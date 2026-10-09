// Command parser & dispatcher for the simulator.
// Returns array of output lines: { kind: 'out'|'err'|'del'|'muted'|'system'|'success', text: string }
// 'err' is a real error (fails an `&&` chain, plays the error sound); 'del' is
// ordinary output shown in red (deleted / modified / untracked, diff "-" lines).
import { HOME } from "./initialState";
import {
    normalizePath,
    expandTilde,
    getNode,
    listDir,
    createFile,
    writeFile,
    makeDir,
    remove,
    ensureDir,
    copy,
    move,
    dirName,
} from "./filesystem";
import {
    newRepo,
    findRepo,
    ensureRepoShape,
    gitAdd,
    gitCommit,
    gitLog,
    gitBranch,
    gitCheckout,
    gitMerge,
    gitMergeAbort,
    gitRebase,
    gitReset,
    gitRevert,
    gitPush,
    gitPull,
    gitFetch,
    gitClone,
    gitTag,
    gitStash,
    gitStashPop,
    gitCherryPick,
    gitReflog,
    gitShow,
    gitRestore,
    gitRm,
    gitMv,
    gitRemote,
    gitConfig,
    stageTracked,
    relPath,
    resolveRev,
    resolveRange,
    logRangeOpts,
    computeDiffPairs,
    remoteAheadBehind,
    status as gitStatus,
    currentBranch,
    headCommit,
} from "./gitEngine";
import { diffHunks, diffStats } from "./diff";
import { has, get } from "./objects";

const out = (text) => ({ kind: "out", text });
const err = (text) => ({ kind: "err", text });
const muted = (text) => ({ kind: "muted", text });
const del = (text) => ({ kind: "del", text });
const ok = (text) => ({ kind: "success", text });

// Multi-line engine errors become one terminal line each.
const errLines = (text) => String(text).split("\n").map(err);

// ---------------------------------------------------------------------------
// Shell syntax: words, quotes ('...', "..."), backslash escapes, and the
// operators && || ; > >>. Operators only count outside quotes, so
// `echo "a > b"` prints the text instead of redirecting.
// ---------------------------------------------------------------------------
const lex = (line) => {
    const toks = [];
    let cur = "";
    let inWord = false;
    let q = null;
    const flush = () => {
        if (inWord) toks.push({ t: "word", v: cur });
        cur = "";
        inWord = false;
    };
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q === "'") {
            if (ch === "'") q = null;
            else cur += ch;
            continue;
        }
        if (q === '"') {
            if (ch === '"') q = null;
            else if (ch === "\\" && '"\\$`'.includes(line[i + 1] || "")) cur += line[++i];
            else cur += ch;
            continue;
        }
        if (ch === "\\") {
            if (i + 1 < line.length) cur += line[++i];
            inWord = true;
            continue;
        }
        if (ch === "'" || ch === '"') {
            q = ch;
            inWord = true;
            continue;
        }
        if (ch === " " || ch === "\t") {
            flush();
            continue;
        }
        const two = line.slice(i, i + 2);
        if (two === "&&" || two === "||" || two === ">>") {
            flush();
            toks.push({ t: "op", v: two });
            i++;
            continue;
        }
        if (";|>&".includes(ch)) {
            flush();
            toks.push({ t: "op", v: ch });
            continue;
        }
        cur += ch;
        inWord = true;
    }
    if (q) return { error: `unexpected end of input: missing closing ${q}` };
    flush();
    return { toks };
};

// → { cmds: [{ words, redirect: {mode,target}|null, next: '&&'|'||'|';'|null }] }
const parse = (line) => {
    const lx = lex(line);
    if (lx.error) return { error: lx.error };
    const cmds = [];
    let cur = { words: [], redirect: null, next: null };
    let pendingRedirect = null;
    const isEmpty = (c) => c.words.length === 0 && !c.redirect;
    for (const tok of lx.toks) {
        if (tok.t === "word") {
            if (pendingRedirect) {
                cur.redirect = { mode: pendingRedirect, target: tok.v };
                pendingRedirect = null;
            } else cur.words.push(tok.v);
            continue;
        }
        if (pendingRedirect) return { error: `syntax error near unexpected token '${tok.v}'` };
        if (tok.v === "|") return { error: "pipes (|) aren't supported in this simulator — run the commands one at a time" };
        if (tok.v === "&") return { error: "background jobs (&) aren't supported — did you mean && ?" };
        if (tok.v === ">" || tok.v === ">>") {
            pendingRedirect = tok.v;
            continue;
        }
        // && || ;
        if (isEmpty(cur)) return { error: `syntax error near unexpected token '${tok.v}'` };
        cur.next = tok.v;
        cmds.push(cur);
        cur = { words: [], redirect: null, next: null };
    }
    if (pendingRedirect) return { error: "syntax error near unexpected token 'newline'" };
    if (!isEmpty(cur)) cmds.push(cur);
    else if (cmds.length && cmds[cmds.length - 1].next !== ";")
        return { error: `syntax error: '${cmds[cmds.length - 1].next}' needs a command after it` };
    return { cmds };
};

const splitFlags = (args) => {
    const flags = new Set();
    const rest = [];
    let endOfFlags = false;
    for (const a of args) {
        if (endOfFlags) rest.push(a);
        else if (a === "--") {
            flags.add(a);
            endOfFlags = true;
        } else if (a.startsWith("--")) flags.add(a);
        else if (a.startsWith("-") && a !== "-") {
            // -rf → -r, -f
            for (const c of a.slice(1)) flags.add("-" + c);
        } else rest.push(a);
    }
    return { flags, rest };
};

const HELP_TEXT = [
    "Available commands:",
    "  Linux:  pwd, ls, cd, mkdir, touch, rm, cp, mv, cat, head, tail, clear, echo, tree, whoami, help",
    "  Shell:  a && b (run b if a worked), a || b (run b if a failed), a ; b, > and >> redirects",
    "  Git:    git init, git status, git add, git commit (-a/-m/--amend), git log, git show, git diff (--staged),",
    "          git branch (-d/-D/-m), git checkout, git switch, git tag, git merge (--abort/--continue),",
    "          git rebase, git cherry-pick, git reset, git revert, git restore, git rm, git mv,",
    "          git stash / pop, git reflog, git push, git pull, git fetch, git clone,",
    "          git remote, git config, git --version",
    "  Tip:    Press ↑ ↓ for history, Tab for path completion, Ctrl+L to clear.",
];

// Each command works on its own copy of the filesystem and repos, so the
// caller's state (the undo checkpoint) is never touched. Terminal lines and
// history aren't copied: commands don't modify them.
const cloneWorld = (state) => ({
    ...state,
    fs: JSON.parse(JSON.stringify(state.fs)),
    repos: JSON.parse(JSON.stringify(state.repos || {})),
});

// Run a whole input line. `a && b`, `a || b` and `a ; b` follow shell rules;
// the last highlight wins.
export const executeCommand = (state, rawLine) => {
    const line = (rawLine || "").trim();
    if (!line) return { state, output: [] };
    const parsed = parse(line);
    if (parsed.error) return { state, output: [err(`gitnaadu: ${parsed.error}`)], failed: true };
    let cur = cloneWorld(state);
    let output = [];
    let highlight = null;
    let lastFailed = false;
    let connector = null;
    for (const cmd of parsed.cmds) {
        const skip = (connector === "&&" && lastFailed) || (connector === "||" && !lastFailed);
        if (!skip) {
            const r = runSimple(cur, cmd);
            cur = r.state;
            output = output.concat(r.output || []);
            if (r.highlight) highlight = r.highlight;
            lastFailed = r.failed;
        }
        connector = cmd.next;
    }
    return { state: cur, output, highlight, failed: lastFailed };
};

const TEXT_KINDS = new Set(["out", "muted", "success", "del"]);

const runSimple = (state, { words, redirect }) => {
    let result;
    if (words.length === 0) {
        result = { state, output: [] }; // bare `> file` just creates / truncates it
    } else {
        const [cmd, ...args] = words;
        const handler = get(HANDLERS, cmd);
        result = handler
            ? handler(state, args)
            : { state, output: [err(`${cmd}: command not found`), muted("type `help` for list of available commands")] };
    }
    const nextState = result.state || state;
    let output = result.output || [];
    let failed = result.failed !== undefined ? !!result.failed : output.some((l) => l.kind === "err");

    if (redirect) {
        // Like a real shell, every written line ends with a newline; errors
        // still go to the terminal.
        const text = output
            .flatMap((l) => (TEXT_KINDS.has(l.kind) ? [l.text] : l.kind === "ls" ? l.items.map((it) => it.name) : []))
            .map((t) => t + "\n")
            .join("");
        const target = normalizePath(nextState.cwd, expandTilde(redirect.target));
        const existing = getNode(nextState.fs, target);
        const content =
            redirect.mode === ">>" && existing?.type === "file"
                ? existing.content + (existing.content && !existing.content.endsWith("\n") ? "\n" : "") + text
                : text;
        const wr = writeFile(nextState.fs, target, content);
        output = output.filter((l) => l.kind === "err");
        if (wr.error) {
            output.push(err(`gitnaadu: ${redirect.target}: ${wr.error}`));
            failed = true;
        }
    }
    return { state: nextState, output, highlight: result.highlight || null, failed };
};

// ---------------------------------------------------------------------------
// Keep state.repos in step with the filesystem when directories move.
// ---------------------------------------------------------------------------
const isUnder = (p, root) => p === root || p.startsWith(root === "/" ? "/" : root + "/");

const dropRepos = (state, path) => {
    for (const k of Object.keys(state.repos)) if (isUnder(k, path)) delete state.repos[k];
};

const relocateRepos = (state, from, to, keepOriginal) => {
    const moved = {};
    for (const [k, r] of Object.entries(state.repos)) {
        if (!isUnder(k, from)) continue;
        const nk = to + k.slice(from.length);
        const repo = keepOriginal ? JSON.parse(JSON.stringify(r)) : r;
        if (!keepOriginal) delete state.repos[k];
        repo.path = nk;
        moved[nk] = repo;
    }
    Object.assign(state.repos, moved);
};

// After a directory was removed, step out to the nearest existing parent.
const fixCwd = (state) => {
    let p = state.cwd;
    while (p !== "/" && getNode(state.fs, p)?.type !== "dir") p = dirName(p);
    const moved = p !== state.cwd;
    state.cwd = p;
    return moved;
};

const HANDLERS = {};

HANDLERS.help = (state) => ({
    state,
    output: HELP_TEXT.map((l) => muted(l)),
    highlight: { kind: "help" },
});

HANDLERS.clear = (state) => ({ state, output: [{ kind: "clear" }] });

HANDLERS.whoami = (state) => ({ state, output: [out("student")] });

HANDLERS.echo = (state, args) => ({
    state,
    output: [out(args.join(" "))],
});

HANDLERS.pwd = (state) => ({ state, output: [out(state.cwd)] });

// The `.git` folder isn't stored in the virtual filesystem (the repo lives
// in state.repos), so it's synthesized for listings: a fixed set of the
// entries a fresh `git init` creates.
export const GIT_DIR_ENTRIES = [
    { name: "branches", type: "dir" },
    { name: "hooks", type: "dir" },
    { name: "info", type: "dir" },
    { name: "objects", type: "dir" },
    { name: "refs", type: "dir" },
    { name: "HEAD", type: "file" },
    { name: "config", type: "file" },
    { name: "description", type: "file" },
];

const isRepoRoot = (state, path) => Object.values(state.repos || {}).some((r) => r.path === path);

HANDLERS.ls = (state, args) => {
    const { flags, rest } = splitFlags(args);
    const target = rest[0] ? normalizePath(state.cwd, expandTilde(rest[0])) : state.cwd;
    const showAll = flags.has("-a") || flags.has("-A") || flags.has("--all");
    let node = getNode(state.fs, target);
    if (!node && target.endsWith("/.git") && isRepoRoot(state, dirName(target)))
        node = { type: "dir", children: {}, virtualGit: true };
    if (!node) return { state, output: [err(`ls: cannot access '${rest[0]}': No such file or directory`)] };
    if (node.type === "file") return { state, output: [out(node.name)] };
    let items = node.virtualGit ? GIT_DIR_ENTRIES : listDir(node);
    if (showAll) {
        if (!node.virtualGit && isRepoRoot(state, target) && !has(node.children, ".git"))
            items = [{ name: ".git", type: "dir" }, ...items];
        if (flags.has("-a") || flags.has("--all"))
            items = [{ name: ".", type: "dir" }, { name: "..", type: "dir" }, ...items];
    } else {
        items = items.filter((it) => !it.name.startsWith("."));
    }
    if (items.length === 0) return { state, output: [muted("(empty)")] };
    if (flags.has("-l")) {
        const lines = items.map((it) => {
            const t = it.type === "dir" ? "drwxr-xr-x" : "-rw-r--r--";
            const size = it.type === "file" ? (it.content?.length ?? 0) : 4096;
            return out(`${t}  ${String(size).padStart(6)}  ${it.name}${it.type === "dir" ? "/" : ""}`);
        });
        return { state, output: lines };
    }
    // Only names and types: terminal lines are persisted, so they must not
    // hold on to whole subtrees.
    return { state, output: [{ kind: "ls", items: items.map((it) => ({ name: it.name, type: it.type })) }] };
};

HANDLERS.cd = (state, args) => {
    const target = args[0] || HOME;
    const next = normalizePath(state.cwd, expandTilde(target));
    const node = getNode(state.fs, next);
    if (!node && next.endsWith("/.git") && isRepoRoot(state, dirName(next)))
        return { state, output: [err("cd: .git is managed by GitNaadu behind the scenes — peek inside with `ls .git`")] };
    if (!node) return { state, output: [err(`cd: no such file or directory: ${target}`)] };
    if (node.type !== "dir") return { state, output: [err(`cd: not a directory: ${target}`)] };
    return { state: { ...state, cwd: next }, output: [] };
};

HANDLERS.mkdir = (state, args) => {
    const { flags, rest } = splitFlags(args);
    if (rest.length === 0) return { state, output: [err("mkdir: missing operand")] };
    const lines = [];
    for (const t of rest) {
        const p = normalizePath(state.cwd, expandTilde(t));
        if (flags.has("-p")) {
            // create missing parents; existing dirs are fine
            if (!ensureDir(state.fs, p)) lines.push(err(`mkdir: cannot create directory '${t}'`));
            continue;
        }
        const r = makeDir(state.fs, p);
        if (r.error) lines.push(err(`mkdir: ${r.error}`));
    }
    return { state, output: lines };
};

HANDLERS.touch = (state, args) => {
    if (args.length === 0) return { state, output: [err("touch: missing file operand")] };
    const lines = [];
    for (const t of args) {
        const r = createFile(state.fs, normalizePath(state.cwd, expandTilde(t)), "");
        if (r.error) lines.push(err(`touch: ${r.error}`));
    }
    return { state, output: lines };
};

HANDLERS.rm = (state, args) => {
    const { flags, rest } = splitFlags(args);
    if (rest.length === 0) return { state, output: [err("rm: missing operand")] };
    const lines = [];
    for (const t of rest) {
        const p = normalizePath(state.cwd, expandTilde(t));
        if (flags.has("-f") && !getNode(state.fs, p)) continue; // -f: ignore missing files
        const r = remove(state.fs, p, { recursive: flags.has("-r") || flags.has("-R") });
        if (r.error) {
            lines.push(err(`rm: ${r.error}`));
            continue;
        }
        dropRepos(state, p); // deleting a repo's folder deletes its history too
    }
    if (fixCwd(state)) lines.push(muted(`(the current directory was removed — now in ${state.cwd})`));
    return { state, output: lines };
};

HANDLERS.cp = (state, args) => {
    const { flags, rest } = splitFlags(args);
    if (rest.length < 2) return { state, output: [err("cp: missing operand")] };
    const src = normalizePath(state.cwd, expandTilde(rest[0]));
    const dst = normalizePath(state.cwd, expandTilde(rest[1]));
    const r = copy(state.fs, src, dst, { recursive: flags.has("-r") || flags.has("-R") });
    if (r.error) return { state, output: [err(`cp: ${r.error}`)] };
    relocateRepos(state, src, r.path, true); // a copied repo keeps its .git
    return { state, output: [] };
};

HANDLERS.mv = (state, args) => {
    const { rest } = splitFlags(args);
    if (rest.length < 2) return { state, output: [err("mv: missing operand")] };
    const src = normalizePath(state.cwd, expandTilde(rest[0]));
    const dst = normalizePath(state.cwd, expandTilde(rest[1]));
    const r = move(state.fs, src, dst);
    if (r.error) return { state, output: [err(`mv: ${r.error}`)] };
    relocateRepos(state, src, r.path, false);
    if (isUnder(state.cwd, src)) state.cwd = r.path + state.cwd.slice(src.length);
    return { state, output: [] };
};

// Lines of a file; a trailing newline ends the last line, it doesn't start a new one.
const fileLines = (content) => (content ? content.replace(/\n$/, "").split("\n") : []);

const readFile = (state, cmd, t) => {
    const node = getNode(state.fs, normalizePath(state.cwd, expandTilde(t)));
    if (!node) return { error: `${cmd}: ${t}: No such file or directory` };
    if (node.type !== "file") return { error: `${cmd}: ${t}: Is a directory` };
    return { lines: fileLines(node.content) };
};

HANDLERS.cat = (state, args) => {
    if (args.length === 0) return { state, output: [err("cat: missing file")] };
    const lines = [];
    for (const t of args) {
        const r = readFile(state, "cat", t);
        if (r.error) lines.push(err(r.error));
        else r.lines.forEach((l) => lines.push(out(l)));
    }
    return { state, output: lines };
};

// head / tail with -n N, -N and -nN.
const headTail = (cmd, pick) => (state, args) => {
    let n = 10;
    const files = [];
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "-n" && /^\d+$/.test(args[i + 1] || "")) n = Number(args[++i]);
        else if (/^-n?\d+$/.test(a)) n = Number(a.replace(/^-n?/, ""));
        else files.push(a);
    }
    if (files.length === 0) return { state, output: [err(`${cmd}: missing file`)] };
    const lines = [];
    for (const t of files) {
        const r = readFile(state, cmd, t);
        if (r.error) lines.push(err(r.error));
        else pick(r.lines, n).forEach((l) => lines.push(out(l)));
    }
    return { state, output: lines };
};

HANDLERS.head = headTail("head", (lines, n) => lines.slice(0, n));
HANDLERS.tail = headTail("tail", (lines, n) => (n === 0 ? [] : lines.slice(-n)));

HANDLERS.tree = (state, args) => {
    const target = args[0] ? normalizePath(state.cwd, expandTilde(args[0])) : state.cwd;
    const node = getNode(state.fs, target);
    if (!node || node.type !== "dir") return { state, output: [err(`tree: ${target}: Not a directory`)] };
    const lines = [out(target)];
    const walk = (n, prefix) => {
        const items = listDir(n);
        items.forEach((it, i) => {
            const last = i === items.length - 1;
            lines.push(out(prefix + (last ? "└── " : "├── ") + it.name + (it.type === "dir" ? "/" : "")));
            if (it.type === "dir") walk(it, prefix + (last ? "    " : "│   "));
        });
    };
    walk(node, "");
    return { state, output: lines };
};

// -------- GIT --------
HANDLERS.git = (state, args) => {
    if (args.length === 0) return { state, output: [muted("usage: git <command> [<args>]")] };
    const dispatch = get(GIT_HANDLERS, args[0]);
    if (!dispatch) return { state, output: [err(`git: '${args[0]}' is not a git command. See 'help'.`)] };
    return dispatch(state, args.slice(1));
};

const GIT_HANDLERS = {};

const NOT_A_REPO = "fatal: not a git repository (or any of the parent directories): .git";

// The state here is a private copy (see cloneWorld), so migrating an old
// saved repo in place is safe.
const requireRepo = (state) => ensureRepoShape(findRepo(state.repos, state.cwd));

const withRepo = (fn) => (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err(NOT_A_REPO)] };
    return fn(state, repo, args);
};

// Path argument (relative to cwd) → path relative to the repo root.
const repoPath = (state, repo, p) => relPath(repo, normalizePath(state.cwd, expandTilde(p)));

const shortRef = (repo) => currentBranch(repo) || `HEAD detached at ${(headCommit(repo) || "").slice(0, 7)}`;

// Most history-changing commands refuse to run while a merge is half done.
const blockedByMerge = (state, repo, op) => {
    const m = repo.merging;
    if (!m) return null;
    const output = m.conflicts.length
        ? [
              err(`error: ${op} is not possible because you have unmerged files:`),
              ...m.conflicts.map((p) => del(`  ${p}`)),
              muted("hint: fix them up, `git add` them and `git commit` — or run `git merge --abort`."),
          ]
        : [
              err("fatal: You have not concluded your merge (MERGE_HEAD exists)."),
              muted("hint: run `git commit` to finish the merge, or `git merge --abort` to cancel it."),
          ];
    return { state, output };
};

const conflictLine = (p, kind, label) => {
    if (kind === "deleted by them") return del(`CONFLICT (modify/delete): ${p} deleted in ${label} and modified in HEAD.`);
    if (kind === "deleted by us") return del(`CONFLICT (modify/delete): ${p} deleted in HEAD and modified in ${label}.`);
    if (kind === "both added") return del(`CONFLICT (add/add): Merge conflict in ${p}`);
    return del(`CONFLICT (content): Merge conflict in ${p}`);
};

const conflictReport = (state, r, label) => ({
    state,
    output: [
        ...r.conflicts.map((p) => muted(`Auto-merging ${p}`)),
        ...r.conflicts.map((p) => conflictLine(p, get(r.kinds, p), label)),
        err("Automatic merge failed; fix conflicts and then commit the result."),
        muted("hint: open each file (Files tab or `cat`), keep the lines you want and delete the"),
        muted("hint: <<<<<<< ======= >>>>>>> markers. Then `git add <file>` and `git commit`."),
        muted("hint: changed your mind? `git merge --abort` puts everything back."),
    ],
    highlight: { kind: "git-merge-conflict", branch: label, count: r.conflicts.length },
    failed: true,
});

// Patch-style output shared by `git diff` and `git show`.
const renderPatch = (pairs) =>
    pairs.flatMap((p) => {
        const s = diffStats(p.before, p.after);
        const lines = [ok(`--- ${p.path}  +${s.adds} -${s.dels}`)];
        for (const h of diffHunks(p.before, p.after, 2)) {
            lines.push(muted(`@@ -${h.oldStart} +${h.newStart} @@`));
            for (const l of h.lines) {
                if (l.type === "add") lines.push(ok("+ " + l.text));
                else if (l.type === "del") lines.push(del("- " + l.text));
                else lines.push(muted("  " + l.text));
            }
        }
        return lines;
    });

GIT_HANDLERS.init = (state, args) => {
    const { rest } = splitFlags(args);
    const dir = rest[0] ? normalizePath(state.cwd, expandTilde(rest[0])) : state.cwd;
    const node = getNode(state.fs, dir);
    if (node && node.type !== "dir") return { state, output: [err(`fatal: cannot mkdir ${rest[0]}: File exists`)] };
    if (!node && !ensureDir(state.fs, dir)) return { state, output: [err(`fatal: cannot mkdir ${rest[0]}`)] };
    const gitDir = (dir === "/" ? "" : dir) + "/.git/";
    if (has(state.repos, dir)) return { state, output: [muted(`Reinitialized existing Git repository in ${gitDir}`)] };
    state.repos[dir] = newRepo(dir);
    return {
        state,
        output: [ok(`Initialized empty Git repository in ${gitDir}`)],
        highlight: { kind: "git-init", path: dir },
    };
};

GIT_HANDLERS.status = withRepo((state, repo) => {
    const s = gitStatus(state.fs, repo);
    const lines = [];
    const branch = currentBranch(repo);
    lines.push(out(branch ? `On branch ${branch}` : shortRef(repo)));
    if (repo.merging) {
        if (s.unmerged.length) {
            lines.push(del("You have unmerged paths."));
            lines.push(muted('  (fix conflicts and run "git commit")'));
        } else {
            lines.push(ok("All conflicts fixed but you are still merging."));
            lines.push(muted('  (use "git commit" to conclude merge)'));
        }
        lines.push(muted('  (use "git merge --abort" to abort the merge)'));
    }
    const clean = !s.staged.length && !s.unstaged.length && !s.untracked.length && !s.unmerged.length;
    if (clean) {
        if (!repo.merging) lines.push(muted("nothing to commit, working tree clean"));
        return { state, output: lines };
    }
    const section = (title, items, fmt) => {
        if (!items.length) return;
        lines.push(muted(""));
        lines.push(out(title));
        items.forEach((f) => lines.push(fmt(f)));
    };
    section("Changes to be committed:", s.staged, (f) => ok(`  ${f.kind}:   ${f.path}`));
    section("Unmerged paths:", s.unmerged, (f) => del(`  ${f.kind}:   ${f.path}`));
    section("Changes not staged for commit:", s.unstaged, (f) => del(`  ${f.kind}:   ${f.path}`));
    section("Untracked files:", s.untracked, (p) => del(`  ${p}`));
    return { state, output: lines };
});

GIT_HANDLERS.add = withRepo((state, repo, args) => {
    if (args.length === 0) return { state, output: [err("Nothing specified, nothing added. (try `git add .`)")] };
    let added = 0;
    const resolved = [];
    for (const a of args) {
        const target = a === "-A" || a === "--all" ? "-A" : repoPath(state, repo, a);
        const one = gitAdd(state.fs, repo, target);
        if (one.error) return { state, output: [err(one.error)] };
        added += one.added;
        resolved.push(...one.resolved);
    }
    if (added === 0 && resolved.length === 0) {
        return { state, output: [muted("nothing to stage — working tree matches index")] };
    }
    const lines = [];
    if (added) lines.push(ok(`✓ staged ${added} file${added !== 1 ? "s" : ""}`));
    if (resolved.length) {
        lines.push(ok(`✓ marked as resolved: ${resolved.join(", ")}`));
        if (repo.merging && repo.merging.conflicts.length === 0)
            lines.push(muted("All conflicts fixed — run `git commit` to finish the merge."));
    }
    return { state, output: lines, highlight: { kind: "git-add", count: added } };
});

// Shared by `git commit` and `git merge --continue`.
const commitAndReport = (state, repo, msg, opts = {}) => {
    const r = gitCommit(repo, msg, opts);
    if (r.error) return { state, output: errLines(r.error) };
    return {
        state,
        output: [ok(`[${currentBranch(repo) || "detached HEAD"} ${r.hash}] ${r.amended ? "(amended) " : ""}${r.message}`)],
        highlight: { kind: r.amended ? "git-amend" : "git-commit", hash: r.hash, message: r.message },
    };
};

GIT_HANDLERS.commit = withRepo((state, repo, args) => {
    const amend = args.includes("--amend");
    let msg = "";
    let all = args.includes("--all");
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a.startsWith("--message=")) msg = a.slice("--message=".length);
        else if (a === "--message" && args[i + 1] !== undefined) msg = args[++i];
        else if (/^-[a-zA-Z]+$/.test(a)) {
            // short flags may be combined: -m, -a, -am
            if (a.includes("a")) all = true;
            if (a.endsWith("m") && args[i + 1] !== undefined && !msg) msg = args[++i];
        }
    }
    if (!msg && amend) {
        // Keep previous message if no -m
        const head = headCommit(repo);
        msg = head ? repo.commits[head]?.message || "" : "";
    }
    // Concluding a merge: git offers the prepared "Merge branch ..." message.
    if (!msg && repo.merging) msg = repo.merging.message;
    if (!msg) return { state, output: [err('Please provide a message: git commit -m "your message"')] };
    if (all) stageTracked(state.fs, repo);
    return commitAndReport(state, repo, msg, { amend, allowEmpty: args.includes("--allow-empty") });
});

GIT_HANDLERS.log = withRepo((state, repo, args) => {
    // Supported: --oneline, -n <N>, -<N>, --max-count=<N>. Other flags
    // (e.g. --graph, --all) are accepted and ignored.
    // A revision (`feature`, `HEAD~2`) or range (`main..feature`,
    // `main...feature`) picks what to list; other words are ignored.
    let oneline = false;
    let limit = Infinity;
    let logOpts;
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "--") break;
        if (a === "--oneline") oneline = true;
        else if (a === "-n" && /^\d+$/.test(args[i + 1] || "")) limit = Number(args[++i]);
        else if (/^-\d+$/.test(a)) limit = Number(a.slice(1));
        else if (/^--max-count=\d+$/.test(a)) limit = Number(a.split("=")[1]);
        else if (!a.startsWith("-") && !logOpts) {
            const range = resolveRange(repo, a);
            if (range?.error) return { state, output: [err(range.error)] };
            if (range) logOpts = logRangeOpts(repo, range);
            else if (resolveRev(repo, a)) logOpts = { starts: [resolveRev(repo, a)] };
        }
    }
    const commits = gitLog(repo, 200, logOpts).slice(0, limit);
    if (commits.length === 0)
        return { state, output: [muted(logOpts ? "(no commits in that range)" : "(no commits yet)")] };
    if (oneline) {
        const head = headCommit(repo);
        const lines = commits.map((c) => {
            const refs = [];
            for (const [name, hash] of Object.entries(repo.branches)) {
                if (hash !== c.hash) continue;
                refs.push(repo.HEAD.type === "branch" && repo.HEAD.ref === name ? `HEAD -> ${name}` : name);
            }
            if (repo.HEAD.type === "detached" && head === c.hash) refs.unshift("HEAD");
            for (const [name, hash] of Object.entries(repo.remoteRefs || {})) if (hash === c.hash) refs.push(name);
            for (const [name, hash] of Object.entries(repo.tags || {})) if (hash === c.hash) refs.push(`tag: ${name}`);
            const first = String(c.message || "").split("\n")[0];
            return out(`${c.hash}${refs.length ? ` (${refs.join(", ")})` : ""} ${first}`);
        });
        return { state, output: lines };
    }
    // Only the fields the Terminal shows: lines are persisted, file contents aren't needed.
    return {
        state,
        output: commits.map((c) => ({
            kind: "log-commit",
            commit: { hash: c.hash, branch: c.branch, author: c.author, date: c.date, message: c.message },
        })),
    };
});

GIT_HANDLERS.branch = withRepo((state, repo, args) => {
    const { flags, rest } = splitFlags(args);
    if (flags.has("-d") || flags.has("-D") || flags.has("--delete")) {
        if (!rest[0]) return { state, output: [err("fatal: branch name required")] };
        const force = flags.has("-D") || flags.has("-f") || flags.has("--force");
        const lines = [];
        for (const name of rest) {
            const r = gitBranch(repo, name, { delete: true, force });
            if (r.error) return { state, output: [...lines, ...errLines(r.error)] };
            lines.push(ok(`Deleted branch ${r.deleted} (was ${r.hash}).`));
        }
        return { state, output: lines };
    }
    if (flags.has("-m") || flags.has("-M")) {
        // git branch -m <new>  OR  git branch -m <old> <new>
        const [a, b] = rest;
        if (!a) return { state, output: [err("fatal: branch name required")] };
        const r = gitBranch(repo, b || a, { rename: true, from: b ? a : currentBranch(repo) });
        if (r.error) return { state, output: errLines(r.error) };
        return {
            state,
            output: [ok(`Renamed branch '${r.renamed.from}' to '${r.renamed.to}'`)],
            highlight: { kind: "git-branch", name: r.renamed.to },
        };
    }
    if (rest.length === 0) {
        const r = gitBranch(repo, null);
        if (r.list.length === 0 && repo.HEAD.type === "branch")
            return {
                state,
                output: [muted(`(no commits yet on branch '${repo.HEAD.ref}' — it appears after your first commit)`)],
            };
        const lines = [];
        if (repo.HEAD.type === "detached") lines.push(ok(`* (${shortRef(repo)})`));
        r.list.forEach((b) => lines.push(b.active ? ok(`* ${b.name}`) : out(`  ${b.name}`)));
        return { state, output: lines };
    }
    const r = gitBranch(repo, rest[0], { start: rest[1] });
    if (r.error) return { state, output: errLines(r.error) };
    return {
        state,
        output: [ok(`Created branch '${r.created}'`)],
        highlight: { kind: "git-branch", name: r.created },
    };
});

const checkoutImpl = (state, repo, args, asSwitch) => {
    const { flags, rest } = splitFlags(args);
    const newBranch = flags.has("-b") || flags.has("-c") || flags.has("-B") || flags.has("-C");
    const target = rest[0];
    if (!target) return { state, output: [err("fatal: missing branch or commit argument")] };
    // `git checkout -- <file>` / `git checkout <file>`: discard working-tree changes
    if (!asSwitch && !newBranch) {
        const looksLikePath =
            !has(repo.branches, target) &&
            !resolveRev(repo, target) &&
            getNode(state.fs, normalizePath(state.cwd, expandTilde(target)));
        if (flags.has("--") || looksLikePath) return GIT_HANDLERS.restore(state, rest);
    }
    const blocked = blockedByMerge(state, repo, asSwitch ? "switch" : "checkout");
    if (blocked) return blocked;
    if (asSwitch && !newBranch && !flags.has("--detach") && !has(repo.branches, target))
        return {
            state,
            output: [
                err(`fatal: invalid reference: ${target}`),
                muted("hint: `git switch` expects a branch. Use `git switch --detach <commit>` for a commit,"),
                muted("hint: or `git switch -c <name>` to create a new branch."),
            ],
        };
    const r = gitCheckout(state.fs, repo, target, { newBranch, start: newBranch ? rest[1] : undefined });
    if (r.error) return { state, output: errLines(r.error) };
    if (r.detached)
        return {
            state,
            output: [
                muted(`Note: switching to '${target}'. You are now in 'detached HEAD' state.`),
                muted(`HEAD is now at ${r.hash}. Use \`git switch -c <name>\` to keep commits you make here.`),
            ],
            highlight: { kind: "git-checkout", target },
        };
    return {
        state,
        output: [ok(`Switched to ${newBranch ? "a new branch" : "branch"} '${r.switched}'`)],
        highlight: { kind: "git-checkout", target: r.switched },
    };
};

GIT_HANDLERS.checkout = withRepo((state, repo, args) => checkoutImpl(state, repo, args, false));
GIT_HANDLERS.switch = withRepo((state, repo, args) => checkoutImpl(state, repo, args, true));

GIT_HANDLERS.merge = withRepo((state, repo, args) => {
    const { flags, rest } = splitFlags(args);
    if (flags.has("--abort")) {
        const r = gitMergeAbort(state.fs, repo);
        if (r.error) return { state, output: errLines(r.error) };
        return {
            state,
            output: [ok(`Merge aborted. HEAD is back at ${r.hash}.`)],
            highlight: { kind: "git-merge-abort", hash: r.hash },
        };
    }
    if (flags.has("--continue")) {
        if (!repo.merging) return { state, output: [err("fatal: There is no merge in progress (MERGE_HEAD missing).")] };
        return commitAndReport(state, repo, repo.merging.message);
    }
    const blocked = blockedByMerge(state, repo, "merging");
    if (blocked) return blocked;
    if (!rest[0]) return { state, output: [err("usage: git merge <branch>  |  git merge --abort  |  git merge --continue")] };
    const r = gitMerge(state.fs, repo, rest[0]);
    if (r.error) return { state, output: errLines(r.error) };
    if (r.conflicts) return conflictReport(state, r, rest[0]);
    if (r.alreadyUpToDate) return { state, output: [muted(r.message)] };
    return {
        state,
        output: [ok(r.ff ? `Fast-forward to ${rest[0]}` : `Merged '${r.merged}' into ${shortRef(repo)} (${r.hash})`)],
        highlight: { kind: "git-merge", branch: rest[0] },
    };
});

GIT_HANDLERS.rebase = withRepo((state, repo, args) => {
    const blocked = blockedByMerge(state, repo, "rebase");
    if (blocked) return blocked;
    const { rest } = splitFlags(args);
    if (!rest[0]) return { state, output: [err("usage: git rebase <upstream>")] };
    const r = gitRebase(state.fs, repo, rest[0]);
    if (r.error) return { state, output: errLines(r.error) };
    if (r.upToDate) return { state, output: [muted(r.message)] };
    const lines = [ok(r.ff ? `Fast-forwarded ${currentBranch(repo)} to ${rest[0]}` : `Replayed ${r.count} commit(s) onto ${rest[0]}`)];
    if (r.dropped) lines.push(muted(`(skipped ${r.dropped} merge or already-applied commit(s))`));
    return { state, output: lines, highlight: { kind: "git-rebase", onto: rest[0] } };
});

GIT_HANDLERS.reset = withRepo((state, repo, args) => {
    const { flags, rest } = splitFlags(args);
    let mode = "--mixed";
    if (flags.has("--hard")) mode = "--hard";
    if (flags.has("--soft")) mode = "--soft";
    // `git reset [HEAD] <file>`: unstage paths, don't move HEAD
    const isPath = (x) => {
        if (resolveRev(repo, x)) return false;
        const rp = repoPath(state, repo, x);
        return has(repo.staged, rp) || has(repo.tracked, rp) || !!getNode(state.fs, normalizePath(state.cwd, expandTilde(x)));
    };
    const paths = flags.has("--") ? rest.slice(rest[0] === "HEAD" ? 1 : 0) : rest[0] === "HEAD" ? rest.slice(1) : rest.filter(isPath);
    if (mode === "--mixed" && paths.length) return GIT_HANDLERS.restore(state, ["--staged", ...paths]);
    const target = rest[0] || "HEAD";
    const r = gitReset(state.fs, repo, target, mode);
    if (r.error) return { state, output: errLines(r.error) };
    return {
        state,
        output: [ok(`HEAD is now at ${r.hash} (${mode})`)],
        highlight: { kind: "git-reset", target, mode },
    };
});

const pickLike = (op, fn, verb) =>
    withRepo((state, repo, args) => {
        const blocked = blockedByMerge(state, repo, op);
        if (blocked) return blocked;
        const { rest } = splitFlags(args);
        if (!rest[0]) return { state, output: [err(`usage: git ${op} <commit>`)] };
        const r = fn(state.fs, repo, rest[0]);
        if (r.error) return { state, output: errLines(r.error) };
        return {
            state,
            output: [ok(`${verb} ${r.picked} as ${r.hash}`)],
            highlight: { kind: `git-${op}`, target: rest[0], picked: r.picked, hash: r.hash },
        };
    });

GIT_HANDLERS.revert = pickLike("revert", gitRevert, "Reverted");
GIT_HANDLERS["cherry-pick"] = pickLike("cherry-pick", gitCherryPick, "Picked");

// `git push [<remote> [<branch>]]` (also `branch:branch` and `HEAD`)
const remoteArgs = (repo, rest) => {
    const remote = rest[0];
    let branch = rest[1] ? rest[1].split(":")[0] : null;
    if (branch === "HEAD") branch = currentBranch(repo);
    return { remote, branch };
};

GIT_HANDLERS.push = withRepo((state, repo, args) => {
    const { flags, rest } = splitFlags(args); // -u / --set-upstream are no-ops
    const force = flags.has("--force") || flags.has("-f") || flags.has("--force-with-lease");
    const { remote, branch } = remoteArgs(repo, rest);
    const r = gitPush(repo, branch, { force, remote });
    if (r.rejected)
        return {
            state,
            output: [
                muted("To origin (simulated)"),
                err(` ! [rejected]        ${r.branch} -> ${r.branch} (${r.reason})`),
                err("error: failed to push some refs to 'origin'"),
                ...(r.reason === "fetch first"
                    ? [
                          muted("hint: Updates were rejected because the remote contains work that you do not"),
                          muted("hint: have locally. Integrate the remote changes (e.g. 'git pull ...')"),
                          muted("hint: before pushing again."),
                      ]
                    : [
                          muted("hint: Updates were rejected because the tip of your current branch is behind"),
                          muted("hint: its remote counterpart. Integrate the remote changes (e.g. 'git pull ...')"),
                          muted("hint: before pushing again, or use 'git push --force' to overwrite the remote."),
                      ]),
            ],
            failed: true,
        };
    if (r.error) return { state, output: errLines(r.error) };
    return {
        state,
        output: [
            muted("Enumerating objects... done."),
            muted("Writing objects... 100%"),
            ok(`To origin (simulated)`),
            ok(`   ${r.forced ? "+ " : ""}${r.hash}  ${r.branch} -> ${r.branch}${r.forced ? " (forced update)" : ""}`),
        ],
        highlight: { kind: "git-push", branch: r.branch },
    };
});

GIT_HANDLERS.fetch = withRepo((state, repo, args) => {
    const { rest } = splitFlags(args);
    const r = gitFetch(repo, rest[0]);
    if (r.error) return { state, output: errLines(r.error) };
    const branch = currentBranch(repo);
    const ab = branch ? remoteAheadBehind(repo, branch) : null;
    const lines = [
        ok(`Fetched ${r.branches.length} branch(es) from origin (+${r.newCommits} new commit${r.newCommits !== 1 ? "s" : ""})`),
    ];
    if (ab && ab.hasRemote && ab.hasLocal) {
        lines.push(muted(`Branch '${branch}' is ${ab.ahead} ahead, ${ab.behind} behind origin/${branch}`));
    }
    return { state, output: lines, highlight: { kind: "git-fetch" } };
});

GIT_HANDLERS.pull = withRepo((state, repo, args) => {
    const blocked = blockedByMerge(state, repo, "pull");
    if (blocked) return blocked;
    const { rest } = splitFlags(args);
    const { remote, branch } = remoteArgs(repo, rest);
    const r = gitPull(state.fs, repo, branch, remote);
    if (r.error) return { state, output: errLines(r.error) };
    if (r.conflicts) return conflictReport(state, r, "origin/" + (branch || currentBranch(repo)));
    return {
        state,
        output: [ok(r.message || (r.ff ? "Fast-forwarded from origin" : `Merged origin into ${currentBranch(repo)}`))],
        highlight: { kind: "git-pull" },
    };
});

GIT_HANDLERS.clone = (state, args) => {
    const { rest } = splitFlags(args);
    if (!rest[0]) return { state, output: [err("usage: git clone <url>")] };
    const r = gitClone(state.fs, rest[0], state.cwd);
    if (r.error) return { state, output: errLines(r.error) };
    state.repos[r.repo.path] = r.repo;
    return {
        state,
        output: [
            muted(`Cloning into '${r.name}'...`),
            muted(`remote: counting objects... done`),
            ok(`Receiving objects: 100%`),
            ok(`Cloned to ${r.repo.path}`),
        ],
        highlight: { kind: "git-clone", name: r.name },
    };
};

GIT_HANDLERS.tag = withRepo((state, repo, args) => {
    // drop the value of -m "<message>" (annotated tags are stored like lightweight ones)
    const mi = args.findIndex((a) => a === "-m");
    const { flags, rest } = splitFlags(mi === -1 ? args : [...args.slice(0, mi), ...args.slice(mi + 2)]);
    if (flags.has("-d")) {
        if (!rest[0]) return { state, output: [err("usage: git tag -d <tagname>")] };
        const r = gitTag(repo, rest[0], null, { delete: true });
        if (r.error) return { state, output: errLines(r.error) };
        return { state, output: [ok(`Deleted tag '${r.deleted}'`)] };
    }
    if (rest.length === 0 || flags.has("-l") || flags.has("--list")) {
        const r = gitTag(repo, null);
        if (r.list.length === 0) return { state, output: [muted("(no tags)")] };
        return { state, output: r.list.map((t) => out(`${t.name}  ${t.hash}`)) };
    }
    const r = gitTag(repo, rest[0], rest[1] || null);
    if (r.error) return { state, output: errLines(r.error) };
    return {
        state,
        output: [ok(`Created tag '${r.created}' on ${r.hash}`)],
        highlight: { kind: "git-tag", name: r.created },
    };
});

GIT_HANDLERS.stash = withRepo((state, repo, args) => {
    const sub = args[0];
    if (!sub || sub === "push" || sub === "save" || sub.startsWith("-")) {
        const blocked = blockedByMerge(state, repo, "stash");
        if (blocked) return blocked;
        const message = args.includes("-m")
            ? args[args.indexOf("-m") + 1] || "WIP"
            : args.filter((a, i) => !(i === 0 && (a === "push" || a === "save")) && !a.startsWith("-")).join(" ") || "WIP";
        const r = gitStash(state.fs, repo, message);
        if (r.error) return { state, output: errLines(r.error) };
        return {
            state,
            output: [ok(`Saved working directory and index state ${r.id}`)],
            highlight: { kind: "git-stash", id: r.id },
        };
    }
    if (sub === "pop") {
        const blocked = blockedByMerge(state, repo, "stash pop");
        if (blocked) return blocked;
        const r = gitStashPop(state.fs, repo);
        if (r.error) return { state, output: errLines(r.error) };
        return {
            state,
            output: [ok(`Applied stash ${r.id}`)],
            highlight: { kind: "git-stash-pop", id: r.id },
        };
    }
    if (sub === "list") {
        if (repo.stashes.length === 0) return { state, output: [muted("(no stash)")] };
        return {
            state,
            output: repo.stashes.map((s, i) => out(`stash@{${i}}: WIP on ${s.branch || "(no branch)"}: ${s.message}`)),
        };
    }
    if (sub === "clear") {
        repo.stashes = [];
        return { state, output: [ok("Cleared stash entries.")] };
    }
    return { state, output: [err(`error: unknown subcommand: '${sub}' (try push, pop, list or clear)`)] };
});

GIT_HANDLERS.reflog = withRepo((state, repo) => {
    const entries = gitReflog(repo);
    if (entries.length === 0) return { state, output: [muted("(empty reflog)")] };
    return {
        state,
        output: entries.map((e, i) => {
            const hash = e.newHash ? e.newHash.slice(0, 7) : "-------";
            return out(`${hash} HEAD@{${i}}: ${e.op}: ${e.message || ""}`);
        }),
    };
});

GIT_HANDLERS.show = withRepo((state, repo, args) => {
    const r = gitShow(repo, args[0]);
    if (r.error) return { state, output: errLines(r.error) };
    const c = r.commit;
    const lines = [
        out(`commit ${c.hash}`),
        ...(c.parents.length > 1 ? [muted(`Merge: ${c.parents.join(" ")}`)] : []),
        muted(`Author: ${c.author}`),
        muted(`Date:   ${new Date(c.date).toLocaleString()}`),
        out(""),
        ...String(c.message).split("\n").map((l) => out(`    ${l}`)),
        out(""),
        ...renderPatch(r.changes),
    ];
    return { state, output: lines, highlight: { kind: "git-show", hash: c.hash } };
});

GIT_HANDLERS.diff = withRepo((state, repo, args) => {
    const { flags, rest } = splitFlags(args);
    // Leading args that name commits are revisions; the rest are paths.
    // With `--`, everything before it is a revision and everything after it
    // a path; without it, an arg is a revision unless it names a file.
    const dash = args.indexOf("--");
    const beforeDash = dash === -1 ? Infinity : args.slice(0, dash).filter((a) => !a.startsWith("-")).length;
    const isFile = (a) => dash === -1 && Boolean(getNode(state.fs, normalizePath(state.cwd, expandTilde(a))));
    const revs = [];
    // `A..B` / `A...B` name both sides at once.
    const range = beforeDash > 0 && rest.length && !isFile(rest[0]) ? resolveRange(repo, rest[0]) : null;
    if (range?.error) return { state, output: [err(range.error)] };
    if (range && !range.from) return { state, output: [err(`fatal: ${rest[0]}: no merge base`)] };
    if (range) {
        rest.shift();
        revs.push(range.from, range.to);
    }
    while (revs.length < 2 && rest.length && revs.length < beforeDash && resolveRev(repo, rest[0]) && !isFile(rest[0]))
        revs.push(rest.shift());
    if (dash !== -1 && revs.length < beforeDash)
        return { state, output: [err(`fatal: bad revision '${rest[0]}'`)] };
    let opts = {};
    if (flags.has("--staged") || flags.has("--cached")) opts = { staged: true };
    else if (revs.length === 2) opts = { between: [revs[0], revs[1]] };
    else if (revs.length === 1) opts = { between: [revs[0], null] };
    if (rest.length) opts.paths = rest.map((p) => repoPath(state, repo, p));
    const pairs = computeDiffPairs(state.fs, repo, opts);
    if (pairs.length === 0) return { state, output: [muted("(no changes)")] };
    return { state, output: renderPatch(pairs), highlight: { kind: "git-diff", count: pairs.length } };
});

GIT_HANDLERS.restore = withRepo((state, repo, args) => {
    const { flags, rest } = splitFlags(args);
    if (!rest[0]) return { state, output: [err("usage: git restore [--staged] <path>")] };
    const staged = flags.has("--staged") || flags.has("-S");
    let count = 0;
    for (const p of rest) {
        const one = gitRestore(state.fs, repo, repoPath(state, repo, p), { staged });
        if (one.error) return { state, output: errLines(one.error) };
        count += (staged ? one.unstaged : one.restored) || 0;
    }
    return {
        state,
        output: [ok(staged ? `Unstaged ${count} change(s)` : `Restored ${count} file(s)`)],
        highlight: { kind: "git-restore", path: rest[0] },
    };
});

GIT_HANDLERS.rm = withRepo((state, repo, args) => {
    const { flags, rest } = splitFlags(args);
    if (!rest[0]) return { state, output: [err("usage: git rm [--cached] [-r] <file>")] };
    const lines = [];
    for (const p of rest) {
        const r = gitRm(state.fs, repo, repoPath(state, repo, p), {
            cached: flags.has("--cached"),
            recursive: flags.has("-r"),
        });
        if (r.error) return { state, output: [...lines, ...errLines(r.error)] };
        lines.push(ok(`rm '${p}' (${r.removed} file(s))`));
    }
    return { state, output: lines, highlight: { kind: "git-rm", path: rest[0] } };
});

GIT_HANDLERS.mv = withRepo((state, repo, args) => {
    const { rest } = splitFlags(args);
    if (rest.length < 2) return { state, output: [err("usage: git mv <src> <dst>")] };
    const r = gitMv(state.fs, repo, repoPath(state, repo, rest[0]), repoPath(state, repo, rest[1]));
    if (r.error) return { state, output: errLines(r.error) };
    return { state, output: [ok(`Renamed ${rest[0]} -> ${rest[1]}`)], highlight: { kind: "git-mv" } };
});

GIT_HANDLERS.remote = withRepo((state, repo, args) => {
    const r = gitRemote(repo, args);
    if (r.error) return { state, output: errLines(r.error) };
    if (r.list) {
        if (!r.list.length) return { state, output: [muted("(no remotes — add one with `git remote add origin <url>`)")] };
        const verbose = args[0] === "-v" || args[0] === "--verbose";
        return {
            state,
            output: verbose
                ? r.list.flatMap((rm) => [out(`${rm.name}\t${rm.url} (fetch)`), out(`${rm.name}\t${rm.url} (push)`)])
                : r.list.map((rm) => out(rm.name)),
        };
    }
    if (r.value !== undefined) return { state, output: [out(r.value)] };
    if (r.added) return { state, output: [ok(`Added remote '${r.added.name}' -> ${r.added.url}`)] };
    if (r.updated) return { state, output: [ok(`Remote '${r.updated.name}' now points to ${r.updated.url}`)] };
    if (r.removed) return { state, output: [ok(`Removed remote '${r.removed}'`)] };
    return { state, output: [] };
});

GIT_HANDLERS.config = withRepo((state, repo, args) => {
    const { flags, rest } = splitFlags(args); // --global / --local are no-ops here
    const r = gitConfig(repo, { flags, rest });
    if (r.error) return { state, output: errLines(r.error) };
    if (r.value !== undefined) return { state, output: [out(r.value)] };
    if (r.set) return { state, output: [ok(`Set ${r.set.key} = ${r.set.val}`)] };
    if (r.list)
        return {
            state,
            output: [out(`user.name=${r.list.user.name}`), out(`user.email=${r.list.user.email}`)],
        };
    return { state, output: [] };
});

GIT_HANDLERS["--version"] = (state) => ({
    state,
    output: [out("git version 2.43.0 (GitNaadu simulated)")],
});
GIT_HANDLERS.version = GIT_HANDLERS["--version"];
GIT_HANDLERS.help = (state) => ({ state, output: HELP_TEXT.map((l) => muted(l)) });
GIT_HANDLERS["--help"] = GIT_HANDLERS.help;

export const tabComplete = (state, line) => {
    if (!line.trim()) return line;
    // Complete only the last (raw) word so the rest of the line — quotes
    // included — is kept exactly as typed.
    const last = line.match(/(\S*)$/)[1];
    const head = line.slice(0, line.length - last.length);
    const m = last.match(/^(.*\/)?([^/]*)$/);
    const dirPart = m[1] || "";
    const filePart = m[2] || "";
    const dirAbs = dirPart ? normalizePath(state.cwd, expandTilde(dirPart)) : state.cwd;
    const dirNode = getNode(state.fs, dirAbs);
    if (!dirNode || dirNode.type !== "dir") return line;
    const matches = listDir(dirNode).filter((it) => it.name.startsWith(filePart));
    if (matches.length === 0) return line;
    if (matches.length === 1) {
        return head + dirPart + matches[0].name + (matches[0].type === "dir" ? "/" : "");
    }
    // common prefix
    let prefix = matches[0].name;
    for (const it of matches) {
        while (!it.name.startsWith(prefix) && prefix.length > 0) prefix = prefix.slice(0, -1);
    }
    return head + dirPart + prefix;
};
