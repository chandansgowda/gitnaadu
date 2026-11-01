# GitNaadu

A fully **client-side Git simulator and learning playground**. It runs an
in-browser Git engine (no backend, no real `git`) so you can experiment with
commits, branches, merges, diffs, remotes, and guided challenges — all from a
simulated terminal with a live commit-graph visualizer.

Everything runs in the browser: the "filesystem", the Git object model, and the
command parser all live in `src/lib/`.

A fresh or reset playground opens in `~/python-project`, with its sample files
already committed on the `main` branch.

## Using the terminal

The terminal starts in `~/python-project`, a sample repository on `main`. Try
renaming a file and checking the repository status:

```text
mv main.py main1.py
mv main1.py main.py
git status
```

Unknown commands (for example, `sudo apt install`) are not run on your
computer; GitNaadu reports that the command is unavailable in the simulator.
Run `help` to see supported commands.

As you type, inline suggestions complete commands, Git subcommands, and paths.
Press `Tab` or `→` to accept a suggestion. `Tab` also completes paths when
there is no inline suggestion.

## Cloning a GitHub repository

Run `git clone https://github.com/<owner>/<repo>.git` from the terminal to
download a public GitHub repository directly into the virtual filesystem. For
example:

```text
git clone https://github.com/octocat/Hello-World.git
```

Cloning includes the default branch and its most recent 20 commits. Other
branches and Git hosting providers are not included. GitHub API limits, binary
files, symlinks, submodules, more than 1,000 files in a commit, or more than
20 MB of unique file contents in the cloned history are reported as errors.
The app uses no backend or GitHub credentials.

## Tech stack

- **React 18** (with React Fast Refresh in dev)
- **Webpack 5** + Babel — bundling and dev server
- **Tailwind CSS 3** + [`tailwindcss-animate`] — styling (shadcn/ui-style tokens)
- **Radix UI**, **lucide-react**, **framer-motion**, **sonner** — UI primitives

## Getting started

```bash
npm install      # install dependencies
npm run dev      # start the dev server at http://localhost:3000
npm run build    # produce a production bundle in dist/
npm test         # run the engine unit tests (Jest)
```

`npm start` is an alias for `npm run dev`.

## Project layout

```
src/
  index.js          # React entry point
  index.css         # Tailwind directives + custom global styles
  App.js            # top-level layout, wires panels + hooks together
  components/       # UI panels (Terminal, GitTree, Editor, DiffView, ...)
    ui/             # shadcn/ui-style primitives (button, dialog, tabs, ...)
  hooks/            # useGitNaadu (state), useChallenges, useSound
  lib/              # the simulator core
    gitEngine.js    #   in-memory Git object model + operations
    merge3.js       #   three-way merge + conflict markers
    graphLayout.js  #   commit-graph lanes for the Git Tree panel
    commands.js     #   parses/executes terminal commands
    filesystem.js   #   virtual filesystem
    objects.js      #   safe own-property lookups for name-keyed maps
    diff.js         #   diffing
    __tests__/      #   Jest tests for the simulator core
    challenges.js   #   guided lessons/challenges
    initialState.js #   starter filesystem and repository
    githubClone.js  #   public GitHub clone downloads
public/
  index.html        # HTML template (webpack injects the bundle)
```

The `@/` import alias maps to `src/` (configured in `webpack.config.js` and
`jsconfig.json`).
