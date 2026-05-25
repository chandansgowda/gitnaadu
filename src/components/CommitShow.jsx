import { useMemo } from "react";
import { motion } from "framer-motion";
import { X, GitCommit, User, CalendarDays, FileDiff, GitBranch, Hash } from "lucide-react";
import { findRepo, gitShow } from "../lib/gitEngine";
import { diffHunks, diffStats } from "../lib/diff";

// Floating commit show panel. Replaces the GitTree's content when a commit is selected.
export const CommitShow = ({ state, commitId, onClose }) => {
    const repo = useMemo(
        () => findRepo(state.repos, state.cwd),
        [state.repos, state.cwd],
    );
    const result = useMemo(() => {
        if (!repo || !commitId) return null;
        return gitShow(repo, commitId);
    }, [repo, commitId, state]);

    if (!repo || !commitId) return null;
    if (!result || result.error) {
        return (
            <div className="absolute inset-0 bg-surface-0/95 backdrop-blur-sm flex items-center justify-center p-6">
                <div className="text-zinc-400 text-sm">
                    {result?.error || "Commit not found"}
                </div>
            </div>
        );
    }

    const c = result.commit;

    return (
        <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 8 }}
            transition={{ duration: 0.18, ease: "easeOut" }}
            className="absolute inset-0 z-20 bg-surface-0/97 backdrop-blur-md flex flex-col"
            data-testid="commit-show-panel"
        >
            <div className="sticky top-0 z-10 bg-surface-1/90 backdrop-blur border-b border-surface-3 px-5 py-3 flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-400 font-bold">
                    <GitCommit className="w-3.5 h-3.5 text-yellow" />
                    git show
                </div>
                <button
                    onClick={onClose}
                    className="flex items-center gap-1 px-2 py-1 rounded text-xs text-zinc-300 hover:text-white hover:bg-surface-2 transition-colors"
                    data-testid="commit-show-close"
                    aria-label="Close commit view"
                >
                    <X className="w-3.5 h-3.5" />
                    close
                </button>
            </div>

            <div className="flex-1 overflow-auto">
                {/* Commit header */}
                <div className="px-5 py-4 border-b border-surface-3 bg-surface-1/40">
                    <div className="flex items-baseline gap-2 flex-wrap">
                        <h2 className="font-black text-lg md:text-xl text-white tracking-tight">
                            {c.message}
                        </h2>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-[12px] font-mono text-zinc-400">
                        <span className="flex items-center gap-1.5 text-yellow">
                            <Hash className="w-3 h-3" />
                            {c.hash}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <GitBranch className="w-3 h-3" />
                            {c.branch}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <User className="w-3 h-3" />
                            {c.author}
                        </span>
                        <span className="flex items-center gap-1.5">
                            <CalendarDays className="w-3 h-3" />
                            {new Date(c.date).toLocaleString()}
                        </span>
                        {c.parents?.length > 0 && (
                            <span className="flex items-center gap-1.5">
                                <span className="text-zinc-500">parents:</span>
                                {c.parents.map((p) => (
                                    <span key={p} className="text-zinc-300">
                                        {p}
                                    </span>
                                ))}
                            </span>
                        )}
                    </div>
                </div>

                {/* Diffs */}
                {result.changes.length === 0 ? (
                    <div className="p-8 text-center text-sm text-zinc-500">
                        Root commit · {Object.keys(c.files || {}).length} file(s) introduced.
                    </div>
                ) : (
                    <div className="p-4 space-y-4">
                        {result.changes.map((ch) => {
                            const stats = diffStats(ch.before, ch.after);
                            const hunks = diffHunks(ch.before, ch.after, 3);
                            return (
                                <div
                                    key={ch.path}
                                    className="border border-surface-3 rounded-md overflow-hidden bg-surface-1"
                                    data-testid={`show-file-${ch.path}`}
                                >
                                    <div className="flex items-center justify-between px-3 py-2 bg-surface-2 border-b border-surface-3">
                                        <div className="flex items-center gap-2 min-w-0">
                                            <FileDiff className="w-3.5 h-3.5 text-yellow flex-shrink-0" />
                                            <span className="font-mono text-sm text-white truncate">
                                                {ch.path}
                                            </span>
                                        </div>
                                        <div className="flex items-center gap-2 text-xs font-mono">
                                            <span className="text-emerald-400">+{stats.adds}</span>
                                            <span className="text-rose-400">−{stats.dels}</span>
                                        </div>
                                    </div>
                                    <div className="font-mono text-xs">
                                        {hunks.map((h, hi) => (
                                            <div key={hi}>
                                                <div className="px-3 py-1 bg-surface-2/60 text-zinc-500 text-[11px]">
                                                    @@ -{h.oldStart} +{h.newStart} @@
                                                </div>
                                                {h.lines.map((l, li) => {
                                                    if (l.type === "add")
                                                        return (
                                                            <div
                                                                key={li}
                                                                className="flex bg-emerald-500/[0.07] border-l-2 border-emerald-500/50"
                                                            >
                                                                <span className="w-9 px-2 text-right text-zinc-700 select-none">
                                                                    {l.newLn}
                                                                </span>
                                                                <span className="w-5 text-emerald-400 select-none">+</span>
                                                                <span className="flex-1 text-emerald-300 whitespace-pre-wrap break-all pr-3">
                                                                    {l.text}
                                                                </span>
                                                            </div>
                                                        );
                                                    if (l.type === "del")
                                                        return (
                                                            <div
                                                                key={li}
                                                                className="flex bg-rose-500/[0.07] border-l-2 border-rose-500/50"
                                                            >
                                                                <span className="w-9 px-2 text-right text-zinc-700 select-none">
                                                                    {l.oldLn}
                                                                </span>
                                                                <span className="w-5 text-rose-400 select-none">−</span>
                                                                <span className="flex-1 text-rose-300 whitespace-pre-wrap break-all pr-3">
                                                                    {l.text}
                                                                </span>
                                                            </div>
                                                        );
                                                    return (
                                                        <div key={li} className="flex">
                                                            <span className="w-9 px-2 text-right text-zinc-700 select-none">
                                                                {l.oldLn}
                                                            </span>
                                                            <span className="w-5 text-zinc-700 select-none"> </span>
                                                            <span className="flex-1 text-zinc-400 whitespace-pre-wrap break-all pr-3">
                                                                {l.text}
                                                            </span>
                                                        </div>
                                                    );
                                                })}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </motion.div>
    );
};
