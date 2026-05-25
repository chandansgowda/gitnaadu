import { useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Sheet,
    SheetContent,
    SheetHeader,
    SheetTitle,
} from "./ui/sheet";
import { Button } from "./ui/button";
import {
    Trophy,
    Check,
    Lightbulb,
    Zap,
    ChevronRight,
    ChevronLeft,
    RotateCcw,
    Flag,
    Clock,
} from "lucide-react";

const DIFF_COLORS = {
    beginner: "text-emerald-400 border-emerald-500/40 bg-emerald-500/10",
    intermediate: "text-yellow border-yellow/40 bg-yellow/10",
    advanced: "text-rose-400 border-rose-500/40 bg-rose-500/10",
};

export const ChallengePanel = ({
    open,
    onOpenChange,
    challenges,
    active,
    stepIndex,
    progress,
    completed,
    onStart,
    onStop,
    onReset,
    onResetOne,
    viewMode,
    onViewList,
    onViewActive,
}) => {
    const stats = useMemo(() => {
        const done = Object.keys(completed || {}).length;
        return { done, total: challenges.all.length };
    }, [completed, challenges.all.length]);

    // `viewMode` is controlled by parent — "list" or "active".
    // If there's no active challenge we always show the list.
    const effectiveView = !active ? "list" : viewMode;

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent
                side="right"
                className="bg-surface-1 border-surface-3 text-white w-full sm:max-w-md md:max-w-lg p-0 overflow-hidden flex flex-col"
                data-testid="challenge-sheet"
            >
                <SheetHeader className="px-5 py-4 border-b border-surface-3 bg-surface-2/40 space-y-0">
                    <SheetTitle className="flex items-center gap-2 font-black tracking-tight text-base pr-10">
                        {effectiveView === "active" && active ? (
                            <button
                                onClick={onViewList}
                                className="p-1 -ml-1 rounded hover:bg-surface-3 text-zinc-400 hover:text-white transition-colors"
                                aria-label="Back to challenges list"
                                data-testid="challenge-back-list"
                            >
                                <ChevronLeft className="w-4 h-4" />
                            </button>
                        ) : (
                            <Trophy className="w-4 h-4 text-yellow" />
                        )}
                        <span className="truncate">
                            {effectiveView === "active" && active
                                ? active.title
                                : "Guided Challenges"}
                        </span>
                        <span
                            className="ml-auto text-[11px] font-mono text-zinc-400 whitespace-nowrap"
                            data-testid="challenge-stats"
                        >
                            {stats.done}/{stats.total}
                        </span>
                    </SheetTitle>
                </SheetHeader>

                {effectiveView === "active" && active ? (
                    <ActiveChallenge
                        challenge={active}
                        stepIndex={stepIndex}
                        onStop={onStop}
                        onViewList={onViewList}
                    />
                ) : (
                    <ChallengeList
                        challenges={challenges.all}
                        progress={progress}
                        completed={completed}
                        activeId={active?.id || null}
                        onStart={(id) => {
                            onStart(id);
                            onViewActive?.();
                        }}
                        onReset={onReset}
                        onResetOne={onResetOne}
                    />
                )}
            </SheetContent>
        </Sheet>
    );
};

const ChallengeList = ({ challenges, progress, completed, activeId, onStart, onReset, onResetOne }) => {
    return (
        <div className="flex-1 overflow-auto" data-testid="challenge-list">
            <div className="px-5 py-3 text-[11px] text-zinc-400 leading-relaxed">
                Pick a quest. Run the suggested commands in the terminal — each
                step auto-completes when its goal is reached.
            </div>
            <ul className="px-3 pb-3 space-y-2">
                {challenges.map((c) => {
                    const isDone = !!completed[c.id];
                    const inProgress = !isDone && (progress?.[c.id] || 0) > 0;
                    const isActive = activeId === c.id;
                    const stepsDone = progress?.[c.id] || 0;
                    return (
                        <li
                            key={c.id}
                            className={
                                "border rounded-md overflow-hidden transition-colors " +
                                (isActive
                                    ? "border-yellow/70 bg-yellow/[0.04]"
                                    : "border-surface-3 bg-surface-2/30 hover:border-yellow/40")
                            }
                            data-testid={`challenge-${c.id}`}
                        >
                            <button
                                onClick={() => onStart(c.id)}
                                className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-surface-2/60 transition-colors focus:outline-none focus:ring-1 focus:ring-yellow/60"
                            >
                                <div
                                    className={
                                        "w-9 h-9 rounded-md flex items-center justify-center flex-shrink-0 border " +
                                        (isDone
                                            ? "bg-yellow text-black border-yellow"
                                            : inProgress
                                                ? "bg-yellow/20 text-yellow border-yellow/50"
                                                : "bg-surface-2 text-yellow border-surface-3")
                                    }
                                >
                                    {isDone ? (
                                        <Check className="w-5 h-5" strokeWidth={3} />
                                    ) : inProgress ? (
                                        <Clock className="w-4 h-4" />
                                    ) : (
                                        <Flag className="w-4 h-4" />
                                    )}
                                </div>
                                <div className="min-w-0 flex-1">
                                    <div className="flex items-center gap-2 flex-wrap">
                                        <span className="font-bold text-sm text-white">
                                            {c.title}
                                        </span>
                                        <span
                                            className={
                                                "px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-bold rounded-sm border " +
                                                DIFF_COLORS[c.difficulty]
                                            }
                                        >
                                            {c.difficulty}
                                        </span>
                                        {isDone && (
                                            <span className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-bold rounded-sm bg-emerald-500/15 text-emerald-400 border border-emerald-500/40">
                                                done
                                            </span>
                                        )}
                                        {inProgress && (
                                            <span
                                                className="px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-bold rounded-sm bg-yellow/15 text-yellow border border-yellow/40"
                                                data-testid={`challenge-${c.id}-progress-badge`}
                                            >
                                                {stepsDone}/{c.steps.length}
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[11px] text-zinc-400 leading-snug mt-1 line-clamp-2">
                                        {c.intro}
                                    </p>
                                </div>
                                <ChevronRight className="w-4 h-4 text-zinc-500 flex-shrink-0" />
                            </button>
                            {(inProgress || isDone) && (
                                <div className="px-4 py-1.5 border-t border-surface-3/60 bg-surface-1/30 flex justify-end">
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onResetOne?.(c.id);
                                        }}
                                        className="text-[10px] uppercase tracking-wider text-zinc-500 hover:text-rose-400 transition-colors flex items-center gap-1"
                                        data-testid={`challenge-${c.id}-reset`}
                                    >
                                        <RotateCcw className="w-3 h-3" />
                                        Reset progress
                                    </button>
                                </div>
                            )}
                        </li>
                    );
                })}
            </ul>
            <div className="px-5 py-4 border-t border-surface-3 flex items-center justify-between">
                <span className="text-[11px] text-zinc-500">
                    Progress persists in your browser
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onReset}
                    className="h-7 text-zinc-400 hover:text-white"
                    data-testid="challenge-reset-all"
                >
                    <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
                    Reset all
                </Button>
            </div>
        </div>
    );
};

const ActiveChallenge = ({ challenge, stepIndex, onStop, onViewList }) => {
    const done = stepIndex >= challenge.steps.length;
    const progress = Math.round((stepIndex / challenge.steps.length) * 100);

    return (
        <div className="flex-1 flex flex-col min-h-0" data-testid="challenge-active">
            <div className="px-5 py-4 border-b border-surface-3 bg-surface-2/30">
                <div className="flex items-center gap-2 flex-wrap mb-2">
                    <span
                        className={
                            "px-1.5 py-0.5 text-[9px] uppercase tracking-wider font-bold rounded-sm border " +
                            DIFF_COLORS[challenge.difficulty]
                        }
                    >
                        {challenge.difficulty}
                    </span>
                </div>
                <p className="text-xs text-zinc-400 leading-relaxed">
                    {challenge.intro}
                </p>
                <div className="mt-3 flex items-center gap-2">
                    <div className="flex-1 h-1.5 rounded-full bg-surface-3 overflow-hidden">
                        <motion.div
                            className="h-full bg-yellow"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ type: "spring", stiffness: 200, damping: 30 }}
                        />
                    </div>
                    <span
                        className="text-[11px] font-mono text-zinc-400"
                        data-testid="challenge-progress"
                    >
                        {stepIndex}/{challenge.steps.length}
                    </span>
                </div>
            </div>

            <div className="flex-1 overflow-auto px-3 py-3 space-y-2">
                {challenge.steps.map((s, i) => {
                    const isDone = i < stepIndex;
                    const isCurrent = i === stepIndex;
                    return (
                        <motion.div
                            key={i}
                            layout
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            className={
                                "rounded-md border p-3 transition-all " +
                                (isDone
                                    ? "border-emerald-500/30 bg-emerald-500/[0.04]"
                                    : isCurrent
                                        ? "border-yellow/50 bg-yellow/[0.05] shadow-[0_0_18px_rgba(255,215,0,0.08)]"
                                        : "border-surface-3 bg-surface-2/30")
                            }
                            data-testid={`challenge-step-${i}`}
                        >
                            <div className="flex items-start gap-2.5">
                                <div
                                    className={
                                        "w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[10px] font-bold mt-0.5 " +
                                        (isDone
                                            ? "bg-emerald-500 text-black"
                                            : isCurrent
                                                ? "bg-yellow text-black animate-pulse-glow"
                                                : "bg-surface-3 text-zinc-500")
                                    }
                                >
                                    {isDone ? <Check className="w-3 h-3" strokeWidth={4} /> : i + 1}
                                </div>
                                <div className="flex-1 min-w-0">
                                    <p
                                        className={
                                            "text-sm " +
                                            (isDone
                                                ? "text-zinc-500 line-through"
                                                : isCurrent
                                                    ? "text-white"
                                                    : "text-zinc-400")
                                        }
                                    >
                                        {s.text}
                                    </p>
                                    {isCurrent && s.hint && (
                                        <div className="mt-2 flex items-start gap-1.5 px-2 py-1.5 rounded bg-surface-1/80 border border-surface-3">
                                            <Lightbulb className="w-3 h-3 text-yellow flex-shrink-0 mt-0.5" />
                                            <code className="font-mono text-[11px] text-yellow break-all">
                                                {s.hint}
                                            </code>
                                        </div>
                                    )}
                                </div>
                            </div>
                        </motion.div>
                    );
                })}

                <AnimatePresence>
                    {done && (
                        <motion.div
                            initial={{ opacity: 0, y: 8, scale: 0.96 }}
                            animate={{ opacity: 1, y: 0, scale: 1 }}
                            transition={{ type: "spring", stiffness: 240, damping: 22 }}
                            className="mt-3 p-4 rounded-md border border-yellow/50 bg-gradient-to-br from-yellow/10 to-yellow/0"
                            data-testid="challenge-complete"
                        >
                            <div className="flex items-center gap-2 mb-2">
                                <Trophy className="w-4 h-4 text-yellow" />
                                <span className="font-black text-sm tracking-tight">
                                    Challenge complete!
                                </span>
                            </div>
                            <p className="text-xs text-zinc-300 leading-relaxed">
                                {challenge.outro}
                            </p>
                            <Button
                                size="sm"
                                onClick={onViewList}
                                className="mt-3 h-7 bg-yellow text-black hover:bg-yellow/90 font-semibold"
                                data-testid="challenge-back-to-list"
                            >
                                <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                                Back to challenges
                            </Button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            <div className="px-5 py-3 border-t border-surface-3 flex items-center justify-between bg-surface-2/30">
                <span className="text-[11px] text-zinc-500 flex items-center gap-1.5">
                    <Zap className="w-3 h-3 text-yellow" />
                    Steps auto-check as you type
                </span>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onViewList}
                    className="h-7 text-zinc-400 hover:text-white"
                    data-testid="challenge-back-list-footer"
                >
                    <ChevronLeft className="w-3.5 h-3.5 mr-1" />
                    All challenges
                </Button>
                {/* Abandon — fully drops the active pointer. Progress for this
                    challenge is still preserved in `progress[id]`. */}
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onStop}
                    className="h-7 text-zinc-500 hover:text-rose-400"
                    data-testid="challenge-leave"
                >
                    Abandon
                </Button>
            </div>
        </div>
    );
};
