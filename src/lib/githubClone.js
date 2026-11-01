const HISTORY_LIMIT = 20;
const FILE_LIMIT = 1000;
const BLOB_LIMIT = 2500;
const CONTENT_LIMIT = 20 * 1024 * 1024;
const REQUEST_CONCURRENCY = 6;

export const parseGitHubCloneUrl = (value) => {
    const httpsMatch = value.match(/^https:\/\/github\.com\/([^/]+)\/([^/?#]+?)(?:\.git)?\/?$/i);
    const sshMatch = value.match(/^git@github\.com:([^/]+)\/([^/]+?)(?:\.git)?$/i);
    const match = httpsMatch || sshMatch;
    if (!match) {
        throw new Error("only public GitHub clone URLs are supported (https://github.com/<owner>/<repo>.git)");
    }
    try {
        return {
            owner: decodeURIComponent(match[1]),
            repository: decodeURIComponent(match[2]),
        };
    } catch {
        throw new Error("the GitHub URL contains invalid percent-encoding.");
    }
};

const request = async (fetchImpl, url, accept) => {
    let response;
    try {
        response = await fetchImpl(url, {
            headers: { Accept: accept },
        });
    } catch (error) {
        throw new Error(`GitHub request failed: ${error instanceof Error ? error.message : "network error"}`);
    }
    if (!response.ok) {
        let detail = "";
        try {
            const body = await response.json();
            detail = body.message || "";
        } catch {
            detail = "";
        }
        if (response.status === 403 || response.status === 429) {
            throw new Error(`GitHub API limit or access restriction: ${detail || "retry later"}`);
        }
        throw new Error(`GitHub request failed (${response.status}): ${detail || response.statusText || "unknown error"}`);
    }
    return response;
};

const mapLimit = async (items, limit, task) => {
    const results = new Array(items.length);
    let next = 0;
    const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
        while (next < items.length) {
            const index = next++;
            results[index] = await task(items[index], index);
        }
    });
    await Promise.all(workers);
    return results;
};

const checkedPath = (path) => {
    const parts = path.split("/");
    if (
        !path ||
        path.startsWith("/") ||
        parts.some((part) => !part || part === "." || part === ".." || part === "__proto__")
    ) {
        throw new Error(`GitHub repository contains an unsupported file path: ${path}`);
    }
    return path;
};

export const fetchGitHubClone = async (url, fetchImpl = globalThis.fetch) => {
    if (typeof fetchImpl !== "function") throw new Error("This browser does not support repository downloads.");
    const { owner, repository } = parseGitHubCloneUrl(url);
    const repoPath = `${encodeURIComponent(owner)}/${encodeURIComponent(repository.replace(/\.git$/i, ""))}`;
    const api = `https://api.github.com/repos/${repoPath}`;
    const metadataResponse = await request(fetchImpl, api, "application/vnd.github+json");
    const metadata = await metadataResponse.json();
    if (!metadata.name) throw new Error("GitHub repository metadata is missing its name.");
    const branch = metadata.default_branch || "main";
    if (!metadata.default_branch) return { name: metadata.name, branch, commits: [] };
    const commitsResponse = await request(
        fetchImpl,
        `${api}/commits?sha=${encodeURIComponent(branch)}&per_page=${HISTORY_LIMIT}`,
        "application/vnd.github+json",
    );
    const listedCommits = await commitsResponse.json();
    if (!Array.isArray(listedCommits)) throw new Error("GitHub returned an invalid commit list.");
    const commitRecords = listedCommits.slice(0, HISTORY_LIMIT);

    const trees = await mapLimit(commitRecords, REQUEST_CONCURRENCY, async (commit) => {
        const treeSha = commit.commit?.tree?.sha;
        if (!commit.sha || !treeSha) throw new Error("GitHub returned incomplete commit information.");
        const response = await request(
            fetchImpl,
            `${api}/git/trees/${encodeURIComponent(treeSha)}?recursive=1`,
            "application/vnd.github+json",
        );
        const tree = await response.json();
        if (tree.truncated) {
            throw new Error(`The repository tree for ${commit.sha.slice(0, 7)} is too large to clone.`);
        }
        if (!Array.isArray(tree.tree)) throw new Error("GitHub returned an invalid repository tree.");
        const unsupported = tree.tree.find(
            (entry) =>
                entry.mode === "120000" ||
                entry.mode === "160000" ||
                (entry.type === "blob" && entry.mode !== "100644" && entry.mode !== "100755"),
        );
        if (unsupported) {
            throw new Error(`This clone does not support symlinks or submodules (${unsupported.path}).`);
        }
        const files = tree.tree.filter((entry) => entry.type === "blob" && (entry.mode === "100644" || entry.mode === "100755"));
        if (files.length > FILE_LIMIT) {
            throw new Error(`This clone supports at most ${FILE_LIMIT} files per commit snapshot.`);
        }
        return files.map((entry) => ({
            path: checkedPath(entry.path),
            sha: entry.sha,
            size: entry.size,
            commit: commit.sha,
        }));
    });

    const uniqueBlobs = new Map();
    for (const tree of trees) {
        for (const file of tree) {
            if (!file.sha) throw new Error(`GitHub returned a file without a blob ID: ${file.path}`);
            if (!uniqueBlobs.has(file.sha)) uniqueBlobs.set(file.sha, file);
        }
    }
    if (uniqueBlobs.size > BLOB_LIMIT) {
        throw new Error(`This clone exceeds the limit of ${BLOB_LIMIT} unique files across its history.`);
    }
    const declaredBytes = [...uniqueBlobs.values()].reduce((total, file) => total + (file.size || 0), 0);
    if (declaredBytes > CONTENT_LIMIT) {
        throw new Error("This clone exceeds the 20 MB content limit for its recent history.");
    }

    let downloadedBytes = 0;
    const contents = new Map();
    await mapLimit([...uniqueBlobs.values()], REQUEST_CONCURRENCY, async (file) => {
        const path = file.path.split("/").map(encodeURIComponent).join("/");
        const response = await request(
            fetchImpl,
            `https://raw.githubusercontent.com/${encodeURIComponent(owner)}/${encodeURIComponent(repository.replace(/\.git$/i, ""))}/${encodeURIComponent(file.commit)}/${path}`,
            "text/plain, application/octet-stream",
        );
        const contentType = response.headers?.get("content-type") || "";
        if (contentType.includes("application/octet-stream")) {
            throw new Error(`Binary file contents are not supported: ${file.path}`);
        }
        const content = await response.text();
        downloadedBytes += new TextEncoder().encode(content).length;
        if (downloadedBytes > CONTENT_LIMIT) {
            throw new Error("This clone exceeds the 20 MB content limit for its recent history.");
        }
        contents.set(file.sha, content);
    });

    const commits = commitRecords.map((commit, index) => {
        const files = {};
        for (const file of trees[index]) files[file.path] = contents.get(file.sha);
        return {
            hash: commit.sha,
            parents: (commit.parents || []).map((parent) => parent.sha),
            message: commit.commit.message || "No commit message",
            author: commit.commit.author?.name || commit.author?.login || "unknown",
            date: commit.commit.author?.date || new Date().toISOString(),
            files,
        };
    });

    return { name: metadata.name, branch, commits };
};
