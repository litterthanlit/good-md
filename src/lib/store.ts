import { Store } from "@tauri-apps/plugin-store";
import type { ThemePreference } from "./types";

export interface PersistedState {
  openFilePaths: string[];
  activeFilePath: string | null;
  watchedFolder: string | null;
  scrollPositions: Record<string, number>;
  themePreference: ThemePreference;
  outlineVisible: boolean;
}

const STORE_FILE = "houston-state.json";

let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await Store.load(STORE_FILE);
  }
  return storeInstance;
}

function getDefaultState(): PersistedState {
  return {
    openFilePaths: [],
    activeFilePath: null,
    watchedFolder: null,
    scrollPositions: {},
    themePreference: "system",
    outlineVisible: true,
  };
}

export async function saveState(state: Partial<PersistedState>): Promise<void> {
  const store = await getStore();
  const current = await loadState();
  await store.set("state", { ...current, ...state });
  await store.save();
}

export async function loadState(): Promise<PersistedState> {
  const store = await getStore();
  const state = await store.get<PersistedState>("state");
  return { ...getDefaultState(), ...state };
}
