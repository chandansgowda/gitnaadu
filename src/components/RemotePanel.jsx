import { useMemo, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Cloud,
    CloudOff,
    GitBranch,
    GitCommit,
    FileText,
    Plus,
    Trash2,
    Send,
    User,
    ArrowDown,
    ArrowUp,
    Sparkles,
} from "lucide-react";
import { Button } from "./ui/button";
import { Input } from "./ui/input";
import {
    findRepo,
    remoteFilesAt,
    remoteCommit,
    remoteLog,
    remoteAheadBehind,
    currentBranch,
} from "../lib/gitEngine";

// Lightweight Input shim — radix Input may not exist; fallback to native input.
// Using shadcn input directly:
// (already imported above)

const cardBase =
    "border border-surface-3 bg-surface-1 rounded-md overflow-hidden";

export const RemotePanel = ({ state, setState }) => {
    const repo = useMemo(
        () => findRepo(state.repos, state.cwd),
        [state.repos, state.cwd],
    );

    const [selectedBranch, setSelectedBranch] = useState(null);
    const [selectedFile, setSelectedFile] = useState(null);
    const [draft, setDraft] = useState("");
    const [newPath, setNewPath] = useState("");
    const [commitMessage, setCommitMessage] = useState("");
    const [savedAt, setSavedAt] = useState(null);

    const remoteBranches = useMemo(
        () => (repo ? Object.entries(repo.remote?.branches || {}) : []),
        [repo, state],
    );

    // Auto-select branch
    useEffect(() => {
        if (!repo) return;
        if (selectedBranch && repo.remote.branches[selectedBranch]) return;
        if (remoteBranches.length > 0) {
            setSelectedBranch(remoteBranches[0][0]);
        } else {
            setSelectedBranch(null);
        }
    }, [repo, remoteBranches, selectedBranch]);

    const files = useMemo(() => {
        if (!repo || !selectedBranch) return {};
        return remoteFilesAt(repo, selectedBranch);
    }, [repo, selectedBranch, state]);

    // Auto-select file (skip when user is creating a new file)
    useEffect(() => {
        if (newPath) return;
        const names = Object.keys(files);
        if (selectedFile && names.includes(selectedFile)) {
            setDraft(files[selectedFile] || "");
            return;
        }
        if (names.length > 0) {
            setSelectedFile(names[0]);
            setDraft(files[names[0]] || "");
        } else {
            setSelectedFile(null);
            setDraft("");
        }
    }, [files, selectedFile, newPath]);

    const log = useMemo(() => {
        if (!repo || !selectedBranch) return [];
        return remoteLog(repo, selectedBranch).slice(0, 12);
    }, [repo, selectedBranch, state]);

    const ab = useMemo(() => {
        if (!repo) return null;
        const branch = currentBranch(repo) || selectedBranch;
        if (!branch) return null;
        return { branch, ...remoteAheadBehind(repo, branch) };
    }, [repo, selectedBranch, state]);

    if (!repo) {
        return (
            <div className="h-full flex items-center justify-center text-center px-8">
                <div className="max-w-md">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-surface-2 border border-surface-3 mb-5">
                        <CloudOff className="w-8 h-8 text-yellow" />
                    </div>
                    <h2 className="font-black text-2xl md:text-3xl tracking-tight text-white">
                        No repository here
                    </h2>
                    <p className="text-zinc-400 mt-3 text-sm leading-relaxed">
                        Initialise a repo and run{" "}
                        <code className="font-mono px-1.5 py-0.5 rounded bg-surface-2 text-yellow">
                            git push
                        </code>{" "}
                        to start using the simulated remote.
                    </p>
                </div>
            </div>
        );
    }

    if (remoteBranches.length === 0) {
        return (
            <div className="h-full flex items-center justify-center text-center px-8">
                <div className="max-w-md">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-surface-2 border border-surface-3 mb-5">
                        <Cloud className="w-8 h-8 text-yellow" />
                    </div>
                    <h2 className="font-black text-2xl md:text-3xl tracking-tight text-white">
                        Nothing on origin yet
                    </h2>
                    <p className="text-zinc-400 mt-3 text-sm leading-relaxed">
                        Run{" "}
                        <code className="font-mono px-1.5 py-0.5 rounded bg-surface-2 text-yellow">
                            git push -u origin {currentBranch(repo) || "main"}
                        </code>{" "}
                        in the terminal to publish your local branch.
                    </p>
                </div>
            </div>
        );
    }

    const commitToRemote = () => {
        const targetPath = newPath.trim() || selectedFile;
        if (!targetPath || !commitMessage.trim()) return;
        const branchName = selectedBranch;
        const msgText = commitMessage;
        const fileContent = draft;
        const cloned = JSON.parse(JSON.stringify(repo));
        const r = remoteCommit(
            cloned,
            branchName,
            { [targetPath]: fileContent },
            msgText,
        );
        if (r.error) return;
        setState(
            (prev) => ({
                ...prev,
                repos: { ...prev.repos, [cloned.path]: cloned },
            }),
            { record: true },
        );
        setCommitMessage("");
        setSavedAt(new Date());
        if (newPath.trim()) {
            setSelectedFile(newPath.trim());
            setNewPath("");
        }
    };

    const deleteFileOnRemote = (path) => {
        if (!selectedBranch) return;
        const msg = `Delete ${path}`;
        const branchName = selectedBranch;
        setState(
            (prev) => {
                const prevRepo = Object.values(prev.repos).find(
                    (r) => r.path === repo.path,
                );
                if (!prevRepo) return prev;
                const cloned = JSON.parse(JSON.stringify(prevRepo));
                const r = remoteCommit(cloned, branchName, { [path]: null }, msg);
                if (r.error) return prev;
                return {
                    ...prev,
                    repos: { ...prev.repos, [cloned.path]: cloned },
                };
            },
            { record: true },
        );
        if (selectedFile === path) setSelectedFile(null);
    };

    const dirty = (() => {
        const targetPath = newPath.trim() || selectedFile;
        if (!targetPath) return false;
        const existing = files[targetPath];
        if (existing === undefined) return draft.length > 0; // brand new file
        return draft !== existing;
    })();

    return (
        <div className="h-full flex flex-col bg-surface-0" data-testid="remote-panel">
            {/* Header */}
            <div className="sticky top-0 z-10 bg-surface-1/40 border-b border-surface-3/60 px-4 py-1.5 flex items-center justify-between gap-3 flex-wrap">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
                    <Cloud className="w-3 h-3 text-yellow" />
                    Origin
                </div>
                {ab && ab.hasRemote && ab.hasLocal && (
                    <div
                        className="flex items-center gap-2 text-[11px] font-mono"
                        data-testid="ahead-behind"
                    >
                        <span className="text-zinc-500">{ab.branch}:</span>
                        <span
                            className={
                                ab.ahead > 0
                                    ? "text-emerald-400 flex items-center"
                                    : "text-zinc-500 flex items-center"
                            }
                        >
                            <ArrowUp className="w-3 h-3" />
                            {ab.ahead}
                        </span>
                        <span
                            className={
                                ab.behind > 0
                                    ? "text-rose-400 flex items-center"
                                    : "text-zinc-500 flex items-center"
                            }
                        >
                            <ArrowDown className="w-3 h-3" />
                            {ab.behind}
                        </span>
                    </div>
                )}
            </div>

            {/* Branch tabs */}
            <div className="flex gap-1 px-3 py-2 border-b border-surface-3 bg-surface-1/40 flex-wrap">
                {remoteBranches.map(([name]) => (
                    <button
                        key={name}
                        onClick={() => {
                            setSelectedBranch(name);
                            setSelectedFile(null);
                        }}
                        className={
                            "px-2.5 py-1 rounded-sm font-mono text-[11px] border transition-colors " +
                            (selectedBranch === name
                                ? "bg-yellow text-black border-yellow font-semibold"
                                : "bg-surface-2 text-zinc-300 border-surface-3 hover:bg-surface-3")
                        }
                        data-testid={"remote-branch-" + name}
                    >
                        <GitBranch className="inline w-3 h-3 mr-1 -mt-0.5" />
                        {name}
                    </button>
                ))}
            </div>

            {/* Body: 3-column-ish layout: log | files | editor */}
            <div className="flex-1 grid grid-cols-1 md:grid-cols-[180px_180px_1fr] min-h-0">
                {/* Log */}
                <div className="border-r border-surface-3 overflow-auto bg-surface-1/30">
                    <div className="px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold flex items-center gap-1.5">
                        <GitCommit className="w-3 h-3" />
                        Commits
                    </div>
                    {log.length === 0 && (
                        <div className="px-3 py-2 text-zinc-500 text-xs">
                            (no commits)
                        </div>
                    )}
                    {log.map((c) => (
                        <div
                            key={c.hash}
                            className="px-3 py-1.5 border-l-2 border-transparent hover:border-yellow/50 hover:bg-surface-2 transition-colors font-mono text-[11px]"
                            data-testid={"remote-commit-" + c.hash}
                        >
                            <div className="flex items-center gap-1.5 text-yellow">
                                <span>{c.hash}</span>
                                {c.author === "origin" ? (
                                    <span className="text-[9px] text-rose-400 uppercase font-bold">
                                        remote
                                    </span>
                                ) : (
                                    <User className="w-2.5 h-2.5 text-zinc-500" />
                                )}
                            </div>
                            <div className="text-zinc-300 truncate" title={c.message}>
                                {c.message}
                            </div>
                            <div className="text-zinc-600 text-[10px]">
                                {new Date(c.date).toLocaleTimeString()}
                            </div>
                        </div>
                    ))}
                </div>

                {/* File list */}
                <div className="border-r border-surface-3 overflow-auto bg-surface-1/20">
                    <div className="px-3 py-2 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold flex items-center gap-1.5">
                        <FileText className="w-3 h-3" />
                        Files @ tip
                    </div>
                    {Object.keys(files).length === 0 ? (
                        <div className="px-3 py-2 text-zinc-500 text-xs">
                            (no files)
                        </div>
                    ) : (
                        Object.keys(files)
                            .sort()
                            .map((p) => (
                                <div
                                    key={p}
                                    onClick={() => {
                                        setSelectedFile(p);
                                        setDraft(files[p] || "");
                                        setNewPath("");
                                    }}
                                    className={
                                        "group px-3 py-1.5 cursor-pointer transition-colors font-mono text-[12px] flex items-center justify-between " +
                                        (selectedFile === p
                                            ? "bg-yellow/10 text-yellow"
                                            : "text-zinc-300 hover:bg-surface-2")
                                    }
                                    data-testid={"remote-file-" + p}
                                >
                                    <span className="truncate flex-1">{p}</span>
                                    <button
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            deleteFileOnRemote(p);
                                        }}
                                        className="opacity-0 group-hover:opacity-100 text-zinc-500 hover:text-rose-400 transition-opacity"
                                        aria-label={"Delete " + p}
                                        title={"Delete " + p}
                                    >
                                        <Trash2 className="w-3 h-3" />
                                    </button>
                                </div>
                            ))
                    )}
                    <div className="px-3 py-2 border-t border-surface-3 mt-2">
                        <div className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold flex items-center gap-1.5 mb-1.5">
                            <Plus className="w-3 h-3" />
                            New file
                        </div>
                        <Input
                            value={newPath}
                            onChange={(e) => {
                                setNewPath(e.target.value);
                                if (e.target.value) {
                                    setSelectedFile(null);
                                    setDraft("");
                                }
                            }}
                            placeholder="path/to/file.txt"
                            className="h-7 bg-surface-2 border-surface-3 text-zinc-200 text-xs font-mono"
                            data-testid="remote-new-path"
                        />
                    </div>
                </div>

                {/* Editor */}
                <div className="flex flex-col min-h-0">
                    <div className="px-3 py-2 border-b border-surface-3 bg-surface-1/40 flex items-center justify-between flex-wrap gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                            <FileText className="w-3.5 h-3.5 text-yellow flex-shrink-0" />
                            <span className="font-mono text-sm text-white truncate">
                                {selectedFile || newPath || "(no file)"}
                            </span>
                            {dirty && (
                                <span className="px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-sm bg-yellow/15 text-yellow border border-yellow/30">
                                    pending
                                </span>
                            )}
                        </div>
                        <span className="text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
                            Editing on origin/{selectedBranch}
                        </span>
                    </div>
                    <textarea
                        value={draft}
                        onChange={(e) => setDraft(e.target.value)}
                        placeholder="// edit a file or create a new one, then commit to remote below"
                        spellCheck={false}
                        className="flex-1 bg-transparent text-zinc-100 font-mono text-sm leading-[20px] p-3 outline-none resize-none caret-yellow min-h-[140px]"
                        data-testid="remote-editor-textarea"
                    />
                    <div className="border-t border-surface-3 bg-surface-1/40 p-3 flex items-center gap-2 flex-wrap">
                        <Input
                            value={commitMessage}
                            onChange={(e) => setCommitMessage(e.target.value)}
                            placeholder="commit message — simulate another developer"
                            className="flex-1 h-8 bg-surface-2 border-surface-3 text-zinc-200 text-xs font-mono"
                            data-testid="remote-commit-message"
                            onKeyDown={(e) => {
                                if (e.key === "Enter" && commitMessage.trim() && (selectedFile || newPath))
                                    commitToRemote();
                            }}
                        />
                        <Button
                            onClick={commitToRemote}
                            disabled={
                                !commitMessage.trim() ||
                                (!selectedFile && !newPath.trim()) ||
                                !dirty
                            }
                            className="h-8 bg-yellow text-black hover:bg-yellow/90 disabled:bg-surface-2 disabled:text-zinc-500 font-semibold"
                            data-testid="remote-commit-btn"
                        >
                            <Send className="w-3.5 h-3.5 mr-1.5" />
                            Commit to remote
                        </Button>
                    </div>
                    <AnimatePresence>
                        {savedAt && (
                            <motion.div
                                key={savedAt.getTime()}
                                initial={{ opacity: 0, y: 6 }}
                                animate={{ opacity: 1, y: 0 }}
                                exit={{ opacity: 0 }}
                                transition={{ duration: 0.2 }}
                                onAnimationComplete={() => {
                                    // auto-hide after a moment
                                    setTimeout(() => setSavedAt(null), 1800);
                                }}
                                className="px-3 py-2 text-[11px] text-emerald-400 font-mono border-t border-surface-3 bg-emerald-500/[0.06] flex items-center gap-2"
                            >
                                <Sparkles className="w-3 h-3" />
                                Pushed to origin · run{" "}
                                <code className="px-1 py-0.5 rounded bg-surface-2 text-yellow">
                                    git fetch
                                </code>{" "}
                                or{" "}
                                <code className="px-1 py-0.5 rounded bg-surface-2 text-yellow">
                                    git pull
                                </code>{" "}
                                to bring it locally
                            </motion.div>
                        )}
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};
