// Command parser & dispatcher for the simulator.
// Returns array of output lines: { kind: 'out'|'err'|'del'|'muted'|'system'|'success', text: string }
// 'err' is a real error (fails an `&&` chain, plays the error sound); 'del' is
// ordinary output shown in red (deleted / modified / untracked, diff "-" lines).
import {
    HOME,
} from "./initialState";
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
    baseName,
} from "./filesystem";
import {
    newRepo,
    findRepo,
    gitAdd,
    gitCommit,
    gitLog,
    gitBranch,
    gitCheckout,
    gitMerge,
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
    computeDiffPairs,
    remoteAheadBehind,
    status as gitStatus,
    currentBranch,
    headCommit,
} from "./gitEngine";
import { diffHunks, diffStats } from "./diff";

const out = (text) => ({ kind: "out", text });
const err = (text) => ({ kind: "err", text });
const muted = (text) => ({ kind: "muted", text });
const del = (text) => ({ kind: "del", text });
const ok = (text) => ({ kind: "success", text });

const tokenize = (line) => {
    // simple shell tokenizer with quotes
    const out = [];
    let cur = "";
    let q = null;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
            if (ch === q) {
                q = null;
            } else {
                cur += ch;
            }
        } else if (ch === '"' || ch === "'") {
            q = ch;
        } else if (ch === " " || ch === "\t") {
            if (cur) {
                out.push(cur);
                cur = "";
            }
        } else {
            cur += ch;
        }
    }
    if (cur) out.push(cur);
    return out;
};

const splitFlags = (args) => {
    const flags = new Set();
    const rest = [];
    for (const a of args) {
        if (a.startsWith("-") && a !== "-") {
            // handle -rf as two flags
            if (a.startsWith("--")) flags.add(a);
            else {
                for (const c of a.slice(1)) flags.add("-" + c);
            }
        } else rest.push(a);
    }
    return { flags, rest };
};

const HELP_TEXT = [
    "Available commands:",
    "  Linux:  pwd, ls, cd, mkdir, touch, rm, cp, mv, cat, head, tail, clear, echo, tree, whoami, help",
    "  Git:    git init, git status, git add, git commit (--amend), git log, git show, git diff (--staged),",
    "          git branch (-d/-m), git checkout, git switch, git tag, git merge, git rebase,",
    "          git cherry-pick, git reset, git revert, git restore, git rm, git mv,",
    "          git stash / pop, git reflog, git push, git pull, git fetch, git clone,",
    "          git remote, git config, git --version",
    "  Tip:    Press ↑ ↓ for history, Tab for path completion, Ctrl+L to clear.",
];

// Split a line on `&&` (outside quotes) into separate commands.
const splitChain = (line) => {
    const parts = [];
    let cur = "";
    let q = null;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (q) {
            if (ch === q) q = null;
        } else if (ch === '"' || ch === "'") {
            q = ch;
        } else if (ch === "&" && line[i + 1] === "&") {
            parts.push(cur);
            cur = "";
            i++;
            continue;
        }
        cur += ch;
    }
    parts.push(cur);
    return parts.map((p) => p.trim()).filter(Boolean);
};

// `a && b && c`: run each command in turn, stopping at the first one that
// fails (executeSingle's `failed` flag). The last highlight wins.
export const executeCommand = (state, rawLine) => {
    const segments = splitChain(rawLine || "");
    if (segments.length <= 1) return executeSingle(state, rawLine);
    let cur = state;
    let output = [];
    let highlight = null;
    for (const seg of segments) {
        const r = executeSingle(cur, seg);
        cur = r.state;
        output = output.concat(r.output || []);
        if (r.highlight) highlight = r.highlight;
        if (r.failed) break;
    }
    return { state: cur, output, highlight };
};

// Wraps runSingle and flags failure: a handler may say `failed` explicitly;
// otherwise any real error line (kind "err") means the command failed.
const executeSingle = (state, rawLine) => {
    const r = runSingle(state, rawLine);
    const failed = r.failed !== undefined ? !!r.failed : (r.output || []).some((l) => l.kind === "err");
    return { ...r, failed };
};

const runSingle = (state, rawLine) => {
    const line = (rawLine || "").trim();
    if (!line) return { state, output: [] };

    // Deep clone state up-front so handlers can mutate freely without
    // touching the caller's object. This is what makes undo / redo correct
    // (the snapshot for undo is the original `state`, not a mutated version).
    state = JSON.parse(JSON.stringify(state));

    const tokens = tokenize(line);

    // Handle simple > and >> redirection: <cmd ...> [>|>>] target
    let redirect = null;
    const ri = tokens.findIndex((t) => t === ">" || t === ">>");
    if (ri !== -1 && ri < tokens.length - 1) {
        redirect = { mode: tokens[ri], target: tokens[ri + 1] };
        tokens.splice(ri, 2);
    }

    const cmd = tokens[0];
    const args = tokens.slice(1);
    if (!cmd && redirect) {
        // bare `> file` just creates / truncates the file
        const target = normalizePath(state.cwd, expandTilde(redirect.target));
        const wr = writeFileIfNotDir(state.fs, target);
        return { state, output: wr.error ? [err(wr.error)] : [] };
    }
    const handler = Object.prototype.hasOwnProperty.call(HANDLERS, cmd) ? HANDLERS[cmd] : null;
    let output = [];
    let highlight = null;
    if (!handler) {
        if (cmd === "git") {
            // unrecognized git subcommand will be hit below
        } else {
            return {
                state,
                output: [err(`${cmd}: command not found`), muted(`type \`help\` for list of available commands`)],
            };
        }
    }
    const result = handler(state, args, line);
    output = result.output || [];
    if (result.highlight) highlight = result.highlight;
    let nextState = result.state || state;

    if (redirect && output.length > 0) {
        // Concatenate textual content of output lines (skip non-text kinds).
        // Like a real shell, every written line ends with a newline.
        const text = output
            .flatMap((l) =>
                l.kind === "out" || l.kind === "muted" || l.kind === "success" || l.kind === "del"
                    ? [l.text]
                    : l.kind === "ls"
                        ? l.items.map((it) => it.name)
                        : [],
            )
            .map((t) => t + "\n")
            .join("");
        const errors = output.filter((l) => l.kind === "err");
        const target = normalizePath(nextState.cwd, expandTilde(redirect.target));
        const existing = getNode(nextState.fs, target);
        const prev =
            redirect.mode === ">>" && existing && existing.type === "file"
                ? (existing.content || "") + (existing.content && !existing.content.endsWith("\n") ? "\n" : "") + text
                : text;
        const wr = createFile(nextState.fs, target, prev);
        if (wr.error) {
            return {
                state: nextState,
                output: [err(`${cmd}: ${wr.error}`)],
                highlight,
            };
        }
        // Overwrite content if file existed
        const node = getNode(nextState.fs, target);
        if (node && node.type === "file") node.content = prev;
        // Suppress original output when redirected (errors still go to the terminal)
        return { state: nextState, output: errors, highlight };
    }

    return {
        state: nextState,
        output,
        highlight,
    };
};

const writeFileIfNotDir = (fs, path) => {
    const node = getNode(fs, path);
    if (node && node.type === "dir") return { error: `${baseName(path)}: Is a directory` };
    return writeFile(fs, path, "");
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

HANDLERS.ls = (state, args) => {
    const { flags, rest } = splitFlags(args);
    const target = rest[0]
        ? normalizePath(state.cwd, expandTilde(rest[0]))
        : state.cwd;
    const node = getNode(state.fs, target);
    if (!node) return { state, output: [err(`ls: cannot access '${target}': No such file or directory`)] };
    if (node.type === "file") return { state, output: [out(node.name)] };
    const items = listDir(node);
    if (items.length === 0) return { state, output: [muted("(empty)")] };
    if (flags.has("-l")) {
        const lines = items.map((it) => {
            const t = it.type === "dir" ? "drwxr-xr-x" : "-rw-r--r--";
            const size = it.type === "file" ? (it.content?.length ?? 0) : 4096;
            return out(`${t}  ${String(size).padStart(6)}  ${it.name}${it.type === "dir" ? "/" : ""}`);
        });
        return { state, output: lines };
    }
    const line = items
        .map((it) =>
            it.type === "dir" ? `\x01dir\x02${it.name}/\x03` : `\x01file\x02${it.name}\x03`,
        )
        .join("  ");
    return { state, output: [{ kind: "ls", items }] };
};

HANDLERS.cd = (state, args) => {
    const target = args[0] || HOME;
    const expanded = expandTilde(target);
    const next = normalizePath(state.cwd, expanded);
    const node = getNode(state.fs, next);
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
            if (!ensureDir(state.fs, p)) lines.push(err(`mkdir: cannot create directory '${t}': Not a directory`));
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
        const p = normalizePath(state.cwd, expandTilde(t));
        const r = createFile(state.fs, p, "");
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
        const r = remove(state.fs, p, {
            recursive: flags.has("-r") || flags.has("-R"),
        });
        if (r.error) lines.push(err(`rm: ${r.error}`));
    }
    return { state, output: lines };
};

HANDLERS.cp = (state, args) => {
    const { flags, rest } = splitFlags(args);
    if (rest.length < 2) return { state, output: [err("cp: missing operand")] };
    const src = normalizePath(state.cwd, expandTilde(rest[0]));
    const dst = normalizePath(state.cwd, expandTilde(rest[1]));
    const r = copy(state.fs, src, dst, { recursive: flags.has("-r") || flags.has("-R") });
    if (r.error) return { state, output: [err(`cp: ${r.error}`)] };
    return { state, output: [] };
};

HANDLERS.mv = (state, args) => {
    if (args.length < 2) return { state, output: [err("mv: missing operand")] };
    const src = normalizePath(state.cwd, expandTilde(args[0]));
    const dst = normalizePath(state.cwd, expandTilde(args[1]));
    const r = move(state.fs, src, dst);
    if (r.error) return { state, output: [err(`mv: ${r.error}`)] };
    return { state, output: [] };
};

// Lines of a file; a trailing newline ends the last line, it doesn't start a new one.
const fileLines = (content) => (content ? content.replace(/\n$/, "").split("\n") : []);

HANDLERS.cat = (state, args) => {
    if (args.length === 0) return { state, output: [err("cat: missing file")] };
    const lines = [];
    for (const t of args) {
        const p = normalizePath(state.cwd, expandTilde(t));
        const node = getNode(state.fs, p);
        if (!node) {
            lines.push(err(`cat: ${t}: No such file or directory`));
            continue;
        }
        if (node.type !== "file") {
            lines.push(err(`cat: ${t}: Is a directory`));
            continue;
        }
        fileLines(node.content).forEach((l) => lines.push(out(l)));
    }
    return { state, output: lines };
};

HANDLERS.head = (state, args) => {
    if (args.length === 0) return { state, output: [err("head: missing file")] };
    const path = normalizePath(state.cwd, expandTilde(args[args.length - 1]));
    const node = getNode(state.fs, path);
    if (!node || node.type !== "file")
        return { state, output: [err(`head: ${args[args.length - 1]}: No such file`)] };
    const lines = fileLines(node.content).slice(0, 10).map(out);
    return { state, output: lines };
};

HANDLERS.tail = (state, args) => {
    if (args.length === 0) return { state, output: [err("tail: missing file")] };
    const path = normalizePath(state.cwd, expandTilde(args[args.length - 1]));
    const node = getNode(state.fs, path);
    if (!node || node.type !== "file")
        return { state, output: [err(`tail: ${args[args.length - 1]}: No such file`)] };
    const all = fileLines(node.content);
    return { state, output: all.slice(Math.max(0, all.length - 10)).map(out) };
};

HANDLERS.tree = (state, args) => {
    const target = args[0]
        ? normalizePath(state.cwd, expandTilde(args[0]))
        : state.cwd;
    const node = getNode(state.fs, target);
    if (!node || node.type !== "dir")
        return { state, output: [err(`tree: ${target}: Not a directory`)] };
    const lines = [out(target)];
    const walk = (n, prefix) => {
        const items = listDir(n);
        items.forEach((it, i) => {
            const last = i === items.length - 1;
            const branch = last ? "└── " : "├── ";
            lines.push(
                out(prefix + branch + it.name + (it.type === "dir" ? "/" : "")),
            );
            if (it.type === "dir") walk(it, prefix + (last ? "    " : "│   "));
        });
    };
    walk(node, "");
    return { state, output: lines };
};

// -------- GIT --------
HANDLERS.git = (state, args) => {
    if (args.length === 0)
        return { state, output: [muted("usage: git <command> [<args>]")] };
    const sub = args[0];
    const rest = args.slice(1);
    const dispatch = Object.prototype.hasOwnProperty.call(GIT_HANDLERS, sub) ? GIT_HANDLERS[sub] : null;
    if (!dispatch)
        return { state, output: [err(`git: '${sub}' is not a git command. See 'help'.`)] };
    return dispatch(state, rest);
};

const GIT_HANDLERS = {};

GIT_HANDLERS.init = (state) => {
    const cwd = state.cwd;
    if (state.repos[cwd])
        return { state, output: [muted(`Reinitialized existing Git repository in ${cwd}/.git/`)] };
    const repo = newRepo(cwd);
    const newRepos = { ...state.repos, [cwd]: repo };
    return {
        state: { ...state, repos: newRepos },
        output: [ok(`Initialized empty Git repository in ${cwd}/.git/`)],
        highlight: { kind: "git-init", path: cwd },
    };
};

const requireRepo = (state) => {
    const repo = findRepo(state.repos, state.cwd);
    if (!repo) return null;
    return repo;
};

// Path argument (relative to cwd) → path relative to the repo root.
const repoPath = (state, repo, p) =>
    relPath(repo, normalizePath(state.cwd, expandTilde(p)));

const shortRef = (repo) => currentBranch(repo) || `HEAD detached at ${(headCommit(repo) || "").slice(0, 7)}`;

GIT_HANDLERS.status = (state) => {
    const repo = requireRepo(state);
    if (!repo)
        return { state, output: [err("fatal: not a git repository (or any of the parent directories): .git")] };
    const s = gitStatus(state.fs, repo);
    const lines = [];
    const branch = currentBranch(repo);
    lines.push(out(branch ? `On branch ${branch}` : shortRef(repo)));
    if (s.staged.length === 0 && s.unstaged.length === 0 && s.untracked.length === 0) {
        lines.push(muted("nothing to commit, working tree clean"));
    } else {
        if (s.staged.length) {
            lines.push(muted(""));
            lines.push(out("Changes to be committed:"));
            s.staged.forEach((f) =>
                lines.push({ kind: "success", text: `  ${f.kind}:   ${f.path}` }),
            );
        }
        if (s.unstaged.length) {
            lines.push(muted(""));
            lines.push(out("Changes not staged for commit:"));
            s.unstaged.forEach((f) =>
                lines.push(del(`  ${f.kind}:   ${f.path}`)),
            );
        }
        if (s.untracked.length) {
            lines.push(muted(""));
            lines.push(out("Untracked files:"));
            s.untracked.forEach((p) => lines.push(del(`  ${p}`)));
        }
    }
    return { state, output: lines };
};

GIT_HANDLERS.add = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    if (args.length === 0) return { state, output: [err("Nothing specified. (try `git add .`)")] };
    const r = { added: 0 };
    for (const a of args) {
        const target = a === "-A" || a === "--all" ? "-A" : repoPath(state, repo, a);
        const one = gitAdd(state.fs, repo, target);
        if (one.error) return { state, output: [err(one.error)] };
        r.added += one.added;
    }
    if (r.added === 0) {
        return {
            state,
            output: [muted("nothing to stage — working tree matches index")],
        };
    }
    return {
        state,
        output: [ok(`✓ staged ${r.added} file${r.added !== 1 ? "s" : ""}`)],
        highlight: { kind: "git-add", count: r.added },
    };
};

GIT_HANDLERS.commit = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    const amend = args.includes("--amend");
    let msg = "";
    let all = args.includes("--all");
    for (let i = 0; i < args.length; i++) {
        // short flags may be combined: -m, -a, -am
        if (/^-[a-zA-Z]+$/.test(args[i])) {
            if (args[i].includes("a")) all = true;
            if (args[i].endsWith("m") && args[i + 1] && !msg) {
                msg = args[i + 1];
                i++;
            }
        }
    }
    if (!msg && amend) {
        // Keep previous message if no -m
        const head = headCommit(repo);
        msg = head ? repo.commits[head]?.message || "" : "";
    }
    if (!msg) return { state, output: [err("Please provide a message: git commit -m \"your message\"")] };
    if (all) stageTracked(state.fs, repo);
    const r = gitCommit(repo, msg, { amend, allowEmpty: args.includes("--allow-empty") });
    if (r.error) return { state, output: [err(r.error)] };
    return {
        state,
        output: [ok(`[${currentBranch(repo) || "detached HEAD"} ${r.hash}] ${r.amended ? "(amended) " : ""}${r.message}`)],
        highlight: { kind: r.amended ? "git-amend" : "git-commit", hash: r.hash, message: r.message },
    };
};

GIT_HANDLERS.log = (state, args = []) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    // Supported: --oneline, -n <N>, -<N>, --max-count=<N>. Other flags
    // (e.g. --graph, --all) are accepted and ignored.
    let oneline = false;
    let limit = Infinity;
    for (let i = 0; i < args.length; i++) {
        const a = args[i];
        if (a === "--oneline") oneline = true;
        else if (a === "-n" && /^\d+$/.test(args[i + 1] || "")) limit = Number(args[++i]);
        else if (/^-\d+$/.test(a)) limit = Number(a.slice(1));
        else if (/^--max-count=\d+$/.test(a)) limit = Number(a.split("=")[1]);
    }
    const commits = gitLog(repo).slice(0, limit);
    if (commits.length === 0) return { state, output: [muted("(no commits yet)")] };
    if (oneline) {
        const head = headCommit(repo);
        const lines = commits.map((c) => {
            const refs = [];
            for (const [name, hash] of Object.entries(repo.branches)) {
                if (hash !== c.hash) continue;
                refs.push(
                    repo.HEAD.type === "branch" && repo.HEAD.ref === name
                        ? `HEAD -> ${name}`
                        : name,
                );
            }
            if (repo.HEAD.type === "detached" && head === c.hash) refs.unshift("HEAD");
            for (const [name, hash] of Object.entries(repo.tags || {}))
                if (hash === c.hash) refs.push(`tag: ${name}`);
            const firstLine = String(c.message || "").split("\n")[0];
            return out(`${c.hash}${refs.length ? ` (${refs.join(", ")})` : ""} ${firstLine}`);
        });
        return { state, output: lines };
    }
    return {
        state,
        output: commits.map((c) => ({ kind: "log-commit", commit: c })),
    };
};

GIT_HANDLERS.branch = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    const { flags, rest } = splitFlags(args);
    if (flags.has("-d") || flags.has("-D")) {
        if (!rest[0]) return { state, output: [err("fatal: branch name required")] };
        const r = gitBranch(repo, rest[0], { delete: true });
        if (r.error) return { state, output: [err(r.error)] };
        return { state, output: [ok(`Deleted branch ${r.deleted}.`)] };
    }
    if (flags.has("-m") || flags.has("-M")) {
        // git branch -m <new>  OR  git branch -m <old> <new>
        const [a, b] = rest;
        const from = b ? a : currentBranch(repo);
        const to = b || a;
        const r = gitBranch(repo, to, { rename: true, from });
        if (r.error) return { state, output: [err(r.error)] };
        return {
            state,
            output: [ok(`Renamed branch '${r.renamed.from}' to '${r.renamed.to}'`)],
            highlight: { kind: "git-branch", name: r.renamed.to },
        };
    }
    if (rest.length === 0) {
        const r = gitBranch(repo, null);
        const lines = [];
        if (r.list.length === 0 && repo.HEAD.type === "branch")
            return { state, output: [muted(`(no commits yet on branch '${repo.HEAD.ref}' — it appears after your first commit)`)] };
        if (repo.HEAD.type === "detached")
            lines.push({ kind: "success", text: `* (${shortRef(repo)})` });
        r.list.forEach((b) => lines.push(
            b.active
                ? { kind: "success", text: `* ${b.name}` }
                : out(`  ${b.name}`),
        ));
        return { state, output: lines };
    }
    const r = gitBranch(repo, rest[0], { start: rest[1] });
    if (r.error) return { state, output: [err(r.error)] };
    return {
        state,
        output: [ok(`Created branch '${r.created}'`)],
        highlight: { kind: "git-branch", name: r.created },
    };
};

const checkoutImpl = (state, args, asSwitch) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    const { flags, rest } = splitFlags(args);
    const newBranch = flags.has("-b") || flags.has("-c");
    const target = rest[0];
    if (!target) return { state, output: [err("missing branch / commit")] };
    // `git checkout -- <file>` / `git checkout <file>`: discard working-tree changes
    if (!asSwitch && !newBranch && (flags.has("--") || (!repo.branches[target] && getNode(state.fs, normalizePath(state.cwd, target)) && !repo.commits[target]))) {
        return GIT_HANDLERS.restore(state, rest);
    }
    const r = gitCheckout(state.fs, repo, target, { newBranch, start: newBranch ? rest[1] : undefined });
    if (r.error) return { state, output: [err(r.error)] };
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

GIT_HANDLERS.checkout = (state, args) => checkoutImpl(state, args, false);
GIT_HANDLERS.switch = (state, args) => {
    // git switch -c creates new branch
    const a = [...args];
    if (a.includes("-c")) a[a.indexOf("-c")] = "-b";
    return checkoutImpl(state, a, true);
};

GIT_HANDLERS.merge = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    if (!args[0]) return { state, output: [err("usage: git merge <branch>")] };
    const r = gitMerge(state.fs, repo, args[0]);
    if (r.error) return { state, output: [err(r.error)] };
    if (r.alreadyUpToDate) return { state, output: [muted(r.message)] };
    return {
        state,
        output: [ok(r.ff ? `Fast-forward to ${args[0]}` : `Merged branch '${r.merged}' into ${currentBranch(repo)} (${r.hash})`)],
        highlight: { kind: "git-merge", branch: args[0] },
    };
};

GIT_HANDLERS.rebase = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    if (!args[0]) return { state, output: [err("usage: git rebase <onto>")] };
    const r = gitRebase(state.fs, repo, args[0]);
    if (r.error) return { state, output: [err(r.error)] };
    if (r.upToDate) return { state, output: [muted(r.message)] };
    return {
        state,
        output: [ok(r.ff ? `Fast-forward rebase onto ${args[0]}` : `Replayed ${r.count} commit(s) onto ${args[0]}`)],
        highlight: { kind: "git-rebase", onto: args[0] },
    };
};

GIT_HANDLERS.reset = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    const { flags, rest } = splitFlags(args);
    let mode = "--mixed";
    if (flags.has("--hard")) mode = "--hard";
    if (flags.has("--soft")) mode = "--soft";
    // `git reset [HEAD] <file>`: unstage paths, don't move HEAD
    const paths =
        rest[0] === "HEAD"
            ? rest.slice(1)
            : rest.filter((x) => repoPath(state, repo, x) in repo.staged && !repo.branches[x]);
    if (mode === "--mixed" && paths.length) {
        return GIT_HANDLERS.restore(state, ["--staged", ...paths]);
    }
    const target = rest[0] || "HEAD";
    const r = gitReset(state.fs, repo, target, mode);
    if (r.error) return { state, output: [err(r.error)] };
    return {
        state,
        output: [ok(`HEAD is now at ${r.hash} (${mode})`)],
        highlight: { kind: "git-reset", target, mode },
    };
};

GIT_HANDLERS.revert = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    if (!args[0]) return { state, output: [err("usage: git revert <commit>")] };
    const r = gitRevert(state.fs, repo, args[0]);
    if (r.error) return { state, output: [err(r.error)] };
    return {
        state,
        output: [ok(`Reverted commit ${args[0]} as ${r.hash}`)],
        highlight: { kind: "git-revert", target: args[0] },
    };
};

GIT_HANDLERS.push = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    const { flags, rest } = splitFlags(args); // -u / --set-upstream are no-ops
    const force = flags.has("--force") || flags.has("-f") || flags.has("--force-with-lease");
    const branch = rest[1] || currentBranch(repo);
    const r = gitPush(repo, branch, { force });
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
    if (r.error) return { state, output: [err(r.error)] };
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
};

GIT_HANDLERS.fetch = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    const r = gitFetch(repo);
    const branch = currentBranch(repo);
    const ab = branch ? remoteAheadBehind(repo, branch) : null;
    const lines = [
        ok(`Fetched ${r.branches.length} branch(es) from origin (+${r.newCommits} new commit${r.newCommits !== 1 ? "s" : ""})`),
    ];
    if (ab && ab.hasRemote && ab.hasLocal) {
        lines.push(
            muted(
                `Branch '${branch}' is ${ab.ahead} ahead, ${ab.behind} behind origin/${branch}`,
            ),
        );
    }
    return { state, output: lines, highlight: { kind: "git-fetch" } };
};

GIT_HANDLERS.pull = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    const { rest } = splitFlags(args);
    const r = gitPull(state.fs, repo, rest[1] || null);
    if (r.error) return { state, output: [err(r.error)] };
    return {
        state,
        output: [
            ok(
                r.message ||
                    (r.ff
                        ? "Fast-forwarded from origin"
                        : `Merged origin into ${currentBranch(repo)}`),
            ),
        ],
        highlight: { kind: "git-pull" },
    };
};

GIT_HANDLERS.clone = (state, args) => {
    if (!args[0]) return { state, output: [err("usage: git clone <url>")] };
    const r = gitClone(state.fs, args[0], state.cwd);
    if (r.error) return { state, output: [err(r.error)] };
    const newRepos = { ...state.repos, [r.repo.path]: r.repo };
    return {
        state: { ...state, repos: newRepos },
        output: [
            muted(`Cloning into '${r.name}'...`),
            muted(`remote: counting objects... done`),
            ok(`Receiving objects: 100%`),
            ok(`Cloned to ${r.repo.path}`),
        ],
        highlight: { kind: "git-clone", name: r.name },
    };
};

// ---- NEW GIT COMMANDS ----

GIT_HANDLERS.tag = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    // drop the value of -m "<message>" (annotated tags are stored like lightweight ones)
    const mi = args.findIndex((a) => a === "-m");
    const { flags, rest } = splitFlags(mi === -1 ? args : [...args.slice(0, mi), ...args.slice(mi + 2)]);
    if (flags.has("-d")) {
        if (!rest[0]) return { state, output: [err("usage: git tag -d <tagname>")] };
        const r = gitTag(repo, rest[0], null, { delete: true });
        if (r.error) return { state, output: [err(r.error)] };
        return { state, output: [ok(`Deleted tag '${r.deleted}'`)] };
    }
    if (rest.length === 0 || flags.has("-l") || flags.has("--list")) {
        const r = gitTag(repo, null);
        if (r.list.length === 0) return { state, output: [muted("(no tags)")] };
        return {
            state,
            output: r.list.map((t) => out(`${t.name}  ${t.hash}`)),
        };
    }
    const r = gitTag(repo, rest[0], rest[1] || null);
    if (r.error) return { state, output: [err(r.error)] };
    return {
        state,
        output: [ok(`Created tag '${r.created}' on ${r.hash}`)],
        highlight: { kind: "git-tag", name: r.created },
    };
};

GIT_HANDLERS.stash = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    const sub = args[0];
    if (!sub || sub === "push" || sub === "save" || sub.startsWith("-")) {
        const message = args.includes("-m")
            ? args[args.indexOf("-m") + 1] || "WIP"
            : args.filter((a, i) => !(i === 0 && (a === "push" || a === "save")) && !a.startsWith("-")).join(" ") || "WIP";
        const r = gitStash(state.fs, repo, message);
        if (r.error) return { state, output: [err(r.error)] };
        return {
            state,
            output: [ok(`Saved working directory and index state ${r.id}`)],
            highlight: { kind: "git-stash", id: r.id },
        };
    }
    if (sub === "pop") {
        const r = gitStashPop(state.fs, repo);
        if (r.error) return { state, output: [err(r.error)] };
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
            output: repo.stashes.map((s, i) =>
                out(`stash@{${i}}: WIP on ${s.branch || "(no branch)"}: ${s.message}`),
            ),
        };
    }
    if (sub === "clear") {
        repo.stashes = [];
        return { state, output: [ok("Cleared stash entries.")] };
    }
    return { state, output: [err(`stash: unknown subcommand '${sub}'`)] };
};

GIT_HANDLERS["cherry-pick"] = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    if (!args[0]) return { state, output: [err("usage: git cherry-pick <commit>")] };
    const r = gitCherryPick(state.fs, repo, args[0]);
    if (r.error) return { state, output: [err(r.error)] };
    return {
        state,
        output: [ok(`Picked ${r.picked} as ${r.hash}`)],
        highlight: { kind: "git-cherry-pick", picked: r.picked, hash: r.hash },
    };
};

GIT_HANDLERS.reflog = (state) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    const entries = gitReflog(repo);
    if (entries.length === 0) return { state, output: [muted("(empty reflog)")] };
    const lines = entries.map((e, i) => {
        const hash = e.newHash ? e.newHash.slice(0, 7) : "-------";
        return out(`${hash} HEAD@{${i}}: ${e.op}: ${e.message || ""}`);
    });
    return { state, output: lines };
};

GIT_HANDLERS.show = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    const r = gitShow(repo, args[0]);
    if (r.error) return { state, output: [err(r.error)] };
    const c = r.commit;
    const lines = [
        { kind: "out", text: `commit ${c.hash}` },
        muted(`Author: ${c.author}`),
        muted(`Date:   ${new Date(c.date).toLocaleString()}`),
        out(""),
        out(`    ${c.message}`),
        out(""),
    ];
    for (const ch of r.changes) {
        const stats = diffStats(ch.before, ch.after);
        lines.push({ kind: "success", text: `--- ${ch.path}  +${stats.adds} -${stats.dels}` });
        const hunks = diffHunks(ch.before, ch.after, 2);
        for (const h of hunks) {
            lines.push(muted(`@@ -${h.oldStart} +${h.newStart} @@`));
            for (const l of h.lines) {
                if (l.type === "add") lines.push({ kind: "success", text: "+ " + l.text });
                else if (l.type === "del") lines.push(del("- " + l.text));
                else lines.push(muted("  " + l.text));
            }
        }
    }
    return { state, output: lines, highlight: { kind: "git-show", hash: c.hash } };
};

GIT_HANDLERS.diff = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    const { flags, rest } = splitFlags(args);
    let opts = {};
    // Leading args that name commits are revisions; the rest are paths.
    const isRev = (x) =>
        x === "HEAD" || /[~^]/.test(x) || repo.branches[x] || repo.tags?.[x] || repo.commits[x] || repo.remoteRefs?.[x];
    const revs = [];
    while (revs.length < 2 && rest.length && isRev(rest[0]) && !getNode(state.fs, normalizePath(state.cwd, rest[0])))
        revs.push(rest.shift());
    if (flags.has("--staged") || flags.has("--cached")) opts = { staged: true };
    else if (revs.length === 2) opts = { between: [revs[0], revs[1]] };
    else if (revs.length === 1) opts = { between: [revs[0], null] };
    if (rest.length) opts.paths = rest.map((p) => repoPath(state, repo, p));
    const pairs = computeDiffPairs(state.fs, repo, opts);
    if (pairs.length === 0) return { state, output: [muted("(no changes)")] };
    const lines = [];
    for (const p of pairs) {
        const stats = diffStats(p.before, p.after);
        lines.push({ kind: "success", text: `--- ${p.path}  +${stats.adds} -${stats.dels}` });
        const hunks = diffHunks(p.before, p.after, 2);
        for (const h of hunks) {
            lines.push(muted(`@@ -${h.oldStart} +${h.newStart} @@`));
            for (const l of h.lines) {
                if (l.type === "add") lines.push({ kind: "success", text: "+ " + l.text });
                else if (l.type === "del") lines.push(del("- " + l.text));
                else lines.push(muted("  " + l.text));
            }
        }
    }
    return { state, output: lines, highlight: { kind: "git-diff", count: pairs.length } };
};

GIT_HANDLERS.restore = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    const { flags, rest } = splitFlags(args);
    const path = rest[0];
    if (!path) return { state, output: [err("usage: git restore [--staged] <path>")] };
    const r = { unstaged: 0, restored: 0 };
    for (const p of rest) {
        const one = gitRestore(state.fs, repo, repoPath(state, repo, p), { staged: flags.has("--staged") });
        if (one.error) return { state, output: [err(one.error)] };
        r.unstaged += one.unstaged || 0;
        r.restored += one.restored || 0;
    }
    return {
        state,
        output: [
            ok(
                flags.has("--staged")
                    ? `Unstaged ${r.unstaged} change(s)`
                    : `Restored ${r.restored} file(s)`,
            ),
        ],
        highlight: { kind: "git-restore", path },
    };
};

GIT_HANDLERS.rm = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    const { flags, rest } = splitFlags(args);
    if (!rest[0]) return { state, output: [err("usage: git rm [--cached] [-r] <file>")] };
    const lines = [];
    for (const p of rest) {
        const r = gitRm(state.fs, repo, repoPath(state, repo, p), {
            cached: flags.has("--cached"),
            recursive: flags.has("-r"),
        });
        if (r.error) return { state, output: [...lines, err(r.error)] };
        lines.push(ok(`rm '${p}' (${r.removed} file(s))`));
    }
    return {
        state,
        output: lines,
        highlight: { kind: "git-rm", path: rest[0] },
    };
};

GIT_HANDLERS.mv = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    if (args.length < 2) return { state, output: [err("usage: git mv <src> <dst>")] };
    const r = gitMv(state.fs, repo, repoPath(state, repo, args[0]), repoPath(state, repo, args[1]));
    if (r.error) return { state, output: [err(r.error)] };
    return {
        state,
        output: [ok(`Renamed ${args[0]} -> ${args[1]}`)],
        highlight: { kind: "git-mv" },
    };
};

GIT_HANDLERS.remote = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    const r = gitRemote(repo, args);
    if (r.error) return { state, output: [err(r.error)] };
    if (r.list)
        return {
            state,
            output: r.list.flatMap((rm) => [
                out(`${rm.name}\t${rm.url} (fetch)`),
                out(`${rm.name}\t${rm.url} (push)`),
            ]),
        };
    if (r.added) return { state, output: [ok(`Added remote '${r.added.name}' -> ${r.added.url}`)] };
    if (r.removed) return { state, output: [ok(`Removed remote '${r.removed}'`)] };
    return { state, output: [] };
};

GIT_HANDLERS.config = (state, args) => {
    const repo = requireRepo(state);
    if (!repo) return { state, output: [err("fatal: not a git repository")] };
    const { flags, rest } = splitFlags(args);
    // Drop --global / --local (no-op in sim)
    const filtered = rest.filter((x) => x !== "--global" && x !== "--local");
    const r = gitConfig(repo, { flags, rest: filtered });
    if (r.error) return { state, output: [err(r.error)] };
    if (r.value !== undefined) return { state, output: [out(r.value)] };
    if (r.set) return { state, output: [ok(`Set ${r.set.key} = ${r.set.val}`)] };
    if (r.list)
        return {
            state,
            output: [
                out(`user.name=${r.list.user.name}`),
                out(`user.email=${r.list.user.email}`),
            ],
        };
    return { state, output: [] };
};

GIT_HANDLERS["--version"] = (state) => ({
    state,
    output: [out("git version 2.43.0 (GitNaadu simulated)")],
});

GIT_HANDLERS.version = GIT_HANDLERS["--version"];
GIT_HANDLERS.help = (state) => ({
    state,
    output: HELP_TEXT.map((l) => muted(l)),
});


export const tabComplete = (state, line) => {
    if (!line.trim()) return line;
    // Complete only the last (raw) word so the rest of the line — quotes
    // included — is kept exactly as typed.
    const last = line.match(/(\S*)$/)[1];
    const head = line.slice(0, line.length - last.length);
    // path completion: look at parent dir
    const m = last.match(/^(.*\/)?([^\/]*)$/);
    const dirPart = m[1] || "";
    const filePart = m[2] || "";
    const dirAbs = dirPart
        ? normalizePath(state.cwd, expandTilde(dirPart))
        : state.cwd;
    const dirNode = getNode(state.fs, dirAbs);
    if (!dirNode || dirNode.type !== "dir") return line;
    const matches = listDir(dirNode).filter((it) => it.name.startsWith(filePart));
    if (matches.length === 0) return line;
    if (matches.length === 1) {
        return head + dirPart + matches[0].name + (matches[0].type === "dir" ? "/" : "");
    }
    // common prefix
    let prefix = matches[0].name;
    for (const m of matches) {
        while (!m.name.startsWith(prefix) && prefix.length > 0) prefix = prefix.slice(0, -1);
    }
    return head + dirPart + prefix;
};
