/**
 * NPC Brain — Prompt construction, world snapshot assembly,
 * LLM response parsing, and decision dispatch.
 *
 * Prompt is structured as XML with 3 content blocks optimised for caching:
 *   Block 1 (cached): <INSTRUCTIONS> + <ACTION_DEFINITIONS>  — shared across ALL NPCs
 *   Block 2 (cached): <CHARACTER_DEFINITION>                  — per-NPC identity
 *   Block 3 (volatile): state, world, social, memory, action log
 */

import type { NPC } from "../actors/npc.ts";
import type { WorldSnapshot, NPCAction, EntityInfo, NPCGoal, NPCStep } from "../types/npc.ts";
import type { ChatMessage } from "../types/chat.ts";
import type { LLMProviderConfig, LLMMessage, LLMContentBlock } from "./llm-provider.ts";
import { callLLM, callThinkingLLM } from "./llm-provider.ts";
import { getItemQuantity } from "../types/item.ts";
import { RECIPES } from "../data/recipes.ts";
import { BUILDING_TYPES } from "../data/buildings.ts";
import { COOKING_RECIPES } from "../data/cooking.ts";
import { ITEMS } from "../data/items.ts";

// ═════════════════════════════════════════════════════════════════════
// Block 1 — Shared static content (cached, identical across ALL NPCs)
// ═════════════════════════════════════════════════════════════════════

const SHARED_STATIC = `<INSTRUCTIONS>
RULES — READ CAREFULLY:
1. Follow the output format specified for your current task.
2. Directions: "up"=north "down"=south "left"=west "right"=east.
3. AUTO-WALK: All interaction actions support x,y coordinates. Provide the target's coordinates and the NPC will automatically walk there and execute the action. No need to move_to first! Use coordinates from KNOWN_GAME_WORLD or WORLD_VIEW.
4. ALWAYS have a goal. No goal? Your ONLY action must be <plan/>. You CANNOT skip this.
5. SURVIVAL ALWAYS COMES FIRST: Thirst > Hunger > Energy. If EMERGENCY_ALERTS exist, you MUST address them before doing ANYTHING else — ignore your current plan. Thirst drains FAST (empty in 4 min). Drink at water when below 60, eat when below 50. No bed? Place a bedroll with <build_plan buildingId="bedroll" x="NUM" y="NUM"/> (costs 1 cow_hide + 1 wool — bedroll is a BUILDING, not a craft recipe).
6. ENERGY: Drains at 1/sec while awake. ONLY recovers by sleeping in YOUR bed. At 0 energy you are EXHAUSTED — you can only sleep, eat, and chat. You cannot gather, build, attack, or move normally. Half speed.
8. EQUIP YOUR TOOLS: Before chopping trees, equip a hatchet. Before mining rocks, equip a pickaxe. Before fighting, equip your best weapon (spear > hammer > unarmed). Before building, equip a hammer. Use "equip" with the bag index. Tools make a HUGE difference in damage.
9. BE ACTIVE: Move, gather, craft, explore, talk. The world is large (64x64) with resources spread everywhere.
10. NEVER wait if there's something useful you could do instead. Only use "wait" if you truly have nothing to do.
11. DON'T CAMP: If a resource is depleted, MOVE ON. Don't wait for respawns.
12. EXPLORE: If you don't see what you need, use "move_to" to walk somewhere new.

CHAT RULES:
- You may freely RESPOND to unread messages at any time — no cooldown.
- To initiate conversation (greetings, comments, reactions): only once every 30 seconds.
- NEVER repeat something you already said — check the conversation log.
- After chatting, wait for a reply before sending another message.
- Keep messages short (under 60 characters). Volume adjusts automatically.
</INSTRUCTIONS>

<ACTION_DEFINITIONS>
AVAILABLE ACTIONS (output ONE as an XML element):

Planning & Thinking:
  <plan/> — Create a new goal with steps. Use when you have no goal or need a completely new direction.
  <modify_plan/> — Add steps to your current goal without removing existing ones. Use when you're stuck or need extra steps. Preserves your goal.
  <complete_step stepIndex="NUM"/> — Mark a step as done. When all steps are done, a new plan is created automatically.
  <think/> — Consult your reasoning mind for advice on what to do next

Movement:
  <move_to x="NUM" y="NUM"/> — Walk to a tile (auto-pathfinds, use for ALL movement)

Gathering (all auto-walk to target if x,y provided, auto-find adjacent resource, no direction needed):
  <pick_bush x="NUM" y="NUM"/> — Walk to and pick berries → berry [+10 hunger]
  <chop_tree x="NUM" y="NUM" autoRepeat="true"/> — Walk to and chop tree until felled → branch (per hit), 6x log (felled). Hatchet 5x faster. Use autoRepeat="true" to keep chopping until the tree falls.
  <mine_rock x="NUM" y="NUM" autoRepeat="true"/> — Walk to and mine rock until items drop → small_rock/large_stone/flint. Pickaxe 5x faster. Use autoRepeat="true" to keep mining until a drop.
  <drink_water x="NUM" y="NUM"/> — Walk to water and drink → +25 thirst
  <pick_up_item itemId="ITEM_ID" x="NUM" y="NUM"/> — Walk to and pick up item (e.g. "branch")

Combat:
  <attack targetType="sheep|cow" x="NUM" y="NUM" autoRepeat="true"/> — Auto-walk to creature and attack. Use autoRepeat="true" to keep attacking until it dies.
  <attack direction="DIR"/> — Face direction and attack (melee only)
  <attack/> — Attack in current facing direction

<ITEM_REFERENCE>
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
</ITEM_REFERENCE>

<CRAFTING_RECIPES>
  <craft recipeId="ID"/> — Craft if you have the materials
${RECIPES.map((r) => `  <recipe id="${r.id}" ingredients="${r.ingredients.map((i) => `${i.count}x ${i.itemId}`).join(", ")}" result="${r.name}${r.resultQuantity ? ` x${r.resultQuantity}` : ""}"/>`).join("\n")}
</CRAFTING_RECIPES>

<COOKING_RECIPES>
  <cook inputItemId="ID" x="NUM" y="NUM"/> — Walk to a BURNING fire and cook. Fire must be lit first! To light a fire_pit or hearth, walk to it and interact with 1 flint + 1 log in your bag.
${COOKING_RECIPES.map((r) => `  <recipe input="${r.inputId}" output="${r.outputId}"/>`).join("\n")}
</COOKING_RECIPES>

<BUILDING_RECIPES>
  Tile buildings (floor, bed, fire_pit, hearth, box_*):
    <build_plan buildingId="ID" x="NUM" y="NUM" rotation="0-3"/>
    rotation: 0-3 = clockwise quarter-turns (0=default). Matters for beds.
  Edge buildings (wall, wall_window, wall_door, fence, fence_gate):
    <build_plan buildingId="ID" x="NUM" y="NUM" orientation="N|E|S|W"/>
    orientation: which side of tile (x,y) to place the wall on. N/S = horizontal wall, E/W = vertical wall.
  To build a room: place floors on all tiles, then walls on all edges around them. "Indoor" = enclosed floor area fully surrounded by walls.
  <construct x="NUM" y="NUM"/> — Walk to a hologram and build it (auto-equips hammer, auto-attacks). Use this on holograms!
  BUILDING WORKFLOW:
    1. Place hologram ONCE with build_plan
    2. Use construct with the hologram's coordinates — it auto-walks there, checks for hammer + materials, and builds it
    If you see a hologram in VISIBLE, use construct on it — don't place another one!
${BUILDING_TYPES.map((b) => `  <building id="${b.id}" ingredients="${b.ingredients.map((i) => `${i.count}x ${i.itemId}`).join(", ")}" placement="${b.placement}"${b.storage ? ` storage="${b.storage.slotCount} slots"` : ""}${b.fire ? ' cookable="true"' : ""}${b.requiresIndoor ? ' indoor="true"' : ""}/>`).join("\n")}
</BUILDING_RECIPES>

Inventory:
  <equip bagIndex="NUM"/> — Equip item from bag
  <unequip slot="SLOT"/> — Unequip (head/torso/hands/legs/feet/mainHand/offHand)
  <consume bagIndex="NUM"/> — Eat/drink a consumable
  <drop_item bagIndex="NUM"/> — Drop item on ground

Interaction (all auto-walk to target if x,y provided):
  <open_door x="NUM" y="NUM"/> / <close_door x="NUM" y="NUM"/>
  <claim_bed x="NUM" y="NUM"/> — Claim an UNCLAIMED bed (check visible list — beds marked [claimed] cannot be claimed! Place your own bedroll with build_plan instead.)
  <sleep x="NUM" y="NUM"/> — Walk to YOUR claimed bed and sleep. Restores energy.
  <wake_up/>
  <store_item bagIndex="NUM" x="NUM" y="NUM"/> / <retrieve_item slotIndex="NUM" x="NUM" y="NUM"/>

Communication:
  <chat text="MSG"/> — Say something (volume auto-adjusts based on distance to nearest listener)

Memory:
  <remember note="TEXT"/> — Save a note (max 20)
  <forget noteIndex="NUM"/> — Delete a note

Wait (LAST RESORT — prefer moving/exploring instead):
  <wait durationMs="2000-8000"/> — Only if truly nothing to do
</ACTION_DEFINITIONS>`;

// ═════════════════════════════════════════════════════════════════════
// Block 2 — Per-NPC character definition (cached per NPC identity)
// ═════════════════════════════════════════════════════════════════════

function buildCharacterBlock(npc: NPC): string {
  const { personality } = npc;
  return `<CHARACTER_DEFINITION>
You are ${personality.name}, a villager in a 64x64 wilderness. You are a REAL CHARACTER with feelings, opinions, and a voice.
${personality.backstory}
Traits: ${personality.traits}
ROLEPLAY: Stay in character! Use "chat" to comment on what you're doing, react to things you see, greet people nearby, or just think out loud. You are NOT a silent robot — you're a person living in this world.
</CHARACTER_DEFINITION>`;
}

// ═════════════════════════════════════════════════════════════════════
// Block 3 — Volatile state (NOT cached, changes every call)
// ═════════════════════════════════════════════════════════════════════

/** Shared context assembly — collects all volatile NPC/world state. */
function buildContextParts(npc: NPC, snapshot: WorldSnapshot) {
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

  // Action log (replaces old 3-item debugHistory in prompt)
  const actionLogLines =
    npc.actionLog.length > 0
      ? npc.actionLog
          .map((e) => {
            let line = `  [${e.tick}] ${e.action} → ${e.result}`;
            if (e.changes) line += ` | world: ${e.changes}`;
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
    actionLogLines,
    thinkingLines,
  };
}

/** Build emergency alerts (survival warnings). Returns empty string if no emergencies. */
function buildEmergencyAlerts(npc: NPC): { block: string; hasCritical: boolean } {
  const { vitals } = npc;
  const emergencies: string[] = [];

  // No bed is ALWAYS an emergency — it should be the #1 priority
  if (!npc.claimedBed) {
    emergencies.push(
      `!!! #1 PRIORITY: YOU HAVE NO BED !!! Without a bed you WILL DIE — energy cannot recover, at 0 energy you become exhausted and helpless, then thirst/hunger drain your HP to 0. Full steps: 1) Mine rock → small_rock 2) Chop tree → branch 3) Craft hammer (1 small_rock + 1 branch) 4) Kill a cow → cow_hide 5) Kill a sheep → wool 6) Place bedroll with <build_plan buildingId="bedroll" x="X" y="Y"/> (costs 1 cow_hide + 1 wool — bedroll is a BUILDING, NOT a craft recipe!) 7) Equip hammer + <construct x="X" y="Y"/> the hologram 8) <claim_bed x="X" y="Y"/> 9) Sleep. This is MORE IMPORTANT than anything else!`,
    );
  }

  if (vitals.thirst <= 60) {
    const waterLoc = Object.keys(npc.knownLocations).find((k) => k.startsWith("water:"));
    const waterCoords = waterLoc ? waterLoc.split(":")[1] : null;
    if (vitals.thirst <= 20) {
      emergencies.push(
        `!!! DYING OF THIRST (${Math.round(vitals.thirst)}/100) !!! DROP EVERYTHING and drink until above 90!${waterCoords ? ` Use: <drink_water x="${waterCoords.split(",")[0]}" y="${waterCoords.split(",")[1]}"/>` : " Find water IMMEDIATELY!"}`,
      );
    } else if (vitals.thirst <= 40) {
      emergencies.push(
        `!!! THIRST CRITICAL (${Math.round(vitals.thirst)}/100) !!! You will die soon. Go drink water NOW — drink until above 90.${waterCoords ? ` Use: <drink_water x="${waterCoords.split(",")[0]}" y="${waterCoords.split(",")[1]}"/>` : " Find water!"}`,
      );
    } else {
      emergencies.push(
        `WARNING: Thirst dropping (${Math.round(vitals.thirst)}/100). Go drink water soon — you dehydrate fast.${waterCoords ? ` Known water at (${waterCoords}).` : ""}`,
      );
    }
  }
  if (vitals.hunger <= 50) {
    const hasBerry = npc.inventory.bag.some((i) => i.consumable);
    const berryIdx = npc.inventory.bag.findIndex((i) => i.consumable);
    if (vitals.hunger <= 20) {
      emergencies.push(
        `!!! STARVING (${Math.round(vitals.hunger)}/100) !!! DROP EVERYTHING and eat until above 70!${hasBerry ? ` You have food — use <consume bagIndex="${berryIdx}"/>` : " Find berries or cook meat!"}`,
      );
    } else if (vitals.hunger <= 35) {
      emergencies.push(
        `!!! HUNGER CRITICAL (${Math.round(vitals.hunger)}/100) !!! Eat food NOW — eat until above 70.${hasBerry ? ` Use <consume bagIndex="${berryIdx}"/>` : " Find berry bushes!"}`,
      );
    } else {
      emergencies.push(
        `WARNING: Getting hungry (${Math.round(vitals.hunger)}/100). Eat soon — find berries or cook meat.${hasBerry ? " You have food in your bag!" : ""}`,
      );
    }
  }
  // Energy alerts
  const energy = vitals.energy;
  if (energy <= 50) {
    emergencies.push(
      `!!! ENERGY CRITICALLY LOW (${Math.round(energy)}/1000) !!! At 0 you will be EXHAUSTED and unable to do anything except sleep!${npc.claimedBed ? ` SLEEP NOW: <sleep x="${npc.claimedBed.x}" y="${npc.claimedBed.y}"/>` : ' You have NO BED — place a bedroll with <build_plan buildingId="bedroll"/> (1 cow_hide + 1 wool) IMMEDIATELY! Bedroll is a BUILDING, not a craft recipe!'}`,
    );
  } else if (energy <= 200) {
    if (npc.claimedBed) {
      emergencies.push(
        `!!! ENERGY EMERGENCY (${Math.round(energy)}/1000) !!! Go sleep in your bed at (${npc.claimedBed.x},${npc.claimedBed.y}) NOW!`,
      );
    } else {
      emergencies.push(
        `!!! ENERGY EMERGENCY (${Math.round(energy)}/1000) !!! You have NO BED! You MUST: kill a cow (cow_hide) + kill a sheep (wool) + place bedroll with build_plan (bedroll is a BUILDING, NOT a craft recipe!) + construct it + claim it. Do NOT try to claim someone else's bed!`,
      );
    }
  } else if (energy <= 500 && !npc.claimedBed) {
    emergencies.push(
      `WARNING: Energy at ${Math.round(energy)}/1000 and you have NO BED. Place your OWN bedroll with build_plan (kill cow for hide + kill sheep for wool — bedroll is a BUILDING, not a craft recipe!). Do NOT try to claim other people's beds!`,
    );
  }

  if (emergencies.length === 0) return { block: "", hasCritical: false };

  const hasCritical = vitals.thirst <= 20 || vitals.hunger <= 20 || energy <= 200;

  return {
    block: `<EMERGENCY_ALERTS>
${emergencies.join("\n")}
DROP EVERYTHING AND ADDRESS THESE EMERGENCIES FIRST!
</EMERGENCY_ALERTS>`,
    hasCritical,
  };
}

/** Build the volatile Block 3 content for a given mode. */
function buildVolatileBlock(
  npc: NPC,
  snapshot: WorldSnapshot,
  mode: "action" | "plan" | "modify_plan" | "think",
): string {
  const ctx = buildContextParts(npc, snapshot);
  const { vitals, facing, tileX, tileY } = npc;
  const { block: emergencyBlock } = buildEmergencyAlerts(npc);

  // Bed info
  const bedStr = npc.claimedBed
    ? `Claimed bed at (${npc.claimedBed.x},${npc.claimedBed.y})`
    : 'NO BED CLAIMED — Place a bedroll with build_plan (1 cow_hide + 1 wool): kill a cow for hide, kill a sheep for wool, then <build_plan buildingId="bedroll" x="X" y="Y"/> + construct + claim_bed. Bedroll is a BUILDING, NOT a craft recipe! Do NOT try to claim someone else\'s bed!';

  // Goal + steps section
  let planSection: string;
  if (!npc.currentGoal) {
    planSection = `NO GOAL — Your ONLY valid action right now is <plan/>. You CANNOT do anything else until you have a goal. Output: <plan/>`;
  } else {
    const { goal, reason, steps } = npc.currentGoal;
    const stepLines = steps
      .map(
        (s, i) =>
          `  [${i}] ${s.done ? "DONE" : "TODO"}: ${s.task}\n       Done when: ${s.doneWhen}`,
      )
      .join("\n");
    const nextStep = steps.findIndex((s) => !s.done);
    if (nextStep >= 0) {
      const next = steps[nextStep];
      planSection = `CURRENT GOAL: ${goal}\nWHY: ${reason}\n\nSTEPS:\n${stepLines}\n→ FOCUS: step [${nextStep}] — "${next.task}"\n  Complete when: ${next.doneWhen}\n  Use <complete_step stepIndex="${nextStep}"/> when done. Check your bag/vitals to verify.`;
    } else {
      planSection = `CURRENT GOAL: ${goal} (ALL STEPS COMPLETE — replanning...)`;
    }
  }

  // Chat cooldown status (dynamic part of chat rules)
  const chatCooldown = (() => {
    const secsSinceChat =
      npc.lastChatTime > 0 ? Math.round((Date.now() - npc.lastChatTime) / 1000) : 999;
    const hasUnread = snapshot.nearbyMessages.length > 0;
    const onCooldown = secsSinceChat < 30 && !hasUnread;
    if (onCooldown)
      return `\n    *** CHAT COOLDOWN: ${30 - secsSinceChat}s remaining. Do NOT chat unless responding to an unread message. ***`;
    return "";
  })();

  // Assemble the volatile block
  const sections: string[] = [];

  // Emergency alerts (only present when there are emergencies)
  if (emergencyBlock) sections.push(emergencyBlock);

  // Survival status indicators
  const waterStatus =
    vitals.thirst <= 20
      ? "DYING"
      : vitals.thirst <= 40
        ? "CRITICAL"
        : vitals.thirst <= 60
          ? "LOW"
          : "ok";
  const foodStatus =
    vitals.hunger <= 20
      ? "STARVING"
      : vitals.hunger <= 35
        ? "CRITICAL"
        : vitals.hunger <= 50
          ? "LOW"
          : "ok";
  const energyStatus =
    vitals.energy <= 50
      ? "EXHAUSTED"
      : vitals.energy <= 200
        ? "CRITICAL"
        : vitals.energy <= 500
          ? "LOW"
          : "ok";

  // Character state
  sections.push(`<CHARACTER_STATE>
Pos: (${tileX},${tileY}) facing ${facing} | HP:${Math.round(vitals.health)}
Water: ${Math.round(vitals.thirst)}/100 [${waterStatus}] | Food: ${Math.round(vitals.hunger)}/100 [${foodStatus}] | Energy: ${Math.round(vitals.energy)}/1000 [${energyStatus}]
Equipped: ${ctx.equipStr}
Bag: ${ctx.bagStr}
Bed: ${bedStr}

${planSection}
</CHARACTER_STATE>`);

  // Known game world (NPC's discovered knowledge + visible entities)
  sections.push(`<KNOWN_GAME_WORLD>
VISIBLE (10-tile radius):
${ctx.entityLines || "  Nothing here — you should EXPLORE by moving!"}
${ctx.knownLocStr ? `\nKNOWN LOCATIONS (places you've discovered — use these to navigate!):\n${ctx.knownLocStr}` : ""}
</KNOWN_GAME_WORLD>`);

  // Social (conversation + chat cooldown)
  sections.push(`<SOCIAL>
CONVERSATION LOG (last 5 min):
${ctx.chatLines}${ctx.newMsgLines ? `\n\nNEW UNREAD MESSAGES:\n${ctx.newMsgLines}\n(You should respond to these!)` : ""}${chatCooldown}
</SOCIAL>`);

  // Memory (notes + thinking history)
  sections.push(`<MEMORY>
NOTES:
${ctx.noteLines}
${ctx.thinkingLines ? `\nTHINKING LOG (your reasoning model's advice):\n${ctx.thinkingLines}` : ""}
</MEMORY>`);

  // Action log (last 30 actions + results)
  sections.push(`<ACTION_LOG>
${ctx.actionLogLines}
</ACTION_LOG>`);

  // Mode-specific task appendix
  if (mode === "action") {
    sections.push(`<ACTION_TASK>
Output ONLY one self-closing XML action element from ACTION_DEFINITIONS. No text, no markdown, no explanation.
Example: <move_to x="10" y="20"/>
</ACTION_TASK>`);
  } else if (mode === "plan") {
    sections.push(buildPlanningTask(npc, ctx));
  } else if (mode === "modify_plan") {
    sections.push(buildModifyPlanTask(npc));
  } else if (mode === "think") {
    sections.push(`<THINKING_TASK>
Analyze the current situation and give concise, actionable advice. What should this villager focus on right now? Consider survival priorities (water, food, energy/bed), available resources, and personality. Be specific with coordinates and item names.
</THINKING_TASK>`);
  }

  return sections.join("\n\n");
}

/** Build the <PLANNING_TASK> appendix for the thinking model. */
function buildPlanningTask(npc: NPC, _ctx: ReturnType<typeof buildContextParts>): string {
  const { vitals } = npc;

  // Build survival preamble
  const mandatoryFirst: string[] = [];
  if (vitals.thirst <= 60)
    mandatoryFirst.push(
      `Your FIRST step MUST be about drinking water — thirst is at ${Math.round(vitals.thirst)}/100 and drains fast (empty in 4 min)!`,
    );
  if (vitals.hunger <= 50)
    mandatoryFirst.push(
      `Include an early step to eat food — hunger is at ${Math.round(vitals.hunger)}/100!`,
    );
  if (vitals.energy <= 500 && npc.claimedBed)
    mandatoryFirst.push(
      `Include a step to sleep — energy is at ${Math.round(vitals.energy)}/1000!`,
    );

  const mandatoryBlock =
    mandatoryFirst.length > 0
      ? `\n!!! MANDATORY SURVIVAL STEPS !!!\n${mandatoryFirst.join("\n")}\n`
      : "";

  // Show previous goal for context if it exists
  const prevGoalContext = npc.currentGoal
    ? `\nPrevious goal was: "${npc.currentGoal.goal}" (${npc.currentGoal.reason})\nYou may continue this goal with new steps, or pick a completely new goal.\n`
    : "";

  return `<PLANNING_TASK>
SURVIVAL PRIORITIES — vitals drain constantly, you WILL die if you don't maintain them:
1. THIRST is #1 (empties in 4 min!). If below 60, drink until above 90.
2. HUNGER is #2 (empties in 8 min). If below 50, eat until above 70.
3. ENERGY is #3. If low and have a bed, sleep until above 800. If no bed, place a bedroll with build_plan (1 cow_hide + 1 wool — bedroll is a BUILDING, not a craft recipe!) ASAP.
4. No tools → craft a hammer (1 small_rock + 1 branch)
${mandatoryBlock}${prevGoalContext}
Create a GOAL (what you want to achieve) with a REASON (why it matters now) and 2-3 immediate STEPS.
Steps will be refreshed when complete — don't try to plan everything upfront, just the next 2-3 things.

Rules:
- Steps describe GOALS, not exact actions. Say "Chop a tree" not "Chop tree at (5,10)"
- doneWhen must use: "Have X in bag" / "X is in bag or equipped" / "X is equipped" / "Thirst is above 90" / "Hunger is above 70" / "Energy is above 800" / "Have a claimed bed" / "Task is completed"
- For BUILDING: 1) gather materials 2) place hologram with build_plan 3) construct it. Bedroll is a BUILDING, NOT a craft recipe!

Output ONLY a JSON object, no other text:
{"goal":"Craft basic tools","reason":"I need a hammer to build things","steps":[{"task":"Mine a rock for small_rock","doneWhen":"Have small_rock in bag"},{"task":"Chop a tree for a branch","doneWhen":"Have branch in bag"},{"task":"Craft a hammer","doneWhen":"Hammer is in bag or equipped"}]}
</PLANNING_TASK>`;
}

/** Build the <MODIFY_PLAN_TASK> appendix — asks thinking model to ADD steps without removing existing ones. */
function buildModifyPlanTask(npc: NPC): string {
  const goal = npc.currentGoal;
  const currentSteps = goal
    ? goal.steps
        .map(
          (s, i) => `  [${i}] ${s.done ? "DONE" : "TODO"}: ${s.task} (doneWhen: "${s.doneWhen}")`,
        )
        .join("\n")
    : "  (none)";

  const nextStep = goal ? goal.steps.findIndex((s) => !s.done) : -1;

  return `<MODIFY_PLAN_TASK>
Current goal: ${goal?.goal ?? "(none)"}
Why: ${goal?.reason ?? "N/A"}
Current steps:
${currentSteps}
${nextStep >= 0 ? `Focus: [${nextStep}] ${goal!.steps[nextStep].task}` : "All steps done."}

Something isn't working — review your ACTION_LOG for recent failures and your current situation.
Add NEW steps to fix the problem. Existing steps are preserved.

Rules:
- Output a JSON array of ONLY the new steps to INSERT before the current focus step
- Each: {"task":"what to do","doneWhen":"how to verify it's done"}
- Tasks describe GOALS, not exact actions. The action model decides HOW.
- Name items/resources but NOT coordinates
- doneWhen must use: "Have X in bag" / "X is in bag or equipped" / "X is equipped" / "Thirst is above 90" / "Hunger is above 70" / "Energy is above 800" / "Have a claimed bed" / "Task is completed"
- Bedroll is a BUILDING placed with build_plan, NOT a craft recipe

Output ONLY a JSON array of new steps, no other text:
[{"task":"Example new step","doneWhen":"Have item in bag"}]
</MODIFY_PLAN_TASK>`;
}

// ═════════════════════════════════════════════════════════════════════
// Unified system content builder (3 content blocks for caching)
// ═════════════════════════════════════════════════════════════════════

function buildSystemContent(
  npc: NPC,
  snapshot: WorldSnapshot,
  mode: "action" | "plan" | "modify_plan" | "think",
): LLMContentBlock[] {
  return [
    { type: "text", text: SHARED_STATIC, cache_control: { type: "ephemeral" } },
    { type: "text", text: buildCharacterBlock(npc), cache_control: { type: "ephemeral" } },
    { type: "text", text: buildVolatileBlock(npc, snapshot, mode) },
  ];
}

// ═════════════════════════════════════════════════════════════════════
// Response parser
// ═════════════════════════════════════════════════════════════════════

const VALID_ACTIONS = new Set([
  "plan",
  "modify_plan",
  "complete_step",
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
  let str = text.trim();

  // Strip markdown code fences
  const fenceMatch = str.match(/```(?:xml)?\s*([\s\S]*?)```/);
  if (fenceMatch) {
    str = fenceMatch[1].trim();
  }

  // Try XML self-closing element: <action_name attr="val" attr2="val2"/>
  const xmlMatch = str.match(/<(\w+)((?:\s+\w+="[^"]*")*)\s*\/>/);
  if (xmlMatch) {
    const actionName = xmlMatch[1];
    if (!VALID_ACTIONS.has(actionName)) return null;

    // Parse attributes into key-value pairs
    const attrs: Record<string, string | number> = {};
    const attrRegex = /(\w+)="([^"]*)"/g;
    let attrMatch;
    while ((attrMatch = attrRegex.exec(xmlMatch[2])) !== null) {
      const val = attrMatch[2];
      // Convert numeric strings to numbers
      const num = Number(val);
      attrs[attrMatch[1]] = !Number.isNaN(num) && val !== "" ? num : val;
    }

    return { action: actionName, ...attrs } as unknown as NPCAction;
  }

  // Fallback: try JSON (for backwards compatibility / reasoning model extraction)
  const braceStart = str.indexOf("{");
  const braceEnd = str.lastIndexOf("}");
  if (braceStart !== -1 && braceEnd > braceStart) {
    try {
      const parsed = JSON.parse(str.substring(braceStart, braceEnd + 1));
      if (parsed && typeof parsed === "object" && parsed.action && VALID_ACTIONS.has(parsed.action))
        return parsed as NPCAction;
    } catch {
      // fall through
    }
  }

  return null;
}

// ═════════════════════════════════════════════════════════════════════
// Main decision function (action model)
// ═════════════════════════════════════════════════════════════════════

export async function decideNextAction(
  npc: NPC,
  snapshot: WorldSnapshot,
  config: LLMProviderConfig,
  signal?: AbortSignal,
): Promise<NPCAction> {
  const messages: LLMMessage[] = [
    { role: "system", content: buildSystemContent(npc, snapshot, "action") },
    { role: "user", content: "What is your next action? Respond with one XML action element." },
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
    `%cGoal%c ${npc.currentGoal ? `"${npc.currentGoal.goal}" ${npc.currentGoal.steps.filter((s) => !s.done).length}/${npc.currentGoal.steps.length} steps` : "(none)"} | ` +
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
  console.log(
    SHARED_STATIC +
      "\n\n" +
      buildCharacterBlock(npc) +
      "\n\n" +
      buildVolatileBlock(npc, snapshot, "action"),
  );
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
      npc.debugLastResult = "❌ Parse failed — model didn't return valid XML action";
    }
    return { action: "wait", durationMs: 3000 };
  }

  return action;
}

// ═════════════════════════════════════════════════════════════════════
// Thinking model calls
// ═════════════════════════════════════════════════════════════════════

/**
 * Ask the thinking model to create a goal with steps.
 * Returns an NPCGoal with a high-level goal, reason, and 2-3 immediate steps.
 */
export async function thinkAboutPlan(
  npc: NPC,
  snapshot: WorldSnapshot,
  config: LLMProviderConfig,
  signal?: AbortSignal,
): Promise<NPCGoal> {
  const messages: LLMMessage[] = [
    { role: "system", content: buildSystemContent(npc, snapshot, "plan") },
    {
      role: "user",
      content: "Output your goal as a JSON object with goal, reason, and steps. Start with {",
    },
    { role: "assistant", content: "{" },
  ];

  const MAX_PLAN_ATTEMPTS = 3;

  console.group(`%c[THINK] ${npc.npcName} — Planning`, "color:#ff88ff;font-weight:bold");

  for (let attempt = 1; attempt <= MAX_PLAN_ATTEMPTS; attempt++) {
    const t0 = performance.now();
    const response = await callThinkingLLM(config, messages, signal);
    const elapsed = Math.round(performance.now() - t0);

    if (response.error) {
      console.warn(
        `Planning error (attempt ${attempt}/${MAX_PLAN_ATTEMPTS}, ${elapsed}ms):`,
        response.error,
      );
      break; // API errors won't be fixed by retrying
    }

    console.log(
      `%c← Plan (attempt ${attempt}, ${elapsed}ms):%c ${response.text.slice(0, 400)}`,
      "color:#888",
      "color:inherit",
    );

    // Parse JSON object — prepend "{" since the assistant prefill starts with it
    const fullResponse = response.text.startsWith("{") ? response.text : "{" + response.text;
    const goal = parseGoalResponse(fullResponse);

    if (goal) {
      console.log(
        `%c✓ Goal:%c ${goal.goal} (${goal.steps.length} steps)`,
        "color:#44ff88",
        "color:inherit",
      );
      console.groupEnd();
      npc.pushThinkingHistory(
        "Create goal",
        `${goal.goal}: ${goal.steps.map((s) => s.task).join(" → ")}`,
      );
      return goal;
    }

    // Fallback: try parsing as a flat array (backwards compat)
    const todos = parseTodoList(fullResponse);
    if (todos && todos.length > 0) {
      const fallbackGoal: NPCGoal = {
        goal: todos[0].task,
        reason: "Continuing survival",
        steps: todos.slice(0, 3).map((t) => ({ task: t.task, done: false, doneWhen: t.doneWhen })),
      };
      console.log(
        `%c✓ Goal (from array):%c ${fallbackGoal.goal}`,
        "color:#44ff88",
        "color:inherit",
      );
      console.groupEnd();
      npc.pushThinkingHistory(
        "Create goal",
        `${fallbackGoal.goal}: ${fallbackGoal.steps.map((s) => s.task).join(" → ")}`,
      );
      return fallbackGoal;
    }

    if (attempt < MAX_PLAN_ATTEMPTS) {
      console.warn(
        `[NPC Plan] Parse failed (attempt ${attempt}/${MAX_PLAN_ATTEMPTS}), retrying...`,
      );
    }
  }

  console.warn("[NPC Plan] All attempts failed, using fallback goal");
  console.groupEnd();

  const fallback: NPCGoal = {
    goal: "Survive and gather resources",
    reason: "Need basic supplies to stay alive",
    steps: [
      { task: "Find and drink water", done: false, doneWhen: "Thirst is above 90" },
      { task: "Find berries and eat", done: false, doneWhen: "Hunger is above 70" },
      { task: "Explore the area", done: false, doneWhen: "Task is completed" },
    ],
  };
  npc.pushThinkingHistory("Create goal", "(fallback) " + fallback.goal);
  return fallback;
}

/** Parse a goal JSON object from the thinking model's response. */
function parseGoalResponse(text: string): NPCGoal | null {
  let jsonStr = text.trim();

  // Strip markdown fences
  const fenceMatch = jsonStr.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fenceMatch) jsonStr = fenceMatch[1].trim();

  // Find the object
  const braceStart = jsonStr.indexOf("{");
  const braceEnd = jsonStr.lastIndexOf("}");
  if (braceStart === -1 || braceEnd <= braceStart) return null;
  jsonStr = jsonStr.substring(braceStart, braceEnd + 1);

  try {
    const parsed = JSON.parse(jsonStr);
    if (!parsed || typeof parsed !== "object") return null;
    if (typeof parsed.goal !== "string" || !Array.isArray(parsed.steps)) return null;

    const steps: NPCStep[] = [];
    for (const s of parsed.steps) {
      if (typeof s === "object" && s !== null && typeof s.task === "string") {
        steps.push({
          task: s.task.trim(),
          done: false,
          doneWhen: typeof s.doneWhen === "string" ? s.doneWhen.trim() : "Task is completed",
        });
      }
    }
    if (steps.length === 0) return null;

    return {
      goal: parsed.goal.trim(),
      reason: typeof parsed.reason === "string" ? parsed.reason.trim() : "No reason given",
      steps: steps.slice(0, 4),
    };
  } catch {
    return null;
  }
}

/**
 * Ask the thinking model to add steps to the current goal.
 * New steps are inserted before the current focus step. Goal is preserved.
 */
export async function thinkAboutPlanModification(
  npc: NPC,
  snapshot: WorldSnapshot,
  config: LLMProviderConfig,
  signal?: AbortSignal,
): Promise<NPCGoal> {
  const currentGoal = npc.currentGoal ?? { goal: "Survive", reason: "Stay alive", steps: [] };

  const messages: LLMMessage[] = [
    { role: "system", content: buildSystemContent(npc, snapshot, "modify_plan") },
    {
      role: "user",
      content:
        "What steps should be added to fix the current plan? Output a JSON array of new steps. Start with [",
    },
    { role: "assistant", content: "[" },
  ];

  console.group(`%c[THINK] ${npc.npcName} — Modifying plan`, "color:#ff88ff;font-weight:bold");

  const t0 = performance.now();
  const response = await callThinkingLLM(config, messages, signal);
  const elapsed = Math.round(performance.now() - t0);

  if (response.error) {
    console.warn(`Modify plan error (${elapsed}ms):`, response.error);
    console.groupEnd();
    return currentGoal;
  }

  console.log(
    `%c← Modifications (${elapsed}ms):%c ${response.text.slice(0, 400)}`,
    "color:#888",
    "color:inherit",
  );

  // Parse the new steps
  const fullResponse = response.text.startsWith("[") ? response.text : "[" + response.text;
  const newSteps = parseTodoList(fullResponse);

  if (!newSteps || newSteps.length === 0) {
    console.warn("[NPC ModifyPlan] No new steps parsed, keeping goal unchanged");
    console.groupEnd();
    return currentGoal;
  }

  // Insert new steps before the current focus step (first incomplete)
  const nextStep = currentGoal.steps.findIndex((s) => !s.done);
  const insertAt = nextStep >= 0 ? nextStep : currentGoal.steps.length;

  const mergedSteps: NPCStep[] = [
    ...currentGoal.steps.slice(0, insertAt),
    ...newSteps.map((t) => ({ task: t.task, done: false, doneWhen: t.doneWhen })),
    ...currentGoal.steps.slice(insertAt),
  ];

  // Cap total steps at 5 to prevent unbounded growth
  const cappedSteps = mergedSteps.slice(0, 5);

  const addedSummary = newSteps.map((t) => t.task).join(" → ");
  console.log(
    `%c+ Added ${newSteps.length} steps at [${insertAt}]:%c ${addedSummary}`,
    "color:#44ff88",
    "color:inherit",
  );
  console.groupEnd();

  npc.pushThinkingHistory("Modify plan", `+${newSteps.length} steps: ${addedSummary}`);
  return { ...currentGoal, steps: cappedSteps };
}

/** Parse a JSON array of {task, doneWhen} steps from the thinking model's response. */
function tryParseArray(jsonStr: string): NPCStep[] {
  try {
    const parsed = JSON.parse(jsonStr);
    if (!Array.isArray(parsed)) return [];
    const items: NPCStep[] = [];
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

function parseTodoList(text: string): NPCStep[] | null {
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
  if (items.length > 0) return items.slice(0, 4);

  // Fallback: extract individual {task, doneWhen} objects via regex (either key order)
  const objectPattern1 = /\{\s*"task"\s*:\s*"([^"]+)"\s*,\s*"doneWhen"\s*:\s*"([^"]+)"\s*\}/g;
  const objectPattern2 = /\{\s*"doneWhen"\s*:\s*"([^"]+)"\s*,\s*"task"\s*:\s*"([^"]+)"\s*\}/g;
  const regexItems: NPCStep[] = [];
  let match;
  while ((match = objectPattern1.exec(text)) !== null) {
    regexItems.push({ task: match[1].trim(), done: false, doneWhen: match[2].trim() });
  }
  while ((match = objectPattern2.exec(text)) !== null) {
    regexItems.push({ task: match[2].trim(), done: false, doneWhen: match[1].trim() });
  }
  if (regexItems.length > 0) return regexItems.slice(0, 4);

  // Fallback: try extracting just task fields
  const taskOnlyPattern = /"task"\s*:\s*"([^"]+)"/g;
  const taskItems: NPCStep[] = [];
  while ((match = taskOnlyPattern.exec(text)) !== null) {
    taskItems.push({ task: match[1].trim(), done: false, doneWhen: "Task is completed" });
  }
  if (taskItems.length > 0) return taskItems.slice(0, 4);

  console.warn("[NPC Plan] Could not parse steps from:", text.slice(0, 500));

  return null;
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
  const messages: LLMMessage[] = [
    { role: "system", content: buildSystemContent(npc, snapshot, "think") },
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
