import { Store } from "@tauri-apps/plugin-store";

interface PersistedState {
  openFilePaths: string[];
  activeFilePath: string | null;
  watchedFolder: string | null;
  scrollPositions: Record<string, number>;
}

const STORE_FILE = "houston-state.json";

let storeInstance: Store | null = null;

async function getStore(): Promise<Store> {
  if (!storeInstance) {
    storeInstance = await Store.load(STORE_FILE);
  }
  return storeInstance;
}

export async function saveState(state: PersistedState): Promise<void> {
  const store = await getStore();
  await store.set("state", state);
  await store.save();
}

export async function loadState(): Promise<PersistedState> {
  const store = await getStore();
  const state = await store.get<PersistedState>("state");
  return (
    state ?? {
      openFilePaths: [],
      activeFilePath: null,
      watchedFolder: null,
      scrollPositions: {},
    }
  );
}
