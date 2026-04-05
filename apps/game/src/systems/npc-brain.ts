/**
 * NPC Brain — Prompt construction, world snapshot assembly,
 * LLM response parsing, and decision dispatch.
 */

import type { NPC } from "../actors/npc.ts";
import type { WorldSnapshot, NPCAction, EntityInfo } from "../types/npc.ts";
import type { ChatMessage } from "../types/chat.ts";
import type { LLMProviderConfig, LLMMessage } from "./llm-provider.ts";
import { callLLM, callThinkingLLM } from "./llm-provider.ts";
import { getItemQuantity } from "../types/item.ts";
import { RECIPES } from "../data/recipes.ts";

// ── Action schema (included in the system prompt) ────────────────────

const ACTION_SCHEMA = `
ACTIONS (respond with exactly ONE JSON object):

Goals & Thinking:
  {"action":"set_goal","goal":"<description>"} — Set your current objective (auto-consults the thinking model for strategy)
  {"action":"complete_goal"} — Mark current goal as done (then set a new one!)
  {"action":"think","question":"<question>"} — Ask your inner reasoning mind a question. Use this when you're unsure what to do, need to plan, or want advice. The answer will appear in your next prompt.

Movement:
  {"action":"move_to","x":<num>,"y":<num>} — Walk to a tile (auto-pathfinds, use for ALL movement)

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

Wait (LAST RESORT — prefer moving/exploring instead):
  {"action":"wait","durationMs":<2000-8000>} — Only if truly nothing to do
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

  // Chat history (last 5 minutes — includes own messages + received)
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

  // NEW messages since last decision (unread inbox)
  const newMsgLines =
    snapshot.nearbyMessages.length > 0
      ? snapshot.nearbyMessages.map((m) => `  >> ${m.sender}: "${m.text}"`).join("\n")
      : "";

  // Notes
  const noteLines =
    npc.memory.notes.length > 0
      ? npc.memory.notes.map((n, i) => `  [${i}] ${n}`).join("\n")
      : "  None";

  // Recent action history (last 3) so the NPC knows what it's been doing
  const recentHistory = npc.debugHistory.slice(0, 3);
  const historyStr =
    recentHistory.length > 0
      ? recentHistory.map((h) => `  ${h.action} => ${h.result}`).join("\n")
      : "  (none)";

  // Thinking history (reasoning model conversations)
  const thinkingLines =
    npc.thinkingHistory.length > 0
      ? npc.thinkingHistory.map((t) => `  Q: ${t.question}\n  A: ${t.answer}`).join("\n")
      : "";

  // Goal section
  let goalSection: string;
  if (!npc.currentGoal) {
    goalSection = `NO GOAL SET — You MUST use {"action":"set_goal","goal":"..."} right now.
Pick a specific, achievable goal like: "Find water and drink", "Gather 3 berries", "Craft a hammer", "Explore south to find resources", "Talk to the player".`;
  } else {
    goalSection = `CURRENT GOAL: "${npc.currentGoal}"
Take the NEXT CONCRETE STEP toward this goal. If it's done, use "complete_goal".`;
  }

  return `You are ${personality.name}, a villager in a 64x64 wilderness. ${personality.backstory}
Traits: ${personality.traits}

SITUATION:
Pos: (${tileX},${tileY}) facing ${facing} | HP:${Math.round(vitals.health)} Food:${Math.round(vitals.hunger)} Water:${Math.round(vitals.thirst)} Energy:${Math.round(vitals.energy)}
Equipped: ${equipStr}
Bag: ${bagStr}

${goalSection}

VISIBLE (6-tile radius):
${entityLines || "  Nothing here — you should EXPLORE by moving!"}

CONVERSATION LOG (last 5 min):
${chatLines}${newMsgLines ? `\n\nNEW UNREAD MESSAGES:\n${newMsgLines}\n(You should respond to these!)` : ""}

NOTES:
${noteLines}

RECENT ACTIONS:
${historyStr}
${thinkingLines ? `\nTHINKING LOG (your reasoning model's advice):\n${thinkingLines}\n` : ""}
${ACTION_SCHEMA}

RULES — READ CAREFULLY:
1. Output ONLY one JSON object. No text, no markdown.
2. Directions: "up"=north "down"=south "left"=west "right"=east. You interact with the tile 1 step in that direction.
3. ALWAYS have a goal. No goal? Your action MUST be "set_goal".
4. SURVIVAL: Water<20 or Food<20? Find water/food IMMEDIATELY.
5. BE ACTIVE: Move, gather, craft, explore, talk. The world is large (64x64) with resources spread everywhere.
6. NEVER wait if there's something useful you could do instead. Only use "wait" if you truly have nothing to do.
7. DON'T CAMP: If a resource is depleted (bush has no berries, tree is a stump), MOVE ON and find another one. Don't wait for it to respawn.
8. EXPLORE: If you don't see what you need, use "move_to" to walk somewhere new. Try coordinates you haven't visited.
9. REMEMBER locations: Use "remember" to save where you found water, bushes, rocks, etc.
10. BE SOCIAL: If someone sent you an unread message, RESPOND with "chat". Check the conversation log — don't repeat what you already said. Don't greet someone you just greeted.`;
}

// ── Response parser ──────────────────────────────────────────────────

const VALID_ACTIONS = new Set([
  "set_goal",
  "complete_goal",
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

// ── Thinking model calls ────────────────────────────────────────────

/**
 * Ask the thinking model to set a goal with a strategy.
 * Returns the goal string (goal + strategy) to set on the NPC.
 */
export async function thinkAboutGoal(
  npc: NPC,
  snapshot: WorldSnapshot,
  config: LLMProviderConfig,
  signal?: AbortSignal,
): Promise<string> {
  const { personality, vitals, inventory } = npc;

  const bagSummary = inventory.bag.map((i) => i.name).join(", ") || "empty";
  const equipped =
    Object.entries(inventory.equipment)
      .filter(([, v]) => v)
      .map(([k, v]) => `${k}:${v!.name}`)
      .join(", ") || "nothing";

  const visibleSummary = snapshot.entities
    .slice(0, 15)
    .map((e) => `(${e.x},${e.y}) ${e.type}: ${e.details}`)
    .join("\n  ");

  const notesSummary = npc.memory.notes.join("; ") || "none";

  const prompt = `You are the strategic mind of ${personality.name}, a villager in a 64x64 survival game.
Personality: ${personality.traits}. ${personality.backstory}

Current state:
- Position: (${npc.tileX}, ${npc.tileY})
- Vitals: HP=${Math.round(vitals.health)} Food=${Math.round(vitals.hunger)} Water=${Math.round(vitals.thirst)} Energy=${Math.round(vitals.energy)}
- Equipped: ${equipped}
- Bag: ${bagSummary}
- Notes: ${notesSummary}

Nearby:
  ${visibleSummary || "Nothing notable nearby"}

Previous goal: ${npc.currentGoal || "(none)"}

Set a NEW specific goal with a step-by-step strategy. Consider survival needs (food, water, tools), personality traits, and what's available nearby. Be concrete — name specific coordinates, items, and actions.

Respond in this format:
GOAL: <one sentence objective>
STRATEGY: <2-4 numbered steps to accomplish it>`;

  const messages: LLMMessage[] = [
    { role: "system", content: prompt },
    { role: "user", content: "What should your next goal and strategy be?" },
  ];

  console.group(`%c[THINK] ${npc.npcName} — Goal Planning`, "color:#ff88ff;font-weight:bold");

  const t0 = performance.now();
  const response = await callThinkingLLM(config, messages, signal);
  const elapsed = Math.round(performance.now() - t0);

  if (response.error) {
    console.warn(`Thinking error (${elapsed}ms):`, response.error);
    console.groupEnd();
    return "Explore the area and find useful resources";
  }

  console.log(
    `%c← Response (${elapsed}ms):%c ${response.text.slice(0, 300)}`,
    "color:#888",
    "color:inherit",
  );
  console.groupEnd();

  // Store in thinking history
  npc.pushThinkingHistory("What should my next goal be?", response.text.slice(0, 300));

  return response.text.slice(0, 300);
}

/**
 * Ask the thinking model an ad-hoc question from the small model.
 */
export async function thinkAboutQuestion(
  npc: NPC,
  question: string,
  snapshot: WorldSnapshot,
  config: LLMProviderConfig,
  signal?: AbortSignal,
): Promise<string> {
  const visibleSummary = snapshot.entities
    .slice(0, 10)
    .map((e) => `(${e.x},${e.y}) ${e.type}: ${e.details}`)
    .join("; ");

  const prompt = `You are the strategic mind of ${npc.personality.name}, a villager in a survival game.
Position: (${npc.tileX},${npc.tileY}). Current goal: "${npc.currentGoal || "none"}".
Vitals: HP=${Math.round(npc.vitals.health)} Food=${Math.round(npc.vitals.hunger)} Water=${Math.round(npc.vitals.thirst)}.
Nearby: ${visibleSummary || "nothing notable"}.
Notes: ${npc.memory.notes.join("; ") || "none"}.

Answer the following question concisely and practically. Give specific actionable advice.`;

  const messages: LLMMessage[] = [
    { role: "system", content: prompt },
    { role: "user", content: question },
  ];

  console.group(`%c[THINK] ${npc.npcName} — "${question}"`, "color:#ff88ff;font-weight:bold");

  const t0 = performance.now();
  const response = await callThinkingLLM(config, messages, signal);
  const elapsed = Math.round(performance.now() - t0);

  if (response.error) {
    console.warn(`Thinking error (${elapsed}ms):`, response.error);
    console.groupEnd();
    return "I couldn't think clearly about that right now.";
  }

  const answer = response.text.slice(0, 300);
  console.log(`%c← Answer (${elapsed}ms):%c ${answer}`, "color:#888", "color:inherit");
  console.groupEnd();

  npc.pushThinkingHistory(question, answer);
  return answer;
}

// ── World snapshot builder ───────────────────────────────────────────

export function buildWorldSnapshot(
  entities: EntityInfo[],
  nearbyMessages: ChatMessage[],
): WorldSnapshot {
  return { entities, nearbyMessages };
}
