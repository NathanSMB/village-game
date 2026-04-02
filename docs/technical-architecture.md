# Technical Architecture

## Monorepo Structure

```
village-game/
├── apps/
│   ├── game/              # Main game application (ExcaliburJS)
│   └── website/           # Existing website
├── packages/
│   ├── utils/             # Existing shared utilities
│   ├── game-engine/       # Game systems (world, entities, needs, building, combat)
│   ├── ai-agents/         # NPC AI agent system (LLM abstraction, memory, decision loop)
│   └── sprite-system/     # Layered sprite rendering, character creator
├── docs/
│   ├── game-design.md
│   └── technical-architecture.md
└── ...
```

### Package Responsibilities

**`apps/game`** — The browser application. Handles:

- ExcaliburJS setup and game loop
- Scene management
- Input handling (keyboard, mouse, chat UI)
- Camera and viewport
- Rendering pipeline
- UI overlay (inventory, chat, needs bars, character creator)

**`packages/game-engine`** — Core game logic, decoupled from rendering:

- World/grid state (64x64 tile map)
- Entity system (characters, items, structures)
- Needs simulation (hunger, thirst, energy, health)
- Time system (day/night, seasons)
- Crafting recipes and logic
- Building/tile placement rules
- Combat resolution
- Inventory management
- Item definitions

**`packages/ai-agents`** — NPC autonomy system:

- `AIBackend` interface and implementations
- NPC agent loop (perceive → reason → act → remember)
- Memory system (short-term, long-term)
- Personality traits
- Relationship tracking
- World observation (what an NPC can "see")
- Action planning and execution
- Conversation handling

**`packages/sprite-system`** — Sprite rendering and character generation:

- Layered sprite composer (body + hair + face + equipment)
- Sprite sheet management
- Character creator logic (randomization for NPCs, selection for player)
- Animation definitions
- Pixel-perfect rendering utilities

## Key Systems

### Game Loop

ExcaliburJS provides the game loop. Each frame:

1. **Input** — Process player keyboard/mouse input
2. **AI Tick** — Run NPC decision cycles (throttled, not every frame)
3. **Simulation** — Update needs, time, world state
4. **Render** — Draw the world, characters, UI

### AI Agent Scheduling

Running LLM calls for 20-30 NPCs every frame is not feasible. The AI system needs scheduling:

- **Decision frequency:** NPCs make decisions on a throttled cycle (e.g., every few seconds of game time)
- **Priority queue:** NPCs with urgent needs (low health, danger nearby) decide more frequently
- **Batch processing:** Multiple NPC contexts can be batched if the backend supports it
- **Async execution:** LLM calls are async; NPCs continue their current action while waiting for a new decision
- **Fallback behavior:** If the LLM is slow or unavailable, NPCs fall back to simple heuristics (seek food if hungry, flee if in danger, idle otherwise)

### World State

The world is a 64x64 grid stored as a 2D array (or flat array with index math).

Each tile holds:

- **Terrain type** (grass, tree, water)
- **Structure** (wall, floor, door, etc.) — nullable
- **Items on ground** — list of dropped/placed items
- **Occupant** — character standing on the tile — nullable

### Entity Model

```
Character {
  id: string
  name: string
  position: GridPosition          // {x, y}
  appearance: CharacterAppearance // base layers
  equipment: EquipmentSlots       // {torso, legs, feet}
  inventory: Item[]
  needs: {hunger, thirst, energy, health}  // 0-100
  isPlayer: boolean
  // NPC-only fields:
  personality?: PersonalityTraits
  memory?: NPCMemory
  relationships?: Map<string, RelationshipState>
}
```

### Rendering Pipeline

ExcaliburJS actors render in layer order:

1. **Terrain layer** — Ground tiles
2. **Structure layer** — Walls, floors, furniture
3. **Item layer** — Items on the ground
4. **Character layer** — Characters with layered sprites (body → hair → face → clothing)
5. **Roof layer** — Roof tiles (hide interior when player is outside)
6. **UI layer** — HUD, chat, inventory, needs bars

Character sprites are composited from their layers at render time (or cached and invalidated on equipment change).

### AI Backend Interface

```typescript
interface AIBackend {
  /** Given an NPC's current context, decide what action to take next */
  decide(context: NPCContext): Promise<NPCAction>;

  /** Generate a conversational response */
  converse(context: ConversationContext): Promise<string>;
}

interface NPCContext {
  npc: NPCState; // needs, inventory, personality, etc.
  nearbyTiles: TileInfo[]; // what the NPC can see
  nearbyCharacters: CharacterInfo[];
  recentMemories: Memory[];
  relationships: RelationshipInfo[];
  timeOfDay: TimeOfDay;
  season: Season;
}

interface NPCAction {
  type:
    | "move"
    | "gather"
    | "craft"
    | "build"
    | "trade"
    | "talk"
    | "attack"
    | "sleep"
    | "eat"
    | "drink"
    | "idle";
  target?: GridPosition | string; // position or entity ID
  parameters?: Record<string, unknown>;
}
```

### Conversation System

When the player initiates conversation with an NPC:

1. A chat UI opens.
2. Player types a message.
3. The message + NPC context (personality, memory, relationship with player, current state) is sent to the AI backend via `converse()`.
4. The NPC's response is displayed.
5. Conversation continues until the player or NPC ends it.
6. Key information from the conversation is stored in the NPC's memory.

NPC-to-NPC conversations happen the same way but are summarized rather than shown in full (unless the player is nearby and can "overhear").

## Data Flow

```
Player Input → Game Engine (validate, apply) → World State Update → Renderer
                    ↑                                    ↓
              AI Agent Loop ← Perception ← World State Query
                    ↓
              LLM Backend (async)
                    ↓
              NPC Action → Game Engine (validate, apply) → World State Update
```

## Performance Considerations

- **LLM latency:** NPC decisions are async. Budget for 1-5 second response times. NPCs should have "thinking" or continuation behavior while waiting.
- **Sprite caching:** Composite character sprites should be cached and only recomposited when equipment changes.
- **AI throttling:** Stagger NPC decision cycles so no more than 2-3 LLM calls are in-flight at once.
- **Map rendering:** Only render tiles visible in the viewport. ExcaliburJS handles this via its camera system.
- **Memory management:** NPC memories need to be summarized/pruned over time to keep context windows manageable.
