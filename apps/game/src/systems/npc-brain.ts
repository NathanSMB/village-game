/**
 * NPC Brain — Prompt construction, world snapshot assembly,
 * LLM response parsing, and decision dispatch.
 */

import type { NPC } from "../actors/npc.ts";
import type { WorldSnapshot, NPCAction, EntityInfo, NPCTodoItem } from "../types/npc.ts";
import type { ChatMessage } from "../types/chat.ts";
import type { LLMProviderConfig, LLMMessage } from "./llm-provider.ts";
import { callLLM, callThinkingLLM } from "./llm-provider.ts";
import { getItemQuantity } from "../types/item.ts";
import { RECIPES } from "../data/recipes.ts";
import { BUILDING_TYPES } from "../data/buildings.ts";
import { COOKING_RECIPES } from "../data/cooking.ts";

// ── Action schema (included in the system prompt) ────────────────────

const ACTION_SCHEMA = `
ACTIONS (respond with exactly ONE JSON object):

Planning & Thinking:
  {"action":"plan"} — Ask your reasoning mind to create a new plan (todo list). Use when you have no todos or need a new plan.
  {"action":"complete_todo","todoIndex":<num>} — Mark a todo item as done. When all items are done, the plan is complete and you should "plan" again.
  {"action":"think"} — Consult your reasoning mind for advice on what to do next

Movement:
  {"action":"move_to","x":<num>,"y":<num>} — Walk to a tile (auto-pathfinds, use for ALL movement)

Gathering:
  {"action":"pick_bush","direction":"<dir>"} — Pick berries from adjacent bush → gives: berry [consumable, +10 hunger]
  {"action":"chop_tree","direction":"<dir>"} — Chop adjacent tree → drops: branch (per hit), 6x log (when felled). Hatchet is much faster.
  {"action":"mine_rock","direction":"<dir>"} — Mine adjacent rock → drops: small_rock (40%), large_stone (40%), flint (20%). Pickaxe is much faster.
  {"action":"drink_water","direction":"<dir>"} — Drink from adjacent water tile → +25 thirst
  {"action":"pick_up_item","direction":"<dir>"} — Pick up item from adjacent ground

Combat:
  {"action":"attack","direction":"<dir>"} — Attack creature. Sheep drops: mutton+wool. Cow drops: raw_beef+cow_hide.

Crafting recipes: ${RECIPES.map((r) => `${r.id}(${r.ingredients.map((i) => `${i.count}x ${i.itemId}`).join("+")} -> ${r.name}${r.resultQuantity ? ` x${r.resultQuantity}` : ""})`).join(", ")}
  {"action":"craft","recipeId":"<id>"} — Craft if you have the materials

Cooking: ${COOKING_RECIPES.map((r) => `${r.inputId} -> ${r.outputId}`).join(", ")}
  {"action":"cook","direction":"<dir>","inputItemId":"<id>"} — Cook at adjacent burning fire

Building recipes: ${BUILDING_TYPES.map((b) => `${b.id}(${b.ingredients.map((i) => `${i.count}x ${i.itemId}`).join("+")}${b.storage ? `, ${b.storage.slotCount} slots` : ""}${b.fire ? ", cookable" : ""}${b.requiresIndoor ? ", indoor only" : ""}, ${b.placement})`).join(", ")}
  Tile buildings (floor, bed, fire_pit, hearth, box_*): {"action":"build_plan","buildingId":"<id>","x":<num>,"y":<num>,"rotation":<0-3>}
    rotation: 0-3 = clockwise quarter-turns (0=default). Matters for beds.
  Edge buildings (wall, wall_window, wall_door, fence, fence_gate): {"action":"build_plan","buildingId":"<id>","x":<num>,"y":<num>,"orientation":"N|E|S|W"}
    orientation: which side of tile (x,y) to place the wall on. N/S = horizontal wall, E/W = vertical wall.
  To build a room: place floors on all tiles, then walls on all edges around them. "Indoor" = enclosed floor area fully surrounded by walls.
  To construct: equip a HAMMER, have the required materials in your bag, then attack the hologram. Each hit delivers materials until complete.

Inventory:
  {"action":"equip","bagIndex":<num>} — Equip item from bag
  {"action":"unequip","slot":"<slot>"} — Unequip (head/torso/hands/legs/feet/mainHand/offHand)
  {"action":"consume","bagIndex":<num>} — Eat/drink a consumable
  {"action":"drop_item","bagIndex":<num>} — Drop item on ground

Interaction:
  {"action":"open_door","direction":"<dir>"} / {"action":"close_door","direction":"<dir>"}
  {"action":"claim_bed","direction":"<dir>"} — Claim an adjacent bed as yours (must claim before sleeping!)
  {"action":"sleep","direction":"<dir>"} — Sleep in YOUR claimed bed (must be adjacent). Restores energy.
  {"action":"wake_up"}
  {"action":"store_item","direction":"<dir>","bagIndex":<num>} / {"action":"retrieve_item","direction":"<dir>","slotIndex":<num>}

Communication:
  {"action":"chat","text":"<msg>","mode":"whisper|talk|yell"} — Speak (whisper=1tile, talk=3, yell=6)

Memory:
  {"action":"remember","note":"<text>"} — Save a note (max 20)
  {"action":"forget","noteIndex":<num>} — Delete a note

Wait (LAST RESORT — prefer moving/exploring instead):
  {"action":"wait","durationMs":<2000-8000>} — Only if truly nothing to do
`.trim();

// ── Shared context builder ───────────────────────────────────────────

interface NPCContext {
  equipStr: string;
  bagStr: string;
  entityLines: string;
  chatLines: string;
  newMsgLines: string;
  noteLines: string;
  knownLocStr: string;
  historyStr: string;
  thinkingLines: string;
}

function buildNPCContext(npc: NPC, snapshot: WorldSnapshot): NPCContext {
  // Equipment summary
  const equipped: string[] = [];
  for (const [slot, item] of Object.entries(npc.inventory.equipment)) {
    if (item) {
      const dur = item.durability != null ? ` (${item.durability}/${item.maxDurability})` : "";
      equipped.push(`${slot}: ${item.name}${dur}`);
    }
  }
  const equipStr = equipped.length > 0 ? equipped.join(", ") : "Nothing";

  // Bag summary
  const bagItems: string[] = [];
  for (let i = 0; i < npc.inventory.bag.length; i++) {
    const item = npc.inventory.bag[i];
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

  // Chat history (last 5 minutes)
  const fiveMinAgo = Date.now() - 5 * 60 * 1000;
  const recentChat = npc.chatHistory.filter((m) => m.timestamp >= fiveMinAgo);
  const chatLines =
    recentChat.length > 0
      ? recentChat
          .map((m) => {
            const isSelf = m.sender === npc.npcName;
            return `  ${isSelf ? "(you)" : m.sender}: "${m.text}"`;
          })
          .join("\n")
      : "  (no recent conversation)";

  // NEW messages since last decision
  const newMsgLines =
    snapshot.nearbyMessages.length > 0
      ? snapshot.nearbyMessages.map((m) => `  >> ${m.sender}: "${m.text}"`).join("\n")
      : "";

  // Notes
  const noteLines =
    npc.memory.notes.length > 0
      ? npc.memory.notes.map((n, i) => `  [${i}] ${n}`).join("\n")
      : "  None";

  // Known locations (object permanence)
  const locEntries = Object.entries(npc.knownLocations);
  let knownLocStr = "";
  if (locEntries.length > 0) {
    const byType: Record<string, string[]> = {};
    for (const [key, state] of locEntries) {
      const [type, coords] = key.split(":");
      if (!byType[type]) byType[type] = [];
      byType[type].push(`(${coords}) ${state}`);
    }
    knownLocStr = Object.entries(byType)
      .map(([type, locs]) => `  ${type}: ${locs.join(", ")}`)
      .join("\n");
  }

  // Recent action history
  const recentHistory = npc.debugHistory.slice(0, 3);
  const historyStr =
    recentHistory.length > 0
      ? recentHistory.map((h) => `  ${h.action} => ${h.result}`).join("\n")
      : "  (none)";

  // Thinking history
  const thinkingLines =
    npc.thinkingHistory.length > 0
      ? npc.thinkingHistory.map((t) => `  [${t.question}]\n  ${t.answer}`).join("\n")
      : "";

  return {
    equipStr,
    bagStr,
    entityLines,
    chatLines,
    newMsgLines,
    noteLines,
    knownLocStr,
    historyStr,
    thinkingLines,
  };
}

// ── System prompt builder (small action model) ──────────────────────

function buildSystemPrompt(npc: NPC, snapshot: WorldSnapshot): string {
  const ctx = buildNPCContext(npc, snapshot);
  const { personality, vitals, facing, tileX, tileY } = npc;

  // Todo list section
  let planSection: string;
  if (npc.todoList.length === 0) {
    planSection = `NO PLAN — You MUST use {"action":"plan"} to create a todo list before doing anything else.`;
  } else {
    const todoLines = npc.todoList
      .map((t, i) => `  [${i}] ${t.done ? "DONE" : "TODO"}: ${t.task}`)
      .join("\n");
    const nextTodo = npc.todoList.findIndex((t) => !t.done);
    planSection = `YOUR TODO LIST:\n${todoLines}\n${nextTodo >= 0 ? `→ Work on item [${nextTodo}]. Take the actions needed to accomplish it. Only use complete_todo AFTER you've actually done it.` : 'All items done! Use {"action":"plan"} for a new plan.'}`;
  }

  // Bed info
  const bedStr = npc.claimedBed
    ? `Claimed bed at (${npc.claimedBed.x},${npc.claimedBed.y})`
    : "NO BED CLAIMED — you need a bed to restore energy! Build or find one, then use claim_bed.";

  return `You are ${personality.name}, a villager in a 64x64 wilderness. ${personality.backstory}
Traits: ${personality.traits}

SITUATION:
Pos: (${tileX},${tileY}) facing ${facing} | HP:${Math.round(vitals.health)} Food:${Math.round(vitals.hunger)} Water:${Math.round(vitals.thirst)} Energy:${Math.round(vitals.energy)}/1000
Equipped: ${ctx.equipStr}
Bag: ${ctx.bagStr}
Bed: ${bedStr}

${planSection}

VISIBLE (6-tile radius):
${ctx.entityLines || "  Nothing here — you should EXPLORE by moving!"}

CONVERSATION LOG (last 5 min):
${ctx.chatLines}${ctx.newMsgLines ? `\n\nNEW UNREAD MESSAGES:\n${ctx.newMsgLines}\n(You should respond to these!)` : ""}

NOTES:
${ctx.noteLines}
${ctx.knownLocStr ? `\nKNOWN LOCATIONS (places you've discovered — use these to navigate!):\n${ctx.knownLocStr}\n` : ""}
RECENT ACTIONS:
${ctx.historyStr}
${ctx.thinkingLines ? `\nTHINKING LOG (your reasoning model's advice):\n${ctx.thinkingLines}\n` : ""}
${ACTION_SCHEMA}

RULES — READ CAREFULLY:
1. Output ONLY one JSON object. No text, no markdown.
2. Directions: "up"=north "down"=south "left"=west "right"=east. You interact with the tile 1 step in that direction.
3. ALWAYS have a plan. No todo list? Your action MUST be "plan". Work through your todos in order.
4. SURVIVAL: Water<20 or Food<20? Find water/food IMMEDIATELY.
5. ENERGY IS CRITICAL: Energy drains at 1/sec while awake. The ONLY way to recover energy is sleeping in a bed you own. If energy reaches 0, you die. You MUST build or find a bed, claim it with "claim_bed", and sleep periodically to restore energy.
6. BED PRIORITY: If you have no claimed bed and energy < 500, your top priority should be building an indoor room with a bed, or finding an unclaimed bed.
7. BE ACTIVE: Move, gather, craft, explore, talk. The world is large (64x64) with resources spread everywhere.
8. NEVER wait if there's something useful you could do instead. Only use "wait" if you truly have nothing to do.
9. DON'T CAMP: If a resource is depleted, MOVE ON. Don't wait for respawns.
10. EXPLORE: If you don't see what you need, use "move_to" to walk somewhere new.
11. BE SOCIAL: If someone sent you an unread message, RESPOND with "chat". Don't repeat greetings.`;
}

// ── Response parser ──────────────────────────────────────────────────

const VALID_ACTIONS = new Set([
  "plan",
  "complete_todo",
  "think",
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
  "claim_bed",
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
    `%cPlan%c ${npc.todoList.length > 0 ? `${npc.todoList.filter((t) => !t.done).length}/${npc.todoList.length} remaining` : "(none)"} | ` +
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

// ── Thinking model calls ────────────────────────────────────────────

/**
 * Ask the thinking model to set a goal with a strategy.
 * Returns the goal string (goal + strategy) to set on the NPC.
 */
export async function thinkAboutPlan(
  npc: NPC,
  snapshot: WorldSnapshot,
  config: LLMProviderConfig,
  signal?: AbortSignal,
): Promise<NPCTodoItem[]> {
  const ctx = buildNPCContext(npc, snapshot);
  const { personality, vitals } = npc;

  const bedStr = npc.claimedBed
    ? `Claimed bed at (${npc.claimedBed.x},${npc.claimedBed.y})`
    : "NO BED — need one to restore energy!";

  const prompt = `You are the strategic mind of ${personality.name}, a villager in a 64x64 survival game.
Personality: ${personality.traits}. ${personality.backstory}

SITUATION:
Pos: (${npc.tileX},${npc.tileY}) | HP:${Math.round(vitals.health)} Food:${Math.round(vitals.hunger)} Water:${Math.round(vitals.thirst)} Energy:${Math.round(vitals.energy)}/1000
Equipped: ${ctx.equipStr}
Bag: ${ctx.bagStr}
Bed: ${bedStr}

VISIBLE (6-tile radius):
${ctx.entityLines || "  Nothing notable nearby"}
${ctx.knownLocStr ? `\nKNOWN LOCATIONS (all discovered resources):\n${ctx.knownLocStr}\n` : ""}
NOTES:
${ctx.noteLines}

CONVERSATION LOG:
${ctx.chatLines}

RECENT ACTIONS:
${ctx.historyStr}

${ACTION_SCHEMA}

Create a TODO LIST for this villager. Each item must be SPECIFIC and ACTIONABLE — name the resource type, item, or action clearly. Don't include coordinates — the action model knows where things are from its known locations.

RULES FOR GOOD TASKS:
- BAD: "Find food" / "Explore the area" / "Gather resources"
- GOOD: "Find a berry bush that has berries and pick them" / "Go to water and drink" / "Mine a rock to get small_rock" / "Explore north to discover new resources"
- Each task should map to 1-3 game actions (move_to, pick_bush, craft, etc.)
- Be specific about WHAT to do and WHY, not WHERE (the action model handles navigation)

CRITICAL PRIORITIES (in order):
1. Water < 20 or Food < 20 → first tasks MUST fix this immediately
2. No claimed bed and Energy < 500 → plan must include getting/building a bed (bedroll needs 1 cow_hide + 1 wool)
3. No tools → craft a hammer (1 small_rock + 1 branch) so you can build things
4. Energy drains at 1/sec. The ONLY way to recover is sleeping in YOUR claimed bed. If energy hits 0, you die.

Respond with ONLY a JSON array of 3-6 task strings:
["Go to water and drink to restore thirst", "Find a berry bush with berries and pick them for food", "Craft a hammer using 1 small_rock + 1 branch"]`;

  const messages: LLMMessage[] = [
    { role: "system", content: prompt },
    { role: "user", content: "Create a todo list for your next plan." },
  ];

  console.group(`%c[THINK] ${npc.npcName} — Planning`, "color:#ff88ff;font-weight:bold");

  const t0 = performance.now();
  const response = await callThinkingLLM(config, messages, signal);
  const elapsed = Math.round(performance.now() - t0);

  if (response.error) {
    console.warn(`Planning error (${elapsed}ms):`, response.error);
    console.groupEnd();
    return [{ task: "Walk to a new area to find water, bushes, and rocks", done: false }];
  }

  console.log(
    `%c← Plan (${elapsed}ms):%c ${response.text.slice(0, 400)}`,
    "color:#888",
    "color:inherit",
  );
  console.groupEnd();

  // Parse JSON array from response
  const todos = parseTodoList(response.text);

  // Store in thinking history
  npc.pushThinkingHistory("Create a plan", todos.map((t) => t.task).join(" → "));

  return todos;
}

/** Parse a JSON array of strings from the thinking model's response into todo items. */
function parseTodoList(text: string): NPCTodoItem[] {
  let jsonStr = text.trim();

  // Strip markdown fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  // Find the array
  const bracketStart = jsonStr.indexOf("[");
  const bracketEnd = jsonStr.lastIndexOf("]");
  if (bracketStart !== -1 && bracketEnd > bracketStart) {
    jsonStr = jsonStr.substring(bracketStart, bracketEnd + 1);
  }

  try {
    const parsed = JSON.parse(jsonStr);
    if (Array.isArray(parsed)) {
      return parsed
        .filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        .slice(0, 8)
        .map((task) => ({ task: task.trim(), done: false }));
    }
  } catch {
    // Try line-by-line fallback (numbered list)
    const lines = text
      .split("\n")
      .map((l) => l.replace(/^\d+[.)]\s*/, "").trim())
      .filter((l) => l.length > 5 && !l.startsWith("[") && !l.startsWith("{"));
    if (lines.length > 0) {
      return lines.slice(0, 8).map((task) => ({ task, done: false }));
    }
  }

  return [{ task: "Walk to a new area to find water, bushes, and rocks", done: false }];
}

/**
 * Ask the thinking model for general advice given the NPC's full context.
 */
export async function thinkAboutQuestion(
  npc: NPC,
  snapshot: WorldSnapshot,
  config: LLMProviderConfig,
  signal?: AbortSignal,
): Promise<string> {
  const ctx = buildNPCContext(npc, snapshot);
  const { vitals } = npc;

  const bedStr = npc.claimedBed
    ? `Claimed bed at (${npc.claimedBed.x},${npc.claimedBed.y})`
    : "NO BED — need one to restore energy!";

  const prompt = `You are the strategic mind of ${npc.personality.name}, a villager in a 64x64 survival game.
${npc.personality.backstory}. Traits: ${npc.personality.traits}

SITUATION:
Pos: (${npc.tileX},${npc.tileY}) | HP:${Math.round(vitals.health)} Food:${Math.round(vitals.hunger)} Water:${Math.round(vitals.thirst)} Energy:${Math.round(vitals.energy)}/1000
Equipped: ${ctx.equipStr}
Bag: ${ctx.bagStr}
Bed: ${bedStr}
Todo list: ${npc.todoList.length > 0 ? npc.todoList.map((t, i) => `[${i}]${t.done ? "DONE" : "TODO"}: ${t.task}`).join(", ") : "(none)"}

VISIBLE (6-tile radius):
${ctx.entityLines || "  Nothing notable nearby"}
${ctx.knownLocStr ? `\nKNOWN LOCATIONS:\n${ctx.knownLocStr}\n` : ""}
CONVERSATION LOG:
${ctx.chatLines}

NOTES:
${ctx.noteLines}

RECENT ACTIONS:
${ctx.historyStr}

${ACTION_SCHEMA}

Analyze the current situation and give concise, actionable advice. What should this villager focus on right now? Consider survival priorities (water, food, energy/bed), available resources, and personality. Be specific with coordinates and item names.`;

  const messages: LLMMessage[] = [
    { role: "system", content: prompt },
    { role: "user", content: "What should I do next? Analyze my situation and advise." },
  ];

  console.group(`%c[THINK] ${npc.npcName} — Reasoning`, "color:#ff88ff;font-weight:bold");

  const t0 = performance.now();
  const response = await callThinkingLLM(config, messages, signal);
  const elapsed = Math.round(performance.now() - t0);

  if (response.error) {
    console.warn(`Thinking error (${elapsed}ms):`, response.error);
    console.groupEnd();
    return "I couldn't think clearly right now.";
  }

  const answer = response.text.slice(0, 400);
  console.log(`%c← Advice (${elapsed}ms):%c ${answer}`, "color:#888", "color:inherit");
  console.groupEnd();

  npc.pushThinkingHistory("What should I do next?", answer);
  return answer;
}

// ── World snapshot builder ───────────────────────────────────────────

export function buildWorldSnapshot(
  entities: EntityInfo[],
  nearbyMessages: ChatMessage[],
): WorldSnapshot {
  return { entities, nearbyMessages };
}
