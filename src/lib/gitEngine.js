// Tiny Git simulator. All in-memory, no network.
// A "repo" lives at a directory path (the dir where `git init` was run).
//
// Repo shape:
// {
//   path,
//   commits: { [hash]: Commit },
//   branches: { [name]: hash },
//   tags:     { [name]: hash },
//   HEAD: { type: 'branch'|'detached', ref: 'main' | hash },
//   staged:  { [relPath]: content | null },  // null = staged deletion
//   tracked: { [relPath]: content },
//   branchColors: { [name]: '#RRGGBB' },
//   remote:  { branches, commits, url },      // the simulated "origin" server
//   remoteRefs: { "origin/<branch>": hash },  // remote-tracking refs
//   remotes: { origin: { url } },             // configured remotes (only origin)
//   reflog:  [ { ts, op, oldHash, newHash, message } ],
//   stashes: [ { id, message, branch, files, staged, parent, date } ],
//   config:  { user: { name, email } },
//   merging: null | { head, label, message, conflicts: [relPath], kinds: { [relPath]: kind } }
// }
//
// Commit: { hash, parents:[hash], message, files:{[relPath]:content}, author, date, branch }
//
// All maps are plain objects keyed by user-chosen names, so lookups go
// through `has` / `get` (see objects.js) instead of `in` / `obj[key]`.

import { getNode, walkFiles, ensureDir } from "./filesystem";
import { has, get } from "./objects";
import { mergeTrees } from "./merge3";

export const COLORS = [
    "#FFD700",
    "#38BDF8",
    "#F43F5E",
    "#A78BFA",
    "#34D399",
    "#FB923C",
    "#F472B6",
    "#22D3EE",
];

const randomHex = (n) => {
    const c = globalThis.crypto;
    if (c?.getRandomValues) {
        const bytes = new Uint8Array(Math.ceil(n / 2));
        c.getRandomValues(bytes);
        return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("").slice(0, n);
    }
    let s = "";
    while (s.length < n) s += Math.floor(Math.random() * 16).toString(16);
    return s;
};

// 7 hex chars like git's abbreviated hashes, re-rolled until unique in this
// repo's local store and on its simulated origin.
const newHash = (repo) => {
    for (;;) {
        const h = randomHex(7);
        if (!has(repo.commits, h) && !has(repo.remote?.commits, h)) return h;
    }
};

// Content of `p` in a snapshot, or null when the file is absent.
const at = (files, p) => (has(files, p) ? files[p] : null);

const firstLine = (msg) => String(msg || "").split("\n")[0];

export const newRepo = (path) => ({
    path,
    commits: {},
    branches: {},
    tags: {},
    HEAD: { type: "branch", ref: "main" },
    staged: {},
    tracked: {},
    branchColors: { main: COLORS[0] },
    remote: { branches: {}, commits: {}, url: "origin (simulated)" },
    remoteRefs: {},
    remotes: { origin: { url: "origin (simulated)" } },
    reflog: [],
    stashes: [],
    config: { user: { name: "student", email: "student@gitnaadu" } },
    merging: null,
});

// Migration for repos persisted by older versions. Mutates `repo`, so only
// call it on objects you own (a freshly parsed save, or a cloned state).
export const ensureRepoShape = (repo) => {
    if (!repo) return repo;
    if (!repo.tags) repo.tags = {};
    if (!repo.staged) repo.staged = {};
    if (!repo.tracked) repo.tracked = {};
    if (!repo.reflog) repo.reflog = [];
    if (!repo.stashes) repo.stashes = [];
    if (!repo.config) repo.config = { user: { name: "student", email: "student@gitnaadu" } };
    if (!repo.remotes) repo.remotes = { origin: { url: "origin (simulated)" } };
    if (!repo.remote) repo.remote = { branches: {}, commits: {}, url: "origin (simulated)" };
    if (!repo.remoteRefs) repo.remoteRefs = {};
    if (!repo.branchColors) repo.branchColors = { main: COLORS[0] };
    if (repo.merging === undefined) repo.merging = null;
    return repo;
};

// Innermost repo containing `cwd`. Pure: never modifies the repos.
export const findRepo = (repos, cwd) => {
    let best = null;
    for (const r of Object.values(repos || {})) {
        if (cwd === r.path || cwd.startsWith(r.path === "/" ? "/" : r.path + "/")) {
            if (!best || r.path.length > best.path.length) best = r;
        }
    }
    return best;
};

export const relPath = (repo, absPath) => {
    if (absPath === repo.path) return ".";
    const prefix = repo.path === "/" ? "/" : repo.path + "/";
    if (absPath.startsWith(prefix)) return absPath.slice(prefix.length);
    return absPath;
};

export const absFromRel = (repo, rel) => {
    if (rel === "." || rel === "") return repo.path;
    return (repo.path === "/" ? "" : repo.path) + "/" + rel;
};

export const currentBranch = (repo) =>
    repo.HEAD.type === "branch" ? repo.HEAD.ref : null;

export const headCommit = (repo) => {
    if (repo.HEAD.type === "branch") return get(repo.branches, repo.HEAD.ref) || null;
    return repo.HEAD.ref;
};

// Git's rules for branch / tag names (git check-ref-format), simplified.
export const refNameError = (name) => {
    const bad = `fatal: '${name}' is not a valid branch or tag name.`;
    if (!name || name === "HEAD" || name === "@" || name === "__proto__") return bad;
    if (name.startsWith("-") || name.startsWith("/") || name.endsWith("/")) return bad;
    if (name.endsWith(".") || name.endsWith(".lock")) return bad;
    if (/[\s~^:?*[\\\x00-\x1f\x7f]/.test(name)) return bad;
    if (name.includes("..") || name.includes("@{") || name.includes("//")) return bad;
    if (name.split("/").some((part) => part.startsWith("."))) return bad;
    return null;
};

const reflog = (repo, op, oldHash, newHash, message) => {
    repo.reflog = repo.reflog || [];
    repo.reflog.unshift({
        ts: new Date().toISOString(),
        op,
        oldHash,
        newHash,
        message,
    });
    if (repo.reflog.length > 200) repo.reflog.length = 200;
};

// Point the current branch (or the detached HEAD) at `hash`.
const setHead = (repo, hash) => {
    if (repo.HEAD.type === "branch") repo.branches[repo.HEAD.ref] = hash;
    else repo.HEAD = { type: "detached", ref: hash };
};

// Store a new commit, move HEAD to it and log it. Returns the hash.
const recordCommit = (repo, { files, parents, message, author, op, oldHash, logMessage }) => {
    const hash = newHash(repo);
    repo.commits[hash] = {
        hash,
        parents,
        message,
        files,
        author: author || repo.config?.user?.name || "student",
        date: new Date().toISOString(),
        branch: currentBranch(repo) || "(detached)",
    };
    setHead(repo, hash);
    reflog(repo, op, oldHash, hash, logMessage ?? message);
    return hash;
};

// Snapshot of working files belonging to this repo from VFS.
export const workingSnapshot = (fsRoot, repo) => {
    const files = walkFiles(fsRoot, repo.path);
    const snap = {};
    for (const f of files) {
        const r = relPath(repo, f.path);
        if (r === ".") continue;
        snap[r] = f.node.content || "";
    }
    return snap;
};

// Get the "indexed" view of files: tracked + staged overrides (null = deleted).
export const indexedFiles = (repo) => {
    const out = { ...(repo.tracked || {}) };
    for (const [p, v] of Object.entries(repo.staged || {})) {
        if (v === null) delete out[p];
        else out[p] = v;
    }
    return out;
};

const conflictSet = (repo) => new Set(repo.merging?.conflicts || []);

export const status = (fsRoot, repo) => {
    const working = workingSnapshot(fsRoot, repo);
    const tracked = repo.tracked || {};
    const staged = repo.staged || {};
    const conflicted = conflictSet(repo);
    const unstaged = [];
    const stagedList = [];
    const untracked = [];

    for (const p of Object.keys(staged)) {
        if (conflicted.has(p)) continue;
        if (staged[p] === null) {
            stagedList.push({ path: p, kind: "deleted" });
        } else if (!has(tracked, p)) {
            stagedList.push({ path: p, kind: "new file" });
        } else if (tracked[p] !== staged[p]) {
            stagedList.push({ path: p, kind: "modified" });
        }
    }

    for (const p of Object.keys(working)) {
        if (conflicted.has(p)) continue;
        const stagedVal = has(staged, p) ? staged[p] : get(tracked, p);
        // not in the index (never added, or removed with `git rm --cached`)
        if (stagedVal === undefined || stagedVal === null) {
            untracked.push(p);
        } else if (working[p] !== stagedVal) {
            unstaged.push({ path: p, kind: "modified" });
        }
    }
    for (const p of Object.keys(tracked)) {
        if (conflicted.has(p)) continue;
        if (!has(working, p) && !has(staged, p)) {
            unstaged.push({ path: p, kind: "deleted" });
        }
    }
    const unmerged = [...conflicted].map((p) => ({
        path: p,
        kind: get(repo.merging?.kinds, p) || "both modified",
    }));
    return { staged: stagedList, unstaged, untracked, unmerged };
};

// Remove resolved paths from an in-progress merge's conflict list.
const markResolved = (repo, isResolved) => {
    if (!repo.merging) return [];
    const resolved = repo.merging.conflicts.filter(isResolved);
    repo.merging.conflicts = repo.merging.conflicts.filter((p) => !isResolved(p));
    return resolved;
};

export const gitAdd = (fsRoot, repo, target) => {
    const working = workingSnapshot(fsRoot, repo);
    const tracked = repo.tracked || {};
    let deletedStaged = 0;
    const all = target === "." || target === "-A" || target === "--all";
    let t = target.startsWith("./") ? target.slice(2) : target;
    t = t.replace(/\/+$/, "");
    const matches = (p) => all || p === t || p.startsWith(t + "/");
    const matched = Object.keys(working).filter(matches);
    // Also stage deletions of tracked files (under target) missing in working tree
    for (const p of Object.keys(tracked)) {
        if (!matches(p) || has(working, p)) continue;
        if (get(repo.staged, p) !== null) {
            repo.staged[p] = null;
            deletedStaged++;
        }
        matched.push(p);
    }
    // A staged new file that was since deleted: just drop it from the index
    for (const p of Object.keys(repo.staged)) {
        if (!matches(p) || has(working, p) || has(tracked, p)) continue;
        delete repo.staged[p];
        deletedStaged++;
        matched.push(p);
    }
    const conflicted = conflictSet(repo);
    if (matched.length === 0 && deletedStaged === 0 && ![...conflicted].some(matches))
        return { error: `fatal: pathspec '${target}' did not match any files` };

    // Count only files whose staged content actually changes
    let changed = deletedStaged;
    for (const p of matched) {
        if (!has(working, p)) continue;
        const currentlyStaged = has(repo.staged, p) ? repo.staged[p] : get(tracked, p);
        if (currentlyStaged !== working[p]) {
            if (has(tracked, p) && tracked[p] === working[p]) delete repo.staged[p];
            else repo.staged[p] = working[p];
            changed++;
        }
    }
    // `git add` on a conflicted file marks it resolved (whatever its content).
    const resolved = markResolved(repo, matches);
    return { ok: true, added: changed, matched: matched.length, resolved };
};

// Stage every modification / deletion of already-tracked files
// (`git commit -a`). Mid-merge this also resolves the conflicted files.
export const stageTracked = (fsRoot, repo) => {
    const working = workingSnapshot(fsRoot, repo);
    for (const [p, content] of Object.entries(repo.tracked || {})) {
        if (!has(working, p)) repo.staged[p] = null;
        else if (working[p] !== content) repo.staged[p] = working[p];
        else delete repo.staged[p];
    }
    for (const p of repo.merging?.conflicts || []) {
        if (has(working, p)) {
            if (get(repo.tracked, p) === working[p]) delete repo.staged[p];
            else repo.staged[p] = working[p];
        } else if (has(repo.tracked, p)) repo.staged[p] = null;
        else delete repo.staged[p];
    }
    markResolved(repo, () => true);
};

export const gitCommit = (repo, message, opts = {}) => {
    const stagedKeys = Object.keys(repo.staged);
    const merging = repo.merging;
    if (merging && merging.conflicts.length) {
        return {
            error:
                "error: Committing is not possible because you have unmerged files.\n" +
                merging.conflicts.map((p) => `  ${p}`).join("\n") +
                "\nhint: Fix them up in the work tree, then use 'git add <file>' to mark resolution.",
        };
    }
    if (merging && opts.amend) return { error: "fatal: You are in the middle of a merge -- cannot amend." };
    if (!opts.amend && !opts.allowEmpty && !merging && stagedKeys.length === 0) {
        return { error: "nothing to commit, working tree clean (use `git add`)" };
    }
    if (!message || !message.trim()) {
        return { error: "Aborting commit due to empty commit message." };
    }
    const msg = message.trim();

    if (opts.amend) {
        // Like real git: a brand-new commit (new hash) with the old commit's
        // parents replaces it on the current branch / detached HEAD only. The
        // old commit stays in the store for any other ref still pointing at it.
        const head = headCommit(repo);
        if (!head || !has(repo.commits, head)) return { error: "fatal: You have nothing to amend." };
        const old = repo.commits[head];
        const files = { ...old.files };
        for (const p of stagedKeys) {
            if (repo.staged[p] === null) delete files[p];
            else files[p] = repo.staged[p];
        }
        const hash = recordCommit(repo, {
            files,
            parents: [...(old.parents || [])],
            message: msg,
            author: old.author,
            op: "commit (amend)",
            oldHash: head,
        });
        repo.tracked = { ...files };
        repo.staged = {};
        return { ok: true, hash, replaced: head, message: msg, amended: true };
    }

    const parent = headCommit(repo);
    const files = { ...(parent ? repo.commits[parent].files : {}) };
    for (const p of stagedKeys) {
        if (repo.staged[p] === null) delete files[p];
        else files[p] = repo.staged[p];
    }
    const parents = parent ? [parent] : [];
    if (merging) parents.push(merging.head);
    const hash = recordCommit(repo, {
        files,
        parents,
        message: msg,
        op: merging ? "commit (merge)" : "commit",
        oldHash: parent,
    });
    repo.tracked = { ...files };
    repo.staged = {};
    repo.merging = null;
    return { ok: true, hash, message: msg, merge: !!merging };
};

// opts.starts: tips to walk from (default HEAD); opts.exclude: commits to
// leave out along with everything only reachable through them (`A..B`).
export const gitLog = (repo, limit = 200, opts = {}) => {
    const starts = (opts.starts || [headCommit(repo)]).filter(Boolean);
    if (!starts.length) return [];
    const exclude = opts.exclude || new Set();
    const out = [];
    const seen = new Set();
    const stack = [...starts];
    while (stack.length) {
        const h = stack.pop();
        if (seen.has(h) || exclude.has(h) || !has(repo.commits, h)) continue;
        seen.add(h);
        out.push(repo.commits[h]);
        for (const p of repo.commits[h].parents) stack.push(p);
        if (out.length >= limit) break;
    }
    // Newest first; ties (same-millisecond commits) keep walk order, child before parent.
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return out;
};

// Every commit reachable from `hashes` (inclusive).
const ancestors = (repo, ...hashes) => {
    const set = new Set();
    const stack = [...hashes];
    while (stack.length) {
        const h = stack.pop();
        if (!h || set.has(h) || !has(repo.commits, h)) continue;
        set.add(h);
        for (const p of repo.commits[h].parents) stack.push(p);
    }
    return set;
};

export const isAncestor = (repo, anc, desc) => Boolean(anc && desc && ancestors(repo, desc).has(anc));

// Best common ancestor (git merge-base): a common ancestor of a and b that
// isn't itself an ancestor of another common ancestor. Newest wins ties.
const mergeBase = (repo, a, b) => {
    if (!a || !b) return null;
    const A = ancestors(repo, a);
    const common = [...ancestors(repo, b)].filter((h) => A.has(h));
    if (!common.length) return null;
    const dominated = ancestors(repo, ...common.flatMap((h) => repo.commits[h].parents));
    const best = common.filter((h) => !dominated.has(h));
    best.sort((x, y) => (repo.commits[x].date < repo.commits[y].date ? 1 : -1));
    return best[0];
};

export const gitBranch = (repo, name, opts = {}) => {
    if (!name) {
        return {
            ok: true,
            list: Object.keys(repo.branches).map((b) => ({
                name: b,
                active: currentBranch(repo) === b,
            })),
        };
    }
    if (opts.delete) {
        if (!has(repo.branches, name)) return { error: `error: branch '${name}' not found.` };
        if (currentBranch(repo) === name)
            return { error: `error: cannot delete branch '${name}' checked out` };
        const tip = repo.branches[name];
        const merged =
            isAncestor(repo, tip, headCommit(repo)) ||
            isAncestor(repo, tip, get(repo.remoteRefs, "origin/" + name));
        if (!opts.force && !merged)
            return {
                error: `error: the branch '${name}' is not fully merged.\nhint: If you are sure you want to delete it, run 'git branch -D ${name}'.`,
            };
        delete repo.branches[name];
        delete repo.branchColors[name];
        return { ok: true, deleted: name, hash: tip };
    }
    const bad = refNameError(name);
    if (bad) return { error: bad };
    if (opts.rename) {
        const cur = currentBranch(repo);
        const from = opts.from || cur;
        if (!from) return { error: "fatal: no branch to rename" };
        // An unborn branch (no commits yet) can be renamed too.
        const unborn = from === cur && !has(repo.branches, from);
        if (!unborn && !has(repo.branches, from)) return { error: `error: branch '${from}' not found.` };
        if (has(repo.branches, name)) return { error: `fatal: a branch named '${name}' already exists.` };
        if (!unborn) {
            repo.branches[name] = repo.branches[from];
            delete repo.branches[from];
        }
        repo.branchColors[name] = get(repo.branchColors, from) || COLORS[0];
        delete repo.branchColors[from];
        if (cur === from) repo.HEAD = { type: "branch", ref: name };
        return { ok: true, renamed: { from, to: name } };
    }
    if (has(repo.branches, name)) return { error: `fatal: a branch named '${name}' already exists.` };
    const head = opts.start ? resolveRev(repo, opts.start) : headCommit(repo);
    if (!head) return { error: `fatal: not a valid object name: '${opts.start || "HEAD"}'.` };
    repo.branches[name] = head;
    repo.branchColors[name] = COLORS[Object.keys(repo.branches).length % COLORS.length];
    return { ok: true, created: name };
};

export const gitCheckout = (fsRoot, repo, target, opts = {}) => {
    if (opts.newBranch) {
        const bad = refNameError(target);
        if (bad) return { error: bad };
    }
    // No commits yet: `checkout -b <name>` just renames the unborn branch HEAD points at.
    if (opts.newBranch && !opts.start && !headCommit(repo) && repo.HEAD.type === "branch") {
        if (has(repo.branches, target) || repo.HEAD.ref === target)
            return { error: `fatal: a branch named '${target}' already exists` };
        repo.HEAD = { type: "branch", ref: target };
        if (!get(repo.branchColors, target))
            repo.branchColors[target] = COLORS[Object.keys(repo.branchColors).length % COLORS.length];
        return { ok: true, switched: target };
    }
    if (opts.newBranch && has(repo.branches, target))
        return { error: `fatal: a branch named '${target}' already exists` };
    const isBranch = opts.newBranch || has(repo.branches, target);
    const hash = opts.newBranch
        ? (opts.start ? resolveRev(repo, opts.start) : headCommit(repo))
        : isBranch
            ? repo.branches[target]
            : resolveRev(repo, target);
    if (!hash) {
        if (opts.newBranch) return { error: `fatal: not a valid object name: '${opts.start || "HEAD"}'.` };
        return { error: `error: pathspec '${target}' did not match any file(s) known to git` };
    }
    const plan = planSwitch(fsRoot, repo, repo.commits[hash]?.files || {}, "checkout");
    if (plan.error) return plan;
    if (opts.newBranch) {
        const r = gitBranch(repo, target, { start: hash });
        if (r.error) return r;
    }
    const oldHead = headCommit(repo);
    repo.HEAD = isBranch ? { type: "branch", ref: target } : { type: "detached", ref: hash };
    finishSwitch(fsRoot, repo, hash, plan);
    reflog(repo, "checkout", oldHead, hash, `moving to ${target}`);
    return isBranch ? { ok: true, switched: target } : { ok: true, detached: target, hash };
};

// --- working-tree helpers (paths are repo-relative) ---
const writeRel = (dirNode, rel, content) => {
    const parts = rel.split("/");
    let cur = dirNode;
    for (let i = 0; i < parts.length - 1; i++) {
        cur.children = cur.children || {};
        if (get(cur.children, parts[i])?.type !== "dir")
            cur.children[parts[i]] = { type: "dir", name: parts[i], children: {} };
        cur = cur.children[parts[i]];
    }
    cur.children = cur.children || {};
    const name = parts[parts.length - 1];
    cur.children[name] = { type: "file", name, content };
};

// Delete a file and prune any directories that become empty because of it.
const removeRel = (dirNode, rel) => {
    const parts = rel.split("/");
    const chain = [dirNode];
    for (let i = 0; i < parts.length - 1; i++) {
        const next = get(chain[chain.length - 1]?.children, parts[i]);
        if (!next || next.type !== "dir") return;
        chain.push(next);
    }
    const parent = chain[chain.length - 1];
    const name = parts[parts.length - 1];
    if (get(parent.children, name)?.type !== "file") return;
    delete parent.children[name];
    for (let i = chain.length - 1; i > 0; i--) {
        if (Object.keys(chain[i].children || {}).length > 0) break;
        delete chain[i - 1].children[parts[i - 1]];
    }
};

// Make the working tree hold `files`: files git knows about (tracked or
// staged) that `files` lacks are removed. Untracked files are left alone.
const writeTree = (fsRoot, repo, files) => {
    const dirNode = getNode(fsRoot, repo.path);
    if (!dirNode) return;
    const known = new Set([
        ...Object.keys(repo.tracked || {}),
        ...Object.keys(repo.staged || {}),
        ...(repo.merging?.conflicts || []),
    ]);
    for (const rel of known) if (!has(files, rel)) removeRel(dirNode, rel);
    for (const [rel, content] of Object.entries(files)) writeRel(dirNode, rel, content);
};

// Working tree and index match commit `hash` afterwards.
const applyCommitToFs = (fsRoot, repo, hash) => {
    const files = repo.commits[hash]?.files || {};
    writeTree(fsRoot, repo, files);
    repo.tracked = { ...files };
    repo.staged = {};
};

// Before moving HEAD to a snapshot with `newFiles`, work out which local
// (uncommitted / untracked) changes can be carried over. Refuses, like git,
// when the switch would overwrite a local change.
const planSwitch = (fsRoot, repo, newFiles, op) => {
    const head = headCommit(repo);
    const oldFiles = head ? repo.commits[head]?.files || {} : {};
    const working = workingSnapshot(fsRoot, repo);
    const index = indexedFiles(repo);
    const staged = repo.staged || {};
    const carry = {};
    const conflicts = [];
    const untrackedConflicts = [];
    const paths = new Set([...Object.keys(oldFiles), ...Object.keys(working), ...Object.keys(staged)]);
    for (const p of paths) {
        const w = at(working, p);
        const o = at(oldFiles, p);
        const i = at(index, p);
        if (w === o && i === o) continue;
        const n = at(newFiles, p);
        if (n !== o && n !== w) (o === null && i === null && w !== null ? untrackedConflicts : conflicts).push(p);
        else carry[p] = w;
    }
    if (untrackedConflicts.length)
        return {
            error: `error: The following untracked working tree files would be overwritten by ${op}:\n${untrackedConflicts
                .map((p) => "  " + p)
                .join("\n")}\nPlease move or remove them before you ${op}.`,
        };
    if (conflicts.length)
        return {
            error: `error: Your local changes to the following files would be overwritten by ${op}:\n${conflicts
                .map((p) => "  " + p)
                .join("\n")}\nPlease commit your changes or stash them first.`,
        };
    const keepStaged = {};
    for (const [p, v] of Object.entries(staged)) {
        if (v !== at(newFiles, p)) keepStaged[p] = v;
    }
    return { carry, staged: keepStaged };
};

const applyCarry = (fsRoot, repo, plan) => {
    const dirNode = getNode(fsRoot, repo.path);
    if (!dirNode) return;
    for (const [rel, content] of Object.entries(plan.carry)) {
        if (content === null) removeRel(dirNode, rel);
        else writeRel(dirNode, rel, content);
    }
};

const finishSwitch = (fsRoot, repo, hash, plan) => {
    applyCommitToFs(fsRoot, repo, hash);
    applyCarry(fsRoot, repo, plan);
    repo.staged = { ...plan.staged };
};

// Move the current branch (or detached HEAD) to `hash`, carrying local changes.
const moveHeadTo = (fsRoot, repo, hash, op) => {
    const plan = planSwitch(fsRoot, repo, repo.commits[hash]?.files || {}, op);
    if (plan.error) return plan;
    setHead(repo, hash);
    finishSwitch(fsRoot, repo, hash, plan);
    return { ok: true };
};

const sameFiles = (a, b) => {
    const ka = Object.keys(a);
    return ka.length === Object.keys(b).length && ka.every((k) => has(b, k) && a[k] === b[k]);
};

// Three-way apply the change `commit` introduced (vs its first parent) onto
// `oursFiles`. With `reverse`, apply the inverse change (for revert).
const pickOnto = (repo, oursFiles, commit, reverse = false) => {
    const parentFiles = commit.parents[0] ? repo.commits[commit.parents[0]]?.files || {} : {};
    const base = reverse ? commit.files : parentFiles;
    const theirs = reverse ? parentFiles : commit.files;
    return mergeTrees(base, oursFiles, theirs, {
        ours: "HEAD",
        theirs: `${commit.hash} (${firstLine(commit.message)})`,
    });
};

// Only merge / pull can stop half-way for the user to resolve conflicts.
const pickConflictError = (op, commit, conflicts) => ({
    error:
        `error: could not ${op} ${commit.hash}... ${firstLine(commit.message)}\n` +
        conflicts.map((p) => `CONFLICT (content): Merge conflict in ${p}`).join("\n") +
        `\nhint: GitNaadu can only pause for conflicts during 'git merge' / 'git pull'.` +
        `\nhint: Nothing was changed. Make the edit by hand, or merge the branch instead.`,
    conflicts,
});

// Generic merge: bring `otherHash` into current HEAD's branch.
const mergeCommitIntoHead = (fsRoot, repo, otherHash, label, message) => {
    const cur = headCommit(repo);
    if (!cur) return { error: "fatal: nothing to merge into (no commits yet)." };
    if (!otherHash) return { error: "merge: nothing to merge: invalid target." };
    if (otherHash === cur || isAncestor(repo, otherHash, cur))
        return { ok: true, alreadyUpToDate: true, message: "Already up to date." };
    if (isAncestor(repo, cur, otherHash)) {
        const moved = moveHeadTo(fsRoot, repo, otherHash, "merge");
        if (moved.error) return moved;
        reflog(repo, "merge", cur, otherHash, `${label} (fast-forward)`);
        return { ok: true, ff: true, hash: otherHash };
    }
    const base = mergeBase(repo, cur, otherHash);
    const { files: merged, conflicts, kinds } = mergeTrees(
        base ? repo.commits[base].files : {},
        repo.commits[cur].files,
        repo.commits[otherHash].files,
        { ours: "HEAD", theirs: label },
    );
    const plan = planSwitch(fsRoot, repo, merged, "merge");
    if (plan.error) return plan;

    if (conflicts.length) {
        // Stop half-way like git: the working tree holds the merge result
        // (with conflict markers), cleanly merged files are staged, and HEAD
        // stays put until `git commit` (or `git merge --abort`).
        const curFiles = repo.commits[cur].files;
        writeTree(fsRoot, repo, merged);
        applyCarry(fsRoot, repo, plan);
        const conflicted = new Set(conflicts);
        const staged = { ...plan.staged };
        for (const p of new Set([...Object.keys(curFiles), ...Object.keys(merged)])) {
            if (conflicted.has(p) || at(curFiles, p) === at(merged, p)) continue;
            staged[p] = at(merged, p);
        }
        repo.staged = staged;
        repo.merging = { head: otherHash, label, message, conflicts, kinds };
        return { ok: true, conflicts, kinds };
    }

    const hash = recordCommit(repo, {
        files: merged,
        parents: [cur, otherHash],
        message,
        op: "merge",
        oldHash: cur,
        logMessage: label,
    });
    finishSwitch(fsRoot, repo, hash, plan);
    return { ok: true, hash };
};

export const gitMerge = (fsRoot, repo, ref) => {
    const otherHash = resolveRev(repo, ref);
    if (!otherHash) return { error: `merge: ${ref} - not something we can merge` };
    if (currentBranch(repo) === ref) return { ok: true, alreadyUpToDate: true, message: "Already up to date." };
    const message = has(repo.branches, ref) ? `Merge branch '${ref}'` : `Merge ${ref}`;
    const r = mergeCommitIntoHead(fsRoot, repo, otherHash, ref, message);
    if (r.error) return r;
    return { ...r, merged: ref };
};

// `git merge --abort`: throw away the half-done merge, back to HEAD.
export const gitMergeAbort = (fsRoot, repo) => {
    if (!repo.merging) return { error: "fatal: There is no merge to abort (MERGE_HEAD missing)." };
    const head = headCommit(repo);
    applyCommitToFs(fsRoot, repo, head);
    repo.merging = null;
    reflog(repo, "merge --abort", head, head, "abort merge");
    return { ok: true, hash: head };
};

// Commits reachable from `set`'s members, oldest first (parents before children).
const topoOldestFirst = (repo, hashes) => {
    const pending = new Set(hashes);
    const out = [];
    while (pending.size) {
        const ready = [...pending]
            .filter((h) => repo.commits[h].parents.every((p) => !pending.has(p)))
            .sort((a, b) => (repo.commits[a].date < repo.commits[b].date ? -1 : 1));
        for (const h of ready) {
            out.push(h);
            pending.delete(h);
        }
    }
    return out;
};

export const gitRebase = (fsRoot, repo, upstream) => {
    const onto = resolveRev(repo, upstream);
    if (!onto) return { error: `fatal: invalid upstream '${upstream}'` };
    const curName = currentBranch(repo);
    if (!curName) return { error: "fatal: rebase needs a branch checked out (you are in detached HEAD)" };
    const cur = get(repo.branches, curName);
    if (!cur) return { error: "fatal: rebase needs at least one commit" };
    const base = mergeBase(repo, cur, onto);
    if (!base) return { error: "fatal: no common ancestor" };
    if (base === onto) return { ok: true, upToDate: true, message: `Current branch ${curName} is up to date.` };
    if (base === cur) {
        const moved = moveHeadTo(fsRoot, repo, onto, "rebase");
        if (moved.error) return moved;
        reflog(repo, "rebase", cur, onto, `fast-forward onto ${upstream}`);
        return { ok: true, ff: true };
    }
    // Our commits that `onto` doesn't have, oldest first. Merge commits are
    // dropped (git's default without --rebase-merges); their changes come
    // along with the commits that made them.
    const ontoHas = ancestors(repo, onto);
    const ours = [...ancestors(repo, cur)].filter((h) => !ontoHas.has(h));
    const todo = topoOldestFirst(repo, ours).map((h) => repo.commits[h]);
    const replayed = [];
    let dropped = 0;
    let files = repo.commits[onto].files;
    for (const c of todo) {
        if (c.parents.length > 1) {
            dropped++;
            continue;
        }
        const r = pickOnto(repo, files, c);
        if (r.conflicts.length) return pickConflictError("apply", c, r.conflicts);
        // Already upstream (e.g. cherry-picked earlier): skip, like git.
        if (sameFiles(r.files, files)) {
            dropped++;
            continue;
        }
        files = r.files;
        replayed.push({ c, files });
    }
    const plan = planSwitch(fsRoot, repo, files, "rebase");
    if (plan.error) return plan;
    let parent = onto;
    for (const { c, files: snap } of replayed) {
        const h = newHash(repo);
        repo.commits[h] = {
            hash: h,
            parents: [parent],
            message: c.message,
            files: snap,
            author: c.author,
            date: new Date().toISOString(),
            branch: curName,
        };
        parent = h;
    }
    repo.branches[curName] = parent;
    finishSwitch(fsRoot, repo, parent, plan);
    reflog(repo, "rebase", cur, parent, `onto ${upstream}, ${replayed.length} commits`);
    return { ok: true, onto: upstream, count: replayed.length, dropped };
};

// A ref, full or partial hash, optionally followed by ~N / ^N suffixes
// (`HEAD~2`, `main^`, `abc1234^2`, `HEAD~1^2~3`).
const resolveBase = (repo, rev) => {
    if (!rev) return null;
    if (rev === "HEAD" || rev === "@") return headCommit(repo);
    if (has(repo.branches, rev)) return repo.branches[rev];
    if (has(repo.tags, rev)) return repo.tags[rev];
    if (has(repo.remoteRefs, rev)) return repo.remoteRefs[rev];
    if (rev.startsWith("origin/") && has(repo.remotes, "origin")) {
        const b = rev.slice("origin/".length);
        if (has(repo.remote?.branches, b)) return repo.remote.branches[b];
    }
    if (has(repo.commits, rev)) return rev;
    if (/^[0-9a-z]{4,}$/i.test(rev)) {
        const matches = Object.keys(repo.commits).filter((h) => h.startsWith(rev));
        if (matches.length === 1) return matches[0];
    }
    return null;
};

export const resolveRev = (repo, rev) => {
    if (!rev) return null;
    const m = rev.match(/^(.*?)((?:[~^]\d*)*)$/);
    let h = resolveBase(repo, m[1]);
    for (const op of m[2].match(/[~^]\d*/g) || []) {
        if (!h) return null;
        const n = op.length > 1 ? parseInt(op.slice(1), 10) : 1;
        if (op[0] === "~") {
            for (let i = 0; i < n && h; i++) h = repo.commits[h]?.parents?.[0] || null;
        } else if (n > 0) {
            h = repo.commits[h]?.parents?.[n - 1] || null;
        }
    }
    return h || null;
};

// Revision ranges. `from`/`to` are what `git diff` compares: A and B for
// `A..B`, merge-base(A, B) and B for `A...B`. `left`/`right` are the two
// tips (for `git log`). An empty side means HEAD. Returns null when `arg`
// isn't a range, or { error } when a side doesn't resolve.
export const resolveRange = (repo, arg) => {
    const m = /^(.*?)(\.\.\.?)(.*)$/.exec(arg || "");
    // Not a range: `..` alone, or a path such as `../notes.txt`.
    if (!m || (!m[1] && !m[3]) || m[1].endsWith("/") || m[3].startsWith("/")) return null;
    const [left, right] = [m[1] || "HEAD", m[3] || "HEAD"];
    const a = resolveRev(repo, left);
    const b = resolveRev(repo, right);
    const bad = !a ? left : !b ? right : null;
    if (bad) return { error: `fatal: ambiguous argument '${arg}': unknown revision '${bad}'` };
    if (m[2] === "...") {
        const base = mergeBase(repo, a, b);
        return { from: base, to: b, left: a, right: b, symmetric: true };
    }
    return { from: a, to: b, left: a, right: b };
};

// Commits for `git log` given a range: `A..B` is what B has and A doesn't;
// `A...B` is what either has that the other doesn't.
export const logRangeOpts = (repo, range) => {
    const A = ancestors(repo, range.left);
    if (!range.symmetric) return { starts: [range.right], exclude: A };
    const B = ancestors(repo, range.right);
    return { starts: [range.left, range.right], exclude: new Set([...A].filter((h) => B.has(h))) };
};

export const gitReset = (fsRoot, repo, target, mode = "--mixed") => {
    const hash = resolveRev(repo, target);
    if (!hash) return { error: `fatal: ambiguous argument '${target}': unknown revision` };
    const oldHead = headCommit(repo);
    const oldIndex = indexedFiles(repo);
    setHead(repo, hash);
    if (mode === "--hard") {
        // Before clearing `merging`, so conflicted files are cleaned up too.
        applyCommitToFs(fsRoot, repo, hash);
    } else {
        const newFiles = repo.commits[hash]?.files || {};
        repo.tracked = { ...newFiles };
        repo.staged = {};
        if (mode === "--soft") {
            // Index is untouched: whatever differs from the new HEAD is now staged.
            for (const p of new Set([...Object.keys(oldIndex), ...Object.keys(newFiles)])) {
                const v = at(oldIndex, p);
                if (v !== at(newFiles, p)) repo.staged[p] = v;
            }
        }
    }
    repo.merging = null; // any reset ends an in-progress merge
    reflog(repo, "reset", oldHead, hash, `${mode} ${target}`);
    return { ok: true, mode, hash };
};

// Shared by revert and cherry-pick: three-way apply, then commit on HEAD.
const applyAsNewCommit = (fsRoot, repo, target, { op, reverse }) => {
    const head = headCommit(repo);
    const targetHash = resolveRev(repo, target);
    if (!targetHash) return { error: `fatal: bad revision '${target}'` };
    if (!head) return { error: `fatal: nothing to ${op} onto (no commits yet)` };
    const tc = repo.commits[targetHash];
    if (tc.parents.length > 1)
        return { error: `error: commit ${targetHash} is a merge commit; GitNaadu can't ${op} merges (git needs -m).` };
    const r = pickOnto(repo, repo.commits[head].files, tc, reverse);
    if (r.conflicts.length) return pickConflictError(op, tc, r.conflicts);
    if (sameFiles(r.files, repo.commits[head].files))
        return { error: `nothing to commit: the ${op} of ${targetHash} leaves no changes (already applied?)` };
    const plan = planSwitch(fsRoot, repo, r.files, op);
    if (plan.error) return plan;
    const hash = recordCommit(repo, {
        files: r.files,
        parents: [head],
        message: reverse ? `Revert "${firstLine(tc.message)}"` : tc.message,
        op,
        oldHash: head,
        logMessage: targetHash,
    });
    finishSwitch(fsRoot, repo, hash, plan);
    return { ok: true, hash, picked: targetHash };
};

export const gitRevert = (fsRoot, repo, target) =>
    applyAsNewCommit(fsRoot, repo, target, { op: "revert", reverse: true });

export const gitCherryPick = (fsRoot, repo, target) =>
    applyAsNewCommit(fsRoot, repo, target, { op: "cherry-pick", reverse: false });

// Tags
export const gitTag = (repo, name, target, opts = {}) => {
    if (!name) {
        return {
            ok: true,
            list: Object.entries(repo.tags || {}).map(([n, h]) => ({ name: n, hash: h })),
        };
    }
    if (opts.delete) {
        if (!has(repo.tags, name)) return { error: `error: tag '${name}' not found.` };
        delete repo.tags[name];
        return { ok: true, deleted: name };
    }
    const bad = refNameError(name);
    if (bad) return { error: bad };
    if (has(repo.tags, name)) return { error: `fatal: tag '${name}' already exists` };
    const hash = target ? resolveRev(repo, target) : headCommit(repo);
    if (!hash) return { error: `fatal: bad revision '${target || "HEAD"}'` };
    repo.tags[name] = hash;
    return { ok: true, created: name, hash };
};

// Stash
export const gitStash = (fsRoot, repo, message = "WIP") => {
    const head = headCommit(repo);
    if (!head) return { error: "You do not have the initial commit yet" };
    const working = workingSnapshot(fsRoot, repo);
    const tracked = repo.tracked || {};
    const dirty =
        Object.keys(repo.staged || {}).length > 0 ||
        Object.entries(working).some(([k, v]) => get(tracked, k) !== v) ||
        Object.keys(tracked).some((k) => !has(working, k));
    if (!dirty) return { error: "No local changes to save" };
    // Newest stash is always stash@{0}; older entries shift down.
    const id = "stash@{0}";
    repo.stashes.unshift({
        id,
        message,
        branch: currentBranch(repo),
        files: { ...working },
        staged: { ...repo.staged },
        parent: head,
        date: new Date().toISOString(),
    });
    // Restore to HEAD. Untracked files are stashed too (like `git stash -u`),
    // so remove them from the working tree as well.
    applyCommitToFs(fsRoot, repo, head);
    const dirNode = getNode(fsRoot, repo.path);
    for (const rel of Object.keys(working)) {
        if (!has(repo.tracked, rel)) removeRel(dirNode, rel);
    }
    return { ok: true, id };
};

export const gitStashPop = (fsRoot, repo) => {
    if (!repo.stashes.length) return { error: "No stash entries found." };
    const s = repo.stashes[0];
    const dirNode = getNode(fsRoot, repo.path);
    if (!dirNode) return { error: "fatal: repository folder is missing" };
    // Re-apply the stashed changes (relative to the commit they were made on)
    // on top of the current working tree.
    const base = repo.commits[s.parent]?.files || {};
    const working = workingSnapshot(fsRoot, repo);
    const head = headCommit(repo);
    const headFiles = head ? repo.commits[head]?.files || {} : {};
    const changed = [...new Set([...Object.keys(base), ...Object.keys(s.files)])].filter(
        (p) => at(base, p) !== at(s.files, p),
    );
    const conflicts = changed.filter(
        (p) => at(working, p) !== at(headFiles, p) && at(working, p) !== at(s.files, p),
    );
    // A later commit changed the same file differently: git would need a
    // content merge here, so refuse and keep the stash.
    const headConflicts = changed.filter(
        (p) => !conflicts.includes(p) && at(headFiles, p) !== at(base, p) && at(headFiles, p) !== at(s.files, p),
    );
    if (headConflicts.length && !conflicts.length)
        return {
            error: `CONFLICT (content): the stash and a later commit both changed:\n${headConflicts
                .map((p) => "  " + p)
                .join("\n")}\nerror: could not apply ${s.id} — commit or undo the conflicting change first.\nThe stash entry is kept in case you need it again.`,
        };
    if (conflicts.length)
        return {
            error: `error: Your local changes to the following files would be overwritten by stash pop:\n${conflicts
                .map((p) => "  " + p)
                .join("\n")}\nThe stash entry is kept in case you need it again.`,
        };
    repo.stashes.shift();
    for (const p of changed) {
        if (has(s.files, p)) writeRel(dirNode, p, s.files[p]);
        else removeRel(dirNode, p);
    }
    for (const [p, v] of Object.entries(s.staged || {})) {
        if (v !== at(repo.tracked, p)) repo.staged[p] = v;
    }
    return { ok: true, id: s.id };
};

const pathMatcher = (path) => (p) => path === "." || p === path || p.startsWith(path + "/");

// Restore
export const gitRestore = (fsRoot, repo, path, opts = {}) => {
    const matches = pathMatcher(path);
    if (opts.staged) {
        // unstage: drop from staged
        let count = 0;
        for (const p of Object.keys(repo.staged || {})) {
            if (!matches(p)) continue;
            delete repo.staged[p];
            count++;
        }
        const known = count > 0 || Object.keys(repo.tracked || {}).some(matches);
        if (!known) return { error: `error: pathspec '${path}' did not match any file(s) known to git` };
        return { ok: true, unstaged: count };
    }
    const unmerged = (repo.merging?.conflicts || []).filter(matches);
    if (unmerged.length) return { error: `error: path '${unmerged[0]}' is unmerged` };
    // Restore working tree from index (staged ?? tracked)
    const src = indexedFiles(repo);
    const dirNode = getNode(fsRoot, repo.path);
    if (!dirNode) return { error: "fatal: repository folder is missing" };
    const targets = Object.keys(src).filter(matches);
    if (targets.length === 0) return { error: `error: pathspec '${path}' did not match any file(s) known to git` };
    for (const rel of targets) writeRel(dirNode, rel, src[rel]);
    return { ok: true, restored: targets.length };
};

// git rm
export const gitRm = (fsRoot, repo, path, opts = {}) => {
    const tracked = repo.tracked || {};
    const matches = pathMatcher(path);
    // Anything in the index (committed or newly staged) plus conflicted files.
    const candidates = new Set([...Object.keys(indexedFiles(repo)), ...(repo.merging?.conflicts || [])]);
    const found = [...candidates].filter(matches);
    if (found.length === 0)
        return { error: `fatal: pathspec '${path}' did not match any files` };
    if (found.length > 1 && !opts.recursive && !found.includes(path))
        return { error: `fatal: not removing '${path}' recursively without -r` };
    // Remove from VFS (unless --cached: only untrack it)
    const dirNode = getNode(fsRoot, repo.path);
    for (const rel of found) {
        if (!opts.cached && dirNode) removeRel(dirNode, rel);
        if (has(tracked, rel)) repo.staged[rel] = null;
        else delete repo.staged[rel]; // never committed: just drop it from the index
    }
    markResolved(repo, (p) => found.includes(p));
    return { ok: true, removed: found.length };
};

// git mv (also stages)
export const gitMv = (fsRoot, repo, src, dst) => {
    const index = indexedFiles(repo);
    if (!has(index, src)) return { error: `fatal: not under version control, source=${src}` };
    const dirNode = getNode(fsRoot, repo.path);
    const working = workingSnapshot(fsRoot, repo);
    if (!has(working, src)) return { error: `fatal: bad source, source=${src}` };
    // Moving into an existing directory keeps the file name
    const dstNode = getNode(fsRoot, absFromRel(repo, dst));
    if (dstNode?.type === "dir") dst = (dst === "." ? "" : dst + "/") + src.split("/").pop();
    else if (dstNode) return { error: `fatal: destination exists, source=${src}, destination=${dst}` };
    if (has(repo.tracked, src)) repo.staged[src] = null;
    else delete repo.staged[src];
    repo.staged[dst] = index[src];
    // Update VFS: the working copy (with any unstaged edits) moves along
    if (dirNode) {
        removeRel(dirNode, src);
        writeRel(dirNode, dst, working[src]);
    }
    return { ok: true, dst };
};

// Reflog
export const gitReflog = (repo) => (repo.reflog || []).slice();

// Show
export const gitShow = (repo, target) => {
    const hash = resolveRev(repo, target || "HEAD");
    if (!hash) return { error: `fatal: bad revision '${target || "HEAD"}'` };
    const c = repo.commits[hash];
    if (!c) return { error: `fatal: commit '${target}' not found` };
    const before = c.parents[0] ? repo.commits[c.parents[0]]?.files || {} : {};
    const after = c.files;
    const changes = [];
    for (const p of new Set([...Object.keys(before), ...Object.keys(after)])) {
        if (at(before, p) === at(after, p)) continue;
        changes.push({ path: p, before: at(before, p) ?? "", after: at(after, p) ?? "" });
    }
    return { ok: true, commit: c, changes };
};

// Diff helpers
export const computeDiffPairs = (fsRoot, repo, opts = {}) => {
    // Returns [{ path, before, after }] for the requested comparison.
    // opts: { staged:false } -> working vs index; { staged:true } -> index vs HEAD
    // opts.between = [a, b] -> commit a vs commit b ([a, null] -> a vs working tree)
    // opts.paths = [relPath] limits the result to those files / directories
    const tracked = repo.tracked || {};
    const index = indexedFiles(repo);
    if (opts.paths?.length) {
        const { paths, ...rest } = opts;
        return computeDiffPairs(fsRoot, repo, rest).filter((d) => paths.some((p) => pathMatcher(p)(d.path)));
    }
    const pairsBetween = (A, B) =>
        [...new Set([...Object.keys(A), ...Object.keys(B)])]
            .filter((p) => at(A, p) !== at(B, p))
            .map((p) => ({ path: p, before: at(A, p) ?? "", after: at(B, p) ?? "" }));
    if (opts.between) {
        const [a, b] = opts.between.map((r) => (r === null ? null : resolveRev(repo, r)));
        const A = repo.commits[a]?.files || {};
        let B;
        if (opts.between[1] === null) {
            // Working-tree side: only paths git knows about; untracked files never show.
            const w = workingSnapshot(fsRoot, repo);
            B = {};
            for (const p of Object.keys(w)) if (has(index, p) || has(A, p)) B[p] = w[p];
        } else B = repo.commits[b]?.files || {};
        return pairsBetween(A, B);
    }
    if (opts.staged) return pairsBetween(tracked, index);
    // working vs index. Untracked files are not part of `git diff`; files
    // mid-conflict are compared with HEAD so the markers show up.
    const working = workingSnapshot(fsRoot, repo);
    const out = [];
    const keys = new Set([...Object.keys(index), ...(repo.merging?.conflicts || [])]);
    for (const p of keys) {
        const before = at(index, p);
        const after = at(working, p);
        if (before === after) continue;
        out.push({ path: p, before: before ?? "", after: after ?? "" });
    }
    return out;
};

// ---- Remote (simulated). Only one remote exists: "origin". ----
export const remoteError = (repo, name = "origin") =>
    has(repo.remotes, name)
        ? null
        : `fatal: '${name}' does not appear to be a git repository\nfatal: Could not read from remote repository.` +
          (name === "origin" ? "\nhint: add it back with `git remote add origin <url>`" : "");

export const gitPush = (repo, branch, opts = {}) => {
    const rErr = remoteError(repo, opts.remote);
    if (rErr) return { error: rErr };
    const b = branch || currentBranch(repo);
    if (!b) return { error: "fatal: You are not currently on a branch." };
    if (!has(repo.branches, b)) return { error: `error: src refspec ${b} does not match any` };
    const head = repo.branches[b];
    const remoteHead = get(repo.remote.branches, b);
    let forced = false;
    if (remoteHead && remoteHead !== head && !isAncestor(repo, remoteHead, head)) {
        if (!opts.force)
            return {
                error: "rejected",
                rejected: true,
                branch: b,
                reason: has(repo.commits, remoteHead) ? "non-fast-forward" : "fetch first",
            };
        forced = true;
    }
    const stack = [head];
    while (stack.length) {
        const h = stack.pop();
        if (!h || has(repo.remote.commits, h) || !has(repo.commits, h)) continue;
        repo.remote.commits[h] = { ...repo.commits[h] };
        stack.push(...repo.commits[h].parents);
    }
    repo.remote.branches[b] = head;
    repo.remoteRefs["origin/" + b] = head;
    return { ok: true, branch: b, hash: head, forced };
};

// Copy origin's commits we don't have yet and update origin/* refs.
const syncFromRemote = (repo) => {
    let newCount = 0;
    for (const [h, c] of Object.entries(repo.remote.commits || {})) {
        if (!has(repo.commits, h)) {
            repo.commits[h] = { ...c };
            newCount++;
        }
    }
    for (const [b, h] of Object.entries(repo.remote.branches || {})) {
        repo.remoteRefs["origin/" + b] = h;
    }
    return newCount;
};

export const gitFetch = (repo, remote) => {
    const rErr = remoteError(repo, remote);
    if (rErr) return { error: rErr };
    const newCommits = syncFromRemote(repo);
    return { ok: true, branches: Object.keys(repo.remote.branches || {}), newCommits };
};

// Compute ahead/behind for a branch vs its remote tracking
export const remoteAheadBehind = (repo, branch) => {
    if (!branch) return { ahead: 0, behind: 0, hasRemote: false, hasLocal: false };
    const localHead = get(repo.branches, branch);
    const remoteHead = get(repo.remote?.branches, branch);
    if (!localHead && !remoteHead) return { ahead: 0, behind: 0, hasRemote: false, hasLocal: false };

    const reachable = (start, store) => {
        const set = new Set();
        const stack = [start];
        while (stack.length) {
            const h = stack.pop();
            if (!h || set.has(h) || !has(store, h)) continue;
            set.add(h);
            for (const p of store[h].parents || []) stack.push(p);
        }
        return set;
    };
    const localSet = localHead ? reachable(localHead, repo.commits) : new Set();
    const remoteSet = remoteHead ? reachable(remoteHead, repo.remote.commits) : new Set();
    let ahead = 0;
    for (const h of localSet) if (!remoteSet.has(h)) ahead++;
    let behind = 0;
    for (const h of remoteSet) if (!localSet.has(h)) behind++;
    return { ahead, behind, hasRemote: !!remoteHead, hasLocal: !!localHead };
};

// Files at the tip of a remote branch
export const remoteFilesAt = (repo, branch) => {
    const h = get(repo.remote?.branches, branch);
    if (!h) return {};
    return { ...(repo.remote.commits[h]?.files || {}) };
};

// Make a commit directly on the remote — simulates "another developer pushed"
export const remoteCommit = (repo, branch, fileChanges, message) => {
    if (!repo.remote) return { error: "no remote" };
    if (!message || !message.trim()) return { error: "message required" };
    const parent = get(repo.remote.branches, branch);
    if (!parent && Object.keys(fileChanges).length === 0)
        return { error: "no files in remote commit" };
    const baseFiles = parent ? repo.remote.commits[parent]?.files || {} : {};
    const newFiles = { ...baseFiles };
    let touched = 0;
    for (const [p, c] of Object.entries(fileChanges)) {
        if (c === null || c === undefined) {
            if (has(newFiles, p)) {
                delete newFiles[p];
                touched++;
            }
        } else if (at(newFiles, p) !== c) {
            newFiles[p] = c;
            touched++;
        }
    }
    if (touched === 0) return { error: "no changes" };
    const hash = newHash(repo);
    const commit = {
        hash,
        parents: parent ? [parent] : [],
        message: message.trim(),
        files: newFiles,
        author: "origin",
        date: new Date().toISOString(),
        branch,
    };
    repo.remote.commits[hash] = commit;
    repo.remote.branches[branch] = hash;
    return { ok: true, hash, commit };
};

// Remote log (commits reachable from any remote branch tip, newest first)
export const remoteLog = (repo, branch) => {
    if (!repo.remote) return [];
    const tips = branch
        ? [get(repo.remote.branches, branch)].filter(Boolean)
        : Object.values(repo.remote.branches || {});
    const seen = new Set();
    const out = [];
    const stack = [...tips];
    while (stack.length) {
        const h = stack.pop();
        if (!h || seen.has(h)) continue;
        seen.add(h);
        const c = get(repo.remote.commits, h);
        if (!c) continue;
        out.push(c);
        for (const p of c.parents || []) stack.push(p);
    }
    out.sort((a, b) => (a.date < b.date ? 1 : -1));
    return out;
};

export const gitPull = (fsRoot, repo, branch, remote) => {
    const rErr = remoteError(repo, remote);
    if (rErr) return { error: rErr };
    const b = branch || currentBranch(repo);
    if (!b) return { error: "fatal: You are not currently on a branch." };
    const remoteHead = get(repo.remote.branches, b);
    if (!remoteHead) return { error: `fatal: couldn't find remote ref ${b} (nothing pushed to origin/${b} yet)` };
    syncFromRemote(repo);

    if (!has(repo.branches, b)) {
        if (currentBranch(repo) === b) {
            // Unborn current branch: protect local / untracked files like checkout does.
            const plan = planSwitch(fsRoot, repo, repo.commits[remoteHead]?.files || {}, "merge");
            if (plan.error) return plan;
            repo.branches[b] = remoteHead;
            finishSwitch(fsRoot, repo, remoteHead, plan);
        } else {
            repo.branches[b] = remoteHead;
        }
        reflog(repo, "pull", null, remoteHead, `created ${b} from origin`);
        return { ok: true, ff: true, hash: remoteHead };
    }
    if (currentBranch(repo) !== b) {
        return {
            error: `fatal: GitNaadu only pulls into the current branch (you are on '${currentBranch(repo)}')`,
        };
    }
    const label = "origin/" + b;
    const r = mergeCommitIntoHead(fsRoot, repo, remoteHead, label, `Merge remote-tracking branch '${label}'`);
    if (r.error || r.conflicts) return r;
    if (r.alreadyUpToDate) return { ok: true, message: r.message };
    return { ok: true, ff: !!r.ff, hash: r.hash };
};

export const gitClone = (fsRoot, url, parentDir = "/home/student") => {
    const name = (url.replace(/\/+$/, "").split("/").pop() || "repo").replace(/\.git$/, "") || "repo";
    const path = (parentDir === "/" ? "" : parentDir) + "/" + name;
    if (getNode(fsRoot, path))
        return { error: `fatal: destination path '${name}' already exists and is not an empty directory.` };
    if (!ensureDir(fsRoot, path)) return { error: `fatal: could not create work tree dir '${name}'` };
    const repo = newRepo(path);
    repo.remotes.origin.url = url;
    repo.remote.url = url;
    const hash = newHash(repo);
    const files = {
        "README.md": `# ${name}\n\nA cloned repository (simulated).\n`,
    };
    repo.commits[hash] = {
        hash,
        parents: [],
        message: "Initial commit",
        files,
        author: "remote",
        date: new Date().toISOString(),
        branch: "main",
    };
    repo.branches.main = hash;
    repo.remote.branches.main = hash;
    repo.remote.commits[hash] = { ...repo.commits[hash] };
    repo.remoteRefs["origin/main"] = hash;
    applyCommitToFs(fsRoot, repo, hash);
    reflog(repo, "clone", null, hash, url);
    return { ok: true, repo, name };
};

// Remote management. The simulator backs exactly one remote, "origin":
// removing it disconnects push / fetch / pull until it's added back.
export const gitRemote = (repo, args) => {
    const sub = args[0];
    if (!sub || sub === "-v" || sub === "--verbose") {
        return {
            ok: true,
            list: Object.entries(repo.remotes || {}).map(([n, r]) => ({ name: n, url: r.url })),
        };
    }
    const name = args[1];
    const url = args[2];
    if (sub === "add") {
        if (!name || !url) return { error: "usage: git remote add <name> <url>" };
        if (has(repo.remotes, name)) return { error: `error: remote ${name} already exists.` };
        if (name !== "origin")
            return { error: `error: GitNaadu simulates a single remote named 'origin' (try: git remote add origin ${url})` };
        repo.remotes.origin = { url };
        repo.remote.url = url;
        return { ok: true, added: { name, url } };
    }
    if (sub === "remove" || sub === "rm") {
        if (!name) return { error: "usage: git remote remove <name>" };
        if (!has(repo.remotes, name)) return { error: `error: No such remote: '${name}'` };
        delete repo.remotes[name];
        repo.remoteRefs = {};
        return { ok: true, removed: name };
    }
    if (sub === "set-url") {
        if (!name || !url) return { error: "usage: git remote set-url <name> <url>" };
        if (!has(repo.remotes, name)) return { error: `error: No such remote '${name}'` };
        repo.remotes[name].url = url;
        repo.remote.url = url;
        return { ok: true, updated: { name, url } };
    }
    if (sub === "get-url") {
        if (!has(repo.remotes, name)) return { error: `error: No such remote '${name}'` };
        return { ok: true, value: repo.remotes[name].url };
    }
    return { error: `error: unknown subcommand: '${sub}'` };
};

// Config
export const gitConfig = (repo, args) => {
    const { rest } = args;
    if (rest.length === 0) return { ok: true, list: repo.config };
    const key = rest[0];
    const val = rest.slice(1).join(" ");
    if (!val) {
        if (key === "user.name") return { ok: true, value: repo.config.user.name };
        if (key === "user.email") return { ok: true, value: repo.config.user.email };
        return { error: `error: key '${key}' is not supported (try user.name or user.email)` };
    }
    if (key === "user.name") repo.config.user.name = val;
    else if (key === "user.email") repo.config.user.email = val;
    else return { error: `error: key '${key}' is not supported (try user.name or user.email)` };
    return { ok: true, set: { key, val } };
};
