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
//   remote:  { branches, commits, url },
//   remotes: { [name]: { url } },
//   reflog:  [ { ts, op, oldHash, newHash, message } ],
//   stashes: [ { id, message, branch, files, parent, date } ],
//   config:  { user: { name, email } }
// }
//
// Commit: { hash, parents:[hash], message, files:{[relPath]:content}, author, date, branch }

import { getNode, walkFiles, ensureDir } from "./filesystem";

const COLORS = [
    "#FFD700",
    "#38BDF8",
    "#F43F5E",
    "#A78BFA",
    "#34D399",
    "#FB923C",
    "#F472B6",
    "#22D3EE",
];

let _hashCounter = 0;
const shortHash = () => {
    _hashCounter += 1;
    const t = Date.now().toString(36).slice(-3);
    const c = _hashCounter.toString(36);
    const r = Math.random().toString(36).slice(2, 5);
    return (t + c + r).slice(0, 7);
};

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
    remoteRefs: {}, // { "origin/main": hash }
    remotes: { origin: { url: "origin (simulated)" } },
    reflog: [],
    stashes: [],
    config: { user: { name: "student", email: "student@gitnaadu" } },
});

// Migration: ensure new fields exist for repos persisted from earlier sessions.
export const ensureRepoShape = (repo) => {
    if (!repo) return repo;
    if (!repo.tags) repo.tags = {};
    if (!repo.reflog) repo.reflog = [];
    if (!repo.stashes) repo.stashes = [];
    if (!repo.config) repo.config = { user: { name: "student", email: "student@gitnaadu" } };
    if (!repo.remotes) repo.remotes = { origin: { url: "origin (simulated)" } };
    if (!repo.remote) repo.remote = { branches: {}, commits: {}, url: "origin (simulated)" };
    if (!repo.remoteRefs) repo.remoteRefs = {};
    if (!repo.branchColors) repo.branchColors = { main: COLORS[0] };
    return repo;
};

export const findRepo = (repos, cwd) => {
    let best = null;
    for (const r of Object.values(repos)) {
        if (cwd === r.path || cwd.startsWith(r.path + "/")) {
            if (!best || r.path.length > best.path.length) best = r;
        }
    }
    return ensureRepoShape(best);
};

export const relPath = (repo, absPath) => {
    if (absPath === repo.path) return ".";
    if (absPath.startsWith(repo.path + "/")) return absPath.slice(repo.path.length + 1);
    return absPath;
};

export const absFromRel = (repo, rel) => {
    if (rel === "." || rel === "") return repo.path;
    return repo.path + "/" + rel;
};

export const currentBranch = (repo) =>
    repo.HEAD.type === "branch" ? repo.HEAD.ref : null;

export const headCommit = (repo) => {
    if (repo.HEAD.type === "branch") return repo.branches[repo.HEAD.ref] || null;
    return repo.HEAD.ref;
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

export const status = (fsRoot, repo) => {
    const working = workingSnapshot(fsRoot, repo);
    const tracked = repo.tracked || {};
    const staged = repo.staged || {};
    const unstaged = [];
    const stagedList = [];
    const untracked = [];

    for (const p of Object.keys(staged)) {
        if (staged[p] === null) {
            stagedList.push({ path: p, kind: "deleted" });
        } else if (!(p in tracked)) {
            stagedList.push({ path: p, kind: "new file" });
        } else if (tracked[p] !== staged[p]) {
            stagedList.push({ path: p, kind: "modified" });
        }
    }

    for (const p of Object.keys(working)) {
        const stagedVal = p in staged ? staged[p] : tracked[p];
        // not in the index (never added, or removed with `git rm --cached`)
        if (stagedVal === undefined || stagedVal === null) {
            untracked.push(p);
        } else if (working[p] !== stagedVal) {
            unstaged.push({ path: p, kind: "modified" });
        }
    }
    for (const p of Object.keys(tracked)) {
        if (!(p in working) && !(p in staged)) {
            unstaged.push({ path: p, kind: "deleted" });
        }
    }
    return { staged: stagedList, unstaged, untracked };
};

export const gitAdd = (fsRoot, repo, target) => {
    const working = workingSnapshot(fsRoot, repo);
    const tracked = repo.tracked || {};
    let matched = [];
    let deletedStaged = 0;
    const all = target === "." || target === "-A" || target === "--all";
    let t = target.startsWith("./") ? target.slice(2) : target;
    t = t.replace(/\/+$/, "");
    const matches = (p) => all || p === t || p.startsWith(t + "/");
    matched = Object.keys(working).filter(matches);
    // Also stage deletions of tracked files (under target) missing in working tree
    for (const p of Object.keys(tracked)) {
        if (!matches(p) || p in working) continue;
        if (repo.staged[p] !== null) {
            repo.staged[p] = null;
            deletedStaged++;
        }
        matched.push(p);
    }
    // A staged new file that was since deleted: just drop it from the index
    for (const p of Object.keys(repo.staged)) {
        if (!matches(p) || p in working || p in tracked) continue;
        delete repo.staged[p];
        deletedStaged++;
        matched.push(p);
    }
    if (matched.length === 0 && deletedStaged === 0)
        return { error: `fatal: pathspec '${target}' did not match any files` };

    // Count only files whose staged content actually changes (new or modified vs tracked/current-stage)
    let changed = deletedStaged;
    for (const p of matched) {
        if (!(p in working)) continue;
        const currentlyStaged = p in repo.staged ? repo.staged[p] : tracked[p];
        if (currentlyStaged !== working[p]) {
            if (p in tracked && tracked[p] === working[p]) delete repo.staged[p];
            else repo.staged[p] = working[p];
            changed++;
        }
    }
    return { ok: true, added: changed, matched: matched.length };
};

// Stage every modification / deletion of already-tracked files (`git commit -a`).
export const stageTracked = (fsRoot, repo) => {
    const working = workingSnapshot(fsRoot, repo);
    for (const [p, content] of Object.entries(repo.tracked || {})) {
        if (!(p in working)) repo.staged[p] = null;
        else if (working[p] !== content) repo.staged[p] = working[p];
        else delete repo.staged[p];
    }
};

export const gitCommit = (repo, message, opts = {}) => {
    const stagedKeys = Object.keys(repo.staged);
    if (!opts.amend && !opts.allowEmpty && stagedKeys.length === 0) {
        return { error: "nothing to commit, working tree clean (use `git add`)" };
    }
    if (!message || !message.trim()) {
        return { error: "Aborting commit due to empty commit message." };
    }

    if (opts.amend) {
        // Like real git: a brand-new commit (new hash) with the old commit's
        // parents replaces it on the current branch / detached HEAD only. The
        // old commit stays in the store for any other ref still pointing at it.
        const head = headCommit(repo);
        if (!head || !repo.commits[head]) return { error: "fatal: You have nothing to amend." };
        const old = repo.commits[head];
        const baseFiles = { ...old.files };
        for (const p of stagedKeys) {
            if (repo.staged[p] === null) delete baseFiles[p];
            else baseFiles[p] = repo.staged[p];
        }
        const hash = shortHash();
        repo.commits[hash] = {
            hash,
            parents: [...(old.parents || [])],
            message: message.trim(),
            files: baseFiles,
            author: old.author || repo.config?.user?.name || "student",
            date: new Date().toISOString(),
            branch: currentBranch(repo) || old.branch || "(detached)",
        };
        if (repo.HEAD.type === "branch") repo.branches[repo.HEAD.ref] = hash;
        else repo.HEAD = { type: "detached", ref: hash };
        repo.tracked = { ...baseFiles };
        repo.staged = {};
        reflog(repo, "commit (amend)", head, hash, message.trim());
        return { ok: true, hash, replaced: head, message: message.trim(), amended: true };
    }

    const parent = headCommit(repo);
    const newFiles = { ...(parent ? repo.commits[parent].files : {}) };
    for (const p of stagedKeys) {
        if (repo.staged[p] === null) delete newFiles[p];
        else newFiles[p] = repo.staged[p];
    }
    const hash = shortHash();
    const branch = currentBranch(repo) || "(detached)";
    const commit = {
        hash,
        parents: parent ? [parent] : [],
        message: message.trim(),
        files: newFiles,
        author: repo.config?.user?.name || "student",
        date: new Date().toISOString(),
        branch,
    };
    repo.commits[hash] = commit;
    if (repo.HEAD.type === "branch") repo.branches[repo.HEAD.ref] = hash;
    else repo.HEAD = { type: "detached", ref: hash };
    repo.tracked = { ...newFiles };
    repo.staged = {};
    reflog(repo, "commit", parent, hash, commit.message);
    return { ok: true, hash, message: commit.message };
};

export const gitLog = (repo, limit = 200) => {
    const start = headCommit(repo);
    if (!start) return [];
    const out = [];
    const seen = new Set();
    const stack = [start];
    while (stack.length) {
        const h = stack.pop();
        if (seen.has(h) || !repo.commits[h]) continue;
        seen.add(h);
        out.push(repo.commits[h]);
        for (const p of repo.commits[h].parents) stack.push(p);
        if (out.length >= limit) break;
    }
    // Newest first; ties (same-millisecond commits) keep walk order, child before parent.
    out.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
    return out;
};

const ancestors = (repo, hash) => {
    const set = new Set();
    const stack = [hash];
    while (stack.length) {
        const h = stack.pop();
        if (!h || set.has(h) || !repo.commits[h]) continue;
        set.add(h);
        for (const p of repo.commits[h].parents) stack.push(p);
    }
    return set;
};

const lowestCommonAncestor = (repo, a, b) => {
    if (!a || !b) return null;
    const ancA = ancestors(repo, a);
    const stack = [b];
    const seen = new Set();
    while (stack.length) {
        const h = stack.pop();
        if (!h || seen.has(h)) continue;
        seen.add(h);
        if (ancA.has(h)) return h;
        for (const p of repo.commits[h]?.parents || []) stack.push(p);
    }
    return null;
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
        if (!repo.branches[name]) return { error: `branch '${name}' not found.` };
        if (currentBranch(repo) === name)
            return { error: `cannot delete branch '${name}' checked out` };
        delete repo.branches[name];
        delete repo.branchColors[name];
        return { ok: true, deleted: name };
    }
    if (opts.rename) {
        const cur = currentBranch(repo);
        const from = opts.from || cur;
        if (!from) return { error: "no branch to rename" };
        if (!repo.branches[from]) return { error: `branch '${from}' not found.` };
        if (repo.branches[name]) return { error: `branch '${name}' already exists.` };
        repo.branches[name] = repo.branches[from];
        repo.branchColors[name] = repo.branchColors[from] || COLORS[0];
        delete repo.branches[from];
        delete repo.branchColors[from];
        if (cur === from) repo.HEAD = { type: "branch", ref: name };
        return { ok: true, renamed: { from, to: name } };
    }
    if (repo.branches[name]) return { error: `branch '${name}' already exists.` };
    const head = opts.start ? resolveRev(repo, opts.start) : headCommit(repo);
    if (!head) return { error: `Not a valid object name: '${opts.start || "HEAD"}'.` };
    repo.branches[name] = head;
    repo.branchColors[name] =
        COLORS[Object.keys(repo.branches).length % COLORS.length];
    return { ok: true, created: name };
};

export const gitCheckout = (fsRoot, repo, target, opts = {}) => {
    // No commits yet: `checkout -b <name>` just renames the unborn branch HEAD points at.
    if (opts.newBranch && !opts.start && !headCommit(repo) && repo.HEAD.type === "branch") {
        if (repo.branches[target]) return { error: `fatal: a branch named '${target}' already exists` };
        if (repo.HEAD.ref === target) return { error: `fatal: a branch named '${target}' already exists` };
        repo.HEAD = { type: "branch", ref: target };
        repo.branchColors = repo.branchColors || {};
        if (!repo.branchColors[target])
            repo.branchColors[target] = COLORS[Object.keys(repo.branchColors).length % COLORS.length];
        return { ok: true, switched: target };
    }
    const isBranch = opts.newBranch || repo.branches[target] !== undefined;
    const hash = opts.newBranch
        ? (opts.start ? resolveRev(repo, opts.start) : headCommit(repo))
        : isBranch
            ? repo.branches[target]
            : resolveRev(repo, target);
    if (opts.newBranch && repo.branches[target]) return { error: `branch '${target}' already exists.` };
    if (!hash) {
        if (opts.newBranch) return { error: `Not a valid object name: '${opts.start || "HEAD"}'.` };
        return { error: `pathspec '${target}' did not match any file(s) known to git` };
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
        if (!cur.children[parts[i]] || cur.children[parts[i]].type !== "dir")
            cur.children[parts[i]] = { type: "dir", name: parts[i], children: {} };
        cur = cur.children[parts[i]];
    }
    cur.children = cur.children || {};
    cur.children[parts[parts.length - 1]] = {
        type: "file",
        name: parts[parts.length - 1],
        content,
    };
};

// Delete a file and prune any directories that become empty because of it.
const removeRel = (dirNode, rel) => {
    const parts = rel.split("/");
    const chain = [dirNode];
    for (let i = 0; i < parts.length - 1; i++) {
        const next = chain[chain.length - 1]?.children?.[parts[i]];
        if (!next || next.type !== "dir") return;
        chain.push(next);
    }
    const parent = chain[chain.length - 1];
    if (parent.children?.[parts[parts.length - 1]]?.type !== "file") return;
    delete parent.children[parts[parts.length - 1]];
    for (let i = chain.length - 1; i > 0; i--) {
        if (Object.keys(chain[i].children || {}).length > 0) break;
        delete chain[i - 1].children[parts[i - 1]];
    }
};

// Make the working tree match `hash`: files git knows about (tracked or
// staged) that the target lacks are removed, target files are written.
// Untracked files are left alone, like real git.
const applyCommitToFs = (fsRoot, repo, hash) => {
    const commit = repo.commits[hash];
    const files = commit ? commit.files : {};
    const dirNode = getNode(fsRoot, repo.path);
    if (!dirNode) return;
    const known = new Set([
        ...Object.keys(repo.tracked || {}),
        ...Object.keys(repo.staged || {}),
    ]);
    for (const rel of known) {
        if (!(rel in files)) removeRel(dirNode, rel);
    }
    for (const [rel, content] of Object.entries(files)) writeRel(dirNode, rel, content);
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
        const w = p in working ? working[p] : null;
        const o = p in oldFiles ? oldFiles[p] : null;
        const i = p in index ? index[p] : null;
        if (w === o && i === o) continue;
        const n = p in newFiles ? newFiles[p] : null;
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
        if (v !== (p in newFiles ? newFiles[p] : null)) keepStaged[p] = v;
    }
    return { carry, staged: keepStaged };
};

const finishSwitch = (fsRoot, repo, hash, plan) => {
    applyCommitToFs(fsRoot, repo, hash);
    const dirNode = getNode(fsRoot, repo.path);
    if (!dirNode) return;
    for (const [rel, content] of Object.entries(plan.carry)) {
        if (content === null) removeRel(dirNode, rel);
        else writeRel(dirNode, rel, content);
    }
    repo.staged = { ...plan.staged };
};

// Move the current branch (or detached HEAD) to `hash`, carrying local changes.
const moveHeadTo = (fsRoot, repo, hash, op) => {
    const plan = planSwitch(fsRoot, repo, repo.commits[hash]?.files || {}, op);
    if (plan.error) return plan;
    if (repo.HEAD.type === "branch") repo.branches[repo.HEAD.ref] = hash;
    else repo.HEAD = { type: "detached", ref: hash };
    finishSwitch(fsRoot, repo, hash, plan);
    return { ok: true };
};

// Apply the change a commit introduced (vs its first parent) onto `baseFiles`.
const applyCommitDiff = (repo, baseFiles, commit, reverse = false) => {
    const parentFiles = commit.parents[0] ? repo.commits[commit.parents[0]]?.files || {} : {};
    const from = reverse ? commit.files : parentFiles;
    const to = reverse ? parentFiles : commit.files;
    const out = { ...baseFiles };
    for (const p of new Set([...Object.keys(from), ...Object.keys(to)])) {
        if (from[p] === to[p]) continue;
        if (p in to) out[p] = to[p];
        else delete out[p];
    }
    return out;
};

// Generic merge: bring `otherHash` into current HEAD's branch.
const mergeCommitIntoHead = (fsRoot, repo, otherHash, label) => {
    const cur = headCommit(repo);
    if (!cur) return { error: "Nothing to merge into (no HEAD)." };
    if (!otherHash) return { error: "Nothing to merge: invalid target." };
    if (otherHash === cur)
        return { ok: true, alreadyUpToDate: true, message: "Already up to date." };
    const lca = lowestCommonAncestor(repo, cur, otherHash);
    if (lca === otherHash) {
        return { ok: true, alreadyUpToDate: true, message: "Already up to date." };
    }
    if (lca === cur) {
        const moved = moveHeadTo(fsRoot, repo, otherHash, "merge");
        if (moved.error) return moved;
        reflog(repo, "merge", cur, otherHash, `${label || otherHash} (fast-forward)`);
        return { ok: true, ff: true, hash: otherHash };
    }
    // True merge — produce a merge commit with two parents.
    // (No conflict support: when both sides changed a file, theirs wins.)
    const baseFiles = repo.commits[lca]?.files || {};
    const curFiles = repo.commits[cur].files;
    const tgtFiles = repo.commits[otherHash].files;
    const merged = { ...curFiles };
    for (const [p, c] of Object.entries(tgtFiles)) {
        if (!(p in merged)) {
            // Added on their side — unless we deleted an unchanged base file.
            if (!(p in baseFiles) || baseFiles[p] !== c) merged[p] = c;
        } else if (merged[p] !== c && baseFiles[p] !== c) merged[p] = c;
    }
    // Deleted on their side and untouched on ours → delete.
    for (const p of Object.keys(curFiles)) {
        if (!(p in tgtFiles) && p in baseFiles && baseFiles[p] === curFiles[p]) delete merged[p];
    }
    const plan = planSwitch(fsRoot, repo, merged, "merge");
    if (plan.error) return plan;
    const hash = shortHash();
    repo.commits[hash] = {
        hash,
        parents: [cur, otherHash],
        message: `Merge ${label || otherHash}`,
        files: merged,
        author: repo.config?.user?.name || "student",
        date: new Date().toISOString(),
        branch: currentBranch(repo) || "(detached)",
    };
    if (repo.HEAD.type === "branch") repo.branches[repo.HEAD.ref] = hash;
    else repo.HEAD = { type: "detached", ref: hash };
    finishSwitch(fsRoot, repo, hash, plan);
    reflog(repo, "merge", cur, hash, label || otherHash);
    return { ok: true, hash };
};

export const gitMerge = (fsRoot, repo, ref) => {
    const otherHash = resolveRev(repo, ref);
    if (!otherHash)
        return { error: `merge: ${ref} - not something we can merge` };
    if (currentBranch(repo) === ref)
        return { error: `Already on '${ref}' — nothing to merge.` };
    const r = mergeCommitIntoHead(fsRoot, repo, otherHash, ref);
    if (r.error) return r;
    return { ...r, merged: ref };
};

export const gitRebase = (fsRoot, repo, ontoBranch) => {
    const onto = resolveRev(repo, ontoBranch);
    if (!onto) return { error: `invalid upstream '${ontoBranch}'` };
    const curName = currentBranch(repo);
    if (!curName) return { error: "rebase requires a branch checkout" };
    const cur = repo.branches[curName];
    if (!cur) return { error: "rebase requires at least one commit" };
    const lca = lowestCommonAncestor(repo, cur, onto);
    if (!lca) return { error: "no common ancestor" };
    if (lca === onto) return { ok: true, upToDate: true, message: `Current branch ${curName} is up to date.` };
    if (lca === cur) {
        const moved = moveHeadTo(fsRoot, repo, onto, "rebase");
        if (moved.error) return moved;
        reflog(repo, "rebase", cur, onto, `onto ${ontoBranch}`);
        return { ok: true, ff: true };
    }
    const linear = [];
    const walk = (h) => {
        if (!h || h === lca) return;
        const c = repo.commits[h];
        if (!c) return;
        if (c.parents.length > 0) walk(c.parents[0]);
        linear.push(c);
    };
    walk(cur);
    // Replay each commit's *change* on top of onto (not its full snapshot,
    // which would silently drop everything onto added).
    const replayed = [];
    let files = repo.commits[onto].files;
    for (const c of linear) {
        files = applyCommitDiff(repo, files, c);
        replayed.push({ c, files });
    }
    const plan = planSwitch(fsRoot, repo, files, "rebase");
    if (plan.error) return plan;
    let parent = onto;
    let lastHash = onto;
    for (const { c, files: snap } of replayed) {
        const h = shortHash();
        const newCommit = {
            hash: h,
            parents: [parent],
            message: c.message,
            files: snap,
            author: c.author,
            date: new Date().toISOString(),
            branch: curName,
        };
        repo.commits[h] = newCommit;
        parent = h;
        lastHash = h;
    }
    repo.branches[curName] = lastHash;
    finishSwitch(fsRoot, repo, lastHash, plan);
    reflog(repo, "rebase", cur, lastHash, `onto ${ontoBranch}, ${linear.length} commits`);
    return { ok: true, onto: ontoBranch, count: linear.length };
};

const resolveRev = (repo, rev) => {
    if (!rev) return null;
    if (rev === "HEAD") return headCommit(repo);
    if (repo.branches[rev]) return repo.branches[rev];
    if (repo.tags?.[rev]) return repo.tags[rev];
    if (repo.remoteRefs?.[rev]) return repo.remoteRefs[rev];
    // origin/<branch> shorthand even if remoteRefs not populated yet
    if (rev.startsWith("origin/")) {
        const b = rev.slice("origin/".length);
        if (repo.remote?.branches?.[b]) return repo.remote.branches[b];
    }
    if (repo.commits[rev]) return rev;
    // <rev>~N, <rev>~, <rev>^ (first-parent ancestry)
    const m = rev.match(/^(.+?)(?:~(\d*)|\^)$/);
    if (m) {
        let n = m[2] ? parseInt(m[2], 10) : 1;
        let h = resolveRev(repo, m[1]);
        while (n > 0 && h) {
            h = repo.commits[h]?.parents?.[0];
            n--;
        }
        return h || null;
    }
    // partial hash prefix
    const matches = Object.keys(repo.commits).filter((h) => h.startsWith(rev));
    if (matches.length === 1) return matches[0];
    return null;
};

export const gitReset = (fsRoot, repo, target, mode = "--mixed") => {
    const hash = resolveRev(repo, target);
    if (!hash) return { error: `unknown revision '${target}'` };
    const oldHead = headCommit(repo);
    const oldIndex = indexedFiles(repo);
    if (repo.HEAD.type === "branch") repo.branches[repo.HEAD.ref] = hash;
    else repo.HEAD = { type: "detached", ref: hash };
    if (mode === "--hard") {
        applyCommitToFs(fsRoot, repo, hash);
    } else {
        const newFiles = repo.commits[hash]?.files || {};
        repo.tracked = { ...newFiles };
        repo.staged = {};
        if (mode === "--soft") {
            // Index is untouched: whatever differs from the new HEAD is now staged.
            for (const p of new Set([...Object.keys(oldIndex), ...Object.keys(newFiles)])) {
                const v = p in oldIndex ? oldIndex[p] : null;
                if (v !== (p in newFiles ? newFiles[p] : null)) repo.staged[p] = v;
            }
        }
    }
    reflog(repo, "reset", oldHead, hash, `${mode} ${target}`);
    return { ok: true, mode, hash };
};

export const gitRevert = (fsRoot, repo, target) => {
    const head = headCommit(repo);
    const targetHash = resolveRev(repo, target);
    if (!targetHash) return { error: `bad revision '${target}'` };
    if (!head) return { error: "nothing to revert" };
    const targetCommit = repo.commits[targetHash];
    // Undo only what the target commit changed (vs its first parent).
    const newFiles = applyCommitDiff(repo, repo.commits[head].files, targetCommit, true);
    const plan = planSwitch(fsRoot, repo, newFiles, "revert");
    if (plan.error) return plan;
    const hash = shortHash();
    repo.commits[hash] = {
        hash,
        parents: [head],
        message: `Revert "${targetCommit.message}"`,
        files: newFiles,
        author: repo.config?.user?.name || "student",
        date: new Date().toISOString(),
        branch: currentBranch(repo) || "(detached)",
    };
    if (repo.HEAD.type === "branch") repo.branches[repo.HEAD.ref] = hash;
    else repo.HEAD = { type: "detached", ref: hash };
    finishSwitch(fsRoot, repo, hash, plan);
    reflog(repo, "revert", head, hash, targetHash);
    return { ok: true, hash };
};

export const gitCherryPick = (fsRoot, repo, target) => {
    const head = headCommit(repo);
    const targetHash = resolveRev(repo, target);
    if (!targetHash) return { error: `bad revision '${target}'` };
    if (!head) return { error: "no HEAD to cherry-pick onto" };
    const tc = repo.commits[targetHash];
    // Apply only the change the picked commit introduced, not its whole snapshot.
    const newFiles = applyCommitDiff(repo, repo.commits[head].files, tc);
    const plan = planSwitch(fsRoot, repo, newFiles, "cherry-pick");
    if (plan.error) return plan;
    const hash = shortHash();
    repo.commits[hash] = {
        hash,
        parents: [head],
        message: tc.message,
        files: newFiles,
        author: repo.config?.user?.name || "student",
        date: new Date().toISOString(),
        branch: currentBranch(repo) || "(detached)",
    };
    if (repo.HEAD.type === "branch") repo.branches[repo.HEAD.ref] = hash;
    else repo.HEAD = { type: "detached", ref: hash };
    finishSwitch(fsRoot, repo, hash, plan);
    reflog(repo, "cherry-pick", head, hash, targetHash);
    return { ok: true, hash, picked: targetHash };
};

// Tags
export const gitTag = (repo, name, target, opts = {}) => {
    if (!name) {
        return {
            ok: true,
            list: Object.entries(repo.tags || {}).map(([n, h]) => ({ name: n, hash: h })),
        };
    }
    if (opts.delete) {
        if (!repo.tags[name]) return { error: `tag '${name}' not found` };
        delete repo.tags[name];
        return { ok: true, deleted: name };
    }
    if (repo.tags?.[name]) return { error: `tag '${name}' already exists` };
    const hash = target ? resolveRev(repo, target) : headCommit(repo);
    if (!hash) return { error: `bad revision '${target || "HEAD"}'` };
    repo.tags = repo.tags || {};
    repo.tags[name] = hash;
    return { ok: true, created: name, hash };
};

// Stash
export const gitStash = (fsRoot, repo, message = "WIP") => {
    const head = headCommit(repo);
    if (!head) return { error: "You do not have the initial commit yet" };
    const working = workingSnapshot(fsRoot, repo);
    const tracked = repo.tracked || {};
    // Only stash if something changed
    const dirty =
        Object.keys(repo.staged || {}).length > 0 ||
        Object.entries(working).some(([k, v]) => tracked[k] !== v) ||
        Object.keys(tracked).some((k) => !(k in working));
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
        if (!(rel in repo.tracked)) removeRel(dirNode, rel);
    }
    return { ok: true, id };
};

export const gitStashPop = (fsRoot, repo) => {
    if (!repo.stashes.length) return { error: "No stash entries found" };
    const s = repo.stashes[0];
    const dirNode = getNode(fsRoot, repo.path);
    if (!dirNode) return { error: "repo path missing" };
    // Re-apply the stashed changes (relative to the commit they were made on)
    // on top of the current working tree.
    const base = repo.commits[s.parent]?.files || {};
    const working = workingSnapshot(fsRoot, repo);
    const head = headCommit(repo);
    const headFiles = head ? repo.commits[head]?.files || {} : {};
    const changed = [...new Set([...Object.keys(base), ...Object.keys(s.files)])].filter(
        (p) => base[p] !== s.files[p],
    );
    const conflicts = changed.filter((p) => working[p] !== headFiles[p] && working[p] !== s.files[p]);
    // A later commit changed the same file differently: git would need a
    // content merge here, so refuse and keep the stash.
    const headConflicts = changed.filter(
        (p) => !conflicts.includes(p) && headFiles[p] !== base[p] && headFiles[p] !== s.files[p],
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
        if (p in s.files) writeRel(dirNode, p, s.files[p]);
        else removeRel(dirNode, p);
    }
    for (const [p, v] of Object.entries(s.staged || {})) {
        if (v !== (p in repo.tracked ? repo.tracked[p] : null)) repo.staged[p] = v;
    }
    return { ok: true, id: s.id };
};

// Restore
export const gitRestore = (fsRoot, repo, path, opts = {}) => {
    if (opts.staged) {
        // unstage: drop from staged
        let count = 0;
        for (const p of Object.keys(repo.staged || {})) {
            if (p === path || p.startsWith(path + "/") || path === ".") {
                delete repo.staged[p];
                count++;
            }
        }
        return { ok: true, unstaged: count };
    }
    // Restore working tree from index (staged ?? tracked)
    const src = indexedFiles(repo);
    const dirNode = getNode(fsRoot, repo.path);
    if (!dirNode) return { error: "repo path missing" };
    // For each matching path, replace content in VFS
    const targets = Object.keys(src).filter(
        (p) => p === path || path === "." || p.startsWith(path + "/"),
    );
    if (targets.length === 0) return { error: `pathspec '${path}' did not match` };
    for (const rel of targets) {
        const parts = rel.split("/");
        let cur = dirNode;
        for (let i = 0; i < parts.length - 1; i++) {
            cur.children = cur.children || {};
            if (!cur.children[parts[i]])
                cur.children[parts[i]] = { type: "dir", name: parts[i], children: {} };
            cur = cur.children[parts[i]];
        }
        cur.children = cur.children || {};
        cur.children[parts[parts.length - 1]] = {
            type: "file",
            name: parts[parts.length - 1],
            content: src[rel],
        };
    }
    return { ok: true, restored: targets.length };
};

// git rm
export const gitRm = (fsRoot, repo, path, opts = {}) => {
    const tracked = repo.tracked || {};
    // Anything in the index: committed files and newly staged ones.
    const matches = Object.keys(indexedFiles(repo)).filter(
        (p) => p === path || path === "." || p.startsWith(path + "/"),
    );
    if (matches.length === 0)
        return { error: `fatal: pathspec '${path}' did not match any files` };
    if (matches.length > 1 && !opts.recursive && !matches.includes(path))
        return { error: `not removing '${path}' recursively without -r` };
    // Remove from VFS (unless --cached: only untrack it)
    const dirNode = getNode(fsRoot, repo.path);
    for (const rel of matches) {
        if (!opts.cached && dirNode) removeRel(dirNode, rel);
        if (rel in tracked) repo.staged[rel] = null;
        else delete repo.staged[rel]; // never committed: just drop it from the index
    }
    return { ok: true, removed: matches.length };
};

// git mv (also stages)
export const gitMv = (fsRoot, repo, src, dst) => {
    const index = indexedFiles(repo);
    if (!(src in index)) return { error: `fatal: not under version control, source=${src}` };
    const dirNode = getNode(fsRoot, repo.path);
    const working = workingSnapshot(fsRoot, repo);
    if (!(src in working)) return { error: `fatal: bad source, source=${src}` };
    // Moving into an existing directory keeps the file name
    const dstNode = getNode(fsRoot, absFromRel(repo, dst));
    if (dstNode?.type === "dir") dst = (dst === "." ? "" : dst + "/") + src.split("/").pop();
    else if (dstNode) return { error: `fatal: destination exists, source=${src}, destination=${dst}` };
    if (src in (repo.tracked || {})) repo.staged[src] = null;
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
    if (!hash) return { error: `bad revision '${target || "HEAD"}'` };
    const c = repo.commits[hash];
    if (!c) return { error: `commit '${target}' not found` };
    const parent = c.parents[0] ? repo.commits[c.parents[0]] : null;
    const before = parent ? parent.files : {};
    const after = c.files;
    const changes = [];
    const all = new Set([...Object.keys(before), ...Object.keys(after)]);
    for (const p of all) {
        if (before[p] === after[p]) continue;
        changes.push({ path: p, before: before[p] || "", after: after[p] || "" });
    }
    return { ok: true, commit: c, changes };
};

// Diff helpers
export const computeDiffPairs = (fsRoot, repo, opts = {}) => {
    // Returns [{ path, before, after, status }] for the requested comparison.
    // opts: { staged:false } -> working vs index; { staged:true } -> index vs HEAD
    // opts.between = [a, b] -> commit a vs commit b
    const tracked = repo.tracked || {};
    const staged = repo.staged || {};
    const index = indexedFiles(repo);
    // opts.paths = [relPath] limits the result to those files / directories
    if (opts.paths?.length) {
        const { paths, ...rest } = opts;
        return computeDiffPairs(fsRoot, repo, rest).filter((d) =>
            paths.some((p) => p === "." || d.path === p || d.path.startsWith(p + "/")),
        );
    }
    if (opts.between) {
        // between = [a, null] compares commit a with the working tree
        const [a, b] = opts.between.map((r) => (r === null ? null : resolveRev(repo, r)));
        const A = repo.commits[a]?.files || {};
        // Working-tree side: only paths git knows about (in the index); untracked files never show.
        let B;
        if (opts.between[1] === null) {
            const w = workingSnapshot(fsRoot, repo);
            B = {};
            for (const p of Object.keys(w)) if (p in index) B[p] = w[p];
        } else B = repo.commits[b]?.files || {};
        const all = new Set([...Object.keys(A), ...Object.keys(B)]);
        return [...all]
            .filter((p) => A[p] !== B[p])
            .map((p) => ({ path: p, before: A[p] || "", after: B[p] || "" }));
    }
    if (opts.staged) {
        const all = new Set([...Object.keys(tracked), ...Object.keys(staged)]);
        const out = [];
        for (const p of all) {
            const before = tracked[p];
            const after = p in staged ? staged[p] : tracked[p];
            if (before === after) continue;
            out.push({ path: p, before: before ?? "", after: after === null ? "" : after ?? "" });
        }
        return out;
    }
    // working vs index
    // Untracked files are not part of `git diff`.
    const working = workingSnapshot(fsRoot, repo);
    const out = [];
    for (const p of Object.keys(index)) {
        const before = index[p];
        const after = working[p];
        if (before === after) continue;
        out.push({ path: p, before: before ?? "", after: after ?? "" });
    }
    return out;
};

// Remote (simulated)
export const gitPush = (repo, branch, opts = {}) => {
    const b = branch || currentBranch(repo);
    if (!b) return { error: "fatal: You are not currently on a branch." };
    if (!repo.branches[b]) return { error: `error: src refspec ${b} does not match any` };
    const head = repo.branches[b];
    const remoteHead = repo.remote.branches[b];
    let forced = false;
    if (remoteHead && remoteHead !== head && !ancestors(repo, head).has(remoteHead)) {
        if (!opts.force)
            return {
                error: "rejected",
                rejected: true,
                branch: b,
                reason: repo.commits[remoteHead] ? "non-fast-forward" : "fetch first",
            };
        forced = true;
    }
    const visit = (h) => {
        if (!h || repo.remote.commits[h]) return;
        const c = repo.commits[h];
        if (!c) return;
        repo.remote.commits[h] = { ...c };
        c.parents.forEach(visit);
    };
    visit(head);
    repo.remote.branches[b] = head;
    // Update remote-tracking ref so the visualizer & ahead/behind logic know.
    repo.remoteRefs = repo.remoteRefs || {};
    repo.remoteRefs["origin/" + b] = head;
    return { ok: true, branch: b, hash: head, forced };
};

export const gitFetch = (repo) => {
    // Copy any commits we don't have yet from origin → local store.
    let newCount = 0;
    for (const [h, c] of Object.entries(repo.remote.commits || {})) {
        if (!repo.commits[h]) {
            repo.commits[h] = { ...c };
            newCount++;
        }
    }
    // Update remote-tracking refs (origin/<branch>) to mirror origin's tips.
    repo.remoteRefs = repo.remoteRefs || {};
    for (const [b, h] of Object.entries(repo.remote.branches || {})) {
        repo.remoteRefs["origin/" + b] = h;
    }
    return {
        ok: true,
        branches: Object.keys(repo.remote.branches || {}),
        newCommits: newCount,
    };
};

// Compute ahead/behind for a branch vs its remote tracking
export const remoteAheadBehind = (repo, branch) => {
    if (!branch) return { ahead: 0, behind: 0, hasRemote: false, hasLocal: false };
    const localHead = repo.branches?.[branch];
    const remoteHead = repo.remote?.branches?.[branch];
    if (!localHead && !remoteHead) return { ahead: 0, behind: 0, hasRemote: false, hasLocal: false };

    const reachable = (start, store) => {
        const set = new Set();
        const stack = [start];
        while (stack.length) {
            const h = stack.pop();
            if (!h || set.has(h) || !store[h]) continue;
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
    const h = repo.remote?.branches?.[branch];
    if (!h) return {};
    return { ...(repo.remote.commits[h]?.files || {}) };
};

// Make a commit directly on the remote — simulates "another developer pushed"
export const remoteCommit = (repo, branch, fileChanges, message) => {
    if (!repo.remote) return { error: "no remote" };
    if (!message || !message.trim()) return { error: "message required" };
    const parent = repo.remote.branches[branch];
    if (!parent && Object.keys(fileChanges).length === 0)
        return { error: "no files in remote commit" };
    const baseFiles = parent ? (repo.remote.commits[parent]?.files || {}) : {};
    const newFiles = { ...baseFiles };
    let touched = 0;
    for (const [p, c] of Object.entries(fileChanges)) {
        if (c === null || c === undefined) {
            if (p in newFiles) {
                delete newFiles[p];
                touched++;
            }
        } else if (newFiles[p] !== c) {
            newFiles[p] = c;
            touched++;
        }
    }
    if (touched === 0) return { error: "no changes" };
    const hash = shortHash();
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
        ? [repo.remote.branches[branch]].filter(Boolean)
        : Object.values(repo.remote.branches || {});
    const seen = new Set();
    const out = [];
    const stack = [...tips];
    while (stack.length) {
        const h = stack.pop();
        if (!h || seen.has(h)) continue;
        seen.add(h);
        const c = repo.remote.commits[h];
        if (!c) continue;
        out.push(c);
        for (const p of c.parents || []) stack.push(p);
    }
    out.sort((a, b) => (a.date < b.date ? 1 : -1));
    return out;
};

export const gitPull = (fsRoot, repo, branch) => {
    const b = branch || currentBranch(repo);
    if (!b) return { error: "no branch to pull into" };
    const remoteHead = repo.remote.branches?.[b];
    if (!remoteHead) return { error: `no remote branch 'origin/${b}'` };
    for (const [h, c] of Object.entries(repo.remote.commits || {})) {
        if (!repo.commits[h]) repo.commits[h] = { ...c };
    }
    repo.remoteRefs = repo.remoteRefs || {};
    repo.remoteRefs["origin/" + b] = remoteHead;

    if (!repo.branches[b]) {
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
            error: `pull only supports pulling into the current branch (you are on '${currentBranch(repo)}')`,
        };
    }
    const r = mergeCommitIntoHead(fsRoot, repo, remoteHead, "origin/" + b);
    if (r.error) return r;
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
    const hash = shortHash();
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
    repo.HEAD = { type: "branch", ref: "main" };
    repo.tracked = { ...files };
    repo.remote.branches.main = hash;
    repo.remote.commits[hash] = { ...repo.commits[hash] };
    repo.remoteRefs["origin/main"] = hash;
    applyCommitToFs(fsRoot, repo, hash);
    reflog(repo, "clone", null, hash, url);
    return { ok: true, repo, name };
};

// Remote management (simulated)
export const gitRemote = (repo, args) => {
    const sub = args[0];
    if (!sub || sub === "-v" || sub === "--verbose") {
        const out = Object.entries(repo.remotes || {}).map(([n, r]) => ({
            name: n,
            url: r.url,
        }));
        return { ok: true, list: out };
    }
    if (sub === "add") {
        const name = args[1];
        const url = args[2];
        if (!name || !url) return { error: "usage: git remote add <name> <url>" };
        repo.remotes[name] = { url };
        return { ok: true, added: { name, url } };
    }
    if (sub === "remove" || sub === "rm") {
        const name = args[1];
        if (!repo.remotes[name]) return { error: `remote '${name}' not found` };
        delete repo.remotes[name];
        return { ok: true, removed: name };
    }
    return { error: `unknown remote subcommand '${sub}'` };
};

// Config
export const gitConfig = (repo, args) => {
    const { rest } = args;
    if (rest.length === 0) return { ok: true, list: repo.config };
    const key = rest[0];
    const val = rest.slice(1).join(" ");
    if (!val) {
        // get
        if (key === "user.name") return { ok: true, value: repo.config.user.name };
        if (key === "user.email") return { ok: true, value: repo.config.user.email };
        return { error: `unknown key ${key}` };
    }
    if (key === "user.name") repo.config.user.name = val;
    else if (key === "user.email") repo.config.user.email = val;
    else return { error: `unknown key ${key}` };
    return { ok: true, set: { key, val } };
};

// ============================================================================
// GRAPH LAYOUT — proper lane assignment so branches & merges don't overlap.
// ============================================================================
const topoOrder = (repo) => {
    // Walk all commits reachable from any "tip": local branches, tags,
    // remote-tracking refs (origin/*) and a detached HEAD.
    const roots = new Set();
    for (const h of Object.values(repo.branches)) roots.add(h);
    for (const h of Object.values(repo.tags || {})) roots.add(h);
    for (const h of Object.values(repo.remoteRefs || {})) roots.add(h);
    if (repo.HEAD?.type === "detached") roots.add(repo.HEAD.ref);
    const rootArr = [...roots]
        .filter((h) => repo.commits[h])
        .sort((a, b) => (repo.commits[a].date < repo.commits[b].date ? 1 : -1));

    const indeg = {};
    const children = {};
    const visited = new Set();
    const stack = [...rootArr];
    while (stack.length) {
        const h = stack.pop();
        if (visited.has(h) || !repo.commits[h]) continue;
        visited.add(h);
        indeg[h] = indeg[h] || 0;
        for (const p of repo.commits[h].parents) {
            indeg[p] = (indeg[p] || 0) + 1;
            children[p] = children[p] || [];
            children[p].push(h);
            stack.push(p);
        }
    }
    // Kahn's algorithm, but among ready nodes pick the one with newest date.
    const childCount = {};
    for (const h of visited) {
        childCount[h] = 0;
    }
    for (const h of visited) {
        for (const p of repo.commits[h].parents) childCount[p] = (childCount[p] || 0) + 1;
    }
    // A tip that is an ancestor of another tip (e.g. main behind feature)
    // must wait for its children, or it would be drawn above them.
    const ready = rootArr.filter((h) => visited.has(h) && childCount[h] === 0);
    const order = [];
    const inReady = new Set(ready);
    while (ready.length) {
        ready.sort((a, b) => (repo.commits[a].date < repo.commits[b].date ? 1 : -1));
        const h = ready.shift();
        inReady.delete(h);
        order.push(h);
        for (const p of repo.commits[h].parents) {
            childCount[p] -= 1;
            if (childCount[p] === 0 && !inReady.has(p)) {
                ready.push(p);
                inReady.add(p);
            }
        }
    }
    // Safety net for reachable commits Kahn's walk missed. Commits no ref
    // reaches (abandoned by rebase or reset --hard) are left out, as in
    // `git log --all`.
    for (const h of visited) {
        if (!order.includes(h)) order.push(h);
    }
    return order;
};

const assignLanes = (repo, order) => {
    // lanes[i] = expected hash for lane i (the commit we're waiting to draw)
    const lanes = [];
    const result = []; // [{ hash, lane, parentLanes:[], mergeIns:[] }]
    const alloc = (hash) => {
        // first try existing lane already targeted at this hash
        const existing = lanes.indexOf(hash);
        if (existing !== -1) return existing;
        // first empty lane
        const empty = lanes.indexOf(null);
        if (empty !== -1) {
            lanes[empty] = hash;
            return empty;
        }
        lanes.push(hash);
        return lanes.length - 1;
    };
    for (const h of order) {
        const c = repo.commits[h];
        // My lane: if some lane targets me, use first such; else allocate
        let myLane = lanes.indexOf(h);
        if (myLane === -1) {
            myLane = lanes.indexOf(null);
            if (myLane === -1) {
                myLane = lanes.length;
                lanes.push(null);
            }
        }
        // Collect & free other lanes that also target me (converging from children)
        const mergeIns = [];
        for (let i = 0; i < lanes.length; i++) {
            if (i !== myLane && lanes[i] === h) {
                mergeIns.push(i);
                lanes[i] = null;
            }
        }
        lanes[myLane] = null; // we're emitting it now

        // Assign parents
        const parents = c.parents || [];
        const parentLanes = [];
        if (parents.length === 0) {
            // root commit; lane closes
        } else {
            // First parent stays in our lane unless another lane already targets it.
            const first = parents[0];
            const firstExisting = lanes.indexOf(first);
            if (firstExisting !== -1) {
                parentLanes.push(firstExisting);
            } else {
                lanes[myLane] = first;
                parentLanes.push(myLane);
            }
            for (let k = 1; k < parents.length; k++) {
                const pHash = parents[k];
                const existing = lanes.indexOf(pHash);
                if (existing !== -1) {
                    parentLanes.push(existing);
                } else {
                    parentLanes.push(alloc(pHash));
                }
            }
        }
        result.push({ hash: h, lane: myLane, parentLanes, mergeIns });
        // Trim trailing nulls
        while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    }
    return result;
};

export const buildGraph = (repo) => {
    repo = ensureRepoShape(repo);
    if (!repo.commits || Object.keys(repo.commits).length === 0) {
        return {
            nodes: [],
            branches: [],
            tags: [],
            head: null,
            headType: repo.HEAD?.type,
            headRef: repo.HEAD?.ref,
            maxLane: 0,
        };
    }
    const order = topoOrder(repo);
    const placement = assignLanes(repo, order);
    const rowByHash = {};
    placement.forEach((p, i) => {
        rowByHash[p.hash] = i;
    });

    // Color per commit: branch color if branch known, else lane color
    const nodes = placement.map((p, i) => {
        const c = repo.commits[p.hash];
        const branchColor = repo.branchColors?.[c.branch];
        return {
            id: c.hash,
            message: c.message,
            parents: c.parents,
            branch: c.branch,
            date: c.date,
            author: c.author,
            lane: p.lane,
            parentLanes: p.parentLanes,
            row: i,
            color: branchColor || COLORS[p.lane % COLORS.length],
        };
    });

    const maxLane = Math.max(0, ...nodes.map((n) => n.lane));

    const branches = Object.entries(repo.branches).map(([name, hash]) => {
        const node = nodes.find((n) => n.id === hash);
        return {
            name,
            hash,
            color: repo.branchColors[name] || (node ? node.color : COLORS[0]),
            row: rowByHash[hash],
            kind: "branch",
        };
    });

    const remoteRefs = Object.entries(repo.remoteRefs || {}).map(([name, hash]) => {
        const node = nodes.find((n) => n.id === hash);
        return {
            name,
            hash,
            color: "#94A3B8", // slate-400 for origin/* refs
            row: rowByHash[hash],
            kind: "remote",
        };
    });

    const tags = Object.entries(repo.tags || {}).map(([name, hash]) => ({
        name,
        hash,
        row: rowByHash[hash],
    }));

    return {
        nodes,
        branches,
        remoteRefs,
        tags,
        head: headCommit(repo),
        headType: repo.HEAD?.type,
        headRef: repo.HEAD?.ref,
        maxLane,
    };
};
