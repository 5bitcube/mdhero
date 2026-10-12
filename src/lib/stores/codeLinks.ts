import { writable } from "svelte/store";
import { invoke } from "@tauri-apps/api/core";

const cache = new Map<string, Record<string, string>>();

export const codeLinks = writable<Record<string, string>>({});

export async function loadCodeLinks(documentPath: string): Promise<void> {
  const cached = cache.get(documentPath);
  if (cached !== undefined) {
    codeLinks.set(cached);
    return;
  }
  try {
    const links = await invoke<Record<string, string>>("load_code_links", {
      documentPath,
    });
    cache.set(documentPath, links);
    codeLinks.set(links);
  } catch {
    cache.set(documentPath, {});
    codeLinks.set({});
  }
}
