import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { GitCompare, FileDiff, Plus, Minus } from "lucide-react";
import { findRepo, computeDiffPairs } from "../lib/gitEngine";
import { diffHunks, diffStats } from "../lib/diff";

export const DiffView = ({ state }) => {
    const repo = useMemo(
        () => findRepo(state.repos, state.cwd),
        [state.repos, state.cwd],
    );
    const [mode, setMode] = useState("working"); // working | staged

    const pairs = useMemo(() => {
        if (!repo) return [];
        return computeDiffPairs(state.fs, repo, { staged: mode === "staged" });
    }, [repo, state.fs, state.repos, mode]);

    if (!repo) {
        return (
            <div className="h-full w-full flex items-center justify-center text-center px-8">
                <div className="max-w-md">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-surface-2 border border-surface-3 mb-5">
                        <GitCompare className="w-8 h-8 text-yellow" />
                    </div>
                    <h2 className="font-black text-2xl md:text-3xl tracking-tight text-white">
                        Nothing to diff
                    </h2>
                    <p className="text-zinc-400 mt-3 text-sm leading-relaxed">
                        Initialise a repository here first, then edit a file
                        and come back to see line-by-line changes.
                    </p>
                </div>
            </div>
        );
    }

    const totals = pairs.reduce(
        (acc, p) => {
            const s = diffStats(p.before, p.after);
            acc.adds += s.adds;
            acc.dels += s.dels;
            return acc;
        },
        { adds: 0, dels: 0 },
    );

    return (
        <div className="h-full overflow-auto bg-surface-0" data-testid="diff-view">
            <div className="sticky top-0 z-10 bg-surface-1/40 border-b border-surface-3/60 px-4 py-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
                    <GitCompare className="w-3 h-3 text-yellow" />
                    Diff
                </div>
                <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-xs font-mono">
                        <span className="text-emerald-400">+{totals.adds}</span>
                        <span className="text-rose-400">−{totals.dels}</span>
                        <span className="text-zinc-500 ml-1">
                            in {pairs.length} file{pairs.length !== 1 ? "s" : ""}
                        </span>
                    </div>
                    <div className="flex rounded-sm overflow-hidden border border-surface-3 text-[11px] font-mono">
                        <button
                            onClick={() => setMode("working")}
                            className={
                                "px-2.5 py-1 transition-colors " +
                                (mode === "working"
                                    ? "bg-yellow text-black font-semibold"
                                    : "bg-surface-2 text-zinc-400 hover:text-white")
                            }
                            data-testid="diff-mode-working"
                        >
                            working
                        </button>
                        <button
                            onClick={() => setMode("staged")}
                            className={
                                "px-2.5 py-1 transition-colors " +
                                (mode === "staged"
                                    ? "bg-yellow text-black font-semibold"
                                    : "bg-surface-2 text-zinc-400 hover:text-white")
                            }
                            data-testid="diff-mode-staged"
                        >
                            staged
                        </button>
                    </div>
                </div>
            </div>

            {pairs.length === 0 ? (
                <div className="h-full flex items-center justify-center text-center text-sm text-zinc-500 pt-20">
                    <span>
                        {mode === "working"
                            ? "No unstaged changes. Edit a file or run "
                            : "No staged changes. Run "}
                        <code className="font-mono px-1.5 py-0.5 rounded bg-surface-2 text-yellow">
                            {mode === "working" ? "git restore" : "git add ."}
                        </code>
                    </span>
                </div>
            ) : (
                <div className="p-4 space-y-4">
                    {pairs.map((p) => {
                        const stats = diffStats(p.before, p.after);
                        const hunks = diffHunks(p.before, p.after, 3);
                        return (
                            <motion.div
                                key={p.path}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                className="border border-surface-3 rounded-md overflow-hidden bg-surface-1"
                                data-testid={`diff-file-${p.path}`}
                            >
                                <div className="flex items-center justify-between px-3 py-2 bg-surface-2 border-b border-surface-3">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <FileDiff className="w-3.5 h-3.5 text-yellow flex-shrink-0" />
                                        <span className="font-mono text-sm text-white truncate">
                                            {p.path}
                                        </span>
                                    </div>
                                    <div className="flex items-center gap-2 text-xs font-mono flex-shrink-0">
                                        <span className="text-emerald-400 flex items-center">
                                            <Plus className="w-3 h-3" />
                                            {stats.adds}
                                        </span>
                                        <span className="text-rose-400 flex items-center">
                                            <Minus className="w-3 h-3" />
                                            {stats.dels}
                                        </span>
                                    </div>
                                </div>
                                <div className="font-mono text-xs">
                                    {hunks.length === 0 ? (
                                        <div className="px-3 py-2 text-zinc-500">
                                            (binary or no textual change)
                                        </div>
                                    ) : (
                                        hunks.map((h, hi) => (
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
                                                        <div
                                                            key={li}
                                                            className="flex"
                                                        >
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
                                        ))
                                    )}
                                </div>
                            </motion.div>
                        );
                    })}
                </div>
            )}
        </div>
    );
};
