import { useEffect, useRef, useState, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    Terminal as TerminalIcon,
    ChevronRight,
    ChevronUp,
    ChevronDown,
    CornerDownLeft,
} from "lucide-react";
import { executeCommand, tabComplete } from "../lib/commands";
import { isTouchDevice } from "../hooks/useViewport";

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
            <div className="font-mono text-xs sm:text-sm flex flex-wrap gap-x-5 gap-y-1">
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
    if (line.kind === "err" || line.kind === "del") cls = "text-rose-400";
    if (line.kind === "muted") cls = "text-zinc-500";
    if (line.kind === "success") cls = "text-emerald-400";
    if (line.kind === "system") cls = "text-yellow";
    return (
        <div className={`font-mono text-xs sm:text-sm leading-relaxed whitespace-pre-wrap ${cls}`}>
            {line.text || "\u00A0"}
        </div>
    );
};

const Prompt = ({ cwd, branch, compact }) => {
    const path = cwd.replace("/home/student", "~");
    return (
        <span className="font-mono text-xs sm:text-sm select-none">
            {!compact && (
                <>
                    <span className="text-emerald-400">student@gitnaadu</span>
                    <span className="text-zinc-500">:</span>
                </>
            )}
            <span className="text-sky-400">{path}</span>
            {branch && (
                <span className="text-yellow"> ({branch})</span>
            )}
            <span className="text-zinc-500"> ❯&nbsp;</span>
        </span>
    );
};

export const Terminal = ({
    state,
    setState,
    branch,
    onHighlight,
    onSound,
    isMobile = false,
}) => {
    const [input, setInput] = useState("");
    const [historyIdx, setHistoryIdx] = useState(-1);
    const [draft, setDraft] = useState("");
    const containerRef = useRef(null);
    const inputRef = useRef(null);

    const scrollToBottom = () => {
        if (containerRef.current) {
            containerRef.current.scrollTop = containerRef.current.scrollHeight;
        }
    };

    // Auto-scroll to bottom on new output
    useEffect(scrollToBottom, [state.lines]);

    // Keep the latest output in view when the pane shrinks (e.g. the
    // on-screen keyboard opening) or is re-shown after being hidden.
    useEffect(() => {
        const el = containerRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(scrollToBottom);
        ro.observe(el);
        return () => ro.disconnect();
    }, []);

    // Focus input on mount + when clicking anywhere in terminal. On touch
    // devices focusing pops the on-screen keyboard, so wait for a tap.
    useEffect(() => {
        if (!isTouchDevice()) inputRef.current?.focus();
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

        // `clear` wipes the screen, but output printed after it in the same
        // `a && b` chain (e.g. `clear && ls`) should still show.
        const lastClear = output.map((l) => l.kind).lastIndexOf("clear");
        const hasClear = lastClear !== -1;
        const hasErr = output.some((l) => l.kind === "err");
        const linesToAdd = hasClear
            ? output.slice(lastClear + 1)
            : [{ kind: "prompt", cwd: state.cwd, branch, text: raw }, ...output];
        setState(
            {
                ...nextState,
                history: [...nextState.history, raw],
                lines: hasClear ? linesToAdd : [...state.lines, ...linesToAdd],
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

    const historyPrev = () => {
        if (state.history.length === 0) return;
        const nextIdx =
            historyIdx === -1 ? state.history.length - 1 : Math.max(0, historyIdx - 1);
        if (historyIdx === -1) setDraft(input);
        setHistoryIdx(nextIdx);
        setInput(state.history[nextIdx]);
    };

    const historyNext = () => {
        if (historyIdx === -1) return;
        const nextIdx = historyIdx + 1;
        if (nextIdx >= state.history.length) {
            setHistoryIdx(-1);
            setInput(draft);
        } else {
            setHistoryIdx(nextIdx);
            setInput(state.history[nextIdx]);
        }
    };

    const complete = () => setInput(tabComplete(state, input));

    const onKeyDown = (e) => {
        if (e.key === "Enter") {
            e.preventDefault();
            submit();
            return;
        }
        if (e.key === "ArrowUp") {
            e.preventDefault();
            historyPrev();
            return;
        }
        if (e.key === "ArrowDown") {
            e.preventDefault();
            historyNext();
            return;
        }
        if (e.key === "Tab") {
            e.preventDefault();
            complete();
            return;
        }
        if (e.key === "l" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            setState((prev) => ({ ...prev, lines: [] }));
            return;
        }
    };

    // Buttons in the docked bar must not steal focus from the input, or the
    // on-screen keyboard would close on every tap.
    const keepFocus = (e) => e.preventDefault();

    const renderLine = (l, idx) => {
        if (l.kind === "prompt") {
            return (
                <div key={idx} className="flex flex-wrap items-baseline">
                    <Prompt cwd={l.cwd} branch={l.branch} compact={isMobile} />
                    <span className="font-mono text-xs sm:text-sm text-white pl-1 break-all">{l.text}</span>
                </div>
            );
        }
        return <Line key={idx} line={l} />;
    };

    const inputEl = (
        <input
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={onKeyDown}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="off"
            autoComplete="off"
            enterKeyHint="send"
            className={
                "flex-1 min-w-0 bg-transparent border-0 outline-none font-mono text-white caret-yellow placeholder:text-zinc-600 " +
                // 16px on phones stops iOS from zooming into the input.
                (isMobile ? "text-base" : "text-sm pl-1")
            }
            placeholder={
                isMobile
                    ? "type a command…"
                    : "try `ls`, `cd portfolio-website`, `git init`…"
            }
            aria-label="Terminal command"
            data-testid="terminal-input"
        />
    );

    return (
        <div
            className="flex flex-col h-full bg-surface-0 noise scanlines"
            onClick={() => {
                // Don't yank focus (and the keyboard) while selecting text.
                if (window.getSelection()?.toString()) return;
                inputRef.current?.focus();
            }}
            data-testid="terminal-root"
        >
            {!isMobile && (
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
            )}
            <div
                ref={containerRef}
                className="flex-1 overflow-y-auto overscroll-contain px-3 sm:px-4 md:px-6 py-3 sm:py-4 space-y-1"
                data-testid="terminal-output"
            >
                {state.lines.map(renderLine)}
                {!isMobile && (
                    <div className="flex flex-wrap items-baseline pt-1">
                        <Prompt cwd={state.cwd} branch={branch} />
                        {inputEl}
                    </div>
                )}
            </div>
            {isMobile && (
                <div
                    className="relative z-10 flex-shrink-0 border-t border-surface-3 bg-surface-1/95 backdrop-blur-md"
                    data-testid="terminal-dock"
                >
                    <div className="flex items-center gap-1.5 px-3 py-2">
                        <div className="flex-1 min-w-0 flex items-center gap-2 h-11 px-3 rounded-xl bg-surface-0 border border-surface-3 focus-within:border-yellow/60">
                            <span className="font-mono text-sm text-yellow select-none">❯</span>
                            {inputEl}
                        </div>
                        {[
                            { icon: ChevronUp, label: "Previous command", run: historyPrev },
                            { icon: ChevronDown, label: "Next command", run: historyNext },
                        ].map((k) => (
                            <button
                                key={k.label}
                                type="button"
                                onMouseDown={keepFocus}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    k.run();
                                }}
                                className="w-9 h-11 flex-shrink-0 flex items-center justify-center rounded-lg bg-surface-2 border border-surface-3 text-zinc-300 active:bg-surface-3"
                                aria-label={k.label}
                            >
                                <k.icon className="w-4 h-4" />
                            </button>
                        ))}
                        <button
                            type="button"
                            onMouseDown={keepFocus}
                            onClick={(e) => {
                                e.stopPropagation();
                                submit();
                            }}
                            className="w-11 h-11 flex-shrink-0 flex items-center justify-center rounded-xl bg-yellow text-black active:bg-yellow/80"
                            aria-label="Run command"
                            data-testid="terminal-run-btn"
                        >
                            <CornerDownLeft className="w-5 h-5" strokeWidth={2.5} />
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};
