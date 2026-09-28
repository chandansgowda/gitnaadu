import { useEffect, useState, useMemo, useRef } from "react";
import { motion } from "framer-motion";
import { Save, FileText, Undo2, AlertCircle, CheckCircle2, X } from "lucide-react";
import { Button } from "./ui/button";
import { getNode, writeFile } from "../lib/filesystem";
import { findRepo, indexedFiles } from "../lib/gitEngine";

// Inline plain-text editor backed by VFS.
// Props: state, setState, path (absolute), onClose
export const Editor = ({ state, setState, path, onClose, onSaved }) => {
    const node = path ? getNode(state.fs, path) : null;
    const repo = useMemo(
        () => (path ? findRepo(state.repos, path) : null),
        [state.repos, path],
    );

    const fileInRepoIndex = useMemo(() => {
        if (!repo) return null;
        if (!path) return null;
        const rel = path.startsWith(repo.path + "/")
            ? path.slice(repo.path.length + 1)
            : path === repo.path
              ? "."
              : null;
        if (!rel) return null;
        const idx = indexedFiles(repo);
        return { rel, indexedContent: idx[rel], tracked: repo.tracked?.[rel] };
    }, [repo, path]);

    const [draft, setDraft] = useState(node?.content || "");
    const [savedAt, setSavedAt] = useState(null);
    const gutterRef = useRef(null);

    useEffect(() => {
        setDraft(node?.content || "");
    }, [path, node?.content]);

    useEffect(() => setSavedAt(null), [path]);

    if (!path) {
        return (
            <div className="h-full w-full flex items-center justify-center text-center px-8">
                <div className="max-w-md">
                    <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-surface-2 border border-surface-3 mb-5">
                        <FileText className="w-8 h-8 text-yellow" />
                    </div>
                    <h2 className="font-black text-2xl md:text-3xl tracking-tight text-white">
                        No file open
                    </h2>
                    <p className="text-zinc-400 mt-3 text-sm leading-relaxed">
                        Switch to the <span className="text-yellow font-semibold">Files</span> tab and click any file to open it here. Edit, save, then run{" "}
                        <code className="font-mono px-1.5 py-0.5 rounded bg-surface-2 text-yellow">
                            git status
                        </code>{" "}
                        or open the{" "}
                        <span className="text-yellow font-semibold">Diff</span>{" "}
                        tab to see what changed.
                    </p>
                </div>
            </div>
        );
    }

    if (!node || node.type !== "file") {
        return (
            <div className="h-full w-full flex items-center justify-center text-center text-zinc-400 text-sm">
                {node?.type === "dir" ? "Cannot open a directory." : "File not found."}
            </div>
        );
    }

    const dirty = draft !== node.content;
    const modifiedVsIndex =
        fileInRepoIndex && fileInRepoIndex.indexedContent !== undefined
            ? draft !== fileInRepoIndex.indexedContent
            : false;
    const isUntracked = fileInRepoIndex && fileInRepoIndex.indexedContent === undefined;

    const save = () => {
        // Write against the current state up front: the updater passed to
        // setState runs later, so a flag set inside it can't be read here.
        const newFs = JSON.parse(JSON.stringify(state.fs));
        if (writeFile(newFs, path, draft).error) return;
        setState((prev) => ({ ...prev, fs: newFs }), { record: true });
        setSavedAt(new Date());
        onSaved?.();
    };

    const revert = () => {
        setDraft(node.content);
    };

    return (
        <div className="h-full flex flex-col bg-surface-0" data-testid="editor-pane">
            <div className="sticky top-0 z-10 bg-surface-1/40 border-b border-surface-3/60 px-3 py-1.5 flex items-center justify-between">
                <div className="flex items-center gap-2 min-w-0">
                    <FileText className="w-3.5 h-3.5 text-yellow flex-shrink-0" />
                    <span
                        className="font-mono text-[12px] text-zinc-200 truncate"
                        title={path}
                        data-testid="editor-file-path"
                    >
                        <span className="hidden sm:inline">{path}</span>
                        <span className="sm:hidden">{path.split("/").pop()}</span>
                    </span>
                    {dirty && (
                        <span className="px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-sm bg-yellow/15 text-yellow border border-yellow/30">
                            unsaved
                        </span>
                    )}
                    {!dirty && modifiedVsIndex && (
                        <span className="px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-sm bg-sky-500/15 text-sky-400 border border-sky-500/30">
                            modified
                        </span>
                    )}
                    {!dirty && isUntracked && repo && (
                        <span className="px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-sm bg-rose-500/15 text-rose-400 border border-rose-500/30">
                            untracked
                        </span>
                    )}
                </div>
                <div className="flex items-center gap-1 sm:gap-2 flex-shrink-0">
                    {savedAt && !dirty && (
                        <span className="flex items-center gap-1 text-[11px] text-emerald-400">
                            <CheckCircle2 className="w-3 h-3" />
                            <span className="hidden sm:inline">saved</span>
                        </span>
                    )}
                    <Button
                        size="sm"
                        variant="ghost"
                        onClick={revert}
                        disabled={!dirty}
                        className="h-7 text-zinc-300 hover:text-white hover:bg-surface-2"
                        data-testid="editor-revert-btn"
                    >
                        <Undo2 className="w-3.5 h-3.5 sm:mr-1.5" />
                        <span className="hidden sm:inline">Revert</span>
                    </Button>
                    <Button
                        size="sm"
                        onClick={save}
                        disabled={!dirty}
                        className="h-7 bg-yellow text-black hover:bg-yellow/90 disabled:bg-surface-2 disabled:text-zinc-500 font-semibold"
                        data-testid="editor-save-btn"
                    >
                        <Save className="w-3.5 h-3.5 mr-1.5" />
                        Save
                    </Button>
                    {onClose && (
                        <Button
                            size="sm"
                            variant="ghost"
                            onClick={onClose}
                            className="h-7 text-zinc-400 hover:text-white"
                            data-testid="editor-close-btn"
                        >
                            <X className="w-3.5 h-3.5" />
                        </Button>
                    )}
                </div>
            </div>
            <div className="flex-1 flex min-h-0">
                <div
                    ref={gutterRef}
                    // Extra bottom padding matches the textarea's horizontal
                    // scrollbar so both can scroll the same distance.
                    className="select-none text-right pr-3 pt-3 pb-8 text-[11px] font-mono text-zinc-600 bg-surface-1/40 border-r border-surface-3 leading-[20px] overflow-hidden flex-shrink-0"
                    style={{ width: 44 }}
                    aria-hidden
                >
                    {draft.split("\n").map((_, i) => (
                        <div key={i}>{i + 1}</div>
                    ))}
                </div>
                <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                        if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
                            e.preventDefault();
                            if (dirty) save();
                        }
                    }}
                    // Keep the line-number gutter aligned with the text.
                    onScroll={(e) => {
                        if (gutterRef.current)
                            gutterRef.current.scrollTop = e.target.scrollTop;
                    }}
                    wrap="off"
                    spellCheck={false}
                    autoCapitalize="off"
                    autoCorrect="off"
                    className="flex-1 min-w-0 bg-transparent text-zinc-100 font-mono text-base sm:text-sm leading-[20px] p-3 outline-none resize-none caret-yellow whitespace-pre overflow-auto"
                    data-testid="editor-textarea"
                    placeholder="// empty file — start typing"
                />
            </div>
            {repo && (
                <div className="border-t border-surface-3 bg-surface-1/60 px-4 py-1.5 text-[11px] font-mono text-zinc-500 flex items-center justify-between gap-3">
                    <span className="truncate">
                        repo: <span className="text-yellow">{repo.path}</span>
                    </span>
                    <span className="hidden xl:flex items-center gap-1 whitespace-nowrap">
                        <AlertCircle className="w-3 h-3" />
                        Ctrl/⌘+S to save · Save then `git add .` to stage
                    </span>
                </div>
            )}
        </div>
    );
};
