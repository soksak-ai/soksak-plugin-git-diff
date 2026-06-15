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

## Permission Rationale

| Permission | Usage |
|------|--------|
| `ui` | Register the view via `registerView` (sidebar/content placement) |
| `commands` | Execute the `explorer.git` command (query changed file list) |
| `git:read` | Retrieve unified diff via `app.git.diff` (read-only) |

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
