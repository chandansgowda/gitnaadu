import { useRef } from "react";
import { motion } from "framer-motion";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "./ui/dialog";
import { Button } from "./ui/button";
import { ArrowRight, GitBranch, Terminal, Folder } from "lucide-react";
import coverImage from "../assets/cover.webp";

const STORAGE_FLAG = "gitnaadu:welcome-seen";

// `onStart` runs after the dialog has fully closed when the user picks
// "Open the terminal", so the caller can show + focus the terminal input.
export const WelcomeOverlay = ({ open, onOpenChange, onStart }) => {
    const startRequested = useRef(false);

    const close = () => {
        try {
            window.localStorage.setItem(STORAGE_FLAG, "1");
        } catch {
            // ignore
        }
        onOpenChange(false);
    };

    const start = () => {
        startRequested.current = true;
        close();
    };

    // Radix returns focus to whatever was focused before the dialog opened
    // (usually <body>), which would undo our focus. Take over instead.
    const onCloseAutoFocus = (e) => {
        if (!startRequested.current) return;
        startRequested.current = false;
        e.preventDefault();
        onStart?.();
    };

    const tips = [
        {
            icon: Terminal,
            title: "Real shell, zero risk",
            text: "A faithful Linux + Git simulator running entirely in your browser. Nothing leaves your machine.",
        },
        {
            icon: GitBranch,
            title: "See Git, finally",
            text: "Every command animates the commit graph so you understand exactly what changed.",
        },
        {
            icon: Folder,
            title: "Bring your own mess",
            text: "Three sample projects to break, fix, and break again. Press reset whenever you want a clean slate.",
        },
    ];

    return (
        <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
            <DialogContent
                className="max-w-2xl w-[calc(100%-1.5rem)] max-h-[calc(100dvh-1.5rem)] rounded-2xl sm:rounded-lg bg-surface-1 border-surface-3 text-white p-0 overflow-y-auto overflow-x-hidden"
                data-testid="welcome-overlay"
                onCloseAutoFocus={onCloseAutoFocus}
            >
                <div className="relative">
                    <div
                        className="absolute inset-0 opacity-40"
                        style={{
                            backgroundImage: `url(${coverImage})`,
                            backgroundSize: "cover",
                            backgroundPosition: "center",
                        }}
                    />
                    <div className="absolute inset-0 bg-gradient-to-b from-transparent via-surface-1/80 to-surface-1" />
                    <div className="relative p-5 sm:p-7 md:p-10">
                        <DialogHeader className="space-y-3 text-left">
                            <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold uppercase tracking-[0.3em] text-yellow">
                                    Engineering in Kannada
                                </span>
                            </div>
                            <DialogTitle className="font-black text-3xl sm:text-4xl md:text-5xl tracking-tight leading-[1.05]">
                                Welcome to{" "}
                                <span className="text-yellow">GitNaadu.</span>
                            </DialogTitle>
                        </DialogHeader>
                        <p className="text-zinc-300 text-sm md:text-base mt-3 sm:mt-4 max-w-lg leading-relaxed">
                            A futuristic, browser-only playground to{" "}
                            <span className="text-white font-semibold">
                                see Git happen
                            </span>{" "}
                            instead of memorising commands. Type, experiment,
                            break things and learn.
                        </p>
                        <div className="grid sm:grid-cols-3 gap-2 sm:gap-3 mt-5 sm:mt-7">
                            {tips.map((t, i) => (
                                <motion.div
                                    key={t.title}
                                    initial={{ opacity: 0, y: 12 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: 0.15 + i * 0.07 }}
                                    className="rounded-md border border-surface-3 bg-surface-2/60 p-3 sm:p-4 flex sm:block items-start gap-3"
                                >
                                    <div className="w-8 h-8 rounded-md bg-yellow/15 border border-yellow/30 flex items-center justify-center sm:mb-2.5 flex-shrink-0">
                                        <t.icon className="w-4 h-4 text-yellow" />
                                    </div>
                                    <div className="min-w-0">
                                        <div className="font-bold text-sm text-white">
                                            {t.title}
                                        </div>
                                        <p className="text-xs text-zinc-400 leading-relaxed mt-1">
                                            {t.text}
                                        </p>
                                    </div>
                                </motion.div>
                            ))}
                        </div>
                        <div className="mt-5 sm:mt-7 flex items-center justify-between gap-4">
                            <code className="font-mono text-xs text-zinc-500 hidden md:block">
                                Tip: press ↑ ↓ for history, Tab for path
                                completion
                            </code>
                            <Button
                                onClick={start}
                                className="bg-yellow text-black hover:bg-yellow/90 font-semibold px-5 w-full md:w-auto h-11 md:h-9"
                                data-testid="welcome-start-btn"
                            >
                                Open the terminal{" "}
                                <ArrowRight className="w-4 h-4 ml-1.5" />
                            </Button>
                        </div>
                    </div>
                </div>
            </DialogContent>
        </Dialog>
    );
};

export const shouldShowWelcome = () => {
    try {
        return !window.localStorage.getItem(STORAGE_FLAG);
    } catch {
        return true;
    }
};

export const resetWelcomeFlag = () => {
    try {
        window.localStorage.removeItem(STORAGE_FLAG);
    } catch {
        // ignore
    }
};
