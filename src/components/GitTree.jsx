import { useMemo, useRef, useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { GitBranch, GitCommit, Tag } from "lucide-react";
import { buildGraph, findRepo } from "../lib/gitEngine";

const ROW_HEIGHT = 60;
const LANE_WIDTH = 36;
const PADDING_TOP = 24;
const PADDING_LEFT = 36;
const NODE_R = 9;

export const GitTree = ({ state, onSelectCommit }) => {
    const repo = useMemo(
        () => findRepo(state.repos, state.cwd),
        [state.repos, state.cwd],
    );
    const graph = useMemo(() => (repo ? buildGraph(repo) : null), [repo, state]);

    // Fit the label column to the visible width so phones don't need to
    // scroll sideways to read commit messages.
    const scrollRef = useRef(null);
    const [viewWidth, setViewWidth] = useState(0);
    useEffect(() => {
        const el = scrollRef.current;
        if (!el || typeof ResizeObserver === "undefined") return;
        const ro = new ResizeObserver(() => setViewWidth(el.clientWidth));
        ro.observe(el);
        return () => ro.disconnect();
    }, [!!repo]);

    if (!repo) {
        return (
            <div className="h-full w-full flex items-center justify-center text-center px-8">
                <div className="max-w-md">
                    <motion.div
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-surface-2 border border-surface-3 mb-5"
                    >
                        <GitBranch className="w-8 h-8 text-yellow" />
                    </motion.div>
                    <h2 className="font-black text-2xl md:text-3xl tracking-tight text-white">
                        No repository here yet
                    </h2>
                    <p className="text-zinc-400 mt-3 text-sm leading-relaxed">
                        Navigate into a project folder (try{" "}
                        <code className="font-mono px-1.5 py-0.5 rounded bg-surface-2 text-yellow">
                            cd portfolio-website
                        </code>
                        ) and run{" "}
                        <code className="font-mono px-1.5 py-0.5 rounded bg-surface-2 text-yellow">
                            git init
                        </code>{" "}
                        to start visualising the commit graph.
                    </p>
                </div>
            </div>
        );
    }

    const nodes = graph.nodes;
    const totalLanes = graph.maxLane + 1;
    const railWidth = PADDING_LEFT + totalLanes * LANE_WIDTH;
    const labelStart = railWidth + 16;
    const labelWidth = viewWidth
        ? Math.max(200, Math.min(520, viewWidth - labelStart - 12))
        : 520;
    const width = labelStart + labelWidth;
    const height = Math.max(280, PADDING_TOP + nodes.length * ROW_HEIGHT + 40);

    const laneX = (lane) => PADDING_LEFT + lane * LANE_WIDTH;
    const rowY = (row) => PADDING_TOP + row * ROW_HEIGHT;

    const nodesById = Object.fromEntries(nodes.map((n) => [n.id, n]));

    // Build edges from each commit to each parent
    const edges = [];
    for (const n of nodes) {
        n.parents.forEach((pid, idx) => {
            const p = nodesById[pid];
            if (!p) return;
            const lane = n.parentLanes[idx] ?? n.lane;
            edges.push({
                key: n.id + "->" + pid,
                fromLane: n.lane,
                fromRow: n.row,
                toLane: p.lane,
                toRow: p.row,
                viaLane: lane,
                color: idx === 0 ? n.color : p.color,
            });
        });
    }

    return (
        <div
            ref={scrollRef}
            className="h-full w-full overflow-auto bg-gradient-to-b from-surface-0 to-black/30 noise relative"
            data-testid="git-tree"
        >
            {/* Context strip with branch legend */}
            <div className="sticky top-0 z-10 bg-surface-1/40 border-b border-surface-3/60 px-4 py-1.5 flex items-center justify-between gap-2 flex-wrap">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
                    <GitBranch className="w-3 h-3 text-yellow" />
                    Commit graph
                </div>
                <div
                    className="flex items-center gap-3 flex-wrap"
                    data-testid="branch-legend"
                >
                    {graph.branches.map((b) => (
                        <div
                            key={b.name}
                            className="flex items-center gap-1.5 text-xs"
                        >
                            <span
                                className="w-2.5 h-2.5 rounded-full"
                                style={{
                                    background: b.color,
                                    boxShadow: `0 0 8px ${b.color}99`,
                                }}
                            />
                            <span
                                className={
                                    b.name === graph.headRef
                                        ? "text-yellow font-semibold"
                                        : "text-zinc-300"
                                }
                            >
                                {b.name}
                            </span>
                        </div>
                    ))}
                    {graph.tags.length > 0 && (
                        <div className="flex items-center gap-1.5 text-xs text-zinc-400 ml-2 pl-2 border-l border-surface-3">
                            <Tag className="w-3 h-3 text-yellow" />
                            <span>{graph.tags.length} tag{graph.tags.length !== 1 ? "s" : ""}</span>
                        </div>
                    )}
                </div>
            </div>

            <div className="relative" style={{ width, height }}>
                {/* Edges */}
                <svg
                    width={width}
                    height={height}
                    className="absolute inset-0 pointer-events-none"
                >
                    {edges.map((e) => {
                        const x1 = laneX(e.fromLane);
                        const y1 = rowY(e.fromRow);
                        const x2 = laneX(e.toLane);
                        const y2 = rowY(e.toRow);
                        // Smooth bezier from (x1,y1) down to (x2,y2)
                        const dy = y2 - y1;
                        const midY = y1 + dy * 0.5;
                        const path =
                            x1 === x2
                                ? `M ${x1} ${y1 + NODE_R} L ${x2} ${y2 - NODE_R}`
                                : `M ${x1} ${y1 + NODE_R} C ${x1} ${midY}, ${x2} ${midY}, ${x2} ${y2 - NODE_R}`;
                        return (
                            <motion.path
                                key={e.key}
                                d={path}
                                stroke={e.color}
                                strokeWidth="2"
                                fill="none"
                                strokeOpacity={0.75}
                                initial={{ pathLength: 0, opacity: 0 }}
                                animate={{ pathLength: 1, opacity: 1 }}
                                transition={{ duration: 0.5, ease: "easeOut" }}
                            />
                        );
                    })}
                </svg>

                {/* Lane rails (subtle vertical guides) */}
                <svg
                    width={width}
                    height={height}
                    className="absolute inset-0 pointer-events-none"
                >
                    {Array.from({ length: totalLanes }).map((_, l) => (
                        <line
                            key={l}
                            x1={laneX(l)}
                            x2={laneX(l)}
                            y1={PADDING_TOP - 12}
                            y2={height - 12}
                            stroke="#27272a"
                            strokeWidth="1"
                            strokeDasharray="2 6"
                            opacity="0.5"
                        />
                    ))}
                </svg>

                {/* Nodes + Labels */}
                <AnimatePresence>
                    {nodes.map((n) => {
                        const x = laneX(n.lane);
                        const y = rowY(n.row);
                        const isHead = graph.head === n.id;
                        const branchTags = graph.branches.filter(
                            (b) => b.hash === n.id,
                        );
                        const remoteTags = (graph.remoteRefs || []).filter(
                            (r) => r.hash === n.id,
                        );
                        const tagTags = graph.tags.filter((t) => t.hash === n.id);
                        return (
                            <div key={n.id}>
                                {/* Node circle (clickable) */}
                                <motion.button
                                    type="button"
                                    onClick={() => onSelectCommit?.(n.id)}
                                    initial={{ scale: 0, opacity: 0 }}
                                    animate={{ scale: 1, opacity: 1 }}
                                    exit={{ scale: 0, opacity: 0 }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 320,
                                        damping: 24,
                                    }}
                                    whileHover={{ scale: 1.18 }}
                                    whileTap={{ scale: 0.92 }}
                                    className="absolute group focus:outline-none"
                                    style={{
                                        left: x - NODE_R - 4,
                                        top: y - NODE_R - 4,
                                        padding: 4,
                                    }}
                                    data-testid={`commit-node-${n.id}`}
                                    title={`${n.id} — ${n.message}`}
                                    aria-label={`Show commit ${n.id}`}
                                >
                                    <div
                                        className="rounded-full border-2 bg-surface-1 flex items-center justify-center cursor-pointer transition-shadow group-hover:shadow-lg"
                                        style={{
                                            width: NODE_R * 2,
                                            height: NODE_R * 2,
                                            borderColor: n.color,
                                            boxShadow: isHead
                                                ? `0 0 0 4px ${n.color}33, 0 0 16px ${n.color}88`
                                                : `0 0 8px ${n.color}55`,
                                        }}
                                    />
                                </motion.button>

                                {/* Label row to the right (also clickable) */}
                                <motion.button
                                    type="button"
                                    onClick={() => onSelectCommit?.(n.id)}
                                    initial={{ opacity: 0, x: -8 }}
                                    animate={{ opacity: 1, x: 0 }}
                                    transition={{ delay: 0.08, duration: 0.3 }}
                                    className="absolute flex items-center gap-1.5 whitespace-nowrap text-left [&>*]:flex-shrink-0 hover:bg-surface-2/40 rounded px-1 py-1 -mx-1 -my-1 transition-colors focus:outline-none focus:ring-1 focus:ring-yellow/60"
                                    style={{
                                        left: labelStart,
                                        top: y - 14,
                                        maxWidth: labelWidth,
                                    }}
                                    aria-label={`Show commit ${n.id}`}
                                >
                                    {isHead && (
                                        <span
                                            className="px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider bg-yellow text-black rounded-sm animate-pulse-glow"
                                            data-testid="head-pointer"
                                        >
                                            HEAD
                                        </span>
                                    )}
                                    {branchTags.map((bt) => (
                                        <span
                                            key={bt.name}
                                            className="px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-sm border"
                                            style={{
                                                color: bt.color,
                                                borderColor: bt.color + "88",
                                                background: bt.color + "15",
                                            }}
                                        >
                                            {bt.name}
                                        </span>
                                    ))}
                                    {remoteTags.map((rt) => (
                                        <span
                                            key={"remote-" + rt.name}
                                            className="px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-sm border bg-slate-500/10 text-slate-300 border-slate-500/40"
                                            data-testid={"remote-ref-" + rt.name}
                                        >
                                            {rt.name}
                                        </span>
                                    ))}
                                    {tagTags.map((tt) => (
                                        <span
                                            key={"tag-" + tt.name}
                                            className="px-1.5 py-0.5 text-[10px] uppercase font-bold tracking-wider rounded-sm bg-surface-2 border border-yellow/50 text-yellow flex items-center gap-1"
                                        >
                                            <Tag className="w-2.5 h-2.5" />
                                            {tt.name}
                                        </span>
                                    ))}
                                    <span className="text-zinc-500 text-xs font-mono">
                                        {n.id}
                                    </span>
                                    <span className="text-zinc-200 text-xs truncate min-w-0 !flex-shrink">
                                        {n.message}
                                    </span>
                                </motion.button>
                            </div>
                        );
                    })}
                </AnimatePresence>

                {nodes.length === 0 && (
                    <div className="absolute inset-0 flex items-center justify-center text-center px-6">
                        <div>
                            <p className="text-zinc-400 text-sm">
                                Repository initialised. Stage and commit some
                                files to see your first commit appear here.
                            </p>
                            <p className="font-mono text-yellow text-sm mt-3">
                                git add . && git commit -m "first commit"
                            </p>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
