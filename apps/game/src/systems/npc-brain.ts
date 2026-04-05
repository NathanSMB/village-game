/**
 * NPC Brain — Prompt construction, world snapshot assembly,
 * LLM response parsing, and decision dispatch.
 */

import type { NPC } from "../actors/npc.ts";
import type { WorldSnapshot, NPCAction, EntityInfo } from "../types/npc.ts";
import type { ChatMessage } from "../types/chat.ts";
import type { LLMProviderConfig, LLMMessage } from "./llm-provider.ts";
import { callLLM } from "./llm-provider.ts";
import { getItemQuantity } from "../types/item.ts";
import { RECIPES } from "../data/recipes.ts";

// ── Action schema (included in the system prompt) ────────────────────

const ACTION_SCHEMA = `
Available actions (respond with ONE as JSON):

Movement:
  {"action":"move","direction":"up|down|left|right"} - Move 1 tile
  {"action":"move_to","x":<num>,"y":<num>} - Pathfind to a tile (multi-step)

Gathering:
  {"action":"pick_bush","direction":"<dir>"} - Pick berries from adjacent bush
  {"action":"chop_tree","direction":"<dir>"} - Chop adjacent tree
  {"action":"mine_rock","direction":"<dir>"} - Mine adjacent rock
  {"action":"drink_water","direction":"<dir>"} - Drink from adjacent water
  {"action":"pick_up_item","direction":"<dir>"} - Pick up item from ground

Combat:
  {"action":"attack","direction":"<dir>"} - Attack in a direction

Crafting & Cooking:
  {"action":"craft","recipeId":"<id>"} - Craft an item (recipes: ${RECIPES.map((r) => `${r.id}: ${r.ingredients.map((i) => `${i.count}x ${i.itemId}`).join(", ")} -> ${r.name}`).join("; ")})
  {"action":"cook","direction":"<dir>","inputItemId":"<id>"} - Cook at adjacent burning fire

Building:
  {"action":"build_plan","buildingId":"<id>","x":<num>,"y":<num>} - Place a building blueprint

Inventory:
  {"action":"equip","bagIndex":<num>} - Equip item from bag
  {"action":"unequip","slot":"<slot>"} - Unequip (slots: head,torso,hands,legs,feet,mainHand,offHand)
  {"action":"consume","bagIndex":<num>} - Eat/drink consumable from bag
  {"action":"drop_item","bagIndex":<num>} - Drop item on ground

Interaction:
  {"action":"open_door","direction":"<dir>"} - Open adjacent door/gate
  {"action":"close_door","direction":"<dir>"} - Close adjacent door/gate
  {"action":"sleep","direction":"<dir>"} - Sleep in adjacent bed
  {"action":"wake_up"} - Wake up from sleep
  {"action":"store_item","direction":"<dir>","bagIndex":<num>} - Store item in adjacent storage
  {"action":"retrieve_item","direction":"<dir>","slotIndex":<num>} - Take item from storage

Communication:
  {"action":"chat","text":"<message>","mode":"whisper|talk|yell"} - Say something (whisper=1 tile, talk=3 tiles, yell=6 tiles)

Memory:
  {"action":"remember","note":"<text>"} - Save a note for yourself (max 20)
  {"action":"forget","noteIndex":<num>} - Delete a note by index

Wait:
  {"action":"wait","durationMs":<1000-30000>} - Do nothing for a while
`.trim();

// ── System prompt builder ────────────────────────────────────────────

function buildSystemPrompt(npc: NPC, snapshot: WorldSnapshot): string {
  const { personality, vitals, inventory, facing, tileX, tileY } = npc;

  // Equipment summary
  const equipped: string[] = [];
  for (const [slot, item] of Object.entries(inventory.equipment)) {
    if (item) {
      const dur = item.durability != null ? ` (${item.durability}/${item.maxDurability})` : "";
      equipped.push(`${slot}: ${item.name}${dur}`);
    }
  }
  const equipStr = equipped.length > 0 ? equipped.join(", ") : "Nothing";

  // Bag summary
  const bagItems: string[] = [];
  for (let i = 0; i < inventory.bag.length; i++) {
    const item = inventory.bag[i];
    const qty = getItemQuantity(item);
    const qtyStr = qty > 1 ? ` x${qty}` : "";
    const consumeStr = item.consumable ? " [consumable]" : "";
    const equipStr2 = item.slot ? ` [equippable:${item.slot}]` : "";
    bagItems.push(`[${i}] ${item.name}${qtyStr}${consumeStr}${equipStr2}`);
  }
  const bagStr = bagItems.length > 0 ? bagItems.join(", ") : "Empty";

  // Entities in vision
  const entityLines = snapshot.entities
    .map((e) => `  (${e.x},${e.y}): ${e.type} - ${e.details}`)
    .join("\n");

  // Messages heard
  const msgLines =
    snapshot.nearbyMessages.length > 0
      ? snapshot.nearbyMessages.map((m) => `  [${m.mode}] ${m.sender}: "${m.text}"`).join("\n")
      : "  None";

  // Notes
  const noteLines =
    npc.memory.notes.length > 0
      ? npc.memory.notes.map((n, i) => `  [${i}] ${n}`).join("\n")
      : "  None";

  return `You are ${personality.name}, a villager in a survival game. ${personality.backstory}
Your personality traits: ${personality.traits}

Current state:
- Position: (${tileX}, ${tileY}), facing ${facing}
- Vitals: health=${Math.round(vitals.health)}/100, hunger=${Math.round(vitals.hunger)}/100, thirst=${Math.round(vitals.thirst)}/100, energy=${Math.round(vitals.energy)}/1000
- Equipped: ${equipStr}
- Bag: ${bagStr}

What you see (6-tile radius):
${entityLines || "  Nothing notable nearby"}

Messages you heard:
${msgLines}

Your notes:
${noteLines}

${ACTION_SCHEMA}

IMPORTANT RULES:
- Respond with EXACTLY ONE JSON action, nothing else.
- Direction must be relative to YOUR position ("up"=north, "down"=south, "left"=west, "right"=east).
- If thirst < 20, prioritize finding water! If hunger < 20, find food!
- You can only interact with things on tiles ADJACENT to you (1 tile away in the direction you specify).
- Use "remember" to save important information (locations, names, plans).
- Use "chat" to communicate with nearby players/NPCs. Be natural and in-character.
- Use "wait" when you have nothing urgent to do (don't spam actions needlessly).`;
}

// ── Response parser ──────────────────────────────────────────────────

const VALID_ACTIONS = new Set([
  "move",
  "move_to",
  "pick_bush",
  "chop_tree",
  "mine_rock",
  "drink_water",
  "pick_up_item",
  "attack",
  "craft",
  "cook",
  "build_plan",
  "equip",
  "unequip",
  "consume",
  "drop_item",
  "open_door",
  "close_door",
  "sleep",
  "wake_up",
  "store_item",
  "retrieve_item",
  "chat",
  "remember",
  "forget",
  "wait",
]);

function parseActionResponse(text: string): NPCAction | null {
  // Try to extract JSON from the response (handle markdown fences, leading text)
  let jsonStr = text.trim();

  // Strip markdown code fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    jsonStr = fenceMatch[1].trim();
  }

  // Try to find JSON object
  const braceStart = jsonStr.indexOf("{");
  const braceEnd = jsonStr.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    jsonStr = jsonStr.substring(braceStart, braceEnd + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== "object" || !parsed.action) return null;
    if (!VALID_ACTIONS.has(parsed.action)) return null;
    return parsed as NPCAction;
  } catch {
    return null;
  }
}

// ── Main decision function ───────────────────────────────────────────

export async function decideNextAction(
  npc: NPC,
  snapshot: WorldSnapshot,
  config: LLMProviderConfig,
  signal?: AbortSignal,
): Promise<NPCAction> {
  const systemPrompt = buildSystemPrompt(npc, snapshot);

  const messages: LLMMessage[] = [
    { role: "system", content: systemPrompt },
    { role: "user", content: "What is your next action? Respond with one JSON action." },
  ];

  const response = await callLLM(config, messages, signal);

  if (response.error) {
    console.warn(`[NPC ${npc.npcName}] LLM error: ${response.error}`);
    return { action: "wait", durationMs: 5000 };
  }

  const action = parseActionResponse(response.text);
  if (!action) {
    console.warn(`[NPC ${npc.npcName}] Failed to parse action: ${response.text.slice(0, 200)}`);
    return { action: "wait", durationMs: 3000 };
  }

  return action;
}

// ── World snapshot builder ───────────────────────────────────────────
// This builds the WorldSnapshot from the GameWorld's exposed data.
// Called by GameWorld.getWorldSnapshotForNPC() which provides the raw data.

export function buildWorldSnapshot(
  entities: EntityInfo[],
  nearbyMessages: ChatMessage[],
): WorldSnapshot {
  return { entities, nearbyMessages };
}
