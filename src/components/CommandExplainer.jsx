import { motion, AnimatePresence } from "framer-motion";
import { GitCommit, GitBranch, GitMerge, GitPullRequest, Plus, RotateCcw, Trash2, Cloud, Sparkles, X, Tag, Archive, FileDiff, FileSearch, Edit3, Cherry, History } from "lucide-react";
import { useEffect, useRef } from "react";
import { cn } from "@/lib/utils";

// Maps a highlight kind to an explanation card.
const EXPLAIN = {
    "git-init": {
        icon: Sparkles,
        title: "Repository initialised",
        body: "A new .git directory was created. From now on, Git will track every commit, branch and merge in this folder.",
    },
    "git-add": {
        icon: Plus,
        title: "Files staged",
        body: "Staging copies your current changes into the index. They are now ready to be saved as a commit snapshot.",
    },
    "git-commit": {
        icon: GitCommit,
        title: "Commit recorded",
        body: "A new commit was created as a permanent snapshot. The current branch now points to this commit.",
    },
    "git-branch": {
        icon: GitBranch,
        title: "Branch created",
        body: "A new pointer was made at the current commit. Switch to it with `git checkout <branch>` to start working on it.",
    },
    "git-checkout": {
        icon: GitBranch,
        title: "HEAD moved",
        body: "HEAD is the pointer to your current location. It now points to a different branch / commit and the working tree was updated.",
    },
    "git-merge": {
        icon: GitMerge,
        title: "Branches merged",
        body: "Histories were combined. If the branches diverged, a merge commit with two parents is created. Otherwise it's a fast-forward.",
    },
    "git-merge-conflict": {
        icon: GitMerge,
        title: "Merge conflict",
        body: "Both branches changed the same lines, so Git stopped half-way. Open each conflicted file, keep the lines you want, delete the <<<<<<< ======= >>>>>>> markers, then `git add` it and `git commit`. `git merge --abort` undoes the whole merge.",
    },
    "git-merge-abort": {
        icon: RotateCcw,
        title: "Merge aborted",
        body: "The half-finished merge was thrown away. Your branch, index and working tree are back exactly as they were before `git merge`.",
    },
    "git-rebase": {
        icon: GitMerge,
        title: "History replayed",
        body: "Commits from the current branch were re-applied on top of the target. The history is now linear.",
    },
    "git-reset": {
        icon: RotateCcw,
        title: "HEAD reset",
        body: "The branch pointer was moved. `--soft` keeps everything staged, `--mixed` keeps working files, `--hard` rewrites them.",
    },
    "git-revert": {
        icon: RotateCcw,
        title: "Commit reverted",
        body: "A new commit was created that undoes the changes of the target commit. History stays linear and safe.",
    },
    "git-push": {
        icon: Cloud,
        title: "Pushed to origin",
        body: "Commits were uploaded to the simulated remote. In real life, this is what shares your work on GitHub.",
    },
    "git-clone": {
        icon: Cloud,
        title: "Repository cloned",
        body: "The public GitHub repository's default branch and recent commit history were copied into the virtual filesystem.",
    },
    "git-tag": {
        icon: Tag,
        title: "Tag created",
        body: "A tag pins a name to a specific commit, usually a release. Unlike branches, tags don't move when you commit.",
    },
    "git-stash": {
        icon: Archive,
        title: "Changes stashed away",
        body: "Your working changes were saved and the working tree restored to HEAD. Run `git stash pop` to bring them back.",
    },
    "git-stash-pop": {
        icon: Archive,
        title: "Stash applied",
        body: "The most recent stashed changes were re-applied to your working tree and removed from the stash list.",
    },
    "git-cherry-pick": {
        icon: Cherry,
        title: "Commit cherry-picked",
        body: "The changes from another commit were copied onto your current branch as a brand new commit.",
    },
    "git-diff": {
        icon: FileDiff,
        title: "Diff computed",
        body: "Compare what changed between your working tree and the index (or any two revisions). Switch the right panel to the Diff tab for a colourised view.",
    },
    "git-show": {
        icon: FileSearch,
        title: "Commit inspected",
        body: "Shows the metadata and full patch of a commit — exactly what changed and why.",
    },
    "git-restore": {
        icon: Edit3,
        title: "File restored",
        body: "Working tree or index was restored from a known good source — without changing your commit history.",
    },
    "git-rm": {
        icon: Trash2,
        title: "File removed",
        body: "The file was deleted from the working tree and the deletion was staged.",
    },
    "git-mv": {
        icon: Edit3,
        title: "File moved",
        body: "Git tracks the rename — history is preserved.",
    },
    "git-amend": {
        icon: GitCommit,
        title: "Last commit amended",
        body: "Your last commit was replaced by a new one (new hash) with the staged changes / new message. Don't amend commits you've already pushed — the push would need --force.",
    },
    "git-pull": {
        icon: Cloud,
        title: "Pulled from origin",
        body: "Remote commits were fetched and merged into your local branch. In real life, this is how you stay in sync with teammates.",
    },
    "git-fetch": {
        icon: Cloud,
        title: "Fetched from origin",
        body: "Remote refs and commits were downloaded but NOT merged. Use `git pull` (or `git merge`) to integrate them into your branch.",
    },
};

export const CommandExplainer = ({ highlight, onClose, className, action }) => {
    const cfg = highlight ? EXPLAIN[highlight.kind] : null;

    // Auto-dismiss after 7s. `onClose` is read through a ref: callers pass an
    // inline arrow, and depending on it would restart the timer every render.
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    useEffect(() => {
        if (!cfg) return;
        const t = setTimeout(() => onCloseRef.current?.(), 7000);
        return () => clearTimeout(t);
    }, [highlight, cfg]);

    return (
        <AnimatePresence>
            {cfg && (
                <motion.div
                    key={(highlight?.kind || "") + (highlight?.hash || highlight?.target || highlight?.name || "")}
                    initial={{ opacity: 0, y: 24 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 24 }}
                    transition={{ type: "spring", stiffness: 380, damping: 30 }}
                    className={cn(
                        "absolute top-16 right-4 z-30 max-w-sm w-[min(22rem,calc(100%-2rem))] pointer-events-none",
                        className,
                    )}
                    data-testid="command-explainer"
                >
                    <div className="bg-surface-2/90 backdrop-blur-xl border border-yellow/40 rounded-md shadow-2xl shadow-black/60 overflow-hidden pointer-events-auto">
                        <div className="absolute inset-0 bg-gradient-to-br from-yellow/5 to-transparent pointer-events-none" />
                        <div className="relative p-3 sm:p-4 flex items-start gap-3">
                            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-yellow/15 border border-yellow/40 flex items-center justify-center flex-shrink-0">
                                <cfg.icon className="w-4 h-4 text-yellow" />
                            </div>
                            <div className="flex-1 min-w-0">
                                <div className="flex items-baseline gap-2 mb-1">
                                    <h3 className="font-bold text-white text-sm tracking-tight">
                                        {cfg.title}
                                    </h3>
                                    {highlight.hash && (
                                        <code className="text-[10px] font-mono text-yellow">
                                            {highlight.hash}
                                        </code>
                                    )}
                                </div>
                                <p className="text-xs text-zinc-300 leading-relaxed">
                                    {cfg.body}
                                </p>
                                {highlight.message && (
                                    <div className="mt-2 font-mono text-[11px] text-zinc-400 truncate">
                                        "{highlight.message}"
                                    </div>
                                )}
                                {action && (
                                    <button
                                        onClick={action.onClick}
                                        className="mt-2.5 inline-flex items-center gap-1 h-8 px-3 rounded-md bg-yellow text-black text-xs font-bold active:bg-yellow/80"
                                        data-testid="explainer-action"
                                    >
                                        {action.label} →
                                    </button>
                                )}
                            </div>
                            <button
                                onClick={onClose}
                                className="text-zinc-500 hover:text-white transition-colors flex-shrink-0 -m-2 p-2"
                                data-testid="explainer-close"
                                aria-label="Dismiss"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>
    );
};
