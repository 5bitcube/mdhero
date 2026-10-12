# Custom changes in this fork

This is `5bitcube/mdhero`, branch `custom`. It tracks upstream
`vaibhav-kakde-in/mdhero` `main` (last base: `a1771ce`) and adds the features
below. Nothing here is upstream; treat the branch as a personal build.

Changes are listed in the order they were made. Each entry names the files it
touches so it can be rebased or dropped on its own.

---

## 1. Single-window mode (upstream PR #130, cherry-picked)

Commit `3cfe287` — cherry-pick of `db3060a` from `hdo-projects/mdhero`
("open files in the existing window, as an opt-in setting", closes upstream
issue #71). Unmerged upstream at the time.

Stock MDHero on Windows opens a new window for every file. With this change
a second launch (double-click in Explorer, `mdhero file.md` from a shell)
forwards the path to the running instance, which opens it as a tab.

- Opt-in via **Settings → Behavior → Open files in the existing window**.
- Stored in `%APPDATA%\com.mdhero.app\window-mode.json` as
  `{"openInExistingWindow": true}`.
- Implemented with `tauri-plugin-single-instance`.

Files: `src-tauri/src/single_window.rs` (new), `src-tauri/src/lib.rs`,
`src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`,
`src/lib/components/SettingsDialog.svelte`, `src/lib/utils/platform.ts`,
`tests/unit/platform.test.ts`.

---

## 2. Clickable inline-code links

Inline code spans (`` `like this` ``, not fenced blocks) can be turned into
links without editing the markdown. The mapping lives outside the document,
in a **link file**.

### Link files

Directory: `%APPDATA%\com.mdhero.app\links\` (macOS:
`~/Library/Application Support/com.mdhero.app/links/`, Linux:
`$XDG_CONFIG_HOME/com.mdhero.app/links/`). Every `*.json` in it is scanned;
the file name is irrelevant. Format:

```json
{
  "file": "C:\\Users\\me\\notes\\index.md",
  "links": {
    "server.md":  "C:\\Users\\me\\notes\\server.md",
    "Toolkit\\":  "C:\\Users\\me\\Desktop\\Toolkit",
    "settings":   "C:\\Users\\me\\.claude\\settings.json",
    "dashboard":  "https://example.com/dashboard"
  },
  "aliases": {
    "C:\\Users\\me\\notes\\server.md": "Server (VPS)"
  }
}
```

- `file` — the document this mapping applies to. Compared
  case-insensitively with `/` and `\` treated the same.
- `links` — keys are the exact text of a code span; values are an absolute
  path or an `http(s)` URL.
- `aliases` — optional, see §4.

### Behaviour

- On open and on reload, `load_code_links` is called with the document path
  and the result is cached per path in the `codeLinks` store.
- After render, every `:not(pre) > code` whose trimmed text matches a key
  gets class `code-link`, a pointer cursor, an underline on hover and a click
  handler. URLs open in the system browser; everything else goes through the
  document's local-link handler (§6).

Files: `src-tauri/src/commands.rs` (`load_code_links`, `app_data_dir`,
`normalize_compare_path`), `src/lib/stores/codeLinks.ts` (new),
`src/lib/components/MarkdownRenderer.svelte` (`addCodeLinkHandlers` + CSS),
`src/lib/tauri/files.ts`, `src/routes/+page.svelte`.

---

## 3. Tree view

A fourth segment, **Tree**, joins View / Split / Edit in the toolbar. It only
appears when the active document has at least one code link. It renders the
document's links as a collapsible tree and follows markdown links into their
own link files, so a set of documents becomes a navigable graph.

- `build_link_tree` starts at the open document, loads its link file, and
  recurses into any target that is itself a markdown file. Depth is capped at
  5 and a visited set stops cycles — a document that is linked from several
  places is expanded only the first time it is met.
- Node kinds: `md`, `folder`, `url`, `json`, `txt`, `file`. Each has its own
  icon and colour (light and dark). A path is a folder if it exists as a
  directory or ends in a separator.
- Clicking a node opens it exactly like clicking the code span would.
- The toolbar tooltip reads "View · Split · Edit · Tree" when the segment is
  present.
- Tree mode is **per tab**. Switching a tab to Tree does not affect other
  tabs, and a file opened from the tree lands in View. Coming back to the
  tree tab restores Tree.

Files: `src-tauri/src/commands.rs` (`build_link_tree`, `build_tree_node`,
`classify_path`, `load_links_for_path`), `src/lib/components/TreeView.svelte`
(new), `src/lib/components/Toolbar.svelte`, `src/routes/+page.svelte`
(`treeTabs`, `treeMode`, `setMode`).

---

## 4. Aliases

Any tree node can be given a display name. Right-click a node →
**Rename Alias** turns the label into an inline input (Enter saves, Esc
cancels, blur saves). **Clear Alias** appears when one is set. Saving an empty
value or the original file name clears it.

- Stored in the **parent** document's link file, under `aliases`, keyed by the
  target path. The same file can therefore carry a different alias from each
  document that links to it.
- The root of the tree has no parent, so its alias is stored in its own link
  file, keyed by its own path.
- Aliased labels render in italics; the tooltip shows `original → path`.
- The alias is also used for the **tab label** and the **window title**.
  It is looked up when a file is opened (`get_alias`, which prefers the
  document's own link file, then any other) and refreshed immediately after a
  rename.

Files: `src-tauri/src/commands.rs` (`set_alias`, `get_alias`, `LinkData`,
`LinkTreeNode.alias`), `src/lib/components/TreeView.svelte`,
`src/lib/stores/tabs.ts` (`Tab.alias`, `setAlias`), `src/lib/tauri/files.ts`
(`applyAlias`), `src/lib/components/TabBar.svelte`, `src/routes/+page.svelte`.

---

## 5. View → Tree View filters

A native **View → Tree View** submenu with six check items — Markdown files,
Folders, Web links, JSON files, Text files, Other files. Unchecking one hides
that kind throughout the tree; a node whose visible children are all hidden
loses its chevron.

- Menu item ids are `tree:<kind>`. A click flips the native check state and
  `lib.rs` forwards the id to `window.__mdhero_tree_toggle`, which toggles the
  kind in `settings.treeHiddenKinds` (persisted in `localStorage` with the
  other reader settings).
- Because the menu is native and the setting lives in the webview, the
  frontend calls `set_tree_menu_checks` once on mount so the checkmarks match
  the saved state after a restart.

Files: `src-tauri/src/menu.rs`, `src-tauri/src/lib.rs`,
`src-tauri/src/commands.rs` (`TREE_KINDS`, `set_tree_menu_checks`),
`src/lib/stores/settings.ts`, `src/lib/components/TreeView.svelte`,
`src/routes/+page.svelte`.

---

## 6. Opening folders and JSON files from links

Upstream routes non-markdown links through `tauri-plugin-opener`'s
`openPath`, whose capability scope (`src-tauri/capabilities/default.json`)
only allows a fixed list of extensions (pdf, txt, images, mp4). Folders have
no extension and `.json` is not listed, so both silently failed.

`handleLocalLink` now checks, in order:

1. path does not exist → toast;
2. **directory** → `open_folder` (Explorer / Finder / `xdg-open`);
3. **`.json`** → `open_in_atom`, which launches
   `%LOCALAPPDATA%\atom\atom.exe` (`atom` on PATH elsewhere) and toasts if
   Atom is missing;
4. `.md` / `.markdown` → new tab;
5. executable extensions → refused (unchanged upstream guard);
6. everything else → `openPath` as before.

The new commands bypass the opener scope on purpose; neither can launch
anything other than the file manager or Atom.

Files: `src-tauri/src/commands.rs` (`path_is_dir`, `open_folder`,
`open_in_atom`), `src/lib/tauri/files.ts`, `src/routes/+page.svelte`.

---

## Backend commands added

| Command | Purpose |
|---|---|
| `load_code_links(document_path)` | `links` map for a document, or `{}` |
| `build_link_tree(document_path)` | Recursive `LinkTreeNode` for the Tree view |
| `set_alias(document_path, target_path, alias?)` | Write/remove an alias in the parent's link file |
| `get_alias(document_path)` | Alias for a document, own link file preferred |
| `set_tree_menu_checks(hidden)` | Sync View → Tree View checkmarks from settings |
| `path_is_dir(path)` | Directory test |
| `open_folder(path)` | Open a directory in the OS file manager |
| `open_in_atom(path)` | Open a file in Atom |

All are registered in `src-tauri/src/lib.rs`.

---

## Build and install

```
pnpm install
pnpm tauri build
```

Output: `src-tauri/target/release/mdhero.exe` plus NSIS and MSI bundles under
`src-tauri/target/release/bundle/`. For an in-place update, quit MDHero and
copy the exe over `%LOCALAPPDATA%\MDHero\mdhero.exe`.

If the app self-updates to a stock upstream release every feature above
disappears until the exe is rebuilt and copied again.

---

## Known limitations

- Link and alias keys are matched by exact string after separator/case
  normalisation. A path written with `..` or a different drive-letter form
  will not match.
- The visited set means a document linked from two places shows its children
  only under the first occurrence in traversal order.
- `open_in_atom` hard-codes Atom's install location on Windows. Pointing it
  at another editor is a one-line change in `commands.rs`.
- `open_folder` accepts any existing directory; it is not scoped like
  `openPath`. A link file is user-authored config, so this is accepted.
- Tree View filter state is restored from `localStorage` once on mount;
  editing the setting elsewhere while the app runs will not move the native
  checkmarks until the next launch.
- `src-tauri/Cargo.toml` tends to show as modified on Windows checkouts due to
  CRLF conversion only. Don't commit that noise.
