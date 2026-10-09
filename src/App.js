import { useState, useMemo, useEffect, useCallback } from "react";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "./components/ui/tabs";
import { Header } from "./components/Header";
import { Terminal } from "./components/Terminal";
import { GitTree } from "./components/GitTree";
import { FileTree } from "./components/FileTree";
import { Editor } from "./components/Editor";
import { DiffView } from "./components/DiffView";
import { CommitShow } from "./components/CommitShow";
import { RemotePanel } from "./components/RemotePanel";
import { StatusBar } from "./components/StatusBar";
import { CommandExplainer } from "./components/CommandExplainer";
import {
    WelcomeOverlay,
    shouldShowWelcome,
    resetWelcomeFlag,
} from "./components/WelcomeOverlay";
import { useGitNaadu } from "./hooks/useGitNaadu";
import { useSound, soundForHighlight } from "./hooks/useSound";
import { useChallenges } from "./hooks/useChallenges";
import { useToasts } from "./hooks/useToasts";
import { ChallengePanel } from "./components/ChallengePanel";
import { findRepo, currentBranch } from "./lib/gitEngine";
import { Toaster } from "./components/ui/sonner";
import { AnimatePresence, motion } from "framer-motion";
import { MobileNav } from "./components/MobileNav";
import { useIsMobile, useVisualViewport } from "./hooks/useViewport";

const TREE_KINDS = new Set([
    "git-init",
    "git-commit",
    "git-amend",
    "git-branch",
    "git-checkout",
    "git-merge",
    "git-merge-abort",
    "git-rebase",
    "git-reset",
    "git-revert",
    "git-cherry-pick",
    "git-tag",
    "git-clone",
]);

// Which workspace view best shows the effect of a highlighted command.
const tabForHighlight = (kind = "") => {
    if (kind === "git-diff" || kind === "git-merge-conflict") return "diff";
    if (kind === "git-push" || kind === "git-fetch") return "remote";
    if (TREE_KINDS.has(kind)) return "git";
    return null;
};

const TAB_LABELS = { git: "graph", diff: "diff", remote: "remote" };

const TAB_TRIGGER_CLS =
    "h-7 px-2.5 data-[state=active]:bg-yellow data-[state=active]:text-black data-[state=active]:shadow-none text-[11px] uppercase tracking-wider font-bold";

export default function App() {
    const [state, setState, stateRef, resetState, hist] = useGitNaadu();
    const sound = useSound();
    const toasts = useToasts();
    const isMobile = useIsMobile();
    const keyboardOpen = useVisualViewport();
    const [highlight, setHighlight] = useState(null);
    // On phones "terminal" is a view of its own; on desktop it's always
    // visible and `tab` only drives the right-hand workspace.
    const [tab, setTab] = useState(() => (isMobile ? "terminal" : "git"));
    const [badges, setBadges] = useState({});
    const [welcomeOpen, setWelcomeOpen] = useState(false);
    const [editorPath, setEditorPath] = useState(null);
    const [selectedCommit, setSelectedCommit] = useState(null);
    const [challengesOpen, setChallengesOpen] = useState(false);
    const [challengeView, setChallengeView] = useState("list"); // "list" | "active"
    // Bumped to ask the Terminal to focus its input (e.g. "Open the terminal").
    const [terminalFocus, setTerminalFocus] = useState(0);

    const openTerminal = useCallback(() => {
        if (isMobile) setTab("terminal");
        setTerminalFocus((n) => n + 1);
    }, [isMobile]);

    const lastCommand = state.history.length
        ? state.history[state.history.length - 1]
        : null;

    const challenges = useChallenges({
        state,
        setState,
        lastHighlight: highlight,
        lastCommand,
        onProgress: (challenge, idx) => {
            sound.play("success");
            toasts.success(`Step ${idx} done`, {
                description: challenge.steps[idx - 1]?.text,
                duration: 2200,
                position: isMobile ? "top-center" : "bottom-right",
            });
        },
        onComplete: (challenge) => {
            sound.play("success");
            toasts.success(`Challenge complete: ${challenge.title}`, {
                description: challenge.outro,
                duration: 4500,
                position: isMobile ? "top-center" : "bottom-right",
            });
        },
    });

    useEffect(() => {
        if (shouldShowWelcome()) setWelcomeOpen(true);
    }, []);

    const repo = useMemo(
        () => findRepo(state.repos, state.cwd),
        [state.repos, state.cwd],
    );
    const branch = repo ? currentBranch(repo) : null;

    // Only mutate-the-tree commands should switch tab to "git". On phones we
    // don't yank the user out of the terminal — the target tab gets a badge
    // and the explainer card offers a shortcut instead.
    useEffect(() => {
        if (!highlight) return;
        const target = tabForHighlight(highlight.kind);
        if (!target) return;
        if (isMobile) {
            if (tab !== target) setBadges((b) => ({ ...b, [target]: true }));
        } else {
            setTab(target);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [highlight]);

    // Terminal isn't a workspace tab on desktop; clear badges once seen.
    useEffect(() => {
        if (!isMobile && tab === "terminal") setTab("git");
        setBadges((b) => (b[tab] ? { ...b, [tab]: false } : b));
    }, [tab, isMobile]);

    const handleReset = useCallback(() => {
        resetState();
        resetWelcomeFlag();
        setHighlight(null);
        setEditorPath(null);
        setSelectedCommit(null);
        setBadges({});
        setTab(isMobile ? "terminal" : "git");
        sound.play("toggle");
        toasts.success("Playground reset", {
            description: "All repos, files and history cleared.",
        });
    }, [resetState, sound, toasts, isMobile]);

    const openFile = useCallback(
        (path) => {
            setEditorPath(path);
            setTab("editor");
            sound.play("pop");
        },
        [sound],
    );

    const playForHighlight = useCallback(
        (h) => {
            if (!h) return;
            if (h.kind === "enter") return sound.play("enter");
            if (h.kind === "error-line") return sound.play("error");
            const mapped = soundForHighlight(h);
            if (mapped) sound.play(mapped);
            else sound.play("enter");
        },
        [sound],
    );

    const onUndo = useCallback(() => {
        if (hist.undo()) {
            sound.play("pop");
        }
    }, [hist, sound]);

    const onRedo = useCallback(() => {
        if (hist.redo()) {
            sound.play("pop");
        }
    }, [hist, sound]);

    // Global keyboard shortcuts: Cmd/Ctrl+Z, Cmd/Ctrl+Shift+Z (or Y)
    useEffect(() => {
        const onKey = (e) => {
            const meta = e.ctrlKey || e.metaKey;
            if (!meta) return;
            const tag = (e.target?.tagName || "").toLowerCase();
            // Don't hijack Cmd+Z while typing in textarea/input (let browser undo text)
            if (tag === "textarea" || tag === "input") return;
            if (e.key.toLowerCase() === "z" && !e.shiftKey) {
                e.preventDefault();
                onUndo();
            } else if (
                (e.key.toLowerCase() === "z" && e.shiftKey) ||
                e.key.toLowerCase() === "y"
            ) {
                e.preventDefault();
                onRedo();
            }
        };
        window.addEventListener("keydown", onKey);
        return () => window.removeEventListener("keydown", onKey);
    }, [onUndo, onRedo]);

    const onSelectCommit = useCallback(
        (id) => {
            setSelectedCommit(id);
            setTab("git");
            sound.play("pop");
        },
        [sound],
    );

    const changeTab = (v) => {
        setTab(v);
        // On phones the explainer card would cover the view being opened.
        if (isMobile) setHighlight(null);
        sound.play("toggle");
    };

    // Workspace panels, shared by the desktop tabs and the phone views.
    const panels = {
        git: (
            <>
                <GitTree state={state} onSelectCommit={onSelectCommit} />
                <AnimatePresence>
                    {selectedCommit && (
                        <CommitShow
                            state={state}
                            commitId={selectedCommit}
                            onClose={() => {
                                setSelectedCommit(null);
                                sound.play("pop");
                            }}
                        />
                    )}
                </AnimatePresence>
            </>
        ),
        files: (
            <FileTree
                state={state}
                repoPath={repo?.path}
                onOpenFile={openFile}
            />
        ),
        editor: (
            <Editor
                state={state}
                setState={setState}
                path={editorPath}
                onSaved={() => sound.play("success")}
                onClose={() => {
                    setEditorPath(null);
                    setTab("files");
                }}
            />
        ),
        diff: <DiffView state={state} />,
        remote: <RemotePanel state={state} setState={setState} />,
    };

    const terminal = (
        <Terminal
            state={state}
            setState={setState}
            branch={branch}
            onHighlight={setHighlight}
            onSound={playForHighlight}
            isMobile={isMobile}
            focusSignal={terminalFocus}
        />
    );

    const explainerTarget = highlight ? tabForHighlight(highlight.kind) : null;

    const header = (
        <Header
            branch={branch}
            repoPath={repo?.path}
            cwd={state.cwd}
            onReset={handleReset}
            onShowHelp={() => setWelcomeOpen(true)}
            onUndo={onUndo}
            onRedo={onRedo}
            canUndo={hist.canUndo}
            canRedo={hist.canRedo}
            soundEnabled={sound.enabled}
            onToggleSound={() => {
                sound.toggle();
                sound.play("toggle");
            }}
            toastsEnabled={toasts.enabled}
            onToggleToasts={() => {
                toasts.toggle();
                sound.play("toggle");
            }}
            onOpenChallenges={() => {
                setChallengesOpen(true);
                // If there's an active challenge, jump straight to it.
                setChallengeView(challenges.active ? "active" : "list");
                sound.play("toggle");
            }}
            challengesDone={Object.keys(challenges.completed || {}).length}
            challengesTotal={challenges.all.length}
            isMobile={isMobile}
        />
    );

    const overlays = (
        <>
            <WelcomeOverlay
                open={welcomeOpen}
                onOpenChange={setWelcomeOpen}
                onStart={openTerminal}
            />
            <ChallengePanel
                side={isMobile ? "bottom" : "right"}
                open={challengesOpen}
                onOpenChange={setChallengesOpen}
                challenges={challenges}
                active={challenges.active}
                stepIndex={challenges.stepIndex}
                progress={challenges.progress}
                completed={challenges.completed}
                onStart={challenges.start}
                onStop={challenges.stop}
                onReset={challenges.resetProgress}
                onResetOne={challenges.resetOne}
                viewMode={challengeView}
                onViewList={() => setChallengeView("list")}
                onViewActive={() => setChallengeView("active")}
            />
            <Toaster
                position={isMobile ? "top-center" : "top-right"}
                offset={isMobile ? 64 : undefined}
                theme="dark"
                toastOptions={{
                    style: {
                        background: "#1C1C1F",
                        border: "1px solid #27272A",
                        color: "#fafafa",
                    },
                }}
            />
        </>
    );

    if (isMobile) {
        return (
            <div
                className="app-height w-full flex flex-col bg-surface-0 text-white overflow-hidden"
                data-testid="app-mobile"
            >
                {header}

                <main className="flex-1 min-h-0 relative">
                    {/* Terminal stays mounted so the typed draft survives tab switches. */}
                    <div className={tab === "terminal" ? "h-full" : "hidden"}>
                        {terminal}
                    </div>
                    {tab !== "terminal" && (
                        <motion.div
                            key={tab}
                            initial={{ opacity: 0, y: 6 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ duration: 0.16, ease: "easeOut" }}
                            className="h-full relative"
                            data-testid={`mobile-view-${tab}`}
                        >
                            {panels[tab]}
                        </motion.div>
                    )}
                    <CommandExplainer
                        highlight={toasts.enabled ? highlight : null}
                        onClose={() => setHighlight(null)}
                        className="top-2 left-2 right-2 w-auto max-w-none"
                        action={
                            explainerTarget && tab !== explainerTarget
                                ? {
                                      label: `See ${TAB_LABELS[explainerTarget]}`,
                                      onClick: () => {
                                          changeTab(explainerTarget);
                                          setHighlight(null);
                                      },
                                  }
                                : null
                        }
                    />
                </main>

                {!keyboardOpen && (
                    <MobileNav tab={tab} onChange={changeTab} badges={badges} />
                )}

                {overlays}
            </div>
        );
    }

    return (
        <div className="h-screen w-screen flex flex-col bg-surface-0 text-white">
            {header}

            <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0 relative">
                {/* LEFT — Terminal */}
                <div className="border-r border-surface-3 min-h-0 flex flex-col">
                    {terminal}
                </div>

                {/* RIGHT — Visual workspace */}
                <div className="min-h-0 flex flex-col relative">
                    <Tabs
                        value={tab}
                        onValueChange={changeTab}
                        className="flex-1 flex flex-col min-h-0"
                    >
                        <div className="h-11 border-b border-surface-3 bg-surface-1/70 px-3 flex items-center justify-between flex-shrink-0 gap-2">
                            <TabsList
                                className="bg-surface-2 border border-surface-3 h-8 p-0.5"
                                data-testid="right-panel-tabs"
                            >
                                {[
                                    ["git", "Git Tree"],
                                    ["files", "Files"],
                                    ["editor", "Editor"],
                                    ["diff", "Diff"],
                                    ["remote", "Remote"],
                                ].map(([value, label]) => (
                                    <TabsTrigger
                                        key={value}
                                        value={value}
                                        className={TAB_TRIGGER_CLS}
                                        data-testid={`tab-${value}`}
                                    >
                                        {label}
                                    </TabsTrigger>
                                ))}
                            </TabsList>
                        </div>
                        {Object.entries(panels).map(([value, panel]) => (
                            <TabsContent
                                key={value}
                                value={value}
                                className="flex-1 m-0 min-h-0 relative"
                            >
                                {panel}
                            </TabsContent>
                        ))}
                    </Tabs>

                    <CommandExplainer
                        highlight={toasts.enabled ? highlight : null}
                        onClose={() => setHighlight(null)}
                    />
                </div>
            </main>

            <StatusBar state={state} repo={repo} branch={branch} />

            {overlays}
        </div>
    );
}
