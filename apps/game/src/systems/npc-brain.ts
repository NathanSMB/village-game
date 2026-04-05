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
ACTIONS (respond with exactly ONE JSON object):

Goals:
  {"action":"set_goal","goal":"<description>"} — Set your current objective
  {"action":"complete_goal"} — Mark current goal as done (then set a new one!)

Movement:
  {"action":"move","direction":"up|down|left|right"} — Move 1 tile
  {"action":"move_to","x":<num>,"y":<num>} — Walk to a tile (auto-pathfinds)

Gathering:
  {"action":"pick_bush","direction":"<dir>"} — Pick berries from adjacent bush
  {"action":"chop_tree","direction":"<dir>"} — Chop adjacent tree (need hatchet for efficiency)
  {"action":"mine_rock","direction":"<dir>"} — Mine adjacent rock (need pickaxe for efficiency)
  {"action":"drink_water","direction":"<dir>"} — Drink from adjacent water tile
  {"action":"pick_up_item","direction":"<dir>"} — Pick up item from adjacent ground

Combat:
  {"action":"attack","direction":"<dir>"} — Attack creature/entity in that direction

Crafting: ${RECIPES.map((r) => `${r.id}(${r.ingredients.map((i) => `${i.count}x ${i.itemId}`).join("+")})`).join(", ")}
  {"action":"craft","recipeId":"<id>"} — Craft if you have the materials
  {"action":"cook","direction":"<dir>","inputItemId":"<id>"} — Cook raw meat at adjacent burning fire

Building:
  {"action":"build_plan","buildingId":"<id>","x":<num>,"y":<num>} — Place a building blueprint at a tile

Inventory:
  {"action":"equip","bagIndex":<num>} — Equip item from bag
  {"action":"unequip","slot":"<slot>"} — Unequip (head/torso/hands/legs/feet/mainHand/offHand)
  {"action":"consume","bagIndex":<num>} — Eat/drink a consumable
  {"action":"drop_item","bagIndex":<num>} — Drop item on ground

Interaction:
  {"action":"open_door","direction":"<dir>"} / {"action":"close_door","direction":"<dir>"}
  {"action":"sleep","direction":"<dir>"} — Sleep in adjacent bed
  {"action":"wake_up"}
  {"action":"store_item","direction":"<dir>","bagIndex":<num>} / {"action":"retrieve_item","direction":"<dir>","slotIndex":<num>}

Communication:
  {"action":"chat","text":"<msg>","mode":"whisper|talk|yell"} — Speak (whisper=1tile, talk=3, yell=6)

Memory:
  {"action":"remember","note":"<text>"} — Save a note (max 20)
  {"action":"forget","noteIndex":<num>} — Delete a note

Wait:
  {"action":"wait","durationMs":<1000-30000>} — Pause before next decision
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

  // Last action context
  const lastActionStr = npc.debugLastAction
    ? `Last action: ${npc.debugLastAction} => ${npc.debugLastResult}`
    : "No previous action";

  // Goal section
  const goalSection = npc.currentGoal
    ? `CURRENT GOAL: "${npc.currentGoal}"
You are actively working toward this goal. Choose your next action to make progress on it.
If the goal is done, use "complete_goal" and then "set_goal" with a new objective.`
    : `You have NO GOAL set. You MUST use "set_goal" as your next action.
Choose a meaningful objective like: gather food, craft a tool, explore the area, find water, build a shelter, talk to someone nearby, etc.`;

  return `You are ${personality.name}, a villager surviving in a wilderness. ${personality.backstory}
Personality: ${personality.traits}

=== YOUR SITUATION ===
Position: (${tileX}, ${tileY}), facing ${facing}
Vitals: HP=${Math.round(vitals.health)}/100  Food=${Math.round(vitals.hunger)}/100  Water=${Math.round(vitals.thirst)}/100  Energy=${Math.round(vitals.energy)}/1000
Equipped: ${equipStr}
Bag: ${bagStr}
${lastActionStr}

=== ${goalSection} ===

=== WHAT YOU SEE (6-tile radius) ===
${entityLines || "  Nothing notable nearby"}

=== MESSAGES HEARD ===
${msgLines}

=== YOUR NOTES ===
${noteLines}

${ACTION_SCHEMA}

RULES:
1. Respond with EXACTLY ONE JSON action object. No explanation, no markdown, just the JSON.
2. Direction values: "up"=north, "down"=south, "left"=west, "right"=east.
3. You can only interact with things ADJACENT to you (1 tile away in a direction).
4. SURVIVAL PRIORITY: If Water < 15 or Food < 15, drop everything and find water/food.
5. GOAL SYSTEM: Always have a goal. Use "set_goal" if you have none. Work toward your goal with each action.
6. Use "remember" to save locations you discover (e.g. "Water pond at (25,30)").
7. Use "chat" with mode "talk" when you see a player or NPC nearby. Be friendly and in-character.
8. Use "wait" (5000-15000ms) after completing a sequence, NOT between every action.
9. When moving toward something far away, use "move_to" with the target coordinates rather than single "move" steps.`;
}

// ── Response parser ──────────────────────────────────────────────────

const VALID_ACTIONS = new Set([
  "set_goal",
  "complete_goal",
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

  const t0 = performance.now();
  const response = await callLLM(config, messages, signal);
  const elapsed = Math.round(performance.now() - t0);

  // ── Structured console logging ──────────────────────────────────────
  const label = `%c[NPC] ${npc.npcName}`;
  const style = "color:#88aaff;font-weight:bold";

  if (response.error) {
    console.group(label, style);
    console.warn("LLM error:", response.error);
    console.log("Position:", `(${npc.tileX},${npc.tileY})`, "facing", npc.facing);
    console.groupEnd();

    npc.debugLastResponse = `ERROR: ${response.error}`;
    npc.debugLastAction = '{"action":"wait","durationMs":5000}';
    npc.debugLastResult = "❌ LLM error";
    return { action: "wait", durationMs: 5000 };
  }

  const action = parseActionResponse(response.text);
  const actionJson = action ? JSON.stringify(action) : "null";

  console.group(label, style);
  console.log(
    `%cGoal%c ${npc.currentGoal || "(none)"} | ` +
      `%cPos%c (${npc.tileX},${npc.tileY}) ${npc.facing} | ` +
      `%cVitals%c H:${Math.round(npc.vitals.health)} F:${Math.round(npc.vitals.hunger)} ` +
      `T:${Math.round(npc.vitals.thirst)} E:${Math.round(npc.vitals.energy)}`,
    "color:#ffdd66;font-weight:bold",
    "color:inherit",
    "color:#aaa",
    "color:inherit",
    "color:#aaa",
    "color:inherit",
  );
  if (snapshot.entities.length > 0) {
    console.groupCollapsed(`%cVisible (${snapshot.entities.length} entities)`, "color:#888");
    for (const e of snapshot.entities) {
      console.log(`  (${e.x},${e.y}) ${e.type}: ${e.details}`);
    }
    console.groupEnd();
  }
  if (snapshot.nearbyMessages.length > 0) {
    console.log(
      "%cMessages heard:",
      "color:#888",
      snapshot.nearbyMessages.map((m) => `[${m.sender}] ${m.text}`).join(" | "),
    );
  }
  if (npc.memory.notes.length > 0) {
    console.log("%cMemory:", "color:#888", npc.memory.notes.join(" | "));
  }
  console.groupCollapsed(`%cFull prompt`, "color:#555");
  console.log(systemPrompt);
  console.groupEnd();
  if (action) {
    console.log(
      `%c→ Action%c ${actionJson} %c(${elapsed}ms)`,
      "color:#44ff88",
      "color:inherit",
      "color:#666",
    );
  } else {
    console.warn(`→ Parse failed (${elapsed}ms):`, response.text.slice(0, 300));
  }
  console.groupEnd();
  // ───────────────────────────────────────────────────────────────────

  // Store debug state on the NPC
  npc.debugLastResponse = response.text ? response.text.slice(0, 500) : "(empty response)";
  npc.debugLastAction = actionJson;

  if (!action) {
    if (!response.text) {
      npc.debugLastResult = "❌ Empty response — check model name & API key in Settings → AI";
    } else {
      npc.debugLastResult = "❌ Parse failed — model didn't return JSON";
    }
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
