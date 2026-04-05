import type { CharacterAppearance } from "./character.ts";
import type { ChatMessage, ChatMode } from "./chat.ts";
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
  | { action: "pick_bush"; direction: Direction }
  | { action: "chop_tree"; direction: Direction }
  | { action: "mine_rock"; direction: Direction }
  | { action: "drink_water"; direction: Direction }
  | { action: "pick_up_item"; direction: Direction }
  | { action: "attack"; direction: Direction }
  | { action: "craft"; recipeId: string }
  | { action: "cook"; direction: Direction; inputItemId: string }
  | {
      action: "build_plan";
      buildingId: string;
      x: number;
      y: number;
      rotation?: number;
      orientation?: string;
    }
  | { action: "equip"; bagIndex: number }
  | { action: "unequip"; slot: string }
  | { action: "consume"; bagIndex: number }
  | { action: "drop_item"; bagIndex: number }
  | { action: "open_door"; direction: Direction }
  | { action: "close_door"; direction: Direction }
  | { action: "claim_bed"; direction: Direction }
  | { action: "sleep"; direction: Direction }
  | { action: "wake_up" }
  | { action: "store_item"; direction: Direction; bagIndex: number }
  | { action: "retrieve_item"; direction: Direction; slotIndex: number }
  | { action: "chat"; text: string; mode: ChatMode }
  | { action: "remember"; note: string }
  | { action: "forget"; noteIndex: number }
  | { action: "wait"; durationMs: number };

// ── Action Result ────────────────────────────────────────────────────

export interface ActionResult {
  success: boolean;
  reason?: string;
}
