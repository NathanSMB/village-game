# Game Design Document

## Overview

A 2D single-player survival game where AI-driven NPCs live as fully autonomous agents in a shared world. The player is one character among many — gathering resources, crafting, building, and navigating social dynamics with NPCs who can do everything the player can. NPCs form relationships, make decisions, and pose the greatest threat in a permadeath world.

Built with ExcaliburJS, running in the browser.

## Core Pillars

1. **Living World** — NPCs are not scripted. They are autonomous agents with goals, needs, and memories. The village exists with or without you.
2. **Social Survival** — The biggest danger isn't hunger; it's people. Alliances, betrayal, trade, and conflict emerge from NPC autonomy.
3. **Permadeath Stakes** — Every character (player and NPC) has one life. Death is permanent and meaningful.
4. **Player Agency** — You're a character in the world, not a god. You survive, build, and influence through action and conversation.

## World

### Grid and Map

- **Size:** 64x64 tiles (4,096 total tiles)
- **Tile size:** 32x32 pixels
- **Viewport:** Scrolling camera centered on the player
- **Coordinate system:** Integer grid positions (0,0) to (63,63)

### Terrain

Starting with simple, uniform terrain. Three base tile types:

| Tile  | Description                    | Walkable | Buildable |
| ----- | ------------------------------ | -------- | --------- |
| Grass | Default open ground            | Yes      | Yes       |
| Tree  | Harvestable for wood           | No       | No        |
| Water | Rivers, ponds. Blocks movement | No       | No        |

More terrain types (stone, sand, soil, etc.) can be added later. The map layout should have a central clearing suitable for the village, surrounded by forested wilderness with a water feature (river or pond).

### Time System

- **Day/night cycle** — Affects visibility, NPC behavior (sleep schedules), and danger.
- **Seasons** — Four seasons that affect resource availability, weather, and survival difficulty.
  - **Spring:** Moderate. Plants grow. New resources become available.
  - **Summer:** Warm. Abundant food. Longer days.
  - **Autumn:** Harvest season. Days shorten. Preparation time.
  - **Winter:** Harsh. Scarce food, cold exposure risk, short days.
- **Time scale:** TBD — needs to balance between "seasons feel meaningful" and "NPCs have time to do things within a day."

## Characters

### Needs System

All characters (player and NPCs) share the same four needs:

| Need   | Depletes By           | Restored By               | At Zero                    |
| ------ | --------------------- | ------------------------- | -------------------------- |
| Hunger | Time (constant drain) | Eating food               | Health drains → death      |
| Thirst | Time (faster drain)   | Drinking water            | Health drains fast → death |
| Energy | Actions, time awake   | Sleeping                  | Collapse (forced sleep)    |
| Health | Damage, unmet needs   | Rest, healing items, time | Death (permanent)          |

### Character Sprite System

Layered sprite rendering at 32x32 (or 32x48 for tall characters — TBD).

**Base layers (not removable):**

1. **Body** — Skin tone, body shape. When no clothing equipped, renders with basic underwear.
2. **Hair** — Style and color.
3. **Face** — Eyes, expression.

**Equipment layers (actual game items):**

| Slot  | Examples                       | Visual Layer |
| ----- | ------------------------------ | ------------ |
| Torso | Shirt, jacket, armor, tunic    | Over body    |
| Legs  | Pants, skirt, shorts           | Over body    |
| Feet  | Boots, sandals, bare (default) | Over body    |

- Clothing items exist in the game world as inventory objects.
- NPCs and the player equip/unequip clothing the same way.
- When a character has no clothing in a slot, the base body (with underwear) shows through.
- All sprite layers must maintain consistent pixel scale — no sub-pixel rendering, no mixed resolutions.

### Character Creator

Used for both the player character and NPC generation. Same system, same options.

**Customization options:**

- Skin tone (palette)
- Hair style (sprite variants)
- Hair color (palette)
- Face/eyes (sprite variants)
- Body type (sprite variants)
- Starting clothing (selected from available items)

For NPCs, the creator runs procedurally — randomly selecting from the available options to generate unique-looking characters.

## AI System

### Architecture

NPCs are fully autonomous agents. They observe the world, reason about their situation, and take actions without player direction.

**Agent loop (per NPC, per decision cycle):**

1. **Perceive** — What tiles/characters/items are nearby? What are my current needs? What do I remember?
2. **Reason** — Given my perception and goals, what should I do? (LLM call)
3. **Act** — Execute the chosen action (move, gather, craft, build, talk, trade, attack, sleep, etc.)
4. **Remember** — Store the outcome. Update relationships and knowledge.

### LLM Backend

Pluggable architecture — the AI reasoning layer is abstracted behind an interface so the LLM provider can be swapped.

```
interface AIBackend {
  decide(context: NPCContext): Promise<NPCAction>
  converse(context: ConversationContext): Promise<string>
}
```

Planned backends:

- Claude API (Anthropic)
- Local LLM (Ollama)
- Others as needed

### NPC Memory

Each NPC maintains:

- **Short-term memory** — Recent events, current conversation context.
- **Long-term memory** — Important events, relationships, grudges, alliances, knowledge of the world.
- **Personality** — Traits that bias decision-making (cautious vs. bold, generous vs. selfish, social vs. loner, etc.).

### Relationships

Relationships are emergent — no pre-set families or factions.

- NPCs start as strangers.
- Interactions (trade, conversation, shared work, conflict) build or erode relationship values.
- Over time, NPCs may form friendships, rivalries, romantic partnerships, families, or factions.
- Relationship state is stored per NPC pair.

### NPC Parity

NPCs can perform every action the player can:

- Gather resources
- Craft items
- Build structures (tile-by-tile)
- Trade with others
- Engage in conversation
- Form/break relationships
- Attack or defend
- Equip/unequip items

This means the village can grow and change even without player involvement.

## Player Interaction

### Movement and Actions

- Grid-based movement (up/down/left/right, possibly diagonal)
- Interact with adjacent tiles/characters
- Inventory management
- Place/remove building tiles
- Equip/unequip items

### NPC Conversation

The player communicates with NPCs by typing natural language messages. The NPC responds via the LLM, informed by:

- The NPC's personality and memory
- Their relationship with the player
- Their current needs and situation
- What they know about the world

Conversations can lead to trade, alliances, information sharing, quests, or conflict.

## Building

### Freeform Tile Placement

Players (and NPCs) build structures by placing individual tiles on the grid.

**Building tiles:**

| Tile     | Material Required | Function                          |
| -------- | ----------------- | --------------------------------- |
| Wall     | Wood or Stone     | Blocks movement, provides shelter |
| Floor    | Wood or Stone     | Walkable, defines interior space  |
| Door     | Wood + Hinge      | Togglable wall tile               |
| Roof     | Wood + Thatch     | Covers interior (visual layer)    |
| Bed      | Wood + Fiber      | Sleep location, restores energy   |
| Storage  | Wood              | Container for items               |
| Campfire | Stone + Wood      | Light, warmth, cooking            |

More tile types to be added as needed. Buildings are freeform — there are no blueprints or templates. Any arrangement of walls, floors, doors, and furniture is valid.

### Ownership

TBD — need to decide how building ownership/territory works. Options:

- First-builder-owns
- Communal by default, with lockable doors
- Claimed territory zones

## Crafting

### Recipe System

Simple predefined recipes. Combine materials to produce items.

**Example recipes:**

| Output      | Inputs              | Tool Required |
| ----------- | ------------------- | ------------- |
| Wooden Axe  | Wood x3 + Stone x1  | None (hand)   |
| Stone Knife | Stone x2 + Wood x1  | None (hand)   |
| Campfire    | Stone x3 + Wood x2  | None          |
| Rope        | Fiber x3            | None          |
| Wooden Wall | Wood x4             | Axe           |
| Bread       | Wheat x2 + Water x1 | Campfire      |

Recipes are known from the start (no unlock/research tree for v1). Crafting happens instantly or with a short timer.

## Threats and Conflict

### Environmental Threats

- **Starvation/dehydration** — Needs deplete over time.
- **Exposure** — Winter cold drains health without shelter or warmth.
- **Drowning** — Walking into deep water (if implemented).

### Social Threats

The primary danger. NPCs make their own decisions and may:

- Steal resources or items
- Refuse to trade or cooperate
- Form hostile factions
- Attack the player or other NPCs
- Betray alliances

### Combat

Simple grid-based combat:

- Characters can attack adjacent characters.
- Damage based on equipped weapon (or fists).
- Health reaches zero → permadeath.
- No complex mechanics (no dodge, block, etc.) for v1. Just attack/damage/health.

## Death and Permadeath

- When any character's health reaches 0, they die permanently.
- Dead characters drop their inventory on the ground.
- NPCs remember the dead — deaths affect relationships and behavior.
- Player death ends the game (option to start over with a new world or same world, new character — TBD).

## Art Style

- **Pixel art** — Consistent pixel scale across all sprites and tiles. No sub-pixel rendering.
- **Resolution:** 32x32 per tile. Characters may be 32x32 or 32x48.
- **Color palette:** Bright and vibrant, but grounded in reality. Think saturated natural colors — rich greens, warm browns, vivid sky blues — not neon or fantasy.
- **Consistency:** Every pixel in a sprite should be the same apparent size on screen. The game should render at native pixel resolution and scale up with nearest-neighbor filtering.

## Technical Stack

- **Engine:** ExcaliburJS
- **Platform:** Browser (web app)
- **Monorepo app:** `apps/game`
- **Toolchain:** Vite+ (`vp dev`, `vp build`, `vp test`)
- **Language:** TypeScript
- **AI Backend:** Pluggable (Claude API, Ollama, etc.)
- **Rendering:** Canvas/WebGL via ExcaliburJS

## Scope: V1 vs Future

### V1 (Build First)

- 64x64 map with grass, trees, water
- Player character + ~20-30 NPCs (enough for ~10 emergent family units)
- Character creator (player + NPC generation)
- Four needs (hunger, thirst, energy, health)
- Day/night cycle + seasons
- Resource gathering (wood, stone, fiber, food, water)
- Simple recipe crafting
- Freeform tile-by-tile building
- Autonomous NPC agents with LLM reasoning
- Natural language NPC conversation
- Emergent relationships
- Basic combat
- Permadeath
- Single pluggable AI backend

### Future (Not V1)

- More terrain types and biomes
- Larger or procedural maps
- More crafting recipes and progression
- Farming/agriculture
- Animal husbandry
- More equipment slots (head, hands, accessories)
- NPC factions and governance systems
- Multiplayer
- Desktop packaging (Electron/Tauri)
- Sound and music
- Save/load system
