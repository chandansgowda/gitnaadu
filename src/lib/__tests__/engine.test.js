import { executeCommand } from "../commands";
import { buildInitialFS, HOME } from "../initialState";
import { findRepo, resolveRev, headCommit } from "../gitEngine";
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
