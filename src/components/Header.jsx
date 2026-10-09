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
    Menu,
    Bell,
    BellOff,
    Download,
    Share,
    SquarePlus,
} from "lucide-react";
import { Button } from "./ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "./ui/sheet";
import { useEffect, useRef, useState } from "react";
import { Credits } from "./Credits";
import { useInstall } from "../hooks/useInstall";

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
    toastsEnabled,
    onToggleToasts,
    onOpenChallenges,
    challengesDone = 0,
    challengesTotal = 0,
    isMobile = false,
}) => {
    const [confirmOpen, setConfirmOpen] = useState(false);
    const [menuOpen, setMenuOpen] = useState(false);
    const [iosHelpOpen, setIosHelpOpen] = useState(false);
    const menuRef = useRef(null);
    const { canInstall, install } = useInstall();

    // Close the desktop dropdown on an outside click or Escape.
    useEffect(() => {
        if (!menuOpen || isMobile) return;
        const onDown = (e) => {
            if (!menuRef.current?.contains(e.target)) setMenuOpen(false);
        };
        const onKey = (e) => {
            if (e.key === "Escape") setMenuOpen(false);
        };
        document.addEventListener("mousedown", onDown);
        document.addEventListener("keydown", onKey);
        return () => {
            document.removeEventListener("mousedown", onDown);
            document.removeEventListener("keydown", onKey);
        };
    }, [menuOpen, isMobile]);

    // Settings menu, shared by the desktop dropdown and the phone sheet.
    const menuItems = [
        canInstall && {
            icon: Download,
            label: "Install app",
            hint: isMobile ? "Add to home screen" : undefined,
            onClick: async () => {
                if ((await install()) === "ios") setIosHelpOpen(true);
            },
            testid: "header-install-btn",
        },
        {
            icon: soundEnabled ? Volume2 : VolumeX,
            label: soundEnabled ? "Sound on" : "Sound off",
            hint: isMobile ? "Tap to toggle" : undefined,
            onClick: onToggleSound,
            keepOpen: true,
            muted: !soundEnabled,
            testid: "header-sound-btn",
        },
        {
            icon: toastsEnabled ? Bell : BellOff,
            label: toastsEnabled ? "Notifications on" : "Notifications off",
            hint: isMobile ? "Tap to toggle" : undefined,
            onClick: onToggleToasts,
            keepOpen: true,
            muted: !toastsEnabled,
            testid: "header-toasts-btn",
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
    ].filter(Boolean);

    const iosHelpDialog = (
        <Dialog open={iosHelpOpen} onOpenChange={setIosHelpOpen}>
            <DialogContent
                className="w-[calc(100%-2rem)] rounded-xl bg-surface-1 border-surface-3 text-white"
                data-testid="install-ios-dialog"
            >
                <DialogHeader>
                    <DialogTitle className="font-black tracking-tight text-left pr-6">
                        Install GitNaadu
                    </DialogTitle>
                </DialogHeader>
                <p className="text-sm text-zinc-400">
                    Add GitNaadu to your home screen to open it like an app —
                    full screen, and it works offline.
                </p>
                <ol className="space-y-3 text-sm text-zinc-200">
                    <li className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-yellow text-black text-xs font-bold flex items-center justify-center flex-shrink-0">
                            1
                        </span>
                        <span>
                            Tap the <b>Share</b> button{" "}
                            <Share className="inline w-4 h-4 -mt-1 text-sky-400" /> in
                            the browser toolbar
                        </span>
                    </li>
                    <li className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-yellow text-black text-xs font-bold flex items-center justify-center flex-shrink-0">
                            2
                        </span>
                        <span>
                            Choose <b>Add to Home Screen</b>{" "}
                            <SquarePlus className="inline w-4 h-4 -mt-1 text-zinc-300" />
                        </span>
                    </li>
                    <li className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-yellow text-black text-xs font-bold flex items-center justify-center flex-shrink-0">
                            3
                        </span>
                        <span>
                            Tap <b>Add</b>
                        </span>
                    </li>
                </ol>
                <div className="flex justify-end pt-1">
                    <Button
                        className="bg-yellow text-black hover:bg-yellow/90"
                        onClick={() => setIosHelpOpen(false)}
                    >
                        Got it
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    );

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
                                <li key={m.testid}>
                                    <button
                                        onClick={() => {
                                            if (!m.keepOpen) setMenuOpen(false);
                                            m.onClick();
                                        }}
                                        className="w-full flex items-center gap-3 px-3 h-12 rounded-lg text-sm text-zinc-200 active:bg-surface-2"
                                        data-testid={m.testid}
                                    >
                                        <m.icon
                                            className={
                                                "w-5 h-5 " +
                                                (m.muted ? "text-zinc-500" : "text-yellow")
                                            }
                                        />
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
                        <div className="px-5 py-3 border-t border-surface-3">
                            <Credits
                                className="text-xs text-zinc-500 leading-relaxed"
                                linkClassName="text-zinc-300 py-1"
                            />
                        </div>
                    </SheetContent>
                </Sheet>
                {resetDialog}
                {iosHelpDialog}
            </header>
        );
    }

    return (
        <header
            className="flex items-center justify-between px-4 md:px-6 h-14 border-b border-surface-3 bg-surface-1/60 backdrop-blur-md relative z-40"
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
                <a
                    href={COURSE_URL}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hidden sm:inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded bg-yellow text-black hover:bg-yellow/90 transition-colors ml-1"
                    data-testid="header-brand-link"
                >
                    Course
                </a>
                <div className="relative ml-1" ref={menuRef}>
                    <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setMenuOpen((o) => !o)}
                        className={
                            "text-zinc-300 hover:text-white hover:bg-surface-2 px-2 " +
                            (menuOpen ? "bg-surface-2 text-white" : "")
                        }
                        data-testid="header-menu-btn"
                        title="Settings & help"
                        aria-label="Settings & help"
                        aria-haspopup="menu"
                        aria-expanded={menuOpen}
                    >
                        <Menu className="w-4 h-4" />
                    </Button>
                    {menuOpen && (
                        <motion.div
                            initial={{ opacity: 0, y: -4 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.12, ease: "easeOut" }}
                            role="menu"
                            className="absolute right-0 top-full mt-2 w-60 rounded-lg border border-surface-3 bg-surface-1 shadow-xl shadow-black/40 p-1"
                            data-testid="header-menu"
                        >
                            {menuItems.map((m) => (
                                <button
                                    key={m.testid}
                                    role="menuitem"
                                    onClick={() => {
                                        if (!m.keepOpen) setMenuOpen(false);
                                        m.onClick();
                                    }}
                                    className="w-full flex items-center gap-2.5 px-2.5 h-9 rounded-md text-sm text-zinc-200 hover:bg-surface-2 focus-visible:bg-surface-2 outline-none"
                                    data-testid={m.testid}
                                >
                                    <m.icon
                                        className={
                                            "w-4 h-4 " +
                                            (m.muted ? "text-zinc-500" : "text-yellow")
                                        }
                                    />
                                    <span className="flex-1 text-left">{m.label}</span>
                                    {m.hint && (
                                        <span className="text-[10px] text-zinc-500">
                                            {m.hint}
                                        </span>
                                    )}
                                </button>
                            ))}
                        </motion.div>
                    )}
                </div>
            </div>

            {resetDialog}
            {iosHelpDialog}
        </header>
    );
};
