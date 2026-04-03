import type { Keyboard } from "excalibur";
import { Keys } from "excalibur";
import { loadSettings, saveSettings } from "./save-manager.ts";

export type ActionName =
  | "moveUp"
  | "moveDown"
  | "moveLeft"
  | "moveRight"
  | "confirm"
  | "action"
  | "pause"
  | "back"
  | "inventory";

export interface KeyBinding {
  slot1: Keys | null;
  slot2: Keys | null;
}

export type KeyBindings = Record<ActionName, KeyBinding>;

export const ALL_ACTIONS: ActionName[] = [
  "moveUp",
  "moveDown",
  "moveLeft",
  "moveRight",
  "confirm",
  "action",
  "pause",
  "back",
  "inventory",
];

export const ACTION_LABELS: Record<ActionName, string> = {
  moveUp: "Move Up",
  moveDown: "Move Down",
  moveLeft: "Move Left",
  moveRight: "Move Right",
  confirm: "Confirm",
  action: "Action",
  pause: "Pause",
  back: "Back",
  inventory: "Inventory",
};

function makeDefaults(): KeyBindings {
  return {
    moveUp: { slot1: Keys.W, slot2: Keys.ArrowUp },
    moveDown: { slot1: Keys.S, slot2: Keys.ArrowDown },
    moveLeft: { slot1: Keys.A, slot2: Keys.ArrowLeft },
    moveRight: { slot1: Keys.D, slot2: Keys.ArrowRight },
    confirm: { slot1: Keys.Enter, slot2: Keys.Space },
    action: { slot1: Keys.E, slot2: Keys.Enter },
    pause: { slot1: Keys.Escape, slot2: null },
    back: { slot1: Keys.Escape, slot2: null },
    inventory: { slot1: Keys.KeyI, slot2: null },
  };
}

export const DEFAULT_BINDINGS: KeyBindings = makeDefaults();

let currentBindings: KeyBindings = makeDefaults();

export function getBindings(): KeyBindings {
  return currentBindings;
}

export function resetBindings(): void {
  currentBindings = makeDefaults();
}

export function setBinding(action: ActionName, slot: 1 | 2, key: Keys | null): void {
  if (slot === 1) {
    currentBindings[action].slot1 = key;
  } else {
    currentBindings[action].slot2 = key;
  }
}

export function isActionHeld(kb: Keyboard, action: ActionName): boolean {
  const binding = currentBindings[action];
  return (
    (binding.slot1 != null && kb.isHeld(binding.slot1)) ||
    (binding.slot2 != null && kb.isHeld(binding.slot2))
  );
}

export function wasActionPressed(kb: Keyboard, action: ActionName): boolean {
  const binding = currentBindings[action];
  return (
    (binding.slot1 != null && kb.wasPressed(binding.slot1)) ||
    (binding.slot2 != null && kb.wasPressed(binding.slot2))
  );
}

const KEY_NAMES: Partial<Record<Keys, string>> = {
  [Keys.ArrowUp]: "Arrow Up",
  [Keys.ArrowDown]: "Arrow Down",
  [Keys.ArrowLeft]: "Arrow Left",
  [Keys.ArrowRight]: "Arrow Right",
  [Keys.Enter]: "Enter",
  [Keys.Space]: "Space",
  [Keys.Escape]: "Esc",
  [Keys.Tab]: "Tab",
  [Keys.ShiftLeft]: "L Shift",
  [Keys.ShiftRight]: "R Shift",
  [Keys.ControlLeft]: "L Ctrl",
  [Keys.ControlRight]: "R Ctrl",
  [Keys.AltLeft]: "L Alt",
  [Keys.AltRight]: "R Alt",
  [Keys.Backspace]: "Backspace",
  [Keys.Delete]: "Delete",
  [Keys.Home]: "Home",
  [Keys.End]: "End",
  [Keys.PageUp]: "Page Up",
  [Keys.PageDown]: "Page Down",
};

export function keyDisplayName(key: Keys | null): string {
  if (key == null) return "None";
  const named = KEY_NAMES[key];
  if (named) return named;
  // Single letter keys (KeyA → A)
  const str = key as string;
  if (str.startsWith("Key") && str.length === 4) return str[3];
  // Digit keys (Digit0 → 0)
  if (str.startsWith("Digit") && str.length === 6) return str[5];
  return str;
}

interface SerializedBindings {
  [action: string]: { slot1: string | null; slot2: string | null };
}

export async function persistKeybinds(): Promise<void> {
  const serialized: SerializedBindings = {};
  for (const action of ALL_ACTIONS) {
    const b = currentBindings[action];
    serialized[action] = {
      slot1: b.slot1 as string | null,
      slot2: b.slot2 as string | null,
    };
  }
  await saveSettings("keybinds", serialized);
}

export async function loadKeybinds(): Promise<void> {
  const data = (await loadSettings("keybinds")) as SerializedBindings | null;
  if (!data) return;
  for (const action of ALL_ACTIONS) {
    const saved = data[action];
    if (saved) {
      currentBindings[action] = {
        slot1: (saved.slot1 as Keys) ?? null,
        slot2: (saved.slot2 as Keys) ?? null,
      };
    }
  }
}
