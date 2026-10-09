import { useEffect, useRef, useState, useCallback } from "react";
import { toast } from "sonner";
import { buildInitialFS, HOME, WELCOME_LINES } from "../lib/initialState";
import { ensureRepoShape } from "../lib/gitEngine";

const STORAGE_KEY = "gitnaadu:v1";
const MAX_HISTORY = 60; // undo / redo checkpoints
const MAX_LINES = 1000; // terminal scrollback kept in state
const MAX_COMMANDS = 500; // ↑ / ↓ command history

const cloneInitial = () => ({
    fs: buildInitialFS(),
    cwd: HOME,
    repos: {},
    history: [],
    lines: WELCOME_LINES,
    lastHighlight: null,
    stats: { commands: 0, commits: 0, branches: 0 },
    challenges: { activeId: null, stepIndex: 0, progress: {}, completed: {} },
});

const reviveState = (raw) => {
    try {
        const parsed = JSON.parse(raw);
        if (!parsed || !parsed.fs) return null;
        // Backwards-compat: older saves lack newer fields.
        if (!parsed.challenges) {
            parsed.challenges = { activeId: null, stepIndex: 0, progress: {}, completed: {} };
        } else if (!parsed.challenges.progress) {
            parsed.challenges.progress = {};
        }
        parsed.repos = parsed.repos || {};
        for (const repo of Object.values(parsed.repos)) ensureRepoShape(repo);
        parsed.lines = Array.isArray(parsed.lines) ? parsed.lines : [];
        // Older saves carry the previous banner text; swap in the current one.
        parsed.lines = parsed.lines.map((l) =>
            l.kind === "system" && l.text === "GitNaadu Terminal v1.0  ·  Engineering in Kannada"
                ? WELCOME_LINES[0]
                : l,
        );
        parsed.history = Array.isArray(parsed.history) ? parsed.history : [];
        return parsed;
    } catch {
        return null;
    }
};

// Keep persisted/in-memory state bounded no matter how long a session runs.
const trim = (s) => {
    if (s.lines.length <= MAX_LINES && s.history.length <= MAX_COMMANDS) return s;
    return {
        ...s,
        lines: s.lines.slice(-MAX_LINES),
        history: s.history.slice(-MAX_COMMANDS),
    };
};

// Save, dropping terminal scrollback if the full state doesn't fit.
// Returns false when even that fails (storage full or disabled).
const persist = (state) => {
    try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
        return true;
    } catch {
        try {
            window.localStorage.setItem(STORAGE_KEY, JSON.stringify({ ...state, lines: [] }));
            return true;
        } catch {
            return false;
        }
    }
};

// State is treated as immutable: every update builds new objects (commands
// work on a copy, see `cloneWorld` in commands.js), so undo / redo can keep
// plain references instead of deep copies.
export const useGitNaadu = () => {
    const [state, setStateRaw] = useState(() => {
        if (typeof window === "undefined") return cloneInitial();
        const raw = window.localStorage.getItem(STORAGE_KEY);
        return reviveState(raw) || cloneInitial();
    });

    const stateRef = useRef(state);
    stateRef.current = state;

    const past = useRef([]);
    const future = useRef([]);
    const [versions, setVersions] = useState(0); // bumps to notify undo/redo button enable/disable
    const warnedRef = useRef(false);

    // Persist (debounced)
    useEffect(() => {
        const id = setTimeout(() => {
            const saved = persist(state);
            if (!saved && !warnedRef.current) {
                warnedRef.current = true;
                toast.error("Couldn't save your progress", {
                    description: "Browser storage is full or disabled. Changes will be lost on reload.",
                });
            }
            if (saved) warnedRef.current = false;
        }, 250);
        return () => clearTimeout(id);
    }, [state]);

    // setState wrapper that optionally records a checkpoint BEFORE applying.
    const setState = useCallback((updater, opts = {}) => {
        if (opts.record) {
            past.current.push(stateRef.current);
            if (past.current.length > MAX_HISTORY) past.current.shift();
            future.current = [];
            setVersions((v) => v + 1);
        }
        setStateRaw((prev) => trim(typeof updater === "function" ? updater(prev) : updater));
    }, []);

    const undo = useCallback(() => {
        if (past.current.length === 0) return false;
        const prev = past.current.pop();
        future.current.push(stateRef.current);
        if (future.current.length > MAX_HISTORY) future.current.shift();
        setStateRaw(prev);
        setVersions((v) => v + 1);
        return true;
    }, []);

    const redo = useCallback(() => {
        if (future.current.length === 0) return false;
        const next = future.current.pop();
        past.current.push(stateRef.current);
        if (past.current.length > MAX_HISTORY) past.current.shift();
        setStateRaw(next);
        setVersions((v) => v + 1);
        return true;
    }, []);

    const reset = useCallback(() => {
        past.current = [];
        future.current = [];
        setStateRaw(cloneInitial());
        setVersions((v) => v + 1);
        try {
            window.localStorage.removeItem(STORAGE_KEY);
        } catch {
            // ignore
        }
    }, []);

    return [
        state,
        setState,
        stateRef,
        reset,
        {
            undo,
            redo,
            canUndo: past.current.length > 0,
            canRedo: future.current.length > 0,
            versions,
        },
    ];
};
