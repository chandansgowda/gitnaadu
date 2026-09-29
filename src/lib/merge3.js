// Line-based three-way merge (the diff3 idea behind `git merge`).
//
// Lines of `base` that survive unchanged on BOTH sides are anchors. Between
// two anchors, whichever side changed the chunk wins; if both changed it in
// different ways, the chunk becomes a conflict wrapped in git-style markers.
// Changes to different parts of a file therefore merge cleanly, like git.
import { has } from "./objects";

// Longest-common-subsequence matching: Map(baseIndex -> otherIndex).
const lcsMatches = (A, B) => {
    const m = A.length;
    const n = B.length;
    const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
            dp[i][j] = A[i] === B[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const map = new Map();
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
        if (A[i] === B[j]) {
            map.set(i, j);
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) i++;
        else j++;
    }
    return map;
};

const sameLines = (a, b) => a.length === b.length && a.every((x, i) => x === b[i]);

export const merge3 = (base, ours, theirs, labels = {}) => {
    if (ours === theirs) return { text: ours, conflict: false };
    if (base === ours) return { text: theirs, conflict: false };
    if (base === theirs) return { text: ours, conflict: false };

    const B = base.split("\n");
    const O = ours.split("\n");
    const T = theirs.split("\n");
    const mo = lcsMatches(B, O);
    const mt = lcsMatches(B, T);
    const out = [];
    let conflict = false;
    let b = 0;
    let o = 0;
    let t = 0;

    const emitChunk = (b1, o1, t1) => {
        const cb = B.slice(b, b1);
        const co = O.slice(o, o1);
        const ct = T.slice(t, t1);
        if (sameLines(co, cb)) out.push(...ct);
        else if (sameLines(ct, cb) || sameLines(co, ct)) out.push(...co);
        else {
            conflict = true;
            out.push(
                `<<<<<<< ${labels.ours || "ours"}`,
                ...co,
                "=======",
                ...ct,
                `>>>>>>> ${labels.theirs || "theirs"}`,
            );
        }
    };

    for (;;) {
        let k = b;
        while (k < B.length && !(mo.has(k) && mt.has(k))) k++;
        if (k === B.length) {
            emitChunk(B.length, O.length, T.length);
            break;
        }
        const ok = mo.get(k);
        const tk = mt.get(k);
        if (k > b || ok > o || tk > t) emitChunk(k, ok, tk);
        out.push(B[k]);
        b = k + 1;
        o = ok + 1;
        t = tk + 1;
    }
    return { text: out.join("\n"), conflict };
};

// Content of `p` in a file map, or null when the file is absent.
const at = (map, p) => (has(map, p) ? map[p] : null);

// Merge three snapshots ({ [path]: content }). Returns the merged snapshot,
// the conflicted paths and, per conflicted path, a git-status style kind.
export const mergeTrees = (base, ours, theirs, labels) => {
    const files = {};
    const conflicts = [];
    const kinds = {};
    const paths = new Set([...Object.keys(base), ...Object.keys(ours), ...Object.keys(theirs)]);
    for (const p of paths) {
        const b = at(base, p);
        const o = at(ours, p);
        const t = at(theirs, p);
        let v;
        if (o === t) v = o;
        else if (b === o) v = t;
        else if (b === t) v = o;
        else if (o === null || t === null) {
            // One side deleted the file, the other changed it: keep the
            // changed version in the working tree and let the user decide.
            v = o ?? t;
            conflicts.push(p);
            kinds[p] = o === null ? "deleted by us" : "deleted by them";
        } else {
            const m = merge3(b ?? "", o, t, labels);
            v = m.text;
            if (m.conflict) {
                conflicts.push(p);
                kinds[p] = b === null ? "both added" : "both modified";
            }
        }
        if (v !== null) files[p] = v;
    }
    return { files, conflicts: conflicts.sort(), kinds };
};

export const hasConflictMarkers = (text) =>
    /^<<<<<<< /m.test(text || "") && /^>>>>>>> /m.test(text || "");
