import { fetchGitHubClone, parseGitHubCloneUrl } from "../githubClone";

const response = (body, contentType = "application/json") => ({
    ok: true,
    status: 200,
    statusText: "OK",
    headers: { get: () => contentType },
    json: async () => body,
    text: async () => body,
});

describe("GitHub clone downloads", () => {
    test("accepts HTTPS and SSH GitHub URLs and rejects other hosts", () => {
        expect(parseGitHubCloneUrl("https://github.com/acme/demo.git")).toEqual({
            owner: "acme",
            repository: "demo",
        });
        expect(parseGitHubCloneUrl("git@github.com:acme/demo.git")).toEqual({
            owner: "acme",
            repository: "demo",
        });
        expect(() => parseGitHubCloneUrl("https://gitlab.com/acme/demo.git")).toThrow(
            /only public GitHub clone URLs/,
        );
    });

    test("downloads commit snapshots for the default branch", async () => {
        const fetchImpl = jest.fn(async (url) => {
            if (url === "https://api.github.com/repos/acme/demo") {
                return response({ name: "demo", default_branch: "main" });
            }
            if (url.includes("/commits?sha=main")) {
                return response([
                    {
                        sha: "abc1234",
                        parents: [],
                        commit: {
                            tree: { sha: "tree123" },
                            message: "initial",
                            author: { name: "student", date: "2025-01-01T00:00:00.000Z" },
                        },
                    },
                ]);
            }
            if (url.includes("/git/trees/tree123")) {
                return response({
                    truncated: false,
                    tree: [
                        { type: "blob", mode: "100644", path: "README.md", sha: "blob123", size: 6 },
                    ],
                });
            }
            if (url.startsWith("https://raw.githubusercontent.com/")) {
                return response("hello\n", "text/plain");
            }
            throw new Error(`Unexpected request: ${url}`);
        });

        const clone = await fetchGitHubClone("https://github.com/acme/demo.git", fetchImpl);
        expect(clone.name).toBe("demo");
        expect(clone.branch).toBe("main");
        expect(clone.commits[0]).toMatchObject({
            hash: "abc1234",
            message: "initial",
            files: { "README.md": "hello\n" },
        });
        expect(fetchImpl).toHaveBeenCalledTimes(4);
    });

    test("supports an empty repository", async () => {
        const fetchImpl = jest.fn(async () => response({ name: "empty", default_branch: null }));
        await expect(fetchGitHubClone("https://github.com/acme/empty.git", fetchImpl)).resolves.toEqual({
            name: "empty",
            branch: "main",
            commits: [],
        });
        expect(fetchImpl).toHaveBeenCalledTimes(1);
    });

    test("rejects repository trees containing symlinks", async () => {
        const fetchImpl = jest.fn(async (url) => {
            if (url === "https://api.github.com/repos/acme/demo") {
                return response({ name: "demo", default_branch: "main" });
            }
            if (url.includes("/commits?sha=main")) {
                return response([
                    {
                        sha: "abc1234",
                        commit: { tree: { sha: "tree123" }, message: "initial" },
                    },
                ]);
            }
            if (url.includes("/git/trees/tree123")) {
                return response({
                    truncated: false,
                    tree: [{ type: "blob", mode: "120000", path: "link", sha: "blob123", size: 4 }],
                });
            }
            throw new Error(`Unexpected request: ${url}`);
        });
        await expect(fetchGitHubClone("https://github.com/acme/demo.git", fetchImpl)).rejects.toThrow(
            /does not support symlinks or submodules/,
        );
    });
});
