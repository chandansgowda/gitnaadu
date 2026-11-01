// Initial Virtual File System for /home/student
// Structure: each dir has children: { name: node }, each file has content: string
// type: 'dir' | 'file'
import { newRepo, workingSnapshot } from "./gitEngine";

export const HOME = "/home/student";
export const PYTHON_PROJECT = `${HOME}/python-project`;

export const buildInitialFS = () => ({
    type: "dir",
    name: "/",
    children: {
        home: {
            type: "dir",
            name: "home",
            children: {
                student: {
                    type: "dir",
                    name: "student",
                    children: {
                        "portfolio-website": {
                            type: "dir",
                            name: "portfolio-website",
                            children: {
                                "index.html": {
                                    type: "file",
                                    name: "index.html",
                                    content: `<!doctype html>
<html>
  <head><title>My Portfolio</title></head>
  <body>
    <h1>Hello, I'm a developer in Karnataka.</h1>
    <p>Built with love, learning Git with GitNaadu.</p>
  </body>
</html>
`,
                                },
                                "style.css": {
                                    type: "file",
                                    name: "style.css",
                                    content: `body { font-family: sans-serif; background: #0b0b0b; color: #fafafa; }
h1 { color: #ffd700; }
`,
                                },
                                "app.js": {
                                    type: "file",
                                    name: "app.js",
                                    content: `console.log("Welcome to my portfolio");
`,
                                },
                            },
                        },
                        "python-project": {
                            type: "dir",
                            name: "python-project",
                            children: {
                                "main.py": {
                                    type: "file",
                                    name: "main.py",
                                    content: `def main():
    print("Namaskara, GitNaadu!")

if __name__ == "__main__":
    main()
`,
                                },
                                "requirements.txt": {
                                    type: "file",
                                    name: "requirements.txt",
                                    content: `requests==2.31.0
rich==13.7.0
`,
                                },
                            },
                        },
                        notes: {
                            type: "dir",
                            name: "notes",
                            children: {
                                "git-basics.txt": {
                                    type: "file",
                                    name: "git-basics.txt",
                                    content: `Git Basics
==========
- git init     : create a new repository
- git add      : stage changes
- git commit   : save a snapshot
- git branch   : list / create branches
- git checkout : switch branches
- git merge    : combine histories

Try them inside the portfolio-website folder!
`,
                                },
                            },
                        },
                    },
                },
            },
        },
    },
});

export const buildInitialRepos = (fsRoot) => {
    const repo = newRepo(PYTHON_PROJECT);
    const files = workingSnapshot(fsRoot, repo);
    const hash = "a1b2c3d";
    const date = "2025-01-01T00:00:00.000Z";
    repo.commits[hash] = {
        hash,
        parents: [],
        message: "Initial Python project",
        files,
        author: "student",
        date,
        branch: "main",
    };
    repo.branches.main = hash;
    repo.tracked = { ...files };
    repo.reflog.unshift({
        ts: date,
        op: "commit",
        oldHash: null,
        newHash: hash,
        message: "Initial Python project",
    });
    return { [PYTHON_PROJECT]: repo };
};

export const WELCOME_LINES = [
    {
        kind: "system",
        text: "GitNaadu Terminal v1.0 by ",
        link: { text: "Engineering in Kannada", href: "https://www.youtube.com/@EngineeringinKannada" },
    },
    { kind: "system", text: "A safe sandbox to learn Git visually." },
    { kind: "muted", text: "Type `help` to see available commands." },
    { kind: "muted", text: "" },
];
