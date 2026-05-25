import { useCallback, useEffect, useRef } from "react";
import { CHALLENGES, findChallenge } from "../lib/challenges";

// Challenge progress lives inside the main app state (`state.challenges`)
// so that:
//   1. It persists across refreshes via the same localStorage key as the rest.
//   2. Undo/redo automatically rolls it back via the existing snapshot mechanism.
//   3. Playground reset clears it (desired behavior).
//
// Shape:
//   state.challenges = {
//     activeId: string | null,           // which challenge is currently being viewed
//     stepIndex: number,                 // step the active challenge is on (mirror of progress[activeId])
//     progress: { [id]: number },        // per-challenge step memory — preserved when switching/leaving
//     completed: { [id]: ISOString },    // permanent completion marks
//   }
export const useChallenges = ({ state, setState, lastHighlight, lastCommand, onProgress, onComplete } = {}) => {
    const data = state?.challenges || {
        activeId: null,
        stepIndex: 0,
        progress: {},
        completed: {},
    };
    const active = data.activeId ? findChallenge(data.activeId) : null;
    const stepIdx = data.stepIndex || 0;

    const justAdvancedRef = useRef(false);

    const start = useCallback(
        (id) => {
            setState((prev) => {
                const ch = prev.challenges || { progress: {}, completed: {} };
                const savedStep = ch.progress?.[id] || 0;
                return {
                    ...prev,
                    challenges: {
                        ...ch,
                        progress: ch.progress || {},
                        completed: ch.completed || {},
                        activeId: id,
                        stepIndex: savedStep,
                    },
                };
            });
        },
        [setState],
    );

    const stop = useCallback(() => {
        // "Leave" just clears the active pointer. Per-challenge progress is
        // preserved in `progress[id]` so re-entering picks up where you left off.
        setState((prev) => ({
            ...prev,
            challenges: {
                ...(prev.challenges || { progress: {}, completed: {} }),
                activeId: null,
                stepIndex: 0,
            },
        }));
    }, [setState]);

    const resetProgress = useCallback(() => {
        setState((prev) => ({
            ...prev,
            challenges: {
                activeId: null,
                stepIndex: 0,
                progress: {},
                completed: {},
            },
        }));
    }, [setState]);

    const resetOne = useCallback(
        (id) => {
            setState((prev) => {
                const ch = prev.challenges || { progress: {}, completed: {} };
                const nextProgress = { ...(ch.progress || {}) };
                const nextCompleted = { ...(ch.completed || {}) };
                delete nextProgress[id];
                delete nextCompleted[id];
                return {
                    ...prev,
                    challenges: {
                        ...ch,
                        activeId: ch.activeId === id ? null : ch.activeId,
                        stepIndex: ch.activeId === id ? 0 : ch.stepIndex,
                        progress: nextProgress,
                        completed: nextCompleted,
                    },
                };
            });
        },
        [setState],
    );

    // Auto-advance: re-check the current step (and any consecutive ones) every
    // time the state, last highlight, or last command changes.
    useEffect(() => {
        if (!active) return;
        const ctx = { state, lastHighlight, lastCommand };
        let idx = stepIdx;
        let advanced = false;
        while (idx < active.steps.length) {
            const step = active.steps[idx];
            let ok = false;
            try {
                ok = step.check(ctx);
            } catch {
                ok = false;
            }
            if (ok) {
                idx += 1;
                advanced = true;
            } else break;
        }
        if (!advanced) return;
        justAdvancedRef.current = true;
        const finalIdx = idx;
        const id = active.id;
        if (finalIdx >= active.steps.length) {
            setState((prev) => {
                const ch = prev.challenges || { progress: {}, completed: {} };
                return {
                    ...prev,
                    challenges: {
                        ...ch,
                        activeId: id,
                        stepIndex: active.steps.length,
                        progress: { ...(ch.progress || {}), [id]: active.steps.length },
                        completed: {
                            ...(ch.completed || {}),
                            [id]: new Date().toISOString(),
                        },
                    },
                };
            });
            onComplete?.(active);
        } else {
            setState((prev) => {
                const ch = prev.challenges || { progress: {}, completed: {} };
                return {
                    ...prev,
                    challenges: {
                        ...ch,
                        activeId: id,
                        stepIndex: finalIdx,
                        progress: { ...(ch.progress || {}), [id]: finalIdx },
                    },
                };
            });
            onProgress?.(active, finalIdx);
        }
    }, [state, lastHighlight, lastCommand, active, stepIdx, onProgress, onComplete, setState]);

    const justAdvanced = justAdvancedRef.current;
    if (justAdvanced) justAdvancedRef.current = false;

    return {
        all: CHALLENGES,
        active,
        stepIndex: stepIdx,
        progress: data.progress || {},
        completed: data.completed || {},
        start,
        stop,
        resetProgress,
        resetOne,
        justAdvanced,
    };
};
