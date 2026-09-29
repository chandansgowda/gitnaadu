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
    MoreVertical,
    Youtube,
    ChevronRight,
} from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { useState } from "react";

const COURSE_URL = "https://www.youtube.com/@EngineeringinKannada";

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
    isMobile = false,
}) => {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);

    const resetDialog = (
        <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
            <DialogContent className="w-[calc(100%-2rem)] rounded-xl bg-surface-1 border-surface-3 text-white">
                <DialogHeader>
                    <DialogTitle className="font-black tracking-tight text-left pr-6">
                        Reset the entire playground?
                    </DialogTitle>
                </DialogHeader>
                <p className="text-sm text-zinc-400">
                    This will wipe all repositories, files and history.
                    Don't worry — nothing real is at stake. This is a safe
                    sandbox.
                </p>
                <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2 pt-2">
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
    );

    if (isMobile) {
        const path = cwd.replace("/home/student", "~");
        const menuItems = [
            {
                icon: soundEnabled ? Volume2 : VolumeX,
                label: soundEnabled ? "Sound on" : "Sound off",
                hint: "Tap to toggle",
                onClick: onToggleSound,
                keepOpen: true,
                testid: "header-sound-btn",
            },
            {
                icon: Info,
                label: "How it works",
                onClick: onShowHelp,
                testid: "header-help-btn",
            },
            {
                icon: RotateCcw,
                label: "Reset playground",
                onClick: () => setConfirmOpen(true),
                testid: "header-reset-btn",
            },
        ];
        return (
            <header
                className="flex-shrink-0 border-b border-surface-3 bg-surface-1/80 backdrop-blur-md relative z-30 pt-safe"
                data-testid="app-header"
            >
                <div className="h-14 flex items-center gap-2.5 pl-3 pr-1.5">
                    <div className="w-8 h-8 rounded-lg bg-yellow flex items-center justify-center shadow-[0_0_14px_rgba(255,215,0,0.3)] flex-shrink-0">
                        <GitBranch className="w-4 h-4 text-black" strokeWidth={2.5} />
                    </div>
                    <div className="flex flex-col leading-tight min-w-0 flex-1">
                        <span className="font-black tracking-tight text-base text-white">
                            GitNaadu
                        </span>
                        <span className="text-[11px] font-mono text-zinc-500 truncate">
                            <span className="text-sky-400">{path}</span>
                            {repoPath && branch && (
                                <span
                                    className="text-yellow"
                                    data-testid="branch-badge"
                                >
                                    {" "}({branch})
                                </span>
                            )}
                        </span>
                    </div>
                    <div className="flex items-center flex-shrink-0">
                        <button
                            onClick={onUndo}
                            disabled={!canUndo}
                            className="w-10 h-10 flex items-center justify-center rounded-full text-zinc-300 active:bg-surface-2 disabled:opacity-30"
                            data-testid="header-undo-btn"
                            aria-label="Undo"
                        >
                            <Undo2 className="w-[18px] h-[18px]" />
                        </button>
                        <button
                            onClick={onRedo}
                            disabled={!canRedo}
                            className="w-10 h-10 flex items-center justify-center rounded-full text-zinc-300 active:bg-surface-2 disabled:opacity-30"
                            data-testid="header-redo-btn"
                            aria-label="Redo"
                        >
                            <Redo2 className="w-[18px] h-[18px]" />
                        </button>
                        <button
                            onClick={onOpenChallenges}
                            className="h-10 px-2 flex items-center gap-1 rounded-full text-zinc-300 active:bg-surface-2"
                            data-testid="header-challenges-btn"
                            aria-label="Guided challenges"
                        >
                            <Trophy className="w-[18px] h-[18px] text-yellow" />
                            {challengesTotal > 0 && (
                                <span
                                    className="text-[10px] font-mono font-bold text-yellow"
                                    data-testid="header-challenges-count"
                                >
                                    {challengesDone}/{challengesTotal}
                                </span>
                            )}
                        </button>
                        <button
                            onClick={() => setMenuOpen(true)}
                            className="w-10 h-10 flex items-center justify-center rounded-full text-zinc-300 active:bg-surface-2"
                            data-testid="header-menu-btn"
                            aria-label="More options"
                        >
                            <MoreVertical className="w-[18px] h-[18px]" />
                        </button>
                    </div>
                </div>

                <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                    <SheetContent
                        side="bottom"
                        className="bg-surface-1 border-surface-3 text-white rounded-t-2xl p-0 pb-safe"
                        data-testid="header-menu-sheet"
                    >
                        <div className="mx-auto mt-2.5 h-1 w-10 rounded-full bg-surface-3" />
                        <SheetHeader className="px-5 pt-3 pb-2 text-left">
                            <SheetTitle className="font-black tracking-tight text-base text-white">
                                GitNaadu
                                <span className="ml-2 text-[10px] uppercase tracking-[0.25em] text-yellow font-bold">
                                    v1.0
                                </span>
                            </SheetTitle>
                        </SheetHeader>
                        <ul className="px-2 pb-2">
                            {menuItems.map((m) => (
                                <li key={m.label}>
                                    <button
                                        onClick={() => {
                                            if (!m.keepOpen) setMenuOpen(false);
                                            m.onClick();
                                        }}
                                        className="w-full flex items-center gap-3 px-3 h-12 rounded-lg text-sm text-zinc-200 active:bg-surface-2"
                                        data-testid={m.testid}
                                    >
                                        <m.icon className="w-5 h-5 text-yellow" />
                                        <span className="flex-1 text-left">{m.label}</span>
                                        {m.hint && (
                                            <span className="text-[11px] text-zinc-500">
                                                {m.hint}
                                            </span>
                                        )}
                                    </button>
                                </li>
                            ))}
                            <li>
                                <a
                                    href={COURSE_URL}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="w-full flex items-center gap-3 px-3 h-12 rounded-lg text-sm text-zinc-200 active:bg-surface-2"
                                    data-testid="header-brand-link"
                                >
                                    <Youtube className="w-5 h-5 text-yellow" />
                                    <span className="flex-1">Watch the course</span>
                                    <ChevronRight className="w-4 h-4 text-zinc-600" />
                                </a>
                            </li>
                        </ul>
                        <div className="px-5 py-3 border-t border-surface-3 text-[11px] text-zinc-500">
                            Made with ♥️ by{" "}
                            <a
                                href="https://www.linkedin.com/in/chandan-s-gowda"
                                className="underline text-zinc-400"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Chandan Gowda
                            </a>
                            {" & "}
                            <a
                                href="https://www.linkedin.com/in/mithungowdab"
                                className="underline text-zinc-400"
                                target="_blank"
                                rel="noopener noreferrer"
                            >
                                Mithun Gowda
                            </a>
                        </div>
                    </SheetContent>
                </Sheet>
                {resetDialog}
            </header>
        );
    }

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
                <span className="hidden xl:inline-block px-2 py-1 rounded bg-surface-2 border border-surface-3 whitespace-nowrap max-w-[22rem] truncate">
                    <span className="text-zinc-500">cwd</span>{" "}
                    <span className="text-white">{cwd}</span>
                </span>
                {repoPath && branch && (
                    <span
                        className="px-2 py-1 rounded bg-surface-2 border border-yellow/40 text-yellow whitespace-nowrap"
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
                    href={COURSE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded bg-yellow text-black hover:bg-yellow/90 transition-colors ml-1"
                    data-testid="header-brand-link"
                >
                    Course
                </a>
            </div>

            {resetDialog}
        </header>
    );
};
