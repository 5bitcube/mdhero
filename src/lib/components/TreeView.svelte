<script lang="ts">
  import { invoke } from "@tauri-apps/api/core";
  import { applyAlias } from "$lib/tauri/files";
  import { settings } from "$lib/stores/settings";

  interface TreeNode {
    name: string;
    path: string;
    kind: "md" | "folder" | "url" | "json" | "txt" | "file";
    alias: string | null;
    children: TreeNode[];
  }

  let {
    filePath = "",
    onLocalLink = (_href: string) => {},
  }: {
    filePath?: string;
    onLocalLink?: (href: string) => void;
  } = $props();

  let tree = $state<TreeNode | null>(null);
  let error = $state("");
  let loading = $state(false);
  let collapsed = $state<Set<string>>(new Set());
  let hidden = $derived(new Set($settings.treeHiddenKinds));

  let renamingPath = $state<string | null>(null);
  let renamingParent = $state<string>("");
  let renameValue = $state("");
  let renameInput = $state<HTMLInputElement | null>(null);

  let ctxMenu = $state<{ x: number; y: number; node: TreeNode; parentPath: string } | null>(null);

  $effect(() => {
    if (filePath) {
      loadTree(filePath);
    } else {
      tree = null;
    }
  });

  $effect(() => {
    if (renamingPath && renameInput) {
      renameInput.focus();
      renameInput.select();
    }
  });

  async function loadTree(path: string) {
    loading = true;
    error = "";
    try {
      tree = await invoke<TreeNode>("build_link_tree", { documentPath: path });
      collapsed = new Set();
    } catch (e) {
      error = String(e);
      tree = null;
    } finally {
      loading = false;
    }
  }

  function toggle(path: string) {
    const next = new Set(collapsed);
    if (next.has(path)) {
      next.delete(path);
    } else {
      next.add(path);
    }
    collapsed = next;
  }

  function handleClick(node: TreeNode) {
    if (node.kind === "url") {
      import("@tauri-apps/plugin-opener")
        .then(({ openUrl }) => openUrl(node.path))
        .catch(() => window.open(node.path, "_blank"));
    } else {
      onLocalLink(node.path);
    }
  }

  function handleContextMenu(e: MouseEvent, node: TreeNode, parentPath: string) {
    e.preventDefault();
    ctxMenu = { x: e.clientX, y: e.clientY, node, parentPath };
  }

  function closeCtxMenu() {
    ctxMenu = null;
  }

  function startRename() {
    if (!ctxMenu) return;
    renamingPath = ctxMenu.node.path;
    renamingParent = ctxMenu.parentPath;
    renameValue = ctxMenu.node.alias ?? ctxMenu.node.name;
    closeCtxMenu();
  }

  function clearAlias() {
    if (!ctxMenu) return;
    const { node, parentPath } = ctxMenu;
    closeCtxMenu();
    invoke("set_alias", { documentPath: parentPath, targetPath: node.path, alias: null })
      .then(() => { loadTree(filePath); applyAlias(node.path); })
      .catch((e) => { error = `Alias error: ${e}`; });
  }

  function commitRename() {
    if (!renamingPath) return;
    const target = renamingPath;
    const parent = renamingParent;
    const value = renameValue.trim();
    renamingPath = null;

    const alias = value && value !== findNodeName(tree, target) ? value : null;
    invoke("set_alias", { documentPath: parent, targetPath: target, alias })
      .then(() => { loadTree(filePath); applyAlias(target); })
      .catch((e) => { error = `Alias error: ${e}`; });
  }

  function cancelRename() {
    renamingPath = null;
  }

  function handleRenameKeydown(e: KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      commitRename();
    } else if (e.key === "Escape") {
      e.preventDefault();
      cancelRename();
    }
  }

  function findNodeName(node: TreeNode | null, targetPath: string): string | null {
    if (!node) return null;
    if (node.path === targetPath) return node.name;
    for (const child of node.children) {
      const found = findNodeName(child, targetPath);
      if (found) return found;
    }
    return null;
  }

  const KIND_COLORS: Record<string, string> = {
    md: "var(--tree-md)",
    folder: "var(--tree-folder)",
    url: "var(--tree-url)",
    json: "var(--tree-json)",
    txt: "var(--tree-txt)",
    file: "var(--tree-file)",
  };

  const KIND_ICONS: Record<string, string> = {
    md: "📄",
    folder: "📁",
    url: "🔗",
    json: "📋",
    txt: "📝",
    file: "📎",
  };
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="tree-root" onclick={closeCtxMenu}>
  {#if loading}
    <p class="tree-msg">Loading tree…</p>
  {:else if error}
    <p class="tree-msg tree-err">{error}</p>
  {:else if tree}
    <div class="tree-scroll">
      {#snippet renderNode(node: TreeNode, depth: number, parentPath: string)}
        {@const visibleChildren = node.children.filter((c) => !hidden.has(c.kind))}
        {@const hasChildren = visibleChildren.length > 0}
        {@const isCollapsed = collapsed.has(node.path)}
        {@const isRenaming = renamingPath === node.path}
        {@const displayName = node.alias ?? node.name}
        <div class="tree-node" style="--depth: {depth}">
          <!-- svelte-ignore a11y_no_static_element_interactions -->
          <div
            class="tree-row"
            style="padding-left: {depth * 24 + 12}px"
            oncontextmenu={(e) => handleContextMenu(e, node, parentPath)}
          >
            {#if hasChildren}
              <button class="tree-toggle" onclick={() => toggle(node.path)}>
                <svg
                  width="12" height="12" viewBox="0 0 12 12"
                  class="tree-chevron"
                  class:rotated={!isCollapsed}
                >
                  <path d="M4 2l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
              </button>
            {:else}
              <span class="tree-toggle-spacer"></span>
            {/if}
            <span class="tree-icon">{KIND_ICONS[node.kind] ?? "📄"}</span>
            {#if isRenaming}
              <input
                class="tree-rename-input"
                type="text"
                bind:this={renameInput}
                bind:value={renameValue}
                onblur={commitRename}
                onkeydown={handleRenameKeydown}
              />
            {:else}
              <button
                class="tree-label"
                class:has-alias={!!node.alias}
                style="color: {KIND_COLORS[node.kind] ?? 'inherit'}"
                onclick={() => handleClick(node)}
                title={node.alias ? `${node.name} → ${node.path}` : node.path}
              >
                {displayName}
              </button>
            {/if}
          </div>
          {#if hasChildren && !isCollapsed}
            {#each visibleChildren as child}
              {@render renderNode(child, depth + 1, node.path)}
            {/each}
          {/if}
        </div>
      {/snippet}
      {@render renderNode(tree, 0, filePath)}
    </div>
  {:else}
    <p class="tree-msg">No link data for this document.</p>
  {/if}

  {#if ctxMenu}
    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div class="ctx-backdrop" onclick={closeCtxMenu} oncontextmenu={(e) => { e.preventDefault(); closeCtxMenu(); }}>
      <div class="ctx-menu" style="left: {ctxMenu.x}px; top: {ctxMenu.y}px">
        <button class="ctx-item" onclick={startRename}>Rename Alias</button>
        {#if ctxMenu.node.alias}
          <button class="ctx-item" onclick={clearAlias}>Clear Alias</button>
        {/if}
      </div>
    </div>
  {/if}
</div>

<style>
  :root {
    --tree-md: #0891b2;
    --tree-folder: #d97706;
    --tree-url: #7c3aed;
    --tree-json: #16a34a;
    --tree-txt: #0d9488;
    --tree-file: #6b7280;
  }

  :global(html.dark) .tree-root {
    --tree-md: #22d3ee;
    --tree-folder: #fbbf24;
    --tree-url: #a78bfa;
    --tree-json: #4ade80;
    --tree-txt: #2dd4bf;
    --tree-file: #9ca3af;
  }

  .tree-root {
    width: 100%;
    height: 100%;
    overflow: hidden;
    display: flex;
    flex-direction: column;
    padding: 16px;
    box-sizing: border-box;
    position: relative;
  }

  .tree-scroll {
    flex: 1;
    overflow-y: auto;
    overflow-x: auto;
    padding: 8px 0;
  }

  .tree-msg {
    text-align: center;
    color: #6b7280;
    margin-top: 64px;
    font-size: 14px;
  }

  :global(html.dark) .tree-msg {
    color: #9ca3af;
  }

  .tree-err {
    color: #ef4444;
  }

  .tree-node {
    user-select: none;
  }

  .tree-row {
    display: flex;
    align-items: center;
    gap: 4px;
    height: 32px;
    border-radius: 6px;
    transition: background 0.1s;
  }

  .tree-row:hover {
    background: rgba(0, 0, 0, 0.04);
  }

  :global(html.dark) .tree-row:hover {
    background: rgba(255, 255, 255, 0.06);
  }

  .tree-toggle {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 18px;
    height: 18px;
    border: none;
    background: none;
    color: #6b7280;
    cursor: pointer;
    padding: 0;
    flex-shrink: 0;
  }

  :global(html.dark) .tree-toggle {
    color: #9ca3af;
  }

  .tree-toggle-spacer {
    width: 18px;
    flex-shrink: 0;
  }

  .tree-chevron {
    transition: transform 0.15s ease;
  }

  .tree-chevron.rotated {
    transform: rotate(90deg);
  }

  .tree-icon {
    font-size: 14px;
    flex-shrink: 0;
    width: 20px;
    text-align: center;
  }

  .tree-label {
    border: none;
    background: none;
    font: inherit;
    font-size: 13px;
    cursor: pointer;
    padding: 2px 4px;
    border-radius: 3px;
    white-space: nowrap;
    text-align: left;
    transition: background 0.1s;
  }

  .tree-label.has-alias {
    font-style: italic;
  }

  .tree-label:hover {
    background: rgba(0, 0, 0, 0.06);
    text-decoration: underline;
  }

  :global(html.dark) .tree-label:hover {
    background: rgba(255, 255, 255, 0.08);
  }

  .tree-rename-input {
    font: inherit;
    font-size: 13px;
    padding: 1px 4px;
    border: 1px solid #0891b2;
    border-radius: 3px;
    background: #fff;
    color: #1f2937;
    outline: none;
    min-width: 80px;
  }

  :global(html.dark) .tree-rename-input {
    background: #1f2937;
    color: #f3f4f6;
    border-color: #22d3ee;
  }

  .ctx-backdrop {
    position: fixed;
    inset: 0;
    z-index: 1000;
  }

  .ctx-menu {
    position: fixed;
    z-index: 1001;
    background: #fff;
    border: 1px solid #e5e7eb;
    border-radius: 6px;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.12);
    padding: 4px 0;
    min-width: 140px;
  }

  :global(html.dark) .ctx-menu {
    background: #1f2937;
    border-color: #374151;
    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.4);
  }

  .ctx-item {
    display: block;
    width: 100%;
    border: none;
    background: none;
    font: inherit;
    font-size: 13px;
    padding: 6px 16px;
    text-align: left;
    cursor: pointer;
    color: #1f2937;
  }

  :global(html.dark) .ctx-item {
    color: #f3f4f6;
  }

  .ctx-item:hover {
    background: #f3f4f6;
  }

  :global(html.dark) .ctx-item:hover {
    background: #374151;
  }
</style>
