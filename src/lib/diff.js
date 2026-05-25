// Tiny line-based diff (LCS).
// Returns array of { type: 'eq'|'add'|'del', text }
export const diffLines = (a, b) => {
    const A = (a == null ? "" : a).split("\n");
    const B = (b == null ? "" : b).split("\n");
    const m = A.length;
    const n = B.length;
    // dp[i][j] = LCS length of A[i..] and B[j..]
    const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
    for (let i = m - 1; i >= 0; i--) {
        for (let j = n - 1; j >= 0; j--) {
            if (A[i] === B[j]) dp[i][j] = dp[i + 1][j + 1] + 1;
            else dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
        }
    }
    const out = [];
    let i = 0;
    let j = 0;
    while (i < m && j < n) {
        if (A[i] === B[j]) {
            out.push({ type: "eq", text: A[i] });
            i++;
            j++;
        } else if (dp[i + 1][j] >= dp[i][j + 1]) {
            out.push({ type: "del", text: A[i] });
            i++;
        } else {
            out.push({ type: "add", text: B[j] });
            j++;
        }
    }
    while (i < m) out.push({ type: "del", text: A[i++] });
    while (j < n) out.push({ type: "add", text: B[j++] });
    return out;
};

// Hunk-grouped diff with line numbers and context size.
export const diffHunks = (a, b, context = 3) => {
    const lines = diffLines(a, b);
    const hunks = [];
    let cur = null;
    let oldLn = 1;
    let newLn = 1;
    const annotated = lines.map((l) => {
        const o = oldLn;
        const n = newLn;
        if (l.type === "eq") {
            oldLn++;
            newLn++;
        } else if (l.type === "del") {
            oldLn++;
        } else if (l.type === "add") {
            newLn++;
        }
        return { ...l, oldLn: o, newLn: n };
    });

    // Build hunks around runs of non-eq lines
    const isChange = (x) => x && x.type !== "eq";
    let i = 0;
    while (i < annotated.length) {
        if (!isChange(annotated[i])) {
            i++;
            continue;
        }
        // Start hunk; expand backwards by `context`
        const start = Math.max(0, i - context);
        let end = i;
        while (end < annotated.length) {
            if (isChange(annotated[end])) {
                end++;
                continue;
            }
            // Look ahead: if next change within `context * 2`, keep going
            let look = end;
            let foundChange = false;
            while (look < annotated.length && look - end < context * 2) {
                if (isChange(annotated[look])) {
                    foundChange = true;
                    break;
                }
                look++;
            }
            if (!foundChange) break;
            end++;
        }
        const tail = Math.min(annotated.length, end + context);
        const hunkLines = annotated.slice(start, tail);
        hunks.push({
            oldStart: hunkLines[0].oldLn,
            newStart: hunkLines[0].newLn,
            lines: hunkLines,
        });
        i = tail;
    }
    return hunks;
};

// Compute summary stats { adds, dels }
export const diffStats = (a, b) => {
    const lines = diffLines(a, b);
    let adds = 0;
    let dels = 0;
    for (const l of lines) {
        if (l.type === "add") adds++;
        else if (l.type === "del") dels++;
    }
    return { adds, dels };
};
