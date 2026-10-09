# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm install      # install dependencies
npm run dev      # dev server at http://localhost:3000 (alias: npm start)
npm run build    # production bundle into dist/
npm test         # Jest unit tests for src/lib (engine, shell parser, merge)
```

There is **no linter**. Verify a change with `npm test` (engine behaviour, in `src/lib/__tests__/`) and `npm run build` (compiles the whole app), plus manual checking in `npm run dev` for UI work.

**Gotcha:** webpack does not hot-reload `webpack.config.js`. After editing it you must stop and restart the dev server, or you'll get stale "no loader configured" errors for source that the new config actually handles.

## Big picture

GitNaadu is a 100% client-side Git simulator — there is no backend and no real `git`. A virtual filesystem, an in-memory Git object model, and a shell command parser all live in `src/lib/` and are driven from a fake terminal, with a live commit-graph visualizer beside it. See `README.md` for the file layout.

### One state object, persisted to localStorage

The entire app is a single JSON-serializable object owned by `useGitNaadu` (`src/hooks/useGitNaadu.js`):

```
{ fs, cwd, repos, history, lines, lastHighlight, stats, challenges }
```

- It is persisted to `localStorage["gitnaadu:v1"]` (debounced 250ms) and revived on load (`reviveState` handles back-compat for older saves and runs `ensureRepoShape` on every repo). If the save doesn't fit, scrollback is dropped; if it still fails, a toast warns the user once.
- **State must stay JSON-safe** (it is persisted as JSON) — no functions, class instances, Maps, or circular refs.
- **State is immutable.** Undo/redo keep plain *references* to previous states, so never mutate an existing state object. Build new objects, or clone first (`executeCommand` clones `fs` and `repos` via `cloneWorld`; Editor / RemotePanel clone before writing).
- Undo/redo: call `setState(updater, { record: true })` to push a checkpoint *before* applying. `past`/`future` stacks cap at 60. `setState` also caps `lines` (1000) and `history` (500). The Terminal records on every command; most other mutations (editor saves, remote panel) decide per-action whether to record.

### The command pipeline

This is the spine of the app. Terminal input is handled by one pure function:

```
executeCommand(state, rawLine)  →  { state, output, highlight }
```

defined in `src/lib/commands.js`. A small lexer handles quotes, backslash escapes and the operators `&&`, `||`, `;`, `>` and `>>`. Pipes and `&` give a clear error. Each simple command is dispatched through the `HANDLERS` / `GIT_HANDLERS` maps. A command fails when it sets `failed` or emits an `err` line, and that drives `&&` / `||`.

- **Git operations** delegate to functions in `src/lib/gitEngine.js` (`gitCommit`, `gitMerge`, `gitRebase`, …). These mutate the (already cloned) repo and return either a result or `{ error }`. Three-way merging lives in `merge3.js`; commit-graph layout lives in `graphLayout.js`.
- **Filesystem operations** delegate to `src/lib/filesystem.js` (path normalization, `getNode`, `createFile`, `makeDir`, `move`, …). `rm` / `mv` / `cp` in `commands.js` keep `state.repos` in step when a repo folder is removed, moved or copied.
- **Name-keyed maps** (dir `children`, `tracked`, `staged`, `branches`, …) are plain objects. Look keys up with `has` / `get` from `src/lib/objects.js`, never `in` or `obj[key]`, or a file named `constructor` breaks. `__proto__` is rejected as a file or ref name.
- `output` is an array of line objects with a `kind`: plain kinds (`out`/`err`/`muted`/`system`/`success`) plus structured kinds (`ls`, `log-commit`, `prompt`, `clear`). The Terminal's `Line` component renders by kind — adding a new structured output means adding a `kind` and a matching render branch there.

### `highlight` is the cross-component event bus

When a command does something visual it returns a `highlight` like `{ kind: "git-commit", ... }`. That single object fans out to three places:

1. **`App.js`** switches the right-panel tab based on `highlight.kind` (e.g. `git-diff` → Diff tab, `git-push`/`git-fetch` → Remote tab, tree-mutating kinds → Git Tree tab). The set of "show tree" kinds is hardcoded in an effect in `App.js`.
2. **`CommandExplainer`** renders a teaching explanation for the kind.
3. **`useSound`** (`soundForHighlight`) maps the kind to a sound effect.

So **adding a new git command touches a predictable chain**: implement the op in `gitEngine.js` → dispatch + return a `highlight` in `commands.js` → (if it should change panels) add its kind to the tab-switch effect in `App.js` → add explanation copy in `CommandExplainer` → add a sound mapping in `useSound`.

### Git object model

A repo in `state.repos` (see `newRepo` in `gitEngine.js`) looks like:

```
{ path, commits: {[hash]: Commit}, branches: {[name]: hash},
  HEAD: { type: 'branch'|'detached', ref }, tags, staged, tracked,
  remote: { branches, commits, url }, remoteRefs, remotes: { origin },
  merging: null | { head, label, message, conflicts: [path], kinds } }
```

- **Merge conflicts:** `git merge` / `git pull` can stop half-way. `repo.merging` is then set, the working tree holds conflict markers, and HEAD doesn't move. `git add` marks files resolved, `git commit` (or `merge --continue`) creates the two-parent commit, and `merge --abort` / any `reset` cancels. Most history-changing commands refuse to run mid-merge (`blockedByMerge` in `commands.js`). Rebase, cherry-pick and revert do three-way applies too, but on a conflict they refuse and change nothing.
- **One remote:** only `origin` exists. `git remote remove origin` disconnects push/fetch/pull until `git remote add origin <url>`.

HEAD can be **detached** — engine functions and any new code reading HEAD must handle both `type: 'branch'` (resolve via `repo.branches[ref]`) and `type: 'detached'` (`ref` is the commit hash). Use the `headCommit(repo)` / `currentBranch(repo)` / `findRepo(repos, cwd)` helpers rather than reaching into the shape directly.

### Layout & challenges

Below Tailwind's `lg` breakpoint (`useIsMobile` in `src/hooks/useViewport.js`) `App.js` renders a separate phone layout: compact `Header` (`isMobile`), one full-screen view at a time chosen by `MobileNav` (bottom tabs; `tab` gains a `"terminal"` value), and a docked terminal input with history / run buttons. On phones a `highlight` badges the target tab instead of switching away from the terminal. `useVisualViewport` sets `--app-height` so the layout sits above the on-screen keyboard. The workspace panels are defined once in `panels` and shared by both layouts.


`App.js` is a two-pane shell: `Header` on top, left = `Terminal`, right = tabbed workspace (Git Tree / Files / Editor / Diff / Remote) whose active tab is `tab` state auto-driven by `highlight`, then `StatusBar` and overlay dialogs (`WelcomeOverlay`, `ChallengePanel`).

Guided lessons live in `src/lib/challenges.js`; `useChallenges` watches the latest `lastCommand` / `highlight` to auto-advance steps, and progress is stored in `state.challenges`.

## Conventions

- `@/` import alias maps to `src/` (configured in both `webpack.config.js` and `jsconfig.json`), though most existing files use relative imports.
- Images are bundled via webpack asset modules (`type: "asset"` for `png|jpe?g|gif|svg|webp`) — `import` them as modules. `public/` is **not** copied wholesale: only the HTML template + `favicon.svg` (via `HtmlWebpackPlugin`) and the files listed in the `CopyWebpackPlugin` patterns (OG image, web manifest, app icons). Add new root-served files to that list. `public/sw.js` is a retired service worker: an earlier build shipped offline caching, and this file (plus a snippet in `src/index.js`) unregisters it and clears its caches on devices that still have it.
- The brand accent is `yellow` = `#ffd700` (Tailwind theme token), used bare as `bg-yellow` / `text-yellow`. Surface shades are `surface-0..3`.
- UI primitives in `src/components/ui/` are shadcn/ui-style; key panels carry `data-testid` attributes.
