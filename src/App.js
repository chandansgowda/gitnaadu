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
import { ChallengePanel } from "./components/ChallengePanel";
import { findRepo, currentBranch } from "./lib/gitEngine";
import { Toaster } from "./components/ui/sonner";
import { toast } from "sonner";
import { AnimatePresence } from "framer-motion";

export default function App() {
    const [state, setState, stateRef, resetState, hist] = useGitNaadu();
    const sound = useSound();
    const [highlight, setHighlight] = useState(null);
    const [tab, setTab] = useState("git");
    const [welcomeOpen, setWelcomeOpen] = useState(false);
    const [editorPath, setEditorPath] = useState(null);
    const [selectedCommit, setSelectedCommit] = useState(null);
    const [challengesOpen, setChallengesOpen] = useState(false);
    const [challengeView, setChallengeView] = useState("list"); // "list" | "active"

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
            toast.success(`Step ${idx} done`, {
                description: challenge.steps[idx - 1]?.text,
                duration: 2200,
                position: "bottom-right",
            });
        },
        onComplete: (challenge) => {
            sound.play("success");
            toast.success(`Challenge complete: ${challenge.title}`, {
                description: challenge.outro,
                duration: 4500,
                position: "bottom-right",
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

    // Only mutate-the-tree commands should switch tab to "git".
    useEffect(() => {
        if (!highlight) return;
        const k = highlight.kind || "";
        if (k === "git-diff") {
            setTab("diff");
            return;
        }
        if (k === "git-push" || k === "git-fetch") {
            setTab("remote");
            return;
        }
        const showTreeKinds = new Set([
            "git-init",
            "git-commit",
            "git-amend",
            "git-branch",
            "git-checkout",
            "git-merge",
            "git-rebase",
            "git-reset",
            "git-revert",
            "git-cherry-pick",
            "git-tag",
            "git-clone",
        ]);
        if (showTreeKinds.has(k)) setTab("git");
    }, [highlight]);

    const handleReset = useCallback(() => {
        resetState();
        resetWelcomeFlag();
        setHighlight(null);
        setEditorPath(null);
        setSelectedCommit(null);
        setTab("git");
        sound.play("toggle");
        toast.success("Playground reset", {
            description: "All repos, files and history cleared.",
        });
    }, [resetState, sound]);

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

    return (
        <div className="h-screen w-screen flex flex-col bg-surface-0 text-white">
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
                onOpenChallenges={() => {
                    setChallengesOpen(true);
                    // If there's an active challenge, jump straight to it.
                    setChallengeView(challenges.active ? "active" : "list");
                    sound.play("toggle");
                }}
                challengesDone={Object.keys(challenges.completed || {}).length}
                challengesTotal={challenges.all.length}
            />

            <main className="flex-1 grid grid-cols-1 lg:grid-cols-2 min-h-0 relative">
                {/* LEFT — Terminal */}
                <div className="border-r border-surface-3 min-h-0 flex flex-col">
                    <Terminal
                        state={state}
                        setState={setState}
                        branch={branch}
                        onHighlight={setHighlight}
                        onSound={playForHighlight}
                    />
                </div>

                {/* RIGHT — Visual workspace */}
                <div className="min-h-0 flex flex-col relative">
                    <Tabs
                        value={tab}
                        onValueChange={(v) => {
                            setTab(v);
                            sound.play("toggle");
                        }}
                        className="flex-1 flex flex-col min-h-0"
                    >
                        <div className="h-11 border-b border-surface-3 bg-surface-1/70 px-3 flex items-center justify-between flex-shrink-0 gap-2">
                            <TabsList
                                className="bg-surface-2 border border-surface-3 h-8 p-0.5"
                                data-testid="right-panel-tabs"
                            >
                                <TabsTrigger
                                    value="git"
                                    className="h-7 px-2.5 data-[state=active]:bg-yellow data-[state=active]:text-black data-[state=active]:shadow-none text-[11px] uppercase tracking-wider font-bold"
                                    data-testid="tab-git"
                                >
                                    Git Tree
                                </TabsTrigger>
                                <TabsTrigger
                                    value="files"
                                    className="h-7 px-2.5 data-[state=active]:bg-yellow data-[state=active]:text-black data-[state=active]:shadow-none text-[11px] uppercase tracking-wider font-bold"
                                    data-testid="tab-files"
                                >
                                    Files
                                </TabsTrigger>
                                <TabsTrigger
                                    value="editor"
                                    className="h-7 px-2.5 data-[state=active]:bg-yellow data-[state=active]:text-black data-[state=active]:shadow-none text-[11px] uppercase tracking-wider font-bold"
                                    data-testid="tab-editor"
                                >
                                    Editor
                                </TabsTrigger>
                                <TabsTrigger
                                    value="diff"
                                    className="h-7 px-2.5 data-[state=active]:bg-yellow data-[state=active]:text-black data-[state=active]:shadow-none text-[11px] uppercase tracking-wider font-bold"
                                    data-testid="tab-diff"
                                >
                                    Diff
                                </TabsTrigger>
                                <TabsTrigger
                                    value="remote"
                                    className="h-7 px-2.5 data-[state=active]:bg-yellow data-[state=active]:text-black data-[state=active]:shadow-none text-[11px] uppercase tracking-wider font-bold"
                                    data-testid="tab-remote"
                                >
                                    Remote
                                </TabsTrigger>
                            </TabsList>
                        </div>
                        <TabsContent
                            value="git"
                            className="flex-1 m-0 min-h-0 relative"
                        >
                            <GitTree
                                state={state}
                                onSelectCommit={onSelectCommit}
                            />
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
                        </TabsContent>
                        <TabsContent
                            value="files"
                            className="flex-1 m-0 min-h-0"
                        >
                            <FileTree
                                state={state}
                                repoPath={repo?.path}
                                onOpenFile={openFile}
                            />
                        </TabsContent>
                        <TabsContent
                            value="editor"
                            className="flex-1 m-0 min-h-0"
                        >
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
                        </TabsContent>
                        <TabsContent
                            value="diff"
                            className="flex-1 m-0 min-h-0"
                        >
                            <DiffView state={state} />
                        </TabsContent>
                        <TabsContent
                            value="remote"
                            className="flex-1 m-0 min-h-0"
                        >
                            <RemotePanel state={state} setState={setState} />
                        </TabsContent>
                    </Tabs>

                    <CommandExplainer
                        highlight={highlight}
                        onClose={() => setHighlight(null)}
                    />
                </div>
            </main>

            <StatusBar state={state} repo={repo} branch={branch} />

            <WelcomeOverlay
                open={welcomeOpen}
                onOpenChange={setWelcomeOpen}
            />
            <ChallengePanel
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
                position="top-right"
                theme="dark"
                toastOptions={{
                    style: {
                        background: "#1C1C1F",
                        border: "1px solid #27272A",
                        color: "#fafafa",
                    },
                }}
            />
        </div>
    );
}
