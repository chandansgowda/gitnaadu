// In-memory virtual Linux filesystem (POSIX-like paths)
// Nodes:  { type: 'dir', name, children: {} }  |  { type: 'file', name, content }
// All functions are pure-ish: they mutate the passed-in root and return result.
import { get } from "./objects";

export const splitPath = (p) =>
    p.split("/").filter((s) => s.length > 0);

export const joinPath = (parts) => "/" + parts.join("/");

export const normalizePath = (cwd, target) => {
    if (!target || target === "") return cwd;
    const isAbsolute = target.startsWith("/");
    const baseParts = isAbsolute ? [] : splitPath(cwd);
    const tParts = splitPath(target);
    const out = [...baseParts];
    for (const part of tParts) {
        if (part === "." || part === "") continue;
        if (part === "..") {
            if (out.length > 0) out.pop();
        } else {
            out.push(part);
        }
    }
    return "/" + out.join("/");
};

export const expandTilde = (p, home = "/home/student") => {
    if (!p) return p;
    if (p === "~") return home;
    if (p.startsWith("~/")) return home + p.slice(1);
    return p;
};

// Returns an error message when `name` can't be used for a file or
// directory. `__proto__` is refused because nodes are stored in plain
// objects keyed by name, where assigning that key would replace the prototype.
export const nameError = (name) => {
    if (!name || name === "." || name === "..") return `invalid name '${name}'`;
    if (name === "__proto__") return `'${name}': name not allowed in this simulator`;
    return null;
};

export const getNode = (root, path) => {
    const parts = splitPath(path);
    let node = root;
    for (const part of parts) {
        if (!node || node.type !== "dir") return null;
        node = get(node.children, part);
        if (!node) return null;
    }
    return node;
};

export const getParent = (root, path) => {
    const parts = splitPath(path);
    if (parts.length === 0) return null;
    parts.pop();
    return getNode(root, "/" + parts.join("/"));
};

export const baseName = (path) => {
    const parts = splitPath(path);
    return parts.length === 0 ? "/" : parts[parts.length - 1];
};

export const dirName = (path) => {
    const parts = splitPath(path);
    if (parts.length <= 1) return "/";
    parts.pop();
    return "/" + parts.join("/");
};

export const listDir = (node) => {
    if (!node || node.type !== "dir") return [];
    return Object.values(node.children || {}).sort((a, b) => {
        if (a.type === b.type) return a.name.localeCompare(b.name);
        return a.type === "dir" ? -1 : 1;
    });
};

export const ensureDir = (root, path) => {
    const parts = splitPath(path);
    let node = root;
    for (const part of parts) {
        if (nameError(part)) return null;
        if (!node.children) node.children = {};
        if (!get(node.children, part)) {
            node.children[part] = { type: "dir", name: part, children: {} };
        }
        node = node.children[part];
        if (node.type !== "dir") return null;
    }
    return node;
};

export const createFile = (root, path, content = "") => {
    const parent = getParent(root, path);
    if (!parent || parent.type !== "dir") return { error: `no such directory: ${dirName(path)}` };
    const name = baseName(path);
    const bad = nameError(name);
    if (bad) return { error: bad };
    parent.children = parent.children || {};
    const existing = get(parent.children, name);
    if (existing && existing.type === "dir")
        return { error: `${name}: is a directory` };
    if (existing) {
        // touch on an existing file keeps its content
        return { ok: true, node: existing };
    }
    const node = { type: "file", name, content };
    parent.children[name] = node;
    return { ok: true, node };
};

export const writeFile = (root, path, content) => {
    const parent = getParent(root, path);
    if (!parent || parent.type !== "dir")
        return { error: `no such directory: ${dirName(path)}` };
    const name = baseName(path);
    const bad = nameError(name);
    if (bad) return { error: bad };
    if (get(parent.children, name)?.type === "dir") return { error: `${name}: Is a directory` };
    parent.children = parent.children || {};
    parent.children[name] = { type: "file", name, content };
    return { ok: true };
};

export const makeDir = (root, path) => {
    const parent = getParent(root, path);
    if (!parent || parent.type !== "dir")
        return { error: `no such directory: ${dirName(path)}` };
    const name = baseName(path);
    const bad = nameError(name);
    if (bad) return { error: `cannot create directory ${bad}` };
    parent.children = parent.children || {};
    if (get(parent.children, name))
        return { error: `cannot create directory '${name}': File exists` };
    parent.children[name] = { type: "dir", name, children: {} };
    return { ok: true };
};

export const remove = (root, path, opts = {}) => {
    const parent = getParent(root, path);
    if (!parent) return { error: `cannot remove '${path}': No such file or directory` };
    const name = baseName(path);
    const node = get(parent.children, name);
    if (!node) return { error: `cannot remove '${path}': No such file` };
    if (node.type === "dir" && !opts.recursive)
        return { error: `cannot remove '${path}': Is a directory (use -r)` };
    delete parent.children[name];
    return { ok: true };
};

// Where `src` ends up for `cp`/`mv src dst`: inside `dst` when it's a directory.
const destinationFor = (root, srcNode, dst) => {
    const dstNode = getNode(root, dst);
    if (dstNode && dstNode.type === "dir")
        return (dst === "/" ? "" : dst.replace(/\/+$/, "")) + "/" + srcNode.name;
    return dst;
};

// Refuse overwriting a directory with a file (or the other way round).
const overwriteError = (root, srcNode, finalPath) => {
    const existing = getNode(root, finalPath);
    if (!existing) return null;
    if (existing.type === "dir" && srcNode.type !== "dir")
        return `cannot overwrite directory '${finalPath}' with non-directory`;
    if (existing.type === "dir") return `cannot overwrite '${finalPath}': Directory not empty`;
    if (srcNode.type === "dir") return `cannot overwrite non-directory '${finalPath}' with directory`;
    return null;
};

export const copy = (root, src, dst, opts = {}) => {
    const srcNode = getNode(root, src);
    if (!srcNode) return { error: `cannot stat '${src}': No such file` };
    if (srcNode.type === "dir" && !opts.recursive)
        return { error: `omitting directory '${src}' (use -r)` };
    const finalPath = destinationFor(root, srcNode, dst);
    if (finalPath === src) return { error: `'${src}' and '${finalPath}' are the same file` };
    if (finalPath.startsWith(src + "/"))
        return { error: `cannot copy a directory, '${src}', into itself` };
    const parent = getParent(root, finalPath);
    if (!parent || parent.type !== "dir")
        return { error: `no such directory: ${dirName(finalPath)}` };
    const name = baseName(finalPath);
    const bad = nameError(name) || overwriteError(root, srcNode, finalPath);
    if (bad) return { error: bad };
    const cloned = JSON.parse(JSON.stringify(srcNode));
    cloned.name = name;
    parent.children = parent.children || {};
    parent.children[name] = cloned;
    return { ok: true, path: finalPath };
};

export const move = (root, src, dst) => {
    const srcNode = getNode(root, src);
    if (!srcNode) return { error: `cannot stat '${src}': No such file` };
    if (src === "/") return { error: `cannot move '/'` };
    const finalPath = destinationFor(root, srcNode, dst);
    if (finalPath === src) return { ok: true, path: src };
    if (finalPath.startsWith(src + "/"))
        return { error: `cannot move '${src}' to a subdirectory of itself` };
    const srcParent = getParent(root, src);
    const dstParent = getParent(root, finalPath);
    if (!srcParent || !dstParent || dstParent.type !== "dir")
        return { error: `no such directory: ${dirName(finalPath)}` };
    const movedName = baseName(finalPath);
    const bad = nameError(movedName) || overwriteError(root, srcNode, finalPath);
    if (bad) return { error: bad };
    delete srcParent.children[baseName(src)];
    srcNode.name = movedName;
    dstParent.children = dstParent.children || {};
    dstParent.children[movedName] = srcNode;
    return { ok: true, path: finalPath };
};

// Walk all files under a directory; yields { path, node }
export const walkFiles = (root, basePath) => {
    const out = [];
    const node = getNode(root, basePath);
    if (!node) return out;
    const visit = (n, p) => {
        if (n.type === "file") {
            out.push({ path: p, node: n });
        } else if (n.type === "dir") {
            for (const child of Object.values(n.children || {})) {
                visit(child, p === "/" ? "/" + child.name : p + "/" + child.name);
            }
        }
    };
    visit(node, basePath);
    return out;
};
