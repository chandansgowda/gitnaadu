// Guided challenges. Each challenge is a sequence of steps.
// A step's `check` returns true when the current state satisfies that step.
//
// `check` receives { state, lastHighlight, lastCommand } where:
//   - state: full GitNaadu state
//   - lastHighlight: the highlight object from the most recent command (e.g. { kind: 'git-commit', hash, message })
//   - lastCommand: the raw command string the user typed
//
// To add a new challenge, just push another object to CHALLENGES.

import { findRepo, currentBranch, headCommit } from "./gitEngine";
import { getNode, normalizePath } from "./filesystem";

// ---- tiny composable check helpers ----
const all = (...fns) => (ctx) => fns.every((fn) => fn(ctx));
const repoAt = (path) => ({ state }) => Boolean(state.repos?.[path]);
const cwdIs = (path) => ({ state }) => state.cwd === path;
const lastKindIs = (kind) => ({ lastHighlight }) => lastHighlight?.kind === kind;
// With `a && b` chaining only the last command's highlight is reported, so a
// "stage" step also accepts the highlight of the command that follows it.
const lastKindIn = (...kinds) => ({ lastHighlight }) => kinds.includes(lastHighlight?.kind);
// Checked against each command of an `a && b` chain as well as the whole line.
const cmdMatches = (re) => ({ lastCommand }) =>
    Boolean(
        lastCommand &&
            (re.test(lastCommand) ||
                lastCommand.split("&&").some((part) => re.test(part))),
    );
const branchExists = (name) => ({ state }) => {
    const repo = findRepo(state.repos || {}, state.cwd);
    return Boolean(repo?.branches?.[name]);
};
const onBranch = (name) => ({ state }) => {
    const repo = findRepo(state.repos || {}, state.cwd);
    return repo ? currentBranch(repo) === name : false;
};
const tagExists = (name) => ({ state }) => {
    const repo = findRepo(state.repos || {}, state.cwd);
    return Boolean(repo?.tags?.[name]);
};
const minCommits = (n) => ({ state }) => {
    const repo = findRepo(state.repos || {}, state.cwd);
    return repo ? Object.keys(repo.commits || {}).length >= n : false;
};
const hasRemoteCommits = (n) => ({ state }) => {
    const repo = findRepo(state.repos || {}, state.cwd);
    return repo ? Object.keys(repo.remote?.commits || {}).length >= n : false;
};
const hasRemoteRef = (name) => ({ state }) => {
    const repo = findRepo(state.repos || {}, state.cwd);
    return Boolean(repo?.remoteRefs?.[name]);
};
const stashCountAtLeast = (n) => ({ state }) => {
    const repo = findRepo(state.repos || {}, state.cwd);
    return (repo?.stashes?.length || 0) >= n;
};
const detached = () => ({ state }) => {
    const repo = findRepo(state.repos || {}, state.cwd);
    return repo?.HEAD?.type === "detached";
};
const branchCountAtLeast = (n) => ({ state }) => {
    const repo = findRepo(state.repos || {}, state.cwd);
    return repo ? Object.keys(repo.branches || {}).length >= n : false;
};
const pathExists = (relOrAbs) => ({ state }) => {
    const p = relOrAbs.startsWith("/")
        ? relOrAbs
        : normalizePath(state.cwd, relOrAbs);
    return Boolean(getNode(state.fs, p));
};
const pathMissing = (relOrAbs) => ({ state }) => {
    const p = relOrAbs.startsWith("/")
        ? relOrAbs
        : normalizePath(state.cwd, relOrAbs);
    return !getNode(state.fs, p);
};
const fileTypeIs = (relOrAbs, type) => ({ state }) => {
    const p = relOrAbs.startsWith("/")
        ? relOrAbs
        : normalizePath(state.cwd, relOrAbs);
    const node = getNode(state.fs, p);
    return node?.type === type;
};
const lastCommitMessageMatches = (re) => ({ state }) => {
    const repo = findRepo(state.repos || {}, state.cwd);
    if (!repo) return false;
    const h = headCommit(repo);
    const msg = h ? repo.commits[h]?.message || "" : "";
    return re.test(msg);
};
const commandsRunAtLeast = (n) => ({ state }) =>
    (state.history?.length || 0) >= n;

const PROJECT = "/home/student/portfolio-website";
const SECOND_PROJECT = "/home/student/second-project";

export const CHALLENGES = [
    // ======================= BEGINNER (Linux essentials) =======================
    {
        id: "welcome-tour",
        title: "First steps in the terminal",
        difficulty: "beginner",
        intro:
            "Every Linux journey starts by figuring out where you are and who you are. Run a few simple commands to look around.",
        steps: [
            {
                text: "Print your username.",
                hint: "whoami",
                check: cmdMatches(/^\s*whoami\s*$/),
            },
            {
                text: "Print the current working directory path.",
                hint: "pwd",
                check: cmdMatches(/^\s*pwd\s*$/),
            },
            {
                text: "List everything inside your home folder.",
                hint: "ls",
                check: cmdMatches(/^\s*ls(\s|$)/),
            },
        ],
        outro:
            "Three commands, and you already know more about Linux than most people who've never touched a terminal.",
    },

    {
        id: "ls-and-cd",
        title: "Navigate the file system",
        difficulty: "beginner",
        intro:
            "Folders are like rooms. Use `cd` to walk in, `pwd` to confirm where you are, and `cd ..` to walk back out.",
        steps: [
            {
                text: "Move into the portfolio-website folder.",
                hint: "cd portfolio-website",
                check: cwdIs(PROJECT),
            },
            {
                text: "List the files inside it.",
                hint: "ls",
                check: ({ lastCommand, state }) =>
                    state.cwd === PROJECT && /^\s*ls(\s|$)/.test(lastCommand || ""),
            },
            {
                text: "Walk back to your home folder.",
                hint: "cd ..",
                check: cwdIs("/home/student"),
            },
        ],
        outro: "`cd` + `pwd` + `ls` are the holy trinity of getting un-lost in any terminal.",
    },

    {
        id: "make-files",
        title: "Create folders and files",
        difficulty: "beginner",
        intro:
            "Time to build something. `mkdir` makes folders, `touch` makes empty files, and `ls` proves they exist.",
        steps: [
            {
                text: "Create a folder called `scratch` in your home directory.",
                hint: "cd ~ && mkdir scratch",
                check: fileTypeIs("/home/student/scratch", "dir"),
            },
            {
                text: "Move into it.",
                hint: "cd scratch",
                check: cwdIs("/home/student/scratch"),
            },
            {
                text: "Create three empty files: notes.txt, todo.md, ideas.txt.",
                hint: "touch notes.txt todo.md ideas.txt",
                check: all(
                    pathExists("notes.txt"),
                    pathExists("todo.md"),
                    pathExists("ideas.txt"),
                ),
            },
        ],
        outro: "You just built a tiny workspace. `touch` is also handy for updating a file's timestamp.",
    },

    {
        id: "read-files",
        title: "Peek inside a file",
        difficulty: "beginner",
        intro:
            "Reading files without opening an editor is a Linux superpower. Try `cat`, `head`, and `tail`.",
        steps: [
            {
                text: "Move into the notes folder.",
                hint: "cd ~/notes",
                check: cwdIs("/home/student/notes"),
            },
            {
                text: "Print the entire contents of git-basics.txt.",
                hint: "cat git-basics.txt",
                check: cmdMatches(/^\s*cat\s+git-basics\.txt\s*$/),
            },
            {
                text: "Print just the first lines using `head`.",
                hint: "head git-basics.txt",
                check: cmdMatches(/^\s*head\s+git-basics\.txt\s*$/),
            },
        ],
        outro: "`cat` for short files, `head` / `tail` for big ones. `tree` to see the whole folder shape.",
    },

    {
        id: "tidy-up",
        title: "Tidy up with rm",
        difficulty: "beginner",
        intro:
            "Clean up matters. `rm` deletes files. `rm -r` deletes folders. There's no recycle bin — be careful in real terminals.",
        steps: [
            {
                text: "Be inside the scratch folder you made earlier (create it if needed).",
                hint: "mkdir -p ~/scratch && cd ~/scratch",
                check: cwdIs("/home/student/scratch"),
            },
            {
                text: "Create a throwaway file called temp.log.",
                hint: "touch temp.log",
                check: pathExists("temp.log"),
            },
            {
                text: "Delete it.",
                hint: "rm temp.log",
                check: pathMissing("temp.log"),
            },
        ],
        outro:
            "Inside GitNaadu this is safe. In real life, `rm` is permanent — double-check before pressing Enter.",
    },

    {
        id: "nested-dirs",
        title: "Build a nested project tree",
        difficulty: "beginner",
        intro:
            "Real projects nest folders inside folders. `mkdir -p` builds the whole chain in one shot.",
        steps: [
            {
                text: "From your home folder, create `app/src/components` in one command.",
                hint: "cd ~ && mkdir -p app/src/components",
                check: fileTypeIs("/home/student/app/src/components", "dir"),
            },
            {
                text: "Add an empty index.js inside src.",
                hint: "touch app/src/index.js",
                check: pathExists("/home/student/app/src/index.js"),
            },
            {
                text: "Visualise the tree.",
                hint: "tree app",
                check: cmdMatches(/^\s*tree(\s|$)/),
            },
        ],
        outro: "`mkdir -p` is the lazy genius move — it never errors on existing folders either.",
    },

    // ======================= BEGINNER (Git fundamentals) =======================
    {
        id: "first-commit",
        title: "Your first commit",
        difficulty: "beginner",
        intro:
            "Every git journey starts with a single commit. Initialize a repo, stage everything and save your first snapshot.",
        steps: [
            {
                text: "Move into the portfolio-website folder.",
                hint: "cd ~/portfolio-website",
                check: cwdIs(PROJECT),
            },
            {
                text: "Initialize a new git repository here.",
                hint: "git init",
                check: all(cwdIs(PROJECT), repoAt(PROJECT)),
            },
            {
                text: "Stage every file in the directory.",
                hint: "git add .",
                check: lastKindIn("git-add", "git-commit"),
            },
            {
                text: "Commit the staged files with a message.",
                hint: 'git commit -m "first commit"',
                check: all(lastKindIs("git-commit"), minCommits(1)),
            },
        ],
        outro:
            "You've created your first commit. The yellow HEAD pointer in the Git Tree shows where 'now' lives in history.",
    },

    {
        id: "peek-status",
        title: "Check your status",
        difficulty: "beginner",
        intro:
            "`git status` is the most useful command in git. It tells you what's changed, what's staged, and what's untracked.",
        steps: [
            {
                text: "Be inside a git repository.",
                hint: "cd ~/portfolio-website && git init",
                check: ({ state }) => Boolean(findRepo(state.repos || {}, state.cwd)),
            },
            {
                text: "Run `git status` to see untracked files.",
                hint: "git status",
                check: cmdMatches(/^\s*git\s+status\s*$/),
            },
            {
                text: "Stage just `index.html` (not everything).",
                hint: "git add index.html",
                check: lastKindIs("git-add"),
            },
            {
                text: "Run `git status` again — the file should now be 'to be committed'.",
                hint: "git status",
                check: cmdMatches(/^\s*git\s+status\s*$/),
            },
        ],
        outro: "Run `git status` constantly. It's free, fast, and saves you from countless mistakes.",
    },

    {
        id: "two-commits-log",
        title: "Make a second commit & read history",
        difficulty: "beginner",
        intro:
            "One commit is a snapshot. Two commits is a story. Let's add a second one and view the timeline with `git log`.",
        steps: [
            {
                text: "Have a repo with at least one commit.",
                hint: "git init && git add . && git commit -m 'init'",
                check: minCommits(1),
            },
            {
                text: "Create a new file called README.md.",
                hint: "touch README.md",
                check: pathExists("README.md"),
            },
            {
                text: "Stage and commit it with a meaningful message.",
                hint: 'git add . && git commit -m "add readme"',
                check: all(lastKindIs("git-commit"), minCommits(2)),
            },
            {
                text: "View the commit history.",
                hint: "git log",
                check: cmdMatches(/^\s*git\s+log\s*$/),
            },
        ],
        outro:
            "`git log` shows the full chain. The newest commit is at the top — git history reads backwards.",
    },

    {
        id: "branch-out",
        title: "Branch out",
        difficulty: "beginner",
        intro:
            "Branches let you experiment without touching main. Create a new branch, commit on it, and admire the fork in the tree.",
        steps: [
            {
                text: "Be inside a git repository.",
                hint: "cd ~/portfolio-website && git init",
                check: ({ state }) => Boolean(findRepo(state.repos || {}, state.cwd)),
            },
            {
                text: "Make sure there is at least one commit.",
                hint: 'git add . && git commit -m "init"',
                check: minCommits(1),
            },
            {
                text: "Create a new branch called 'feature/login'.",
                hint: "git checkout -b feature/login",
                check: branchExists("feature/login"),
            },
            {
                text: "Confirm you're on 'feature/login'.",
                hint: "git status",
                check: onBranch("feature/login"),
            },
            {
                text: "Make a change and create a new commit on this branch.",
                hint: 'touch login.html && git add . && git commit -m "login page"',
                check: all(onBranch("feature/login"), minCommits(2)),
            },
        ],
        outro:
            "The Git Tree now shows two divergent paths. Switching branches changes which one HEAD points to.",
    },

    {
        id: "list-branches",
        title: "List all branches",
        difficulty: "beginner",
        intro:
            "`git branch` with no arguments shows every branch — and marks the current one with an asterisk.",
        steps: [
            {
                text: "Have a repo with at least one commit.",
                hint: "git init && git commit -m 'init' (after staging)",
                check: minCommits(1),
            },
            {
                text: "Create two branches: `develop` and `staging`.",
                hint: "git branch develop && git branch staging",
                check: all(branchExists("develop"), branchExists("staging")),
            },
            {
                text: "List all branches.",
                hint: "git branch",
                check: cmdMatches(/^\s*git\s+branch\s*$/),
            },
        ],
        outro:
            "The asterisk (*) marks the branch you're currently on. Branches are just pointers — cheap to make, cheap to throw away.",
    },

    {
        id: "rename-branch",
        title: "Rename a branch",
        difficulty: "beginner",
        intro:
            "Picked a bad branch name? `git branch -m new-name` renames the current one without breaking anything.",
        steps: [
            {
                text: "Create a branch with a deliberately bad name.",
                hint: "git checkout -b wip-stuff",
                check: branchExists("wip-stuff"),
            },
            {
                text: "Rename it to `feature/dashboard`.",
                hint: "git branch -m feature/dashboard",
                check: all(
                    branchExists("feature/dashboard"),
                    ({ state }) => {
                        const repo = findRepo(state.repos || {}, state.cwd);
                        return !repo?.branches?.["wip-stuff"];
                    },
                ),
            },
        ],
        outro: "Renaming is free. There's no excuse for living with `wip-stuff-final-v2-FINAL`.",
    },

    {
        id: "delete-branch",
        title: "Delete a stale branch",
        difficulty: "beginner",
        intro:
            "Merged your feature? Clean up. `git branch -d <name>` removes a branch that's already been merged.",
        steps: [
            {
                text: "Be on the `main` branch.",
                hint: "git checkout main",
                check: onBranch("main"),
            },
            {
                text: "Create a throwaway branch `tmp`.",
                hint: "git branch tmp",
                check: branchExists("tmp"),
            },
            {
                text: "Delete it.",
                hint: "git branch -d tmp",
                check: ({ state }) => {
                    const repo = findRepo(state.repos || {}, state.cwd);
                    return !repo?.branches?.tmp;
                },
            },
        ],
        outro: "Use `-d` for safe deletes (only merged branches). Use `-D` to force-delete unmerged ones.",
    },

    {
        id: "merge-it",
        title: "Merge a branch back",
        difficulty: "beginner",
        intro: "Once a feature is ready, merge it back into main. Watch how the histories combine.",
        steps: [
            {
                text: "Create a 'feature/profile' branch.",
                hint: "git checkout -b feature/profile",
                check: branchExists("feature/profile"),
            },
            {
                text: "Make at least one commit on feature/profile.",
                hint: 'touch profile.html && git add . && git commit -m "profile"',
                check: ({ state }) =>
                    onBranch("feature/profile")({ state }) && minCommits(2)({ state }),
            },
            {
                text: "Switch back to main.",
                hint: "git checkout main",
                check: onBranch("main"),
            },
            {
                text: "Merge feature/profile into main.",
                hint: "git merge feature/profile",
                check: lastKindIs("git-merge"),
            },
        ],
        outro:
            "If the branches hadn't diverged this was a fast-forward — main simply jumped to where feature/profile was.",
    },

    {
        id: "tag-release",
        title: "Tag a release",
        difficulty: "beginner",
        intro: "Tags pin a name to a specific commit — perfect for marking a version. Add one to your latest commit.",
        steps: [
            {
                text: "Have at least one commit in your repo.",
                hint: 'git commit -m "..."',
                check: minCommits(1),
            },
            {
                text: "Create a tag named v1.0.",
                hint: "git tag v1.0",
                check: tagExists("v1.0"),
            },
            {
                text: "Make a new commit so v1.0 stays behind.",
                hint: 'touch CHANGELOG.md && git add . && git commit -m "changelog"',
                check: ({ state, ...rest }) =>
                    tagExists("v1.0")({ state, ...rest }) && minCommits(2)({ state, ...rest }),
            },
        ],
        outro: "Tags don't move when you commit — that's exactly what makes them ideal for releases.",
    },

    {
        id: "second-repo",
        title: "A second repo",
        difficulty: "beginner",
        intro:
            "The Python project is already a Git repository. Create `second-project` to see how independent repositories live side by side.",
        steps: [
            {
                text: "Create and enter a new project folder.",
                hint: "mkdir ~/second-project && cd ~/second-project",
                check: cwdIs(SECOND_PROJECT),
            },
            {
                text: "Initialize git here.",
                hint: "git init",
                check: repoAt(SECOND_PROJECT),
            },
            {
                text: "Create a file and stage it.",
                hint: 'echo "# Second project" > README.md && git add .',
                check: lastKindIs("git-add"),
            },
            {
                text: "Commit the staged file.",
                hint: 'git commit -m "initial second project"',
                check: all(lastKindIs("git-commit"), ({ state }) => {
                    const repo = state.repos?.[SECOND_PROJECT];
                    return repo && Object.keys(repo.commits || {}).length >= 1;
                }),
            },
        ],
        outro:
            "Each repo lives inside its own folder. The Git Tree shows the repo for your current directory.",
    },

    // ======================= INTERMEDIATE =======================
    {
        id: "unstage-file",
        title: "Unstage a file",
        difficulty: "intermediate",
        intro:
            "Accidentally staged the wrong file? `git restore --staged <file>` (or the older `git reset HEAD <file>`) takes it back off the index without losing your changes.",
        steps: [
            {
                text: "Be in a repo with at least one commit.",
                hint: "git init && git add . && git commit -m 'init'",
                check: minCommits(1),
            },
            {
                text: "Create and stage a new file.",
                hint: "touch secret.txt && git add secret.txt",
                check: all(pathExists("secret.txt"), lastKindIs("git-add")),
            },
            {
                text: "Unstage it without deleting the file.",
                hint: "git restore --staged secret.txt",
                check: lastKindIs("git-restore"),
            },
        ],
        outro: "The file is still on disk — just no longer queued for the next commit.",
    },

    {
        id: "diff-changes",
        title: "Diff your changes",
        difficulty: "intermediate",
        intro:
            "`git diff` shows exactly which lines changed since the last commit. Try it before every commit and you'll catch silly bugs.",
        steps: [
            {
                text: "Have a repo with at least one commit.",
                hint: "git init && commit something",
                check: minCommits(1),
            },
            {
                text: "Create a new untracked file so there's something to diff.",
                hint: "touch draft.txt",
                check: pathExists("draft.txt"),
            },
            {
                text: "Stage it so it shows up in the staged diff.",
                hint: "git add draft.txt",
                check: lastKindIs("git-add"),
            },
            {
                text: "Show the staged diff.",
                hint: "git diff --staged",
                check: ({ lastHighlight }) =>
                    lastHighlight?.kind === "git-diff" && (lastHighlight.count || 0) > 0,
            },
        ],
        outro:
            "Diff = the difference between commits, branches, or your edits and the last snapshot. Read it like a story.",
    },

    {
        id: "amend-it",
        title: "Amend that typo",
        difficulty: "intermediate",
        intro: "Made a typo in your commit message? `git commit --amend` replaces the last commit with a fixed-up copy (new hash, same parent).",
        steps: [
            {
                text: "Make a commit with a deliberately bad message.",
                hint: 'touch bug.txt && git add . && git commit -m "intial commit"',
                check: lastKindIs("git-commit"),
            },
            {
                text: "Amend that last commit with a corrected message.",
                hint: 'git commit --amend -m "initial commit"',
                check: lastKindIs("git-amend"),
            },
        ],
        outro: "Amend rewrites history. Safe locally, dangerous on a branch you've already pushed!",
    },

    {
        id: "revert-it",
        title: "Undo with revert",
        difficulty: "intermediate",
        intro: "Reset is destructive. Revert is safe: it creates a NEW commit that undoes a previous one. History stays linear.",
        steps: [
            {
                text: "Create two commits.",
                hint: 'touch a.txt && git add . && git commit -m "add a" && touch b.txt && git add . && git commit -m "add b"',
                check: minCommits(3),
            },
            {
                text: "Revert the most recent commit (HEAD).",
                hint: "git revert HEAD",
                check: lastKindIs("git-revert"),
            },
        ],
        outro:
            "A revert commit appears on top of history, undoing the previous one — but the original commit is still there for the record.",
    },

    {
        id: "soft-reset",
        title: "Soft reset (rewind without losing work)",
        difficulty: "intermediate",
        intro:
            "`git reset --soft HEAD~1` moves the branch pointer back one commit but keeps your changes staged. Great for fixing 'oops, that should have been two commits' moments.",
        steps: [
            {
                text: "Have at least 2 commits.",
                hint: 'commit twice',
                check: minCommits(2),
            },
            {
                text: "Soft-reset one commit back.",
                hint: "git reset --soft HEAD~1",
                check: lastKindIs("git-reset"),
            },
        ],
        outro:
            "`--soft` keeps changes staged · `--mixed` keeps changes unstaged · `--hard` throws them away. Choose carefully.",
    },

    {
        id: "stash-it",
        title: "Stash work in progress",
        difficulty: "intermediate",
        intro:
            "Mid-task and need to switch branches? `git stash` shelves your dirty work, `git stash pop` brings it back.",
        steps: [
            {
                text: "Have a repo with at least one commit.",
                hint: "init + commit",
                check: minCommits(1),
            },
            {
                text: "Make a change you're not ready to commit (touch a new file).",
                hint: "touch wip.txt",
                check: pathExists("wip.txt"),
            },
            {
                text: "Stash it.",
                hint: "git stash",
                check: all(lastKindIs("git-stash"), stashCountAtLeast(1)),
            },
            {
                text: "Pop the stash back.",
                hint: "git stash pop",
                check: lastKindIs("git-stash-pop"),
            },
        ],
        outro:
            "Stash is a tiny clipboard for git. Don't let it pile up — pop sooner rather than later.",
    },

    {
        id: "rebase",
        title: "Rebase a feature branch",
        difficulty: "intermediate",
        intro: "Rebase replays your feature commits ON TOP of a target branch — keeps history linear and tidy.",
        steps: [
            {
                text: "Be on a feature branch with commits not on main.",
                hint: 'git checkout -b feature/clean && touch x.txt && git add . && git commit -m "x"',
                check: ({ state }) => {
                    const repo = findRepo(state.repos || {}, state.cwd);
                    const cur = currentBranch(repo);
                    return cur && cur !== "main" && repo?.branches?.[cur];
                },
            },
            {
                text: "Switch back to main and make a separate commit (to diverge).",
                hint: 'git checkout main && touch m.txt && git add . && git commit -m "main update"',
                check: ({ state }) => onBranch("main")({ state }) && minCommits(3)({ state }),
            },
            {
                text: "Switch to your feature branch.",
                hint: "git checkout feature/clean",
                check: ({ state }) => {
                    const repo = findRepo(state.repos || {}, state.cwd);
                    return repo && currentBranch(repo) !== "main";
                },
            },
            {
                text: "Rebase your feature branch onto main.",
                hint: "git rebase main",
                check: lastKindIs("git-rebase"),
            },
        ],
        outro: "Your feature commits were re-applied on top of main — no merge commit, fully linear.",
    },

    {
        id: "push-pull",
        title: "Push and pull from origin",
        difficulty: "intermediate",
        intro: "Time to talk to a remote. Push your work, simulate another developer making a commit on origin, then pull it back.",
        steps: [
            {
                text: "Have at least one commit.",
                hint: 'git add . && git commit -m "..."',
                check: minCommits(1),
            },
            {
                text: "Push your current branch to origin.",
                hint: "git push",
                check: hasRemoteRef("origin/main"),
            },
            {
                text: "Open the Remote tab and commit a change there (simulating another developer).",
                hint: "Tab → Remote → edit a file → commit message → 'Commit to remote'",
                check: hasRemoteCommits(2),
            },
            {
                text: "Fetch updates from origin.",
                hint: "git fetch",
                check: lastKindIs("git-fetch"),
            },
            {
                text: "Pull origin/main into your branch.",
                hint: "git pull",
                check: lastKindIs("git-pull"),
            },
        ],
        outro: "You just performed a full push-edit-fetch-pull round trip — exactly how teams stay in sync.",
    },

    // ======================= ADVANCED =======================
    {
        id: "cherry-pick",
        title: "Cherry-pick a fix",
        difficulty: "advanced",
        intro: "Need just ONE commit from another branch without merging the whole thing? Cherry-pick is your friend.",
        steps: [
            {
                text: "Create a 'hotfix' branch off main.",
                hint: "git checkout -b hotfix",
                check: branchExists("hotfix"),
            },
            {
                text: "Make a commit on hotfix.",
                hint: 'touch FIX.txt && git add . && git commit -m "important fix"',
                check: ({ state }) => onBranch("hotfix")({ state }) && minCommits(2)({ state }),
            },
            {
                text: "Switch back to main.",
                hint: "git checkout main",
                check: onBranch("main"),
            },
            {
                text: "Cherry-pick the hotfix commit onto main.",
                hint: "git log (copy the hotfix hash) then `git cherry-pick <hash>`",
                check: lastKindIs("git-cherry-pick"),
            },
        ],
        outro: "A copy of that commit now lives on main — different hash, same change.",
    },

    {
        id: "detached-rescue",
        title: "Rescue a detached HEAD",
        difficulty: "advanced",
        intro: "Checking out a specific commit puts you in 'detached HEAD' state. Any commits you make here would be lost. Create a branch to save them.",
        steps: [
            {
                text: "Have at least 2 commits.",
                hint: 'touch a.txt && git add . && git commit -m "a" && touch b.txt && git add . && git commit -m "b"',
                check: minCommits(2),
            },
            {
                text: "Check out a previous commit by its hash (use `git log` to find one).",
                hint: "git checkout <older-hash>",
                check: detached(),
            },
            {
                text: "Rescue yourself by creating a new branch from this state.",
                hint: "git checkout -b rescue-branch",
                check: ({ state, ...rest }) =>
                    branchExists("rescue-branch")({ state, ...rest }) && !detached()({ state, ...rest }),
            },
        ],
        outro:
            "Detached HEAD is just a warning, not a crash. Creating a branch turns this state into a normal branch you can keep working on.",
    },
];

export const findChallenge = (id) => CHALLENGES.find((c) => c.id === id);

// Suppress unused warning — these helpers are kept for future challenges.
export const _helpers = {
    branchCountAtLeast,
    lastCommitMessageMatches,
    commandsRunAtLeast,
};
