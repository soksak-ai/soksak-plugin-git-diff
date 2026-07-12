# Git Diff (soksak-plugin-git-diff)

A view plugin that shows the list of changed files in a project and renders the unified diff
of a selected file with line-level colouring (additions `+`, deletions `-`, hunks `@@`).
The `staged` checkbox in the top bar switches between the working-tree diff and the
index (`--cached`) diff.

## What It Does

- Opens a "Git Diff" view (icon `±`) in the right sidebar (default) or content area.
- Changed file list: status badge (M modified / A added / D deleted / R renamed / ? untracked) + path.
- Click a file → unified diff. `+` lines in green (`var(--ok)`), `-` lines in red, `@@` lines highlighted.
- `⟳` button refreshes. `staged` toggle switches to index diff. Shows "No changes" when there are none.
- Failures (non-git directory, no root, etc.) are displayed as error text inside the view (no silent failures).
- Exposes the same data headlessly as commands: `files` (changed file list) and `read` (diff text).

## Commands

Everything the view shows is also readable without the view (agent/CLI/MCP surface).

| Command | Params | Returns |
|------|--------|------|
| `plugin.soksak-plugin-git-diff.files` | `path?` (repository path; defaults to the active project root) | `{ files: [{path,status}] }` — the same source as the view's file list |
| `plugin.soksak-plugin-git-diff.read` | `path?`, `file?` (repository-relative; omit for the whole repo), `staged?` (default false) | `{ diff, file?, staged }` — the same source as the view's diff pane |

```sh
sok plugin.soksak-plugin-git-diff.files
sok plugin.soksak-plugin-git-diff.read '{"file":"src/main.ts","staged":true}'
```

Responses follow the standard envelope (`{ok, code, message, data}`); failures propagate the
provider's error code (e.g. `NO_PATH` when neither `path` nor an active project exists).

## The git provider

This plugin runs no git. It delegates `status` and `diff` to a plugin implementing
**`soksak-git-spec@1`**, and it finds that plugin **by contract, never by name**
(`plugin.implementers` → the enabled implementer). Swap the implementer and nothing here changes.
No enabled implementer is a loud refusal (`NO_GIT_PROVIDER`), never an empty list — an empty list
would read as "no changes", which is the worse lie.

The manifest still declares `dependencies: { "soksak-plugin-git-core": "^0.1.0" }`. That is **not**
this plugin's choice: the core's cross-plugin gate currently admits a call only when the target's
plugin id appears in `dependencies`, so a contract-pinned consumer cannot reach its provider without
it. **Remove that line when the core accepts a contract-pin declaration on the consumer side** — the
code needs no change, because the code already names no implementer. Verify by disabling git-core,
enabling a different implementer of the contract, and re-running `files`.

## Tests

```sh
npm test   # node --test — manifest≡registration conformance, spec fields, envelope behaviour
```

## Permission Rationale

| Permission | Usage |
|------|--------|
| `ui` | Register the view via `registerView` (sidebar/content placement) |
| `commands` | Execute the provider's `status` / `diff` commands + register the `files` / `read` commands |
| `terminal` | Open the repository's directory context for the view |

No write permission — makes no changes to git.

## Installation

```sh
# Install from a local directory
sok plugin.install '{"source":"/path/to/examples/plugins/soksak-plugin-git-diff"}'
```

After installation, activate (consent) the plugin in the app's plugin settings. The `±` icon
will appear in the right sidebar icon rail. Activation consent must be given by a human inside
the app.

## Usage

1. Press the `±` icon in the right sidebar to open the view (content area placement also supported).
2. Click a file in the changed file list to show its diff below.
3. Check `staged` to see the diff of index (staged) changes.
4. Press `⟳` to reload the list and diff.

## DOM Exposure (Structural Addresses)

The host accesses elements of this view via structural path addresses instead of arbitrary CSS
selectors (`win/<label>/<region>/view/soksak-plugin-git-diff.view/node/<nodePath>`). Only the
nodes listed below are exposed (declared in manifest `contributes.nodes` — shown on the consent
screen); all other elements are not accessible.

| Node | data-node | Description |
|------|-----------|------|
| File row | `file/<path>` | Changed file row — click to show diff. Stable key = file path (lowercased; disallowed characters replaced with `-`). |
| staged | `staged` | staged checkbox — toggle between working-tree diff and index (`--cached`) diff. |
| refresh | `refresh` | Refresh button — reload list and diff. |
