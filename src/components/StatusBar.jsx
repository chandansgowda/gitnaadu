import { Activity, GitCommit, GitBranch, Hash } from "lucide-react";

export const StatusBar = ({ state, repo, branch }) => {
    const commits = repo ? Object.keys(repo.commits).length : 0;
    const branches = repo ? Object.keys(repo.branches).length : 0;
    const head = repo
        ? repo.HEAD.type === "branch"
            ? repo.branches[repo.HEAD.ref]
            : repo.HEAD.ref
        : null;
    return (
        <div
            className="h-8 px-4 md:px-6 flex items-center justify-between border-t border-surface-3 bg-surface-1/80 backdrop-blur text-[11px] font-mono text-zinc-400"
            data-testid="status-bar"
        >
            <div className="flex items-center gap-4">
                <span className="flex items-center gap-1.5">
                    <Activity className="w-3 h-3 text-emerald-400" />
                    ready
                </span>
                <span>
                    <span className="text-zinc-500">cmds</span>{" "}
                    <span className="text-white">{state.stats?.commands || 0}</span>
                </span>
                {repo && (
                    <>
                        <span className="flex items-center gap-1">
                            <GitCommit className="w-3 h-3 text-yellow" />
                            <span className="text-white">{commits}</span>
                            <span className="text-zinc-500">commits</span>
                        </span>
                        <span className="flex items-center gap-1">
                            <GitBranch className="w-3 h-3 text-sky-400" />
                            <span className="text-white">{branches}</span>
                            <span className="text-zinc-500">branches</span>
                        </span>
                    </>
                )}
            </div>
            <div className="hidden sm:flex items-center gap-4">
                {head && (
                    <span className="flex items-center gap-1">
                        <Hash className="w-3 h-3 text-zinc-500" />
                        <span className="text-yellow">{head}</span>
                    </span>
                )}
                {branch && <span className="text-yellow">{branch}</span>}
                <span className="text-zinc-600">
                    Made with ♥️ by{" "}
                    <a
                        href="https://www.linkedin.com/in/chandan-s-gowda"
                        className="underline hover:text-yellow"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Chandan Gowda
                    </a>
                    {" & "}
                    <a
                        href="https://www.linkedin.com/in/mithungowdab"
                        className="underline hover:text-yellow"
                        target="_blank"
                        rel="noopener noreferrer"
                    >
                        Mithun Gowda
                    </a>
                </span>
            </div>
        </div>
    );
};
