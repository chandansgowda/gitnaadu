import { useState, useMemo } from "react";
import { motion } from "framer-motion";
import {
    Folder,
    FolderOpen,
    FileText,
    ChevronRight,
    ChevronDown,
    Home,
} from "lucide-react";
import { GIT_DIR_ENTRIES } from "../lib/commands";

// Renders the virtual filesystem tree. Avoids recursive component to keep
// babel + dev-tools instrumentation happy; uses an iterative flatten.

// Repos keep their history in state.repos, not in the filesystem, so each
// repo root gets a read-only stand-in `.git` folder to show it exists.
const virtualGitDir = () => ({
    type: "dir",
    name: ".git",
    virtual: true,
    children: Object.fromEntries(
        GIT_DIR_ENTRIES.map((e) => [
            e.name,
            { ...e, virtual: true, ...(e.type === "dir" ? { children: {} } : {}) },
        ]),
    ),
});

const flatten = (root, isOpen, repoRoots) => {
    const out = [];
    const walk = (node, path, depth) => {
        out.push({ node, path, depth });
        if (node.type === "dir" && isOpen(path)) {
            const children = Object.values(node.children || {}).sort((a, b) => {
                if (a.type === b.type) return a.name.localeCompare(b.name);
                return a.type === "dir" ? -1 : 1;
            });
            if (repoRoots.has(path) && !children.some((c) => c.name === ".git"))
                children.unshift(virtualGitDir());
            for (const child of children) {
                walk(
                    child,
                    (path === "/" ? "" : path) + "/" + child.name,
                    depth + 1,
                );
            }
        }
    };
    walk(root, "/", 0);
    return out;
};

export const FileTree = ({ state, repoPath, onOpenFile }) => {
    const [openMap, setOpenMap] = useState({});

    const ancestors = useMemo(() => {
        const parts = state.cwd.split("/").filter(Boolean);
        const arr = ["/"];
        let p = "";
        for (const part of parts) {
            p += "/" + part;
            arr.push(p);
        }
        return arr;
    }, [state.cwd]);

    const isOpen = (p) =>
        openMap[p] !== undefined
            ? openMap[p]
            : ancestors.includes(p) || p === "/";

    const toggle = (p) => setOpenMap((m) => ({ ...m, [p]: !isOpen(p) }));

    const repoRoots = useMemo(
        () => new Set(Object.values(state.repos || {}).map((r) => r.path)),
        [state.repos],
    );

    const items = flatten(state.fs, isOpen, repoRoots);

    return (
        <div className="h-full overflow-auto bg-surface-0">
            <div className="sticky top-0 z-10 bg-surface-1/40 border-b border-surface-3/60 px-4 py-1.5 flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.2em] text-zinc-500 font-bold">
                    <FolderOpen className="w-3 h-3 text-yellow" />
                    File explorer
                </div>
                <div className="flex items-center gap-1.5 text-[11px] font-mono text-zinc-500">
                    <Home className="w-3 h-3" />
                    <span className="truncate max-w-[16rem]">{state.cwd}</span>
                </div>
            </div>
            <div className="py-2" data-testid="file-tree">
                {items.map(({ node, path, depth }) => {
                    const isCwd = state.cwd === path;
                    const isRepo = repoPath === path;
                    const padLeft = 8 + depth * 16;
                    if (node.type === "file") {
                        return (
                            <div
                                key={path}
                                onClick={() => !node.virtual && onOpenFile && onOpenFile(path)}
                                className={
                                    "flex items-center gap-2 py-1 pr-2 text-sm font-mono rounded transition-colors " +
                                    (node.virtual
                                        ? "opacity-50 cursor-default"
                                        : isCwd
                                          ? "bg-yellow/10 cursor-pointer"
                                          : "hover:bg-surface-2 cursor-pointer")
                                }
                                style={{ paddingLeft: padLeft }}
                                data-testid={"file-" + node.name}
                            >
                                <FileText className="w-3.5 h-3.5 text-zinc-500 flex-shrink-0" />
                                <span className="text-zinc-300 truncate">
                                    {node.name}
                                </span>
                            </div>
                        );
                    }
                    // Folders inside the stand-in .git have nothing to expand.
                    const leaf = node.virtual && node.name !== ".git";
                    const open = !leaf && isOpen(path);
                    return (
                        <div
                            key={path}
                            onClick={() => !leaf && toggle(path)}
                            className={
                                "flex items-center gap-1.5 py-1 pr-2 text-sm font-mono rounded transition-colors " +
                                (leaf ? "cursor-default " : "cursor-pointer ") +
                                (node.virtual ? "opacity-50 " : "") +
                                (isCwd
                                    ? "bg-yellow/10 text-yellow"
                                    : "text-zinc-200 hover:bg-surface-2")
                            }
                            style={{ paddingLeft: padLeft }}
                            data-testid={"dir-" + (node.name === "/" ? "root" : node.name)}
                        >
                            {leaf ? (
                                <span className="w-3.5 h-3.5 flex-shrink-0" />
                            ) : open ? (
                                <ChevronDown className="w-3.5 h-3.5 text-zinc-500" />
                            ) : (
                                <ChevronRight className="w-3.5 h-3.5 text-zinc-500" />
                            )}
                            {open ? (
                                <FolderOpen className="w-3.5 h-3.5 text-yellow" />
                            ) : (
                                <Folder className="w-3.5 h-3.5 text-sky-400" />
                            )}
                            <span className="truncate font-semibold">
                                {node.name === "/" ? "/" : node.name}
                            </span>
                            {isRepo && (
                                <span className="ml-1 px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-wider rounded-sm bg-yellow text-black">
                                    repo
                                </span>
                            )}
                            {node.virtual && node.name === ".git" && (
                                <span className="ml-1 px-1.5 py-0.5 text-[9px] uppercase font-bold tracking-wider rounded-sm border border-surface-3 text-zinc-400">
                                    hidden
                                </span>
                            )}
                        </div>
                    );
                })}
            </div>
        </div>
    );
};
