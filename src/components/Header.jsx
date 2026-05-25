import { motion } from "framer-motion";
import {
    GitBranch,
    RotateCcw,
    Sparkles,
    Info,
    Undo2,
    Redo2,
    Volume2,
    VolumeX,
    Trophy,
} from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { useState } from "react";

export const Header = ({
    branch,
    repoPath,
    cwd,
    onReset,
    onShowHelp,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    soundEnabled,
    onToggleSound,
    onOpenChallenges,
    challengesDone = 0,
    challengesTotal = 0,
}) => {
    const [confirmOpen, setConfirmOpen] = useState(false);
    return (
        <header
            className="flex items-center justify-between px-4 md:px-6 h-14 border-b border-surface-3 bg-surface-1/60 backdrop-blur-md relative z-30"
            data-testid="app-header"
        >
            <div className="flex items-center gap-3">
                <motion.div
                    initial={{ scale: 0.8, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    transition={{ type: "spring", stiffness: 400, damping: 22 }}
                    className="relative"
                >
                    <div className="w-9 h-9 rounded-md bg-yellow flex items-center justify-center shadow-[0_0_18px_rgba(255,215,0,0.35)]">
                        <GitBranch className="w-5 h-5 text-black" strokeWidth={2.5} />
                    </div>
                </motion.div>
                <div className="flex flex-col leading-tight">
                    <div className="flex items-baseline gap-2">
                        <span className="font-black tracking-tight text-lg md:text-xl text-white">
                            GitNaadu
                        </span>
                        <span className="hidden sm:inline text-[10px] uppercase tracking-[0.25em] text-yellow font-bold">
                            v1.0
                        </span>
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500">
                        Git Playground
                    </span>
                </div>
            </div>

            <div className="hidden md:flex items-center gap-2 text-xs font-mono text-zinc-400">
                <span className="px-2 py-1 rounded bg-surface-2 border border-surface-3">
                    <span className="text-zinc-500">cwd</span>{" "}
                    <span className="text-white">{cwd}</span>
                </span>
                {repoPath && branch && (
                    <span
                        className="px-2 py-1 rounded bg-surface-2 border border-yellow/40 text-yellow"
                        data-testid="branch-badge"
                    >
                        <GitBranch className="inline w-3 h-3 mr-1 -mt-0.5" />
                        {branch}
                    </span>
                )}
            </div>

            <div className="flex items-center gap-1">
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onUndo}
                    disabled={!canUndo}
                    className="text-zinc-300 hover:text-white hover:bg-surface-2 disabled:opacity-40 px-2"
                    data-testid="header-undo-btn"
                    title="Undo (Ctrl/⌘+Z)"
                    aria-label="Undo"
                >
                    <Undo2 className="w-4 h-4" />
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onRedo}
                    disabled={!canRedo}
                    className="text-zinc-300 hover:text-white hover:bg-surface-2 disabled:opacity-40 px-2"
                    data-testid="header-redo-btn"
                    title="Redo (Ctrl/⌘+Shift+Z)"
                    aria-label="Redo"
                >
                    <Redo2 className="w-4 h-4" />
                </Button>
                <span className="hidden md:inline w-px h-5 bg-surface-3 mx-1" />
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onToggleSound}
                    className="text-zinc-300 hover:text-white hover:bg-surface-2 px-2"
                    data-testid="header-sound-btn"
                    title={soundEnabled ? "Mute sounds" : "Enable sounds"}
                    aria-label={soundEnabled ? "Mute sounds" : "Enable sounds"}
                >
                    {soundEnabled ? (
                        <Volume2 className="w-4 h-4 text-yellow" />
                    ) : (
                        <VolumeX className="w-4 h-4 text-zinc-500" />
                    )}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onOpenChallenges}
                    className="text-zinc-300 hover:text-white hover:bg-surface-2 relative"
                    data-testid="header-challenges-btn"
                    title="Guided Challenges"
                >
                    <Trophy className="w-4 h-4 mr-1.5 text-yellow" />
                    <span className="hidden sm:inline">Challenges</span>
                    {challengesTotal > 0 && (
                        <span
                            className="ml-1.5 px-1.5 py-0.5 rounded text-[10px] font-mono font-bold bg-surface-2 border border-surface-3 text-yellow"
                            data-testid="header-challenges-count"
                        >
                            {challengesDone}/{challengesTotal}
                        </span>
                    )}
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={onShowHelp}
                    className="text-zinc-300 hover:text-white hover:bg-surface-2 hidden sm:inline-flex"
                    data-testid="header-help-btn"
                >
                    <Info className="w-4 h-4 mr-1.5" /> Help
                </Button>
                <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setConfirmOpen(true)}
                    className="text-zinc-300 hover:text-white hover:bg-surface-2"
                    data-testid="header-reset-btn"
                >
                    <RotateCcw className="w-4 h-4 mr-1.5" /> Reset
                </Button>
                <a
                    href="https://www.youtube.com/@EngineeringinKannada"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded bg-yellow text-black hover:bg-yellow/90 transition-colors ml-1"
                    data-testid="header-brand-link"
                >
                    Course
                </a>
            </div>

            <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
                <DialogContent className="bg-surface-1 border-surface-3 text-white">
                    <DialogHeader>
                        <DialogTitle className="font-black tracking-tight">
                            Reset the entire playground?
                        </DialogTitle>
                    </DialogHeader>
                    <p className="text-sm text-zinc-400">
                        This will wipe all repositories, files and history.
                        Don't worry — nothing real is at stake. This is a safe
                        sandbox.
                    </p>
                    <div className="flex justify-end gap-2 pt-2">
                        <Button
                            variant="ghost"
                            onClick={() => setConfirmOpen(false)}
                            data-testid="reset-cancel-btn"
                        >
                            Cancel
                        </Button>
                        <Button
                            className="bg-yellow text-black hover:bg-yellow/90"
                            onClick={() => {
                                onReset();
                                setConfirmOpen(false);
                            }}
                            data-testid="reset-confirm-btn"
                        >
                            <RotateCcw className="w-4 h-4 mr-1.5" /> Reset
                            playground
                        </Button>
                    </div>
                </DialogContent>
            </Dialog>
        </header>
    );
};
