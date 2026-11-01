import { autoSuggest, executeCommand, getCloneUrl } from "../commands";
import { buildInitialFS, buildInitialRepos, HOME, PYTHON_PROJECT } from "../initialState";
import { findRepo, resolveRev, headCommit, currentBranch } from "../gitEngine";
import { getNode } from "../filesystem";
import { merge3 } from "../merge3";

const fresh = () => ({
    fs: buildInitialFS(),
    cwd: HOME,
    repos: {},
    history: [],
    lines: [],
    lastHighlight: null,
    stats: {},
    challenges: {},
});

// Run each line in turn; returns the final state and the last result.
const run = (state, ...lines) => {
    let last = null;
    for (const line of lines) {
        last = executeCommand(state, line);
        state = last.state;
    }
    return { state, last, text: (last?.output || []).map((l) => l.text).join("\n") };
};

const repoOf = (state) => findRepo(state.repos, state.cwd);
const read = (state, rel) => getNode(state.fs, `${state.cwd}/${rel}`)?.content;

// A repo at ~/proj with one commit containing f.txt = "a\nb\nc".
const withRepo = () =>
    run(
        fresh(),
        "mkdir proj",
        "cd proj",
        "git init",
        'echo "a\nb\nc" > f.txt',
        "git add .",
        'git commit -m "base"',
    ).state;

describe("shell parser", () => {
    test("suggests matching commands, Git subcommands, and paths", () => {
        const state = fresh();
        expect(autoSuggest(state, "gi")).toBe("t");
        expect(autoSuggest(state, "git cl")).toBe("one");
        expect(autoSuggest(state, "cd py")).toBe("thon-project/");
        expect(autoSuggest(state, "unknown")).toBe("");
        expect(autoSuggest(state, "git ")).toBe("");
    });

    test("quoted > is text, not a redirect", () => {
        const { text } = run(fresh(), 'echo "a > b"');
        expect(text).toBe("a > b");
    });

    test("redirect works without spaces", () => {
        const { state } = run(fresh(), "echo hi>x.txt");
        expect(getNode(state.fs, `${HOME}/x.txt`).content).toBe("hi\n");
    });

    test("backslash escapes a space", () => {
        const { text } = run(fresh(), "echo a\\ \\ b");
        expect(text).toBe("a  b");
    });

    test("&& stops after a failure, || runs only after one, ; always runs", () => {
        expect(run(fresh(), "cd nope && echo no").text).not.toContain("no\n");
        expect(run(fresh(), "cd nope && echo no").last.output.some((l) => l.text === "no")).toBe(false);
        expect(run(fresh(), "cd nope || echo yes").last.output.some((l) => l.text === "yes")).toBe(true);
        expect(run(fresh(), "true_cmd ; echo after").last.output.some((l) => l.text === "after")).toBe(true);
        expect(run(fresh(), "pwd || echo skipped").last.output.some((l) => l.text === "skipped")).toBe(false);
    });

    test("ls hides dotfiles; ls -a shows them plus the repo's .git", () => {
        const names = (r) => r.last.output[0].items.map((it) => it.name);
        let s = run(fresh(), "mkdir proj", "cd proj", "touch .env a.txt").state;
        expect(names(run(s, "ls"))).toEqual(["a.txt"]);
        expect(names(run(s, "ls -a"))).toEqual([".", "..", ".env", "a.txt"]);
        s = run(s, "git init").state;
        expect(names(run(s, "ls"))).toEqual(["a.txt"]);
        expect(names(run(s, "ls -a"))).toEqual([".", "..", ".git", ".env", "a.txt"]);
        expect(names(run(s, "ls -A"))).toEqual([".git", ".env", "a.txt"]);
        expect(names(run(s, "ls .git"))).toContain("HEAD");
        expect(run(s, "ls -la").text).toMatch(/drwxr-xr-x .* \.git\//);
        // .git isn't a real folder, so it never shows up as untracked
        expect(run(s, "git status").text).not.toContain(".git");
        expect(run(s, "cd .git").last.output[0].kind).toBe("err");
    });

    test("pipes give a clear error", () => {
        expect(run(fresh(), "ls | cat").text).toMatch(/pipes/);
    });

    test("unterminated quote is an error", () => {
        expect(run(fresh(), 'echo "oops').last.failed).toBe(true);
    });

    test("commands never mutate the input state (undo relies on it)", () => {
        const s = withRepo();
        const before = JSON.stringify(s);
        run(s, "touch new.txt", "git add .", 'git commit -m "x"', "rm -r ../proj");
        expect(JSON.stringify(s)).toBe(before);
    });
});

describe("prototype-named files", () => {
    test("files named like Object built-ins behave normally", () => {
        let { state, text } = run(withRepo(), "git status");
        expect(text).toContain("working tree clean");
        ({ state } = run(state, "touch constructor toString"));
        ({ text } = run(state, "git status"));
        expect(text).toContain("constructor");
        expect(text).not.toContain("modified");
        ({ state } = run(state, "git add .", 'git commit -m "weird names"'));
        expect(run(state, "git status").text).toContain("working tree clean");
    });

    test("__proto__ is refused as a name", () => {
        const r = run(fresh(), "mkdir __proto__");
        expect(r.last.failed).toBe(true);
        expect(Object.getPrototypeOf(getNode(r.state.fs, HOME).children)).toBe(Object.prototype);
    });
});

describe("filesystem ↔ repo sync", () => {
    test("rm -r of a repo folder drops its history", () => {
        let { state } = run(withRepo(), "cd ..", "rm -r proj", "mkdir proj", "cd proj");
        expect(repoOf(state)).toBeNull();
        expect(run(state, "git log").text).toMatch(/not a git repository/);
    });

    test("mv of a repo folder keeps its history", () => {
        const { state } = run(withRepo(), "cd ..", "mv proj renamed", "cd renamed");
        expect(repoOf(state).path).toBe(`${HOME}/renamed`);
        expect(run(state, "git log --oneline").text).toContain("base");
    });

    test("removing the cwd moves you to an existing parent", () => {
        const { state } = run(withRepo(), "rm -r ../proj");
        expect(state.cwd).toBe(HOME);
    });
});

describe("starter Python repository", () => {
    test("starts on main with the sample files already committed", () => {
        const fs = buildInitialFS();
        const repo = buildInitialRepos(fs)[PYTHON_PROJECT];
        const state = { ...fresh(), fs, cwd: PYTHON_PROJECT, repos: { [PYTHON_PROJECT]: repo } };

        expect(currentBranch(repo)).toBe("main");
        expect(Object.keys(repo.commits)).toHaveLength(1);
        expect(run(state, "git status").text).toContain("working tree clean");
        expect(run(state, "ls").last.output[0].items.map((item) => item.name)).toEqual([
            "main.py",
            "requirements.txt",
        ]);
    });

    test("supports the screenshot's rename, unsupported command, and help sequence", () => {
        const fs = buildInitialFS();
        const state = {
            ...fresh(),
            fs,
            cwd: PYTHON_PROJECT,
            repos: buildInitialRepos(fs),
        };
        const failed = run(
            state,
            "mv main.py main1.py",
            "mv main1.py main.py",
            "sudo apt install",
        );

        expect(getNode(failed.state.fs, `${PYTHON_PROJECT}/main.py`).type).toBe("file");
        expect(getNode(failed.state.fs, `${PYTHON_PROJECT}/main1.py`)).toBeNull();
        expect(failed.text).toContain("sudo: command not found");
        expect(failed.text).toContain("type `help` for list of available commands");

        const help = run(failed.state, "help");
        expect(help.text).toContain("git init");
        expect(currentBranch(findRepo(help.state.repos, PYTHON_PROJECT))).toBe("main");
    });

    test("keeps the second-repository lesson usable with the preconfigured starter", () => {
        const fs = buildInitialFS();
        const state = {
            ...fresh(),
            fs,
            cwd: PYTHON_PROJECT,
            repos: buildInitialRepos(fs),
        };
        const result = run(
            state,
            "mkdir ~/second-project && cd ~/second-project",
            "git init",
            'echo "# Second project" > README.md && git add .',
            'git commit -m "initial second project"',
        );

        expect(result.last.failed).toBe(false);
        expect(Object.keys(result.state.repos["/home/student/second-project"].commits)).toHaveLength(1);
        expect(getNode(result.state.fs, "/home/student/second-project/README.md").content).toBe("# Second project\n");
    });
});

describe("git clone", () => {
    test("imports a downloaded repository and its recent history", () => {
        const source = {
            name: "demo",
            branch: "main",
            commits: [
                {
                    hash: "def5678",
                    parents: ["abc1234"],
                    message: "second",
                    author: "student",
                    date: "2025-01-02T00:00:00.000Z",
                    files: { "README.md": "updated\n", "src/index.js": "hello\n" },
                },
                {
                    hash: "abc1234",
                    parents: [],
                    message: "first",
                    author: "student",
                    date: "2025-01-01T00:00:00.000Z",
                    files: { "README.md": "initial\n" },
                },
            ],
        };
        const result = executeCommand(fresh(), "git clone https://github.com/acme/demo.git", {
            cloneSource: source,
        });
        const repo = result.state.repos[`${HOME}/demo`];
        expect(result.failed).toBe(false);
        expect(result.state.cwd).toBe(HOME);
        expect(repo.branches.main).toBe("def5678");
        expect(repo.commits["def5678"].parents).toEqual(["abc1234"]);
        expect(getNode(result.state.fs, `${HOME}/demo/README.md`).content).toBe("updated\n");
        expect(getNode(result.state.fs, `${HOME}/demo/src/index.js`).content).toBe("hello\n");
        expect(getCloneUrl("git clone -- https://github.com/acme/demo.git && cd demo")).toBe(
            "https://github.com/acme/demo.git",
        );
    });

    test("reports a failed remote download without creating a repository", () => {
        const result = executeCommand(fresh(), "git clone https://github.com/acme/demo.git", {
            cloneSource: { error: "GitHub API limit exceeded" },
        });
        expect(result.failed).toBe(true);
        expect(result.output[0].text).toContain("GitHub API limit exceeded");
        expect(result.state.repos).toEqual({});
    });
});

describe("revisions", () => {
    test("~N, ^ and ^2 (second parent)", () => {
        let state = withRepo();
        ({ state } = run(
            state,
            "git checkout -b side",
            "touch s.txt",
            "git add .",
            'git commit -m "side"',
            "git checkout main",
            "touch m.txt",
            "git add .",
            'git commit -m "main"',
            "git merge side",
        ));
        const repo = repoOf(state);
        const merge = repo.commits[headCommit(repo)];
        expect(merge.parents).toHaveLength(2);
        expect(resolveRev(repo, "HEAD^")).toBe(merge.parents[0]);
        expect(resolveRev(repo, "HEAD^2")).toBe(merge.parents[1]);
        expect(repo.commits[resolveRev(repo, "HEAD^2~1")].message).toBe("base");
        expect(resolveRev(repo, "HEAD^3")).toBeNull();
    });
});

describe("git diff revisions", () => {
    // main: f.txt = a,b,c then g.txt; feature (from base): f.txt line b → B
    const forked = () =>
        run(
            withRepo(),
            "git checkout -b feature",
            'echo "a\nB\nc" > f.txt',
            'git commit -am "edit f"',
            "git checkout main",
            "echo g > g.txt",
            "git add .",
            'git commit -m "add g"',
        ).state;
    const files = (r) => r.last.output.filter((l) => /^--- /.test(l.text)).map((l) => l.text.split(/\s+/)[1]);

    test("A..B compares the two branch tips", () => {
        const s = forked();
        const r = run(s, "git diff main..feature");
        expect(r.last.highlight?.kind).toBe("git-diff");
        expect(files(r).sort()).toEqual(["f.txt", "g.txt"]);
        expect(r.text).toContain("+ B");
        // same as the two-argument form
        expect(run(s, "git diff main feature").text).toBe(r.text);
    });

    test("A...B compares B with the merge base", () => {
        const r = run(forked(), "git diff main...feature");
        expect(files(r)).toEqual(["f.txt"]);
    });

    test("an empty side means HEAD", () => {
        const s = forked();
        expect(run(s, "git diff feature..").text).toBe(run(s, "git diff feature..HEAD").text);
        expect(run(s, "git diff ..feature").text).toBe(run(s, "git diff HEAD..feature").text);
    });

    test("unknown side errors; identical sides show no changes", () => {
        const s = forked();
        expect(run(s, "git diff main..nope").last.output[0].kind).toBe("err");
        expect(run(s, "git diff main..main").text).toBe("(no changes)");
    });

    test("revisions before -- and paths after it", () => {
        const s = forked();
        expect(files(run(s, "git diff main..feature -- f.txt"))).toEqual(["f.txt"]);
        expect(files(run(s, "git diff HEAD~1 -- g.txt"))).toEqual(["g.txt"]);
        expect(run(s, "git diff nope -- f.txt").last.output[0].kind).toBe("err");
    });

    test("git log takes a revision or a range", () => {
        const s = forked();
        const msgs = (line) => run(s, `git log --oneline ${line}`).last.output.map((l) => l.text.replace(/^\S+ (\(.*?\) )?/, ""));
        expect(msgs("")).toEqual(["add g", "base"]);
        expect(msgs("feature")).toEqual(["edit f", "base"]);
        expect(msgs("main..feature")).toEqual(["edit f"]);
        expect(msgs("feature..main")).toEqual(["add g"]);
        expect(msgs("main...feature").sort()).toEqual(["add g", "edit f"]);
        expect(run(s, "git log main..main").text).toBe("(no commits in that range)");
        expect(run(s, "git log main..nope").last.output[0].kind).toBe("err");
        expect(msgs("-n 1")).toEqual(["add g"]);
    });

    test("paths with .. still work as paths", () => {
        let s = run(withRepo(), "mkdir sub", "cd sub").state;
        s = run(s, "echo z >> ../f.txt").state;
        expect(files(run(s, "git diff ../f.txt"))).toEqual(["f.txt"]);
        s = run(s, "cd ..", "git add .", 'git commit -m "z"', "rm f.txt", "cd sub").state;
        expect(files(run(s, "git diff ../f.txt"))).toEqual(["f.txt"]);
        expect(files(run(s, "git diff"))).toEqual(["f.txt"]);
    });
});

describe("branches", () => {
    test("-d refuses unmerged branches, -D forces", () => {
        let { state } = run(withRepo(), "git checkout -b wip", "touch w.txt", "git add .", 'git commit -m "w"', "git checkout main");
        let r = run(state, "git branch -d wip");
        expect(r.last.failed).toBe(true);
        expect(r.text).toMatch(/not fully merged/);
        r = run(state, "git branch -D wip");
        expect(r.last.failed).toBe(false);
        expect(repoOf(r.state).branches.wip).toBeUndefined();
    });

    test("invalid ref names are rejected", () => {
        const r = run(withRepo(), "git branch 'bad name'");
        expect(r.last.failed).toBe(true);
        expect(run(withRepo(), "git branch a..b").last.failed).toBe(true);
    });
});

describe("merge conflicts", () => {
    const diverged = () =>
        run(
            withRepo(),
            "git checkout -b feature",
            'echo "a\nFEATURE\nc" > f.txt',
            'git commit -am "feature edit"',
            "git checkout main",
            'echo "a\nMAIN\nc" > f.txt',
            'git commit -am "main edit"',
        ).state;

    test("non-overlapping edits merge cleanly", () => {
        const { state } = run(
            withRepo(),
            "git checkout -b feature",
            'echo "A\nb\nc" > f.txt',
            'git commit -am "top"',
            "git checkout main",
            'echo "a\nb\nC" > f.txt',
            'git commit -am "bottom"',
            "git merge feature",
        );
        expect(read(state, "f.txt")).toBe("A\nb\nC\n");
        expect(repoOf(state).merging).toBeNull();
    });

    test("conflicting edits stop with markers, then resolve + commit", () => {
        let { state, last } = run(diverged(), "git merge feature");
        expect(last.failed).toBe(true);
        expect(last.highlight.kind).toBe("git-merge-conflict");
        expect(read(state, "f.txt")).toContain("<<<<<<< HEAD");
        expect(run(state, "git status").text).toContain("both modified:   f.txt");
        // Blocked while unresolved
        expect(run(state, 'git commit -m "x"').last.failed).toBe(true);
        expect(run(state, "git checkout feature").last.failed).toBe(true);

        ({ state } = run(state, 'echo "a\nBOTH\nc" > f.txt', "git add f.txt"));
        const r = run(state, "git commit");
        expect(r.last.failed).toBe(false);
        const repo = repoOf(r.state);
        const head = repo.commits[headCommit(repo)];
        expect(head.parents).toHaveLength(2);
        expect(head.message).toBe("Merge branch 'feature'");
        expect(head.files["f.txt"]).toBe("a\nBOTH\nc\n");
        expect(repo.merging).toBeNull();
    });

    test("merge --abort restores the pre-merge state", () => {
        const before = diverged();
        const { state } = run(before, "git merge feature", "git merge --abort");
        expect(read(state, "f.txt")).toBe("a\nMAIN\nc\n");
        expect(repoOf(state).merging).toBeNull();
        expect(run(state, "git status").text).toContain("working tree clean");
    });

    test("cherry-pick with a conflict refuses and changes nothing", () => {
        const s = diverged();
        const hash = repoOf(s).branches.feature;
        const r = run(s, `git cherry-pick ${hash}`);
        expect(r.last.failed).toBe(true);
        expect(read(r.state, "f.txt")).toBe("a\nMAIN\nc\n");
    });
});

describe("rebase", () => {
    test("replays commits on top of upstream, skipping merge commits", () => {
        let { state } = run(
            withRepo(),
            "git checkout -b feature",
            "touch f1.txt",
            "git add .",
            'git commit -m "f1"',
            "git checkout main",
            "touch m1.txt",
            "git add .",
            'git commit -m "m1"',
            "git checkout feature",
        );
        const r = run(state, "git rebase main");
        expect(r.last.failed).toBe(false);
        const repo = repoOf(r.state);
        const tip = repo.commits[repo.branches.feature];
        expect(tip.message).toBe("f1");
        expect(tip.parents[0]).toBe(repo.branches.main);
        // Array form: a dotted string would be read as a nested path.
        expect(tip.files).toHaveProperty(["m1.txt"]);
    });
});

describe("remote", () => {
    test("removing origin disconnects push/fetch; adding it back reconnects", () => {
        let { state } = run(withRepo(), "git remote remove origin");
        expect(run(state, "git push").last.failed).toBe(true);
        expect(run(state, "git fetch").last.failed).toBe(true);
        ({ state } = run(state, "git remote add origin https://example.com/proj.git"));
        expect(run(state, "git push").last.failed).toBe(false);
        expect(run(state, "git remote add upstream x").last.failed).toBe(true);
    });
});

describe("restore", () => {
    test("--staged on an unknown path is an error", () => {
        expect(run(withRepo(), "git restore --staged nope.txt").last.failed).toBe(true);
    });

    test("counts only the files it actually changes", () => {
        let s = run(withRepo(), "touch b.txt c.txt", "git add .", 'git commit -m "more"').state;
        s = run(s, 'echo "hello" >> f.txt').state;
        let r = run(s, "git restore .");
        expect(r.text).toBe("Restored 1 file(s)");
        expect(read(r.state, "f.txt")).toBe("a\nb\nc\n");
        // a deleted file counts too
        r = run(r.state, "rm b.txt", 'echo "x" > c.txt', "git restore .");
        expect(r.text).toBe("Restored 2 file(s)");
        expect(read(r.state, "b.txt")).toBe("");
        // nothing changed: says so, still succeeds
        r = run(r.state, "git restore .");
        expect(r.text).toMatch(/Nothing to restore/);
        expect(r.last.failed).toBeFalsy();
        expect(r.last.highlight?.kind).toBe("git-restore");
    });
});

describe("merge3", () => {
    test("identical changes on both sides are not a conflict", () => {
        expect(merge3("a\nb", "a\nX", "a\nX")).toEqual({ text: "a\nX", conflict: false });
    });
    test("one-sided change wins", () => {
        expect(merge3("a\nb\nc", "a\nb\nc", "a\nZ\nc").text).toBe("a\nZ\nc");
    });
});

describe("hashes", () => {
    test("are unique across many commits", () => {
        let state = withRepo();
        for (let i = 0; i < 40; i++) ({ state } = run(state, `git commit --allow-empty -m c${i}`));
        const hashes = Object.keys(repoOf(state).commits);
        expect(new Set(hashes).size).toBe(41);
        hashes.forEach((h) => expect(h).toMatch(/^[0-9a-f]{7}$/));
    });
});
