// Commit-graph layout for the Git Tree panel: topological row order plus
// lane assignment so branches & merges don't overlap.
import { COLORS, headCommit } from "./gitEngine";
import { get } from "./objects";

const newerFirst = (repo) => (a, b) => (repo.commits[a].date < repo.commits[b].date ? 1 : -1);

const topoOrder = (repo) => {
    // Walk all commits reachable from any "tip": local branches, tags,
    // remote-tracking refs (origin/*), a detached HEAD and an in-progress merge.
    const roots = new Set();
    for (const h of Object.values(repo.branches)) roots.add(h);
    for (const h of Object.values(repo.tags || {})) roots.add(h);
    for (const h of Object.values(repo.remoteRefs || {})) roots.add(h);
    if (repo.HEAD?.type === "detached") roots.add(repo.HEAD.ref);
    if (repo.merging?.head) roots.add(repo.merging.head);
    const rootArr = [...roots].filter((h) => get(repo.commits, h)).sort(newerFirst(repo));

    const visited = new Set();
    const stack = [...rootArr];
    while (stack.length) {
        const h = stack.pop();
        if (visited.has(h) || !get(repo.commits, h)) continue;
        visited.add(h);
        for (const p of repo.commits[h].parents) stack.push(p);
    }
    // Kahn's algorithm; among ready nodes pick the newest.
    const childCount = {};
    for (const h of visited) childCount[h] = 0;
    for (const h of visited) {
        for (const p of repo.commits[h].parents) if (visited.has(p)) childCount[p] += 1;
    }
    // A tip that is an ancestor of another tip (e.g. main behind feature)
    // must wait for its children, or it would be drawn above them.
    const ready = rootArr.filter((h) => childCount[h] === 0);
    const inReady = new Set(ready);
    const order = [];
    const placed = new Set();
    while (ready.length) {
        ready.sort(newerFirst(repo));
        const h = ready.shift();
        inReady.delete(h);
        order.push(h);
        placed.add(h);
        for (const p of repo.commits[h].parents) {
            if (!visited.has(p)) continue;
            childCount[p] -= 1;
            if (childCount[p] === 0 && !inReady.has(p)) {
                ready.push(p);
                inReady.add(p);
            }
        }
    }
    // Commits no ref reaches (abandoned by rebase or reset --hard) are left
    // out, as in `git log --all`.
    for (const h of visited) if (!placed.has(h)) order.push(h);
    return order;
};

const assignLanes = (repo, order) => {
    // lanes[i] = hash lane i is waiting to draw next (null = free)
    const lanes = [];
    const result = [];
    const alloc = (hash) => {
        const existing = lanes.indexOf(hash);
        if (existing !== -1) return existing;
        const empty = lanes.indexOf(null);
        if (empty !== -1) {
            lanes[empty] = hash;
            return empty;
        }
        lanes.push(hash);
        return lanes.length - 1;
    };
    for (const h of order) {
        const c = repo.commits[h];
        let myLane = lanes.indexOf(h);
        if (myLane === -1) {
            myLane = lanes.indexOf(null);
            if (myLane === -1) {
                myLane = lanes.length;
                lanes.push(null);
            }
        }
        // Free other lanes that also target me (converging children).
        const mergeIns = [];
        for (let i = 0; i < lanes.length; i++) {
            if (i !== myLane && lanes[i] === h) {
                mergeIns.push(i);
                lanes[i] = null;
            }
        }
        lanes[myLane] = null;

        const parents = c.parents || [];
        const parentLanes = [];
        if (parents.length) {
            // First parent stays in our lane unless another lane already targets it.
            const firstExisting = lanes.indexOf(parents[0]);
            if (firstExisting !== -1) parentLanes.push(firstExisting);
            else {
                lanes[myLane] = parents[0];
                parentLanes.push(myLane);
            }
            for (let k = 1; k < parents.length; k++) parentLanes.push(alloc(parents[k]));
        }
        result.push({ hash: h, lane: myLane, parentLanes, mergeIns });
        while (lanes.length && lanes[lanes.length - 1] === null) lanes.pop();
    }
    return result;
};

export const buildGraph = (repo) => {
    if (!repo.commits || Object.keys(repo.commits).length === 0) {
        return {
            nodes: [],
            branches: [],
            remoteRefs: [],
            tags: [],
            head: null,
            headType: repo.HEAD?.type,
            headRef: repo.HEAD?.ref,
            maxLane: 0,
        };
    }
    const order = topoOrder(repo);
    const placement = assignLanes(repo, order);
    const rowByHash = {};
    placement.forEach((p, i) => {
        rowByHash[p.hash] = i;
    });

    // Color per commit: branch color if branch known, else lane color
    const nodes = placement.map((p, i) => {
        const c = repo.commits[p.hash];
        return {
            id: c.hash,
            message: c.message,
            parents: c.parents,
            branch: c.branch,
            date: c.date,
            author: c.author,
            lane: p.lane,
            parentLanes: p.parentLanes,
            row: i,
            color: get(repo.branchColors, c.branch) || COLORS[p.lane % COLORS.length],
        };
    });
    const colorByHash = Object.fromEntries(nodes.map((n) => [n.id, n.color]));

    const branches = Object.entries(repo.branches).map(([name, hash]) => ({
        name,
        hash,
        color: get(repo.branchColors, name) || colorByHash[hash] || COLORS[0],
        row: rowByHash[hash],
        kind: "branch",
    }));

    const remoteRefs = Object.entries(repo.remoteRefs || {}).map(([name, hash]) => ({
        name,
        hash,
        color: "#94A3B8", // slate-400 for origin/* refs
        row: rowByHash[hash],
        kind: "remote",
    }));

    const tags = Object.entries(repo.tags || {}).map(([name, hash]) => ({
        name,
        hash,
        row: rowByHash[hash],
    }));

    return {
        nodes,
        branches,
        remoteRefs,
        tags,
        head: headCommit(repo),
        headType: repo.HEAD?.type,
        headRef: repo.HEAD?.ref,
        maxLane: Math.max(0, ...nodes.map((n) => n.lane)),
    };
};
