import type { CharacterAppearance } from "../types/character.ts";
import type { Equipment } from "../types/inventory.ts";
import type { Item } from "../types/item.ts";
import type { VitalsState } from "../types/vitals.ts";

export interface BerryBushSaveState {
  tileX: number;
  tileY: number;
  hasBerries: boolean;
  regrowTimer: number;
}

export interface GroundItemSaveState {
  tileX: number;
  tileY: number;
  items: Item[];
}

export interface TreeSaveState {
  tileX: number;
  tileY: number;
  dropTimer: number;
  branchCount: number;
  hp: number;
  isStump: boolean;
  regrowTimer: number;
  damageAccum: number;
}

export interface BigRockSaveState {
  tileX: number;
  tileY: number;
  damageAccum: number;
}

export interface BuildingSaveState {
  typeId: string;
  tileX: number;
  tileY: number;
  state: "hologram" | "complete";
  materialsDelivered: number;
  hp: number;
  isOpen: boolean;
}

export interface EdgeBuildingSaveState {
  typeId: string;
  edgeKey: number;
  axis: "h" | "v";
  x: number;
  y: number;
  state: "hologram" | "complete";
  materialsDelivered: number;
  hp: number;
  isOpen: boolean;
}

export interface SheepSaveState {
  tileX: number;
  tileY: number;
  hp: number;
  following: boolean;
}

export interface SaveData {
  name: string;
  timestamp: number;
  player: {
    tileX: number;
    tileY: number;
    appearance: CharacterAppearance;
    equipment?: Equipment;
    bag?: Item[];
    maxWeight?: number;
    vitals: VitalsState;
  };
  bushes?: BerryBushSaveState[];
  trees?: TreeSaveState[];
  rocks?: BigRockSaveState[];
  groundItems?: GroundItemSaveState[];
  buildings?: BuildingSaveState[];
  edgeBuildings?: EdgeBuildingSaveState[];
  sheep?: SheepSaveState[];
}

const DB_NAME = "village-game";
const DB_VERSION = 1;
const SAVES_STORE = "saves";
const SETTINGS_STORE = "settings";

let db: IDBDatabase | null = null;

export async function initDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(SAVES_STORE)) {
        database.createObjectStore(SAVES_STORE, { keyPath: "name" });
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
    };

    request.onsuccess = () => {
      db = request.result;
      resolve();
    };

    request.onerror = () => {
      reject(request.error);
    };
  });
}

function getDB(): IDBDatabase {
  if (!db) throw new Error("Database not initialized. Call initDB() first.");
  return db;
}

export async function saveGame(data: SaveData): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(SAVES_STORE, "readwrite");
    tx.objectStore(SAVES_STORE).put(data);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadGame(name: string): Promise<SaveData | null> {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(SAVES_STORE, "readonly");
    const request = tx.objectStore(SAVES_STORE).get(name);
    request.onsuccess = () => resolve((request.result as SaveData) ?? null);
    request.onerror = () => reject(request.error);
  });
}

export async function listSaves(): Promise<SaveData[]> {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(SAVES_STORE, "readonly");
    const request = tx.objectStore(SAVES_STORE).getAll();
    request.onsuccess = () => {
      const saves = request.result as SaveData[];
      saves.sort((a, b) => b.timestamp - a.timestamp);
      resolve(saves);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function deleteSave(name: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(SAVES_STORE, "readwrite");
    tx.objectStore(SAVES_STORE).delete(name);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export function exportSaveToFile(data: SaveData): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${data.name.replace(/[^a-zA-Z0-9_-]/g, "_")}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importSaveFromFile(): Promise<SaveData | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const text = await file.text();
      const data = JSON.parse(text) as SaveData;
      await saveGame(data);
      resolve(data);
    };
    input.click();
  });
}

export async function saveSettings(key: string, value: unknown): Promise<void> {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(SETTINGS_STORE, "readwrite");
    tx.objectStore(SETTINGS_STORE).put({ key, value });
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadSettings(key: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const tx = getDB().transaction(SETTINGS_STORE, "readonly");
    const request = tx.objectStore(SETTINGS_STORE).get(key);
    request.onsuccess = () => {
      const result = request.result as { key: string; value: unknown } | undefined;
      resolve(result?.value ?? null);
    };
    request.onerror = () => reject(request.error);
  });
}
