import type { CharacterAppearance } from "./character.ts";
import type { ChatMessage } from "./chat.ts";
import type { Equipment } from "./inventory.ts";
import type { Item } from "./item.ts";
import type { VitalsState } from "./vitals.ts";
import type { Direction } from "../actors/player.ts";

// ── Personality ──────────────────────────────────────────────────────

export interface NPCPersonality {
  name: string;
  traits: string;
  backstory: string;
}

// ── Memory ───────────────────────────────────────────────────────────

export interface NPCMemoryState {
  notes: string[];
}

// ── Todo List ────────────────────────────────────────────────────

export interface NPCTodoItem {
  task: string;
  done: boolean;
  /** How to know this task is complete — a concrete observable condition. */
  doneWhen: string;
}

// ── Action State ─────────────────────────────────────────────────────

export type NPCActionState =
  | "idle"
  | "moving"
  | "picking"
  | "drinking"
  | "attacking"
  | "pickingUp"
  | "sleeping"
  | "waiting";

// ── NPC Definition (static data for spawning) ───────────────────────

export interface NPCDefinition {
  npcId: string;
  personality: NPCPersonality;
  appearance: CharacterAppearance;
}

// ── Save State ───────────────────────────────────────────────────────

export interface NPCSaveState {
  npcId: string;
  tileX: number;
  tileY: number;
  facing: Direction;
  appearance: CharacterAppearance;
  vitals: VitalsState;
  equipment: Equipment;
  bag: Item[];
  maxWeight: number;
  personality: NPCPersonality;
  memory: NPCMemoryState;
  sleeping: boolean;
  /** The NPC's current plan — a list of tasks from the thinking model. */
  todoList: NPCTodoItem[];
  claimedBed: { x: number; y: number } | null;
  knownLocations: Record<string, string>;
}

// ── World Snapshot (what the NPC can see) ────────────────────────────

export interface TileInfo {
  x: number;
  y: number;
  type: "grass" | "water";
}

export interface EntityInfo {
  type:
    | "bush"
    | "tree"
    | "rock"
    | "ground_items"
    | "sheep"
    | "cow"
    | "building"
    | "edge_building"
    | "player"
    | "npc";
  x: number;
  y: number;
  details: string;
}

export interface WorldSnapshot {
  entities: EntityInfo[];
  nearbyMessages: ChatMessage[];
}

// ── NPC Actions (discriminated union) ────────────────────────────────

export type NPCAction =
  | { action: "plan" }
  | { action: "complete_todo"; todoIndex: number }
  | { action: "think" }
  | { action: "move_to"; x: number; y: number }
  | { action: "pick_bush"; x?: number; y?: number }
  | { action: "chop_tree"; x?: number; y?: number }
  | { action: "mine_rock"; x?: number; y?: number }
  | { action: "drink_water"; x?: number; y?: number }
  | { action: "pick_up_item"; itemId: string; x?: number; y?: number }
  | { action: "attack"; direction?: Direction; targetType?: string; x?: number; y?: number }
  | { action: "craft"; recipeId: string }
  | { action: "cook"; inputItemId: string; x?: number; y?: number }
  | {
      action: "build_plan";
      buildingId: string;
      x: number;
      y: number;
      rotation?: number;
      orientation?: string;
    }
  | { action: "construct"; x: number; y: number }
  | { action: "equip"; bagIndex: number }
  | { action: "unequip"; slot: string }
  | { action: "consume"; bagIndex: number }
  | { action: "drop_item"; bagIndex: number }
  | { action: "open_door"; x?: number; y?: number }
  | { action: "close_door"; x?: number; y?: number }
  | { action: "claim_bed"; x?: number; y?: number }
  | { action: "sleep"; x?: number; y?: number }
  | { action: "wake_up" }
  | { action: "store_item"; bagIndex: number; x?: number; y?: number }
  | { action: "retrieve_item"; slotIndex: number; x?: number; y?: number }
  | { action: "chat"; text: string }
  | { action: "remember"; note: string }
  | { action: "forget"; noteIndex: number }
  | { action: "wait"; durationMs: number };

// ── Action Result ────────────────────────────────────────────────────

export interface ActionResult {
  success: boolean;
  reason?: string;
}
