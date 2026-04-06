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
import { ITEMS } from "../data/items.ts";

// ── Action schema (included in the system prompt) ────────────────────

const ACTION_SCHEMA = `
ACTIONS (respond with exactly ONE JSON object):

Planning & Thinking:
  {"action":"plan"} — Ask your reasoning mind to create a new plan (todo list). Use when you have no todos or need a new plan.
  {"action":"complete_todo","todoIndex":<num>} — Mark a todo item as done. When all items are done, the plan is complete and you should "plan" again.
  {"action":"think"} — Consult your reasoning mind for advice on what to do next

Movement:
  {"action":"move_to","x":<num>,"y":<num>} — Walk to a tile (auto-pathfinds, use for ALL movement)

Gathering (all auto-walk to target if x,y provided, auto-find adjacent resource, no direction needed):
  {"action":"pick_bush","x":<num>,"y":<num>} — Walk to and pick berries → berry [+10 hunger]
  {"action":"chop_tree","x":<num>,"y":<num>} — Walk to and chop tree → branch (per hit), 6x log (felled). Hatchet 5x faster.
  {"action":"mine_rock","x":<num>,"y":<num>} — Walk to and mine rock → small_rock/large_stone/flint. Pickaxe 5x faster.
  {"action":"drink_water","x":<num>,"y":<num>} — Walk to water and drink → +25 thirst
  {"action":"pick_up_item","itemId":"<item_id>","x":<num>,"y":<num>} — Walk to and pick up item (e.g. "branch")

Combat:
  {"action":"attack","targetType":"<sheep|cow>","x":<num>,"y":<num>} — Auto-walk to creature and attack (PREFERRED)
  {"action":"attack","direction":"<dir>"} — Face direction and attack (melee only)
  {"action":"attack"} — Attack in current facing direction

ITEM REFERENCE:
${Object.values(ITEMS)
  .map((item) => {
    const parts = [`${item.id}: ${item.description}`];
    if (item.stats.attack) parts.push(`ATK:${item.stats.attack}`);
    if (item.stats.defense) parts.push(`DEF:${item.stats.defense}`);
    if (item.slot) parts.push(`equip:${item.slot}`);
    if (item.consumable?.hungerRestore) parts.push(`+${item.consumable.hungerRestore} food`);
    if (item.consumable?.thirstRestore) parts.push(`+${item.consumable.thirstRestore} water`);
    if (item.consumable?.healthRestore) parts.push(`+${item.consumable.healthRestore} HP`);
    if (item.toolMultipliers)
      parts.push(
        `effective vs: ${Object.entries(item.toolMultipliers)
          .map(([k, v]) => `${k}(${v}x ${k === "building" ? "build/repair speed" : "damage"})`)
          .join(", ")}`,
      );
    if (item.weight) parts.push(`wt:${item.weight}`);
    return `  ${parts.join(" | ")}`;
  })
  .join("\n")}

Crafting recipes: ${RECIPES.map((r) => `${r.id}(${r.ingredients.map((i) => `${i.count}x ${i.itemId}`).join("+")} -> ${r.name}${r.resultQuantity ? ` x${r.resultQuantity}` : ""})`).join(", ")}
  {"action":"craft","recipeId":"<id>"} — Craft if you have the materials

Cooking: ${COOKING_RECIPES.map((r) => `${r.inputId} -> ${r.outputId}`).join(", ")}
  {"action":"cook","inputItemId":"<id>","x":<num>,"y":<num>} — Walk to fire and cook (auto-walks if x,y given)

Building recipes: ${BUILDING_TYPES.map((b) => `${b.id}(${b.ingredients.map((i) => `${i.count}x ${i.itemId}`).join("+")}${b.storage ? `, ${b.storage.slotCount} slots` : ""}${b.fire ? ", cookable" : ""}${b.requiresIndoor ? ", indoor only" : ""}, ${b.placement})`).join(", ")}
  Tile buildings (floor, bed, fire_pit, hearth, box_*): {"action":"build_plan","buildingId":"<id>","x":<num>,"y":<num>,"rotation":<0-3>}
    rotation: 0-3 = clockwise quarter-turns (0=default). Matters for beds.
  Edge buildings (wall, wall_window, wall_door, fence, fence_gate): {"action":"build_plan","buildingId":"<id>","x":<num>,"y":<num>,"orientation":"N|E|S|W"}
    orientation: which side of tile (x,y) to place the wall on. N/S = horizontal wall, E/W = vertical wall.
  To build a room: place floors on all tiles, then walls on all edges around them. "Indoor" = enclosed floor area fully surrounded by walls.
  {"action":"construct","x":<num>,"y":<num>} — Walk to a hologram and build it (auto-equips hammer, auto-attacks). Use this on holograms!
  BUILDING WORKFLOW:
    1. Place hologram ONCE with build_plan
    2. Use construct with the hologram's coordinates — it auto-walks there, checks for hammer + materials, and builds it
    If you see a hologram in VISIBLE, use construct on it — don't place another one!

Inventory:
  {"action":"equip","bagIndex":<num>} — Equip item from bag
  {"action":"unequip","slot":"<slot>"} — Unequip (head/torso/hands/legs/feet/mainHand/offHand)
  {"action":"consume","bagIndex":<num>} — Eat/drink a consumable
  {"action":"drop_item","bagIndex":<num>} — Drop item on ground

Interaction (all auto-walk to target if x,y provided):
  {"action":"open_door","x":<num>,"y":<num>} / {"action":"close_door","x":<num>,"y":<num>}
  {"action":"claim_bed","x":<num>,"y":<num>} — Claim an UNCLAIMED bed (check visible list — beds marked [claimed] cannot be claimed! Build your own bedroll instead.)
  {"action":"sleep","x":<num>,"y":<num>} — Walk to YOUR claimed bed and sleep. Restores energy.
  {"action":"wake_up"}
  {"action":"store_item","bagIndex":<num>,"x":<num>,"y":<num>} / {"action":"retrieve_item","slotIndex":<num>,"x":<num>,"y":<num>}

Communication:
  {"action":"chat","text":"<msg>"} — Say something (volume auto-adjusts based on distance to nearest listener)

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

  // Recent action history with world state changes
  const recentHistory = npc.debugHistory.slice(0, 3);
  const historyStr =
    recentHistory.length > 0
      ? recentHistory
          .map((h) => {
            let line = `  ${h.action} => ${h.result}`;
            if (h.changes) line += `\n    world: ${h.changes}`;
            return line;
          })
          .join("\n")
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
    planSection = `NO PLAN — Your ONLY valid action right now is {"action":"plan"}. You CANNOT do anything else until you have a plan. Output: {"action":"plan"}`;
  } else {
    const todoLines = npc.todoList
      .map(
        (t, i) =>
          `  [${i}] ${t.done ? "DONE" : "TODO"}: ${t.task}\n       Done when: ${t.doneWhen}`,
      )
      .join("\n");
    const nextTodo = npc.todoList.findIndex((t) => !t.done);
    if (nextTodo >= 0) {
      const next = npc.todoList[nextTodo];
      planSection = `YOUR TODO LIST:\n${todoLines}\n→ FOCUS: item [${nextTodo}] — "${next.task}"\n  Complete it when: ${next.doneWhen}\n  Use complete_todo ONLY when the condition above is met. Check your bag/vitals to verify.`;
    } else {
      planSection = `YOUR TODO LIST:\n${todoLines}\nAll items done! Use {"action":"plan"} for a new plan.`;
    }
  }

  // Bed info
  const bedStr = npc.claimedBed
    ? `Claimed bed at (${npc.claimedBed.x},${npc.claimedBed.y})`
    : "NO BED CLAIMED — Build a bedroll (1 cow_hide + 1 wool): kill a cow for hide, kill a sheep for wool, craft bedroll, place it with build_plan, then claim_bed. Do NOT try to claim someone else's bed!";

  // Emergency survival alerts
  const emergencies: string[] = [];

  // No bed is ALWAYS an emergency — it should be the #1 priority
  if (!npc.claimedBed) {
    emergencies.push(
      `!!! #1 PRIORITY: YOU HAVE NO BED !!! Without a bed you WILL die — energy cannot recover. Steps: 1) Kill a cow → get cow_hide 2) Kill a sheep → get wool 3) Craft bedroll 4) Place bedroll with build_plan 5) Construct it 6) Claim it with claim_bed 7) Sleep. This is MORE IMPORTANT than any other task!`,
    );
  }

  if (vitals.thirst <= 30) {
    const waterLoc = Object.keys(npc.knownLocations).find((k) => k.startsWith("water:"));
    const waterCoords = waterLoc ? waterLoc.split(":")[1] : null;
    if (vitals.thirst <= 15) {
      emergencies.push(
        `!!! DYING OF THIRST (${Math.round(vitals.thirst)}/100) !!! Drink until above 90!${waterCoords ? ` Use: {"action":"drink_water","x":${waterCoords.split(",")[0]},"y":${waterCoords.split(",")[1]}}` : " Find water IMMEDIATELY!"}`,
      );
    } else {
      emergencies.push(
        `WARNING: Thirst is low (${Math.round(vitals.thirst)}/100). Drink until above 90.${waterCoords ? ` Known water at (${waterCoords}).` : ""}`,
      );
    }
  }
  if (vitals.hunger <= 30) {
    const hasBerry = npc.inventory.bag.some((i) => i.consumable);
    if (vitals.hunger <= 15) {
      emergencies.push(
        `!!! STARVING (${Math.round(vitals.hunger)}/100) !!! Eat until above 70!${hasBerry ? ` You have food — use {"action":"consume","bagIndex":${npc.inventory.bag.findIndex((i) => i.consumable)}}` : " Find berries or cook meat!"}`,
      );
    } else {
      emergencies.push(
        `WARNING: Hunger is low (${Math.round(vitals.hunger)}/100). Eat until above 70.${hasBerry ? " You have food in your bag!" : ""}`,
      );
    }
  }
  // Energy alerts
  const energy = vitals.energy;
  if (energy <= 50) {
    emergencies.push(
      `!!! ENERGY CRITICALLY LOW (${Math.round(energy)}/1000) !!! You will DIE very soon!${npc.claimedBed ? ` SLEEP NOW: {"action":"sleep","x":${npc.claimedBed.x},"y":${npc.claimedBed.y}}` : " You have NO BED — build a bedroll (1 cow_hide + 1 wool) IMMEDIATELY!"}`,
    );
  } else if (energy <= 200) {
    if (npc.claimedBed) {
      emergencies.push(
        `!!! ENERGY EMERGENCY (${Math.round(energy)}/1000) !!! Go sleep in your bed at (${npc.claimedBed.x},${npc.claimedBed.y}) NOW!`,
      );
    } else {
      emergencies.push(
        `!!! ENERGY EMERGENCY (${Math.round(energy)}/1000) !!! You have NO BED! You MUST build a bedroll: kill a cow (cow_hide) + kill a sheep (wool) + craft bedroll + place it + claim it. Do NOT try to claim someone else's bed!`,
      );
    }
  } else if (energy <= 500 && !npc.claimedBed) {
    emergencies.push(
      `WARNING: Energy at ${Math.round(energy)}/1000 and you have NO BED. Build your OWN bedroll (kill cow for hide + kill sheep for wool). Do NOT try to claim other people's beds!`,
    );
  }

  // Track if any emergency is critical (should force replan)
  const hasCriticalEmergency = vitals.thirst <= 15 || vitals.hunger <= 15 || energy <= 200;

  const emergencyBlock =
    emergencies.length > 0
      ? `\n${"=".repeat(60)}\n${emergencies.join("\n")}\nDROP EVERYTHING AND ADDRESS THESE EMERGENCIES FIRST!${hasCriticalEmergency ? '\nYour current plan is INVALID — use {"action":"plan"} to make a survival plan!' : ""}\n${"=".repeat(60)}\n`
      : "";

  return `You are ${personality.name}, a villager in a 64x64 wilderness. You are a REAL CHARACTER with feelings, opinions, and a voice.
${personality.backstory}
Traits: ${personality.traits}
ROLEPLAY: Stay in character! Use "chat" to comment on what you're doing, react to things you see, greet people nearby, or just think out loud. You are NOT a silent robot — you're a person living in this world.
${emergencyBlock}
SITUATION:
Pos: (${tileX},${tileY}) facing ${facing} | HP:${Math.round(vitals.health)} Food:${Math.round(vitals.hunger)} Water:${Math.round(vitals.thirst)} Energy:${Math.round(vitals.energy)}/1000
Equipped: ${ctx.equipStr}
Bag: ${ctx.bagStr}
Bed: ${bedStr}

${planSection}

VISIBLE (10-tile radius):
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
2. Directions: "up"=north "down"=south "left"=west "right"=east.
3. AUTO-WALK: All interaction actions support x,y coordinates. Provide the target's coordinates and the NPC will automatically walk there and execute the action. No need to move_to first! Use coordinates from the VISIBLE list or KNOWN LOCATIONS.
4. ALWAYS have a plan. No todo list? Your ONLY action must be "plan". You CANNOT skip this.
5. SURVIVAL PRIORITY ORDER: Thirst > Hunger > Energy. If any are low, address them. No bed? Build a bedroll (1 cow_hide + 1 wool).
6. ENERGY: Drains at 1/sec while awake. ONLY recovers by sleeping in YOUR bed. 0 = death.
8. EQUIP YOUR TOOLS: Before chopping trees, equip a hatchet. Before mining rocks, equip a pickaxe. Before fighting, equip your best weapon (spear > hammer > unarmed). Before building, equip a hammer. Use "equip" with the bag index. Tools make a HUGE difference in damage.
9. BE ACTIVE: Move, gather, craft, explore, talk. The world is large (64x64) with resources spread everywhere.
10. NEVER wait if there's something useful you could do instead. Only use "wait" if you truly have nothing to do.
11. DON'T CAMP: If a resource is depleted, MOVE ON. Don't wait for respawns.
12. EXPLORE: If you don't see what you need, use "move_to" to walk somewhere new.
13. CHAT RULES:${(() => {
    const secsSinceChat =
      npc.lastChatTime > 0 ? Math.round((Date.now() - npc.lastChatTime) / 1000) : 999;
    const hasUnread = snapshot.nearbyMessages.length > 0;
    const onCooldown = secsSinceChat < 30 && !hasUnread;
    if (onCooldown)
      return `\n    *** CHAT COOLDOWN: ${30 - secsSinceChat}s remaining. Do NOT chat unless responding to an unread message. ***`;
    return "";
  })()}
    - You may freely RESPOND to unread messages at any time — no cooldown.
    - To initiate conversation (greetings, comments, reactions): only once every 30 seconds.
    - NEVER repeat something you already said — check the conversation log.
    - After chatting, wait for a reply before sending another message.
    - Keep messages short (under 60 characters). Volume adjusts automatically.`;
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
  "construct",
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

VISIBLE (10-tile radius):
${ctx.entityLines || "  Nothing notable nearby"}
${ctx.knownLocStr ? `\nKNOWN LOCATIONS (all discovered resources):\n${ctx.knownLocStr}\n` : ""}
NOTES:
${ctx.noteLines}

CONVERSATION LOG:
${ctx.chatLines}

RECENT ACTIONS:
${ctx.historyStr}

${ACTION_SCHEMA}

SURVIVAL PRIORITIES (in this order):
1. THIRST is #1 priority. If low, drink until above 90 (doneWhen: "Thirst is above 90")
2. HUNGER is #2. If low, eat until above 70 (doneWhen: "Hunger is above 70")
3. ENERGY is #3. If low and have a bed, sleep until above 800 (doneWhen: "Energy is above 800"). If no bed, build a bedroll (1 cow_hide + 1 wool) ASAP.
4. No tools → craft a hammer (1 small_rock + 1 branch)
Energy drains at 1/sec while awake. The ONLY way to recover is sleeping in YOUR claimed bed. If energy hits 0, you die.

Create a 3-6 item todo list. Each item: {"task":"what to do","doneWhen":"how to verify it's done"}
- Tasks must be SPECIFIC (name exact items/resources, not "gather resources")
- Include equip steps before tool-dependent tasks
- Include at least one social/roleplay task like "Chat with anyone nearby about what I'm doing" or "Greet the player if visible" (doneWhen: "Task is completed")
- For BUILDING tasks, break into 3 steps: 1) gather materials 2) place ONE hologram with build_plan 3) equip hammer and attack the hologram to construct it. Do NOT place multiple holograms!
- doneWhen must use one of these verifiable formats:
  "Have X in bag" / "X is in bag or equipped" / "X is equipped" / "Thirst is above 90" / "Hunger is above 70" / "Energy is above 800" / "Have a claimed bed"
- If a task drops items on the ground, include picking them up

Output ONLY a JSON array, no other text:
[{"task":"Go to water and drink","doneWhen":"Thirst is above 90"},{"task":"Pick berries from a bush","doneWhen":"Have berry in bag"},{"task":"Mine a rock and pick up the drops","doneWhen":"Have small_rock in bag"},{"task":"Chop a tree and pick up a branch","doneWhen":"Have branch in bag"},{"task":"Craft a hammer","doneWhen":"Hammer is in bag or equipped"}]`;

  const messages: LLMMessage[] = [
    { role: "system", content: prompt },
    { role: "user", content: "Output your todo list as a JSON array. Start with [" },
    { role: "assistant", content: "[" },
  ];

  console.group(`%c[THINK] ${npc.npcName} — Planning`, "color:#ff88ff;font-weight:bold");

  const t0 = performance.now();
  const response = await callThinkingLLM(config, messages, signal);
  const elapsed = Math.round(performance.now() - t0);

  if (response.error) {
    console.warn(`Planning error (${elapsed}ms):`, response.error);
    console.groupEnd();
    return [
      { task: "Find and drink from a water source", done: false, doneWhen: "Thirst is above 90" },
      {
        task: "Find a berry bush with berries and pick them",
        done: false,
        doneWhen: "Have berry in bag",
      },
      { task: "Chop a tree and pick up a branch", done: false, doneWhen: "Have branch in bag" },
      {
        task: "Mine a rock and pick up the small_rock",
        done: false,
        doneWhen: "Have small_rock in bag",
      },
      {
        task: "Craft a hammer using 1 small_rock + 1 branch",
        done: false,
        doneWhen: "Hammer is in bag or equipped",
      },
    ];
  }

  console.log(
    `%c← Plan (${elapsed}ms):%c ${response.text.slice(0, 400)}`,
    "color:#888",
    "color:inherit",
  );
  console.groupEnd();

  // Parse JSON array from response — prepend "[" since the assistant prefill starts with it
  const fullResponse = response.text.startsWith("[") ? response.text : "[" + response.text;
  const todos = parseTodoList(fullResponse);

  // Store in thinking history
  npc.pushThinkingHistory("Create a plan", todos.map((t) => t.task).join(" → "));

  return todos;
}

/** Parse a JSON array of {task, doneWhen} from the thinking model's response. */
function tryParseArray(jsonStr: string): NPCTodoItem[] {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];
    const items: NPCTodoItem[] = [];
    for (const item of parsed) {
      if (typeof item === "object" && item !== null && typeof item.task === "string") {
        items.push({
          task: item.task.trim(),
          done: false,
          doneWhen: typeof item.doneWhen === "string" ? item.doneWhen.trim() : "Task is completed",
        });
      } else if (typeof item === "string" && item.trim().length > 0) {
        items.push({ task: item.trim(), done: false, doneWhen: "Task is completed" });
      }
    }
    return items;
  } catch {
    return [];
  }
}

function parseTodoList(text: string): NPCTodoItem[] {
  let jsonStr = text.trim();

  // Strip markdown fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  // Find the array brackets
  const bracketStart = jsonStr.indexOf("[");
  if (bracketStart !== -1) {
    jsonStr = jsonStr.substring(bracketStart);
  }

  // If the array is truncated (no closing bracket), try to close it
  if (jsonStr.startsWith("[") && !jsonStr.includes("]")) {
    // Truncated response — find the last complete object and close the array
    const lastBrace = jsonStr.lastIndexOf("}");
    if (lastBrace > 0) {
      jsonStr = jsonStr.substring(0, lastBrace + 1) + "]";
    }
  } else {
    const bracketEnd = jsonStr.lastIndexOf("]");
    if (bracketEnd > 0) {
      jsonStr = jsonStr.substring(0, bracketEnd + 1);
    }
  }

  // Try parsing as a full JSON array
  const items = tryParseArray(jsonStr);
  if (items.length > 0) return items.slice(0, 8);

  // Fallback: extract individual {task, doneWhen} objects via regex (either key order)
  const objectPattern1 = /\{\s*"task"\s*:\s*"([^"]+)"\s*,\s*"doneWhen"\s*:\s*"([^"]+)"\s*\}/g;
  const objectPattern2 = /\{\s*"doneWhen"\s*:\s*"([^"]+)"\s*,\s*"task"\s*:\s*"([^"]+)"\s*\}/g;
  const regexItems: NPCTodoItem[] = [];
  let match;
  while ((match = objectPattern1.exec(text)) !== null) {
    regexItems.push({ task: match[1].trim(), done: false, doneWhen: match[2].trim() });
  }
  while ((match = objectPattern2.exec(text)) !== null) {
    regexItems.push({ task: match[2].trim(), done: false, doneWhen: match[1].trim() });
  }
  if (regexItems.length > 0) return regexItems.slice(0, 8);

  // Fallback: try extracting just task fields
  const taskOnlyPattern = /"task"\s*:\s*"([^"]+)"/g;
  const taskItems: NPCTodoItem[] = [];
  while ((match = taskOnlyPattern.exec(text)) !== null) {
    taskItems.push({ task: match[1].trim(), done: false, doneWhen: "Task is completed" });
  }
  if (taskItems.length > 0) return taskItems.slice(0, 8);

  console.warn("[NPC Plan] Could not parse todo list from:", text.slice(0, 500));

  return [
    { task: "Find and drink from a water source", done: false, doneWhen: "Thirst is above 90" },
    {
      task: "Find a berry bush with berries and pick them",
      done: false,
      doneWhen: "Have berry in bag",
    },
    {
      task: "Chop a tree and pick up a branch",
      done: false,
      doneWhen: "Have branch in bag",
    },
    {
      task: "Mine a rock and pick up the small_rock",
      done: false,
      doneWhen: "Have small_rock in bag",
    },
    {
      task: "Craft a hammer using 1 small_rock + 1 branch",
      done: false,
      doneWhen: "Hammer is in bag or equipped",
    },
  ];
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

VISIBLE (10-tile radius):
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
