import { useEffect, useRef, useState, useCallback } from "react";
import { buildInitialFS, HOME, WELCOME_LINES } from "../lib/initialState";

const STORAGE_KEY = "gitnaadu:v1";
const MAX_HISTORY = 60;

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
        // Backwards-compat: older saves don't have `challenges` or `progress`.
        if (!parsed.challenges) {
            parsed.challenges = { activeId: null, stepIndex: 0, progress: {}, completed: {} };
        } else if (!parsed.challenges.progress) {
            parsed.challenges.progress = {};
        }
        return parsed;
    } catch {
        return null;
    }
};

// Light deep-clone via JSON. State is JSON-safe by design.
const snapshot = (s) => JSON.parse(JSON.stringify(s));

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

    // Persist
    useEffect(() => {
        const id = setTimeout(() => {
            try {
                window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
            } catch {
                // ignore quota
            }
        }, 250);
        return () => clearTimeout(id);
    }, [state]);

    // setState wrapper that optionally records a checkpoint BEFORE applying.
    const setState = useCallback((updater, opts = {}) => {
        if (opts.record) {
            past.current.push(snapshot(stateRef.current));
            if (past.current.length > MAX_HISTORY) past.current.shift();
            future.current = [];
            setVersions((v) => v + 1);
        }
        setStateRaw((prev) =>
            typeof updater === "function" ? updater(prev) : updater,
        );
    }, []);

    const undo = useCallback(() => {
        if (past.current.length === 0) return false;
        const prev = past.current.pop();
        future.current.push(snapshot(stateRef.current));
        if (future.current.length > MAX_HISTORY) future.current.shift();
        setStateRaw(prev);
        setVersions((v) => v + 1);
        return true;
    }, []);

    const redo = useCallback(() => {
        if (future.current.length === 0) return false;
        const next = future.current.pop();
        past.current.push(snapshot(stateRef.current));
        if (past.current.length > MAX_HISTORY) past.current.shift();
        setStateRaw(next);
        setVersions((v) => v + 1);
        return true;
    }, []);

    const reset = useCallback(() => {
        past.current = [];
        future.current = [];
        const fresh = cloneInitial();
        setStateRaw(fresh);
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
