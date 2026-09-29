import { useCallback, useEffect, useRef, useState } from "react";

// Tiny synthesizer for UI sounds. No external assets.
// Uses Web Audio API tone bursts. Volume is intentionally quiet (~0.06).

const STORAGE_KEY = "gitnaadu:sound";

const safeAudioCtx = () => {
    try {
        const Ctx = window.AudioContext || window.webkitAudioContext;
        if (!Ctx) return null;
        return new Ctx();
    } catch {
        return null;
    }
};

export const useSound = () => {
    const [enabled, setEnabled] = useState(() => {
        try {
            const raw = window.localStorage.getItem(STORAGE_KEY);
            return raw === null ? true : raw === "1";
        } catch {
            return true;
        }
    });
    const ctxRef = useRef(null);

    useEffect(() => {
        try {
            window.localStorage.setItem(STORAGE_KEY, enabled ? "1" : "0");
        } catch {
            // ignore
        }
    }, [enabled]);

    const ensureCtx = () => {
        if (!ctxRef.current) ctxRef.current = safeAudioCtx();
        return ctxRef.current;
    };

    const play = useCallback(
        (kind) => {
            if (!enabled) return;
            const ctx = ensureCtx();
            if (!ctx) return;
            if (ctx.state === "suspended") ctx.resume();
            const now = ctx.currentTime;
            const recipes = {
                key: [{ f: 1800, t: "square", a: 0.04, d: 0.04 }],
                enter: [{ f: 660, t: "triangle", a: 0.06, d: 0.09 }],
                success: [
                    { f: 660, t: "sine", a: 0.07, d: 0.09 },
                    { f: 990, t: "sine", a: 0.07, d: 0.12, delay: 0.08 },
                ],
                commit: [
                    { f: 520, t: "sine", a: 0.07, d: 0.09 },
                    { f: 780, t: "sine", a: 0.07, d: 0.1, delay: 0.06 },
                    { f: 1040, t: "sine", a: 0.06, d: 0.16, delay: 0.13 },
                ],
                branch: [
                    { f: 740, t: "triangle", a: 0.07, d: 0.1 },
                    { f: 880, t: "triangle", a: 0.06, d: 0.12, delay: 0.07 },
                ],
                error: [
                    { f: 220, t: "sawtooth", a: 0.08, d: 0.18 },
                    { f: 180, t: "sawtooth", a: 0.06, d: 0.18, delay: 0.04 },
                ],
                pop: [{ f: 1200, t: "sine", a: 0.05, d: 0.05 }],
                toggle: [{ f: 880, t: "square", a: 0.05, d: 0.05 }],
            };
            const parts = recipes[kind] || recipes.key;
            for (const p of parts) {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = p.t;
                osc.frequency.setValueAtTime(p.f, now + (p.delay || 0));
                gain.gain.setValueAtTime(0.0001, now + (p.delay || 0));
                gain.gain.exponentialRampToValueAtTime(
                    p.a,
                    now + (p.delay || 0) + 0.01,
                );
                gain.gain.exponentialRampToValueAtTime(
                    0.0001,
                    now + (p.delay || 0) + p.d,
                );
                osc.connect(gain);
                gain.connect(ctx.destination);
                osc.start(now + (p.delay || 0));
                osc.stop(now + (p.delay || 0) + p.d + 0.02);
            }
        },
        [enabled],
    );

    const toggle = useCallback(() => setEnabled((v) => !v), []);

    return { enabled, toggle, play };
};

// Map command highlight kinds to a sound kind
export const soundForHighlight = (highlight) => {
    if (!highlight) return null;
    const k = highlight.kind;
    if (k === "git-commit" || k === "git-amend") return "commit";
    if (k === "git-merge-conflict") return "error";
    if (k === "git-branch" || k === "git-checkout" || k === "git-merge" || k === "git-rebase")
        return "branch";
    if (k === "git-merge-abort") return "pop";
    if (k === "git-init" || k === "git-clone" || k === "git-push" || k === "git-tag") return "success";
    if (k === "git-add" || k === "git-restore" || k === "git-stash" || k === "git-stash-pop") return "pop";
    return null;
};
