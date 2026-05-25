import { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Terminal as TerminalIcon, ChevronRight } from "lucide-react";
import { executeCommand, tabComplete } from "../lib/commands";

// Render a single output line based on its kind
const Line = ({ line }) => {
    if (line.kind === "clear") return null;
    if (line.kind === "log-commit") {
        const c = line.commit;
        return (
            <div className="font-mono text-xs sm:text-sm leading-relaxed">
                <span className="text-yellow">commit {c.hash}</span>
                <span className="text-zinc-500"> ({c.branch})</span>
                <div className="text-zinc-400 pl-4">
                    Author: {c.author} · {new Date(c.date).toLocaleString()}
                </div>
                <div className="text-white pl-4">{c.message}</div>
            </div>
        );
    }
    if (line.kind === "ls") {
        return (
            <div className="font-mono text-sm flex flex-wrap gap-x-5 gap-y-1">
                {line.items.map((it) => (
                    <span
                        key={it.name}
                        className={
                            it.type === "dir"
                                ? "text-sky-400 font-semibold"
                                : "text-zinc-200"
                        }
                    >
                        {it.name}
                        {it.type === "dir" ? "/" : ""}
                    </span>
                ))}
            </div>
        );
    }
    let cls = "text-zinc-200";
    if (line.kind === "err") cls = "text-rose-400";
    if (line.kind === "muted") cls = "text-zinc-500";
    if (line.kind === "success") cls = "text-emerald-400";
    if (line.kind === "system") cls = "text-yellow";
    return (
        <div className={`font-mono text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${cls}`}>
            {line.text || "\u00A0"}
        </div>
    );
};

const Prompt = ({ cwd, branch }) => {
    const path = cwd.replace("/home/student", "~");
    return (
        <span className="font-mono text-sm select-none">
            <span className="text-emerald-400">student@gitnaadu</span>
            <span className="text-zinc-500">:</span>
            <span className="text-sky-400">{path}</span>
            {branch && (
                <span className="text-yellow"> ({branch})</span>
            )}
            <span className="text-zinc-500"> ❯&nbsp;</span>
        </span>
    );
};

export const Terminal = ({ state, setState, branch, onHighlight, onSound }) => {
    const [input, setInput] = useState("");
    const [historyIdx, setHistoryIdx] = useState(-1);
    const [draft, setDraft] = useState("");
    const containerRef = useRef(null);
    const inputRef = useRef(null);

    // Auto-scroll to bottom on new output
    useEffect(() => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    }, [state.lines]);

    // Focus input on mount + when clicking anywhere in terminal
    useEffect(() => {
        inputRef.current?.focus();
    }, []);

    const submit = () => {
        const raw = input;
        if (!raw.trim()) {
            // empty enter just adds new prompt line
            setState((prev) => ({
                ...prev,
                lines: [
                    ...prev.lines,
                    { kind: "prompt", cwd: prev.cwd, branch, text: "" },
                ],
            }));
            setInput("");
            onSound?.("enter");
            return;
        }
        const { state: nextState, output, highlight } = executeCommand(state, raw);
        if (highlight) onHighlight?.(highlight);

        const hasClear = output.some((l) => l.kind === "clear");
        const hasErr = output.some((l) => l.kind === "err");
        const linesToAdd = [
            { kind: "prompt", cwd: state.cwd, branch, text: raw },
            ...output.filter((l) => l.kind !== "clear"),
        ];
        setState(
            {
                ...nextState,
                history: [...nextState.history, raw],
                lines: hasClear ? [] : [...state.lines, ...linesToAdd],
                lastHighlight: highlight || nextState.lastHighlight,
                stats: {
                    ...nextState.stats,
                    commands: (nextState.stats?.commands || 0) + 1,
                    commits:
                        highlight?.kind === "git-commit"
                            ? (nextState.stats?.commits || 0) + 1
                            : nextState.stats?.commits || 0,
                    branches:
                        highlight?.kind === "git-branch"
                            ? (nextState.stats?.branches || 0) + 1
                            : nextState.stats?.branches || 0,
                },
            },
            { record: true },
        );
        // Sound feedback — onSound() handles routing highlight to sound kind
        if (hasErr) onSound?.({ kind: "error-line" });
        else onSound?.(highlight || { kind: "enter" });
        setInput("");
        setHistoryIdx(-1);
        setDraft("");
    };

    const onKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            submit();
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            if (state.history.length === 0) return;
            const nextIdx =
                historyIdx === -1 ? state.history.length - 1 : Math.max(0, historyIdx - 1);
            if (historyIdx === -1) setDraft(input);
            setHistoryIdx(nextIdx);
            setInput(state.history[nextIdx]);
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            if (historyIdx === -1) return;
            const nextIdx = historyIdx + 1;
            if (nextIdx >= state.history.length) {
                setHistoryIdx(-1);
                setInput(draft);
            } else {
                setHistoryIdx(nextIdx);
                setInput(state.history[nextIdx]);
            }
            return;
        }
        if (e.key === "Tab") {
            e.preventDefault();
            setInput(tabComplete(state, input));
            return;
        }
        if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            setState((prev) => ({ ...prev, lines: [] }));
            return;
        }
    };

    const renderLine = (l, idx) => {
        if (l.kind === "prompt") {
            return (
                <div key={idx} className="flex flex-wrap items-baseline">
                    <Prompt cwd={l.cwd} branch={l.branch} />
                    <span className="font-mono text-sm text-white pl-1">{l.text}</span>
                </div>
            );
        }
        return <Line key={idx} line={l} />;
    };

    return (
        <div
            className="flex flex-col h-full bg-surface-0 noise scanlines"
            onClick={() => inputRef.current?.focus()}
            data-testid="terminal-root"
        >
            <div className="h-11 px-4 flex items-center justify-between border-b border-surface-3 bg-surface-1/70 flex-shrink-0">
                <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-zinc-400 font-bold">
                    <TerminalIcon className="w-3.5 h-3.5 text-yellow" />
                    Terminal
                </div>
                <div className="flex items-center gap-1.5">
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                    <span className="w-2.5 h-2.5 rounded-full bg-zinc-700" />
                    <span className="w-2.5 h-2.5 rounded-full bg-yellow/80" />
                </div>
            </div>
            <div
                ref={containerRef}
                className="flex-1 overflow-y-auto px-4 md:px-6 py-4 space-y-1"
                data-testid="terminal-output"
            >
                {state.lines.map(renderLine)}
                <div className="flex flex-wrap items-baseline pt-1">
                    <Prompt cwd={state.cwd} branch={branch} />
                    <input
                        ref={inputRef}
                        value={input}
                        onChange={(e) => setInput(e.target.value)}
                        onKeyDown={onKeyDown}
                        spellCheck={false}
                        autoCorrect="off"
                        autoCapitalize="off"
                        className="flex-1 min-w-0 bg-transparent border-0 outline-none font-mono text-sm text-white caret-yellow placeholder:text-zinc-600 pl-1"
                        placeholder="try `ls`, `cd portfolio-website`, `git init`…"
                        data-testid="terminal-input"
                    />
                </div>
            </div>
        </div>
    );
};
