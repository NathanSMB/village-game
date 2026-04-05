import * as ex from "excalibur";
import type { CharacterAppearance } from "../types/character.ts";
import {
  totalWeight,
  equipItem,
  unequipItem,
  consumeItem,
  repairItem,
  consumeArrow,
  addItemToBag,
  type InventoryState,
} from "../types/inventory.ts";
import {
  EquipmentSlot,
  RARITY_COLORS,
  ALL_EQUIPMENT_SLOTS,
  EQUIPMENT_SLOT_LABELS,
  isConsumable,
  isStackable,
  getItemQuantity,
  type Item,
} from "../types/item.ts";
import { isAlive } from "../types/vitals.ts";
import { Player } from "../actors/player.ts";
import { BerryBush } from "../actors/berry-bush.ts";
import { BigRock } from "../actors/big-rock.ts";
import { Tree } from "../actors/tree.ts";
import { GroundItemStack } from "../actors/ground-item-stack.ts";
import { FloatingText } from "../actors/floating-text.ts";
import { AttackEffect } from "../actors/attack-effect.ts";
import { ArrowProjectile } from "../actors/arrow-projectile.ts";
import { VitalsHud } from "../actors/vitals-hud.ts";
import { wasActionPressed } from "../systems/keybinds.ts";
import {
  ITEMS,
  DURABILITY_CONFIG,
  migrateItemDurability,
  migrateItemStacking,
} from "../data/items.ts";
import { BUILDING_TYPES, BUILDING_TYPE_MAP, type BuildingType } from "../data/buildings.ts";
import { COOKING_RECIPES, COOKING_RECIPE_MAP } from "../data/cooking.ts";
import { RECIPES } from "../data/recipes.ts";
import { canCraft, craft } from "../types/crafting.ts";
import { Building } from "../actors/building.ts";
import { EdgeBuilding } from "../actors/edge-building.ts";
import { PlanCursor } from "../actors/plan-cursor.ts";
import { buildingGraphic, edgeBuildingGraphic } from "../systems/building-sprites.ts";
import {
  type EdgeAxis,
  type EdgeOrientation,
  type FenceConnections,
  edgeKeyBetween,
  edgeKeyFromTileAndDir,
  decodeEdgeKey,
  edgeToWorldPos,
  getEdgeNeighbors,
} from "../systems/edge-key.ts";
import type {
  BerryBushSaveState,
  BigRockSaveState,
  BuildingSaveState,
  EdgeBuildingSaveState,
  GroundItemSaveState,
  TreeSaveState,
  SheepSaveState,
  CowSaveState,
  SaveData,
} from "../systems/save-manager.ts";
import {
  getGrassAnimations,
  getWaterAnimation,
  getSheepSpriteSheet,
  getCowSpriteSheet,
  WaterTileType,
} from "../systems/sprite-loader.ts";
import type { WaterTileTypeValue } from "../systems/sprite-loader.ts";
import type { DeathCause } from "./game-over.ts";
import { IndoorDarknessOverlay, getIndoorTiles } from "../systems/indoor-lighting.ts";
import { Sheep } from "../actors/sheep.ts";
import { Cow } from "../actors/cow.ts";
import { detectBreedingEnclosures } from "../systems/enclosure.ts";
import { getUIScale, UI_REF_HEIGHT } from "../systems/ui-scale.ts";
import { SpeechBubble } from "../actors/speech-bubble.ts";
import { ChatLog } from "../actors/chat-log.ts";
import {
  type ChatMessage,
  type ChatMode,
  CHAT_MODE_ORDER,
  CHAT_MODE_RADIUS,
  CHAT_EXPIRE_MS,
  CHAT_MODE_COLORS,
  CHAT_MODE_VERBS,
  chebyshevDistance,
} from "../types/chat.ts";
import { NPC } from "../actors/npc.ts";
import type { NPCSaveState, EntityInfo } from "../types/npc.ts";
import { NPC_DEFINITIONS } from "../data/npc-definitions.ts";
import { type LLMProviderConfig, defaultConfig } from "../systems/llm-provider.ts";
import { loadLLMConfig } from "../systems/llm-settings.ts";
import {
  decideNextAction,
  buildWorldSnapshot,
  thinkAboutPlan,
  thinkAboutQuestion,
} from "../systems/npc-brain.ts";
import { executeNPCAction, type GameWorldNPCInterface } from "../systems/npc-actions.ts";
import { findPath } from "../systems/pathfinding.ts";
import { NPCThoughtIndicator } from "../actors/npc-thought-indicator.ts";
import { NPCDebugPanel } from "../actors/npc-debug-panel.ts";

const MAP_COLS = 64;
const MAP_ROWS = 64;
const TILE_SIZE = 32;
const BUSH_COUNT = 25;
const TREE_COUNT = 15;
const BIG_ROCK_COUNT = 10;
const SMALL_ROCK_COUNT = 30;
const SPAWN_EXCLUSION = 3; // No bushes/rocks within N tiles of center spawn
const POND_COUNT = 3; // Number of ponds to generate
const POND_MIN_RADIUS = 3;
const POND_MAX_RADIUS = 5;
const WATER_EXCLUSION = 5; // No water within N tiles of center spawn
const INITIAL_SHEEP_COUNT = 5;
const INITIAL_COW_COUNT = 5;
const BREEDING_INTERVAL_MS = 60_000; // 60 seconds
const WILD_SPAWN_INTERVAL_MS = 600_000; // 10 minutes
const WILD_SPAWN_MAX_SHEEP = 10; // Only wild spawn when ≤ 10 sheep alive
const WILD_SPAWN_MAX_COWS = 10; // Only wild spawn when ≤ 10 cows alive
const GROUND_ITEM_DESPAWN_MS = 180_000; // 3 minutes until non-permanent ground items vanish

export type GameWorldData =
  | { type: "new"; appearance: CharacterAppearance; playerName: string }
  | { type: "load"; save: SaveData };

/** Map an Excalibur key code + shift state to a printable character, or null. */
function chatKeyToChar(key: ex.Keys, shift: boolean): string | null {
  const s = key as string;

  // Letter keys: KeyA → "a"/"A"
  if (s.startsWith("Key") && s.length === 4) {
    const ch = s[3].toLowerCase();
    return shift ? ch.toUpperCase() : ch;
  }

  // Digit keys: Digit0 → "0" (or shift symbols)
  const DIGIT_SHIFT: Record<string, string> = {
    Digit1: "!",
    Digit2: "@",
    Digit3: "#",
    Digit4: "$",
    Digit5: "%",
    Digit6: "^",
    Digit7: "&",
    Digit8: "*",
    Digit9: "(",
    Digit0: ")",
  };
  if (s.startsWith("Digit") && s.length === 6) {
    if (shift) return DIGIT_SHIFT[s] ?? s[5];
    return s[5];
  }

  // Space
  if (key === ex.Keys.Space) return " ";

  // Punctuation keys
  const PUNCT: Record<string, [string, string]> = {
    Minus: ["-", "_"],
    Equal: ["=", "+"],
    BracketLeft: ["[", "{"],
    BracketRight: ["]", "}"],
    Backslash: ["\\", "|"],
    Semicolon: [";", ":"],
    Quote: ["'", '"'],
    Comma: [",", "<"],
    Period: [".", ">"],
    Slash: ["/", "?"],
    Backquote: ["`", "~"],
  };
  const punct = PUNCT[s];
  if (punct) return shift ? punct[1] : punct[0];

  return null;
}

/** Encode tile coords into a single number for Set lookups. */
function tileKey(x: number, y: number): number {
  return y * MAP_COLS + x;
}

export class GameWorld extends ex.Scene<GameWorldData> {
  private tilemap!: ex.TileMap;
  private player: Player | null = null;
  private hud: VitalsHud | null = null;
  private bushes: BerryBush[] = [];
  private bushByTile = new Map<number, BerryBush>();
  private trees: Tree[] = [];
  private treeByTile = new Map<number, Tree>();
  private rocks: BigRock[] = [];
  private rockByTile = new Map<number, BigRock>();
  private blockedTiles = new Set<number>();
  private waterTiles = new Set<number>(); // Track water tile positions
  private groundItems = new Map<number, GroundItemStack>();
  private actionPrompt: ex.Label | null = null;

  // Item picker overlay state
  private itemPickerOpen = false;
  private itemPickerItems: Item[] = [];
  private itemPickerIndex = 0;
  private itemPickerTileKey = 0;
  private itemPickerScroll = 0;
  private itemPickerPanel: ex.ScreenElement | null = null;

  // Building system (tile-based: floors only)
  private buildings: Building[] = [];
  private buildingByTile = new Map<number, Building>();

  // Edge building system (walls, fences, doors, gates)
  private edgeBuildingsList: EdgeBuilding[] = [];
  private edgeBuildings = new Map<number, EdgeBuilding>();
  private blockedEdges = new Set<number>();

  // Indoor darkness overlay
  private darknessOverlay: IndoorDarknessOverlay | null = null;

  // Sheep / creature system
  private sheepList: Sheep[] = [];
  private sheepByTile = new Map<number, Sheep>();
  private sheepRegisteredTile = new Map<Sheep, number>(); // last tile key registered in sheepByTile
  private breedingTimer = BREEDING_INTERVAL_MS;
  private wildSpawnTimer = WILD_SPAWN_INTERVAL_MS;

  // Cow system (parallel to sheep)
  private cowList: Cow[] = [];
  private cowByTile = new Map<number, Cow>();
  private cowRegisteredTile = new Map<Cow, number>();
  private cowWildSpawnTimer = WILD_SPAWN_INTERVAL_MS;

  // NPC system
  private npcList: NPC[] = [];
  private npcByTile = new Map<number, NPC>();
  private npcRegisteredTile = new Map<NPC, number>();
  private npcInFlight = new Map<string, AbortController>(); // in-flight LLM calls
  private llmConfig: LLMProviderConfig = defaultConfig();
  private npcDebugPanel: NPCDebugPanel | null = null;
  private npcDebugVisible = false;
  // Bed ownership: tileKey → NPC id (prevents double-claiming)
  private claimedBeds = new Map<number, string>();

  // Sleeping state
  private playerSleeping = false;
  private sleepingBed: Building | null = null;
  private preSleepPos: ex.Vector | null = null;
  private blanketOverlay: ex.Actor | null = null;

  // Cooking menu state
  private cookingMenuOpen = false;
  private cookingMenuIndex = 0;
  private cookingBuilding: Building | null = null;
  private cookingMenuPanel: ex.ScreenElement | null = null;

  // Storage menu state
  private storageMenuOpen = false;
  private storageBuilding: Building | null = null;
  private storageMenuPanel: ex.ScreenElement | null = null;
  private storageFocus: "bag" | "box" = "bag";
  private storageBagIndex = 0;
  private storageBoxIndex = 0;
  private storageBagScroll = 0;

  // Indoor tile cache (computed when entering planning mode for bed validation)
  private indoorTilesCache: Set<number> | null = null;
  // Floors hidden underneath allowIndoor buildings (boxes); keyed by tile key
  private floorsUnderBuildings = new Map<number, Building>();

  // Planning mode state
  private planningMode = false;
  private planCursor: PlanCursor | null = null;
  private planCursorX = 0;
  private planCursorY = 0;
  private planMenuIndex = 0;
  private planMenuOpen = true; // true = browsing menu, false = placing
  private selectedBuildType: BuildingType | null = null;
  private plannedBuildings = new Map<
    number,
    {
      type: BuildingType;
      x: number;
      y: number;
      rotation: number;
      actor: ex.Actor;
    }
  >();
  private plannedEdges = new Map<
    number,
    {
      type: BuildingType;
      edgeKey: number;
      axis: EdgeAxis;
      x: number;
      y: number;
      actor: ex.Actor;
    }
  >();
  private planEdgeOrientation: EdgeOrientation = "N";
  private planTileRotation = 0;
  private planRadiusOverlay: ex.Actor | null = null;
  private planMenuPanel: ex.ScreenElement | null = null;
  private planPlayerTileX = 0;
  private planPlayerTileY = 0;

  // Inventory menu state (canvas overlay — game world continues updating)
  private inventoryMenuOpen = false;
  private inventoryMenuPanel: ex.ScreenElement | null = null;
  private inventoryTab: "equipment" | "bag" | "craft" = "equipment";
  private inventoryEquipIndex = 0;
  private inventoryBagIndex = 0;
  private inventoryBagScroll = 0;
  private inventoryCraftIndex = 0;
  private inventoryCraftScroll = 0;
  private inventoryFilterText = "";
  private inventoryFilterActive = false;
  private inventorySortMode: "default" | "a-z" | "z-a" = "default";
  private inventoryViewBag: { item: Item; realIndex: number }[] = [];
  private inventoryOnFilterBar = false;

  // Equipment submenu (shown when selecting an equipment slot)
  private inventoryEquipSubmenuOpen = false;
  private inventoryEquipSubmenuSlot: EquipmentSlot | null = null;
  private inventoryEquipSubmenuItems: { item: Item; realIndex: number }[] = [];
  private inventoryEquipSubmenuIndex = 0;
  private inventoryEquipSubmenuScroll = 0;

  // Chat state
  private chatMessages: ChatMessage[] = [];
  private chatOpen = false;
  private chatInputPanel: ex.ScreenElement | null = null;
  private chatInputText = "";
  private chatMode: ChatMode = "talk";
  private chatLog: ChatLog | null = null;
  private playerName = "Player";

  private uiScale = 1;

  override onInitialize(engine: ex.Engine): void {
    this.uiScale = getUIScale(engine);
    this.tilemap = new ex.TileMap({
      tileWidth: TILE_SIZE,
      tileHeight: TILE_SIZE,
      columns: MAP_COLS,
      rows: MAP_ROWS,
    });

    let seed = 12345;
    const seededRandom = (): number => {
      seed = (seed * 16807 + 0) % 2147483647;
      return (seed - 1) / 2147483646;
    };

    // Generate pond positions first (before grass/bushes)
    this.generatePonds(seededRandom);

    const grassAnims = getGrassAnimations();

    for (let i = 0; i < MAP_COLS * MAP_ROWS; i++) {
      const tile = this.tilemap.getTileByIndex(i);
      if (!tile) continue;

      const tx = i % MAP_COLS;
      const ty = Math.floor(i / MAP_COLS);
      const key = tileKey(tx, ty);

      if (this.waterTiles.has(key)) {
        // Determine the right water tile variant based on neighbors
        const waterType = this.getWaterTileType(tx, ty);
        tile.addGraphic(getWaterAnimation(waterType).clone());
      } else {
        const idx = Math.floor(seededRandom() * grassAnims.length);
        tile.addGraphic(grassAnims[idx].clone());
      }
    }

    this.add(this.tilemap);

    // Create indoor darkness overlay
    this.darknessOverlay = new IndoorDarknessOverlay();
    this.add(this.darknessOverlay);

    // Spawn berry bushes at seeded random positions
    const centerX = MAP_COLS / 2;
    const centerY = MAP_ROWS / 2;
    let placed = 0;

    while (placed < BUSH_COUNT) {
      const bx = Math.floor(seededRandom() * MAP_COLS);
      const by = Math.floor(seededRandom() * MAP_ROWS);

      // Skip tiles near spawn, on water, and duplicates
      if (Math.abs(bx - centerX) <= SPAWN_EXCLUSION && Math.abs(by - centerY) <= SPAWN_EXCLUSION) {
        continue;
      }
      const key = tileKey(bx, by);
      if (this.blockedTiles.has(key)) continue;
      if (this.waterTiles.has(key)) continue;

      const bush = new BerryBush(bx, by);
      this.bushes.push(bush);
      this.bushByTile.set(key, bush);
      this.blockedTiles.add(key);
      this.add(bush);
      placed++;
    }

    // Spawn trees at seeded random positions (after bushes)
    let treesPlaced = 0;
    while (treesPlaced < TREE_COUNT) {
      const tx = Math.floor(seededRandom() * MAP_COLS);
      const ty = Math.floor(seededRandom() * MAP_ROWS);
      if (Math.abs(tx - centerX) <= SPAWN_EXCLUSION && Math.abs(ty - centerY) <= SPAWN_EXCLUSION) {
        continue;
      }
      const key = tileKey(tx, ty);
      if (this.blockedTiles.has(key)) continue;
      if (this.waterTiles.has(key)) continue;

      const tree = new Tree(tx, ty);
      this.trees.push(tree);
      this.treeByTile.set(key, tree);
      this.blockedTiles.add(key);
      this.add(tree);
      treesPlaced++;
    }

    // Spawn big rocks at seeded random positions (after bushes to preserve seed order)
    let rocksPlaced = 0;
    while (rocksPlaced < BIG_ROCK_COUNT) {
      const rx = Math.floor(seededRandom() * MAP_COLS);
      const ry = Math.floor(seededRandom() * MAP_ROWS);
      if (Math.abs(rx - centerX) <= SPAWN_EXCLUSION && Math.abs(ry - centerY) <= SPAWN_EXCLUSION) {
        continue;
      }
      const key = tileKey(rx, ry);
      if (this.blockedTiles.has(key)) continue;
      if (this.waterTiles.has(key)) continue;

      const rock = new BigRock(rx, ry);
      this.rocks.push(rock);
      this.rockByTile.set(key, rock);
      this.blockedTiles.add(key);
      this.add(rock);
      rocksPlaced++;
    }

    // Spawn small rocks as ground items at seeded random positions
    let smallRocksPlaced = 0;
    while (smallRocksPlaced < SMALL_ROCK_COUNT) {
      const sx = Math.floor(seededRandom() * MAP_COLS);
      const sy = Math.floor(seededRandom() * MAP_ROWS);
      if (Math.abs(sx - centerX) <= SPAWN_EXCLUSION && Math.abs(sy - centerY) <= SPAWN_EXCLUSION) {
        continue;
      }
      const key = tileKey(sx, sy);
      if (this.blockedTiles.has(key)) continue;
      if (this.waterTiles.has(key)) continue;

      this.dropItemAt(sx, sy, { ...ITEMS["small_rock"] }, true);
      smallRocksPlaced++;
    }

    // Action prompt label (shown when facing interactable)
    this.actionPrompt = new ex.Label({
      text: "[E] Pick",
      pos: ex.vec(0, 0),
      z: 50,
      font: new ex.Font({
        family: "monospace",
        size: 12,
        bold: true,
        color: ex.Color.White,
        textAlign: ex.TextAlign.Center,
        baseAlign: ex.BaseAlign.Bottom,
        shadow: { offset: ex.vec(1, 1), color: ex.Color.Black },
      }),
    });
    this.actionPrompt.graphics.visible = false;
    this.add(this.actionPrompt);
  }

  /** Generate organic pond shapes using seeded random. */
  private generatePonds(seededRandom: () => number): void {
    const centerX = MAP_COLS / 2;
    const centerY = MAP_ROWS / 2;
    let pondsPlaced = 0;
    let attempts = 0;
    const maxAttempts = 200;

    while (pondsPlaced < POND_COUNT && attempts < maxAttempts) {
      attempts++;

      // Pick a center for the pond
      const px = Math.floor(seededRandom() * (MAP_COLS - 10)) + 5;
      const py = Math.floor(seededRandom() * (MAP_ROWS - 10)) + 5;

      // Skip if too close to spawn
      if (Math.abs(px - centerX) <= WATER_EXCLUSION && Math.abs(py - centerY) <= WATER_EXCLUSION) {
        continue;
      }

      // Skip if overlapping another pond
      let overlaps = false;
      for (let dy = -POND_MAX_RADIUS; dy <= POND_MAX_RADIUS; dy++) {
        for (let dx = -POND_MAX_RADIUS; dx <= POND_MAX_RADIUS; dx++) {
          const wx = px + dx;
          const wy = py + dy;
          if (wx >= 0 && wx < MAP_COLS && wy >= 0 && wy < MAP_ROWS) {
            if (this.waterTiles.has(tileKey(wx, wy))) {
              overlaps = true;
              break;
            }
          }
        }
        if (overlaps) break;
      }
      if (overlaps) continue;

      // Generate organic blob shape
      const rx = POND_MIN_RADIUS + seededRandom() * (POND_MAX_RADIUS - POND_MIN_RADIUS);
      const ry = POND_MIN_RADIUS + seededRandom() * (POND_MAX_RADIUS - POND_MIN_RADIUS);

      // Create noise offsets for organic shape
      const noiseAngles = 8;
      const noiseOffsets: number[] = [];
      for (let i = 0; i < noiseAngles; i++) {
        noiseOffsets.push(0.7 + seededRandom() * 0.6); // 0.7 to 1.3 multiplier
      }

      for (let dy = -Math.ceil(ry) - 1; dy <= Math.ceil(ry) + 1; dy++) {
        for (let dx = -Math.ceil(rx) - 1; dx <= Math.ceil(rx) + 1; dx++) {
          const wx = px + dx;
          const wy = py + dy;

          if (wx < 1 || wx >= MAP_COLS - 1 || wy < 1 || wy >= MAP_ROWS - 1) continue;

          // Calculate distance with organic noise
          const angle = Math.atan2(dy, dx);
          const normalizedAngle = ((angle + Math.PI) / (2 * Math.PI)) * noiseAngles;
          const idx = Math.floor(normalizedAngle) % noiseAngles;
          const nextIdx = (idx + 1) % noiseAngles;
          const frac = normalizedAngle - Math.floor(normalizedAngle);
          const noiseMult = noiseOffsets[idx] * (1 - frac) + noiseOffsets[nextIdx] * frac;

          const ndx = dx / (rx * noiseMult);
          const ndy = dy / (ry * noiseMult);
          const dist = ndx * ndx + ndy * ndy;

          if (dist <= 1.0) {
            const key = tileKey(wx, wy);
            this.waterTiles.add(key);
            this.blockedTiles.add(key);
          }
        }
      }

      pondsPlaced++;
    }

    // Smooth pond shapes: remove water tiles that create 1-tile protrusions
    // (tiles with fewer than 2 adjacent cardinal water neighbors).
    // Also remove tiles that only have opposite water neighbors (narrow channels).
    // Run multiple passes to fully clean up.
    for (let pass = 0; pass < 3; pass++) {
      const toRemove: number[] = [];
      for (const key of this.waterTiles) {
        const tx = key % MAP_COLS;
        const ty = Math.floor(key / MAP_COLS);
        const n = this.waterTiles.has(tileKey(tx, ty - 1));
        const s = this.waterTiles.has(tileKey(tx, ty + 1));
        const e = this.waterTiles.has(tileKey(tx + 1, ty));
        const w = this.waterTiles.has(tileKey(tx - 1, ty));
        const waterCount = (n ? 1 : 0) + (s ? 1 : 0) + (e ? 1 : 0) + (w ? 1 : 0);

        // Remove tiles with 0 or 1 cardinal water neighbors (tips/isolated)
        if (waterCount < 2) {
          toRemove.push(key);
          continue;
        }

        // Remove tiles with exactly 2 opposite water neighbors (narrow channels)
        // These have n+s or e+w but not adjacent pairs
        if (waterCount === 2) {
          const hasAdjacentPair = (n && e) || (e && s) || (s && w) || (w && n);
          if (!hasAdjacentPair) {
            toRemove.push(key);
          }
        }
      }
      for (const key of toRemove) {
        this.waterTiles.delete(key);
        this.blockedTiles.delete(key);
      }
      if (toRemove.length === 0) break; // No changes, done early
    }
  }

  /** Determine the correct water tile type based on adjacent tiles. */
  private getWaterTileType(tx: number, ty: number): WaterTileTypeValue {
    const isWater = (x: number, y: number): boolean => {
      if (x < 0 || x >= MAP_COLS || y < 0 || y >= MAP_ROWS) return false;
      return this.waterTiles.has(tileKey(x, y));
    };

    const n = isWater(tx, ty - 1);
    const s = isWater(tx, ty + 1);
    const e = isWater(tx + 1, ty);
    const w = isWater(tx - 1, ty);
    const nw = isWater(tx - 1, ty - 1);
    const ne = isWater(tx + 1, ty - 1);
    const sw = isWater(tx - 1, ty + 1);
    const se = isWater(tx + 1, ty + 1);

    // Outer corners: two adjacent cardinal sides are land
    if (!n && !w && s && e) return WaterTileType.OuterNW;
    if (!n && !e && s && w) return WaterTileType.OuterNE;
    if (!s && !w && n && e) return WaterTileType.OuterSW;
    if (!s && !e && n && w) return WaterTileType.OuterSE;

    // Edges: one cardinal side is land
    if (!n && s && e && w) return WaterTileType.EdgeN;
    if (!s && n && e && w) return WaterTileType.EdgeS;
    if (!e && n && s && w) return WaterTileType.EdgeE;
    if (!w && n && s && e) return WaterTileType.EdgeW;

    // Inner corners: all cardinal sides are water but a diagonal is land
    if (n && s && e && w) {
      if (!nw) return WaterTileType.InnerNW;
      if (!ne) return WaterTileType.InnerNE;
      if (!sw) return WaterTileType.InnerSW;
      if (!se) return WaterTileType.InnerSE;
    }

    // Default: full water center
    return WaterTileType.Center;
  }

  /** Check if a tile is a water tile. */
  isWaterTile(x: number, y: number): boolean {
    return this.waterTiles.has(tileKey(x, y));
  }

  override onActivate(context: ex.SceneActivationContext<GameWorldData>): void {
    if (context.data) {
      if (this.player) {
        this.remove(this.player);
      }
      if (this.hud) {
        this.remove(this.hud);
        this.hud = null;
      }

      let appearance: CharacterAppearance;
      let startX: number;
      let startY: number;

      let inventory: InventoryState | undefined;

      if (context.data.type === "new") {
        appearance = context.data.appearance;
        startX = (MAP_COLS / 2) * TILE_SIZE + TILE_SIZE / 2;
        startY = (MAP_ROWS / 2) * TILE_SIZE + TILE_SIZE / 2;
      } else {
        appearance = context.data.save.player.appearance;
        startX = context.data.save.player.tileX * TILE_SIZE + TILE_SIZE / 2;
        startY = context.data.save.player.tileY * TILE_SIZE + TILE_SIZE / 2;
        if (context.data.save.player.equipment) {
          inventory = {
            equipment: context.data.save.player.equipment,
            bag: context.data.save.player.bag ?? [],
            maxWeight: context.data.save.player.maxWeight ?? 50,
          };
          // Migrate durability and stacking for old saves
          for (const item of Object.values(inventory.equipment)) {
            if (item) {
              migrateItemDurability(item);
              migrateItemStacking(item);
            }
          }
          for (const item of inventory.bag) {
            migrateItemDurability(item);
            migrateItemStacking(item);
          }
        }
      }

      const vitals = context.data.type === "load" ? context.data.save.player.vitals : undefined;
      this.player = new Player(appearance, ex.vec(startX, startY), inventory, vitals);
      this.player.setBlockedCheck((fromX, fromY, toX, toY) => {
        if (this.blockedTiles.has(tileKey(toX, toY))) return true;
        const ek = edgeKeyBetween(fromX, fromY, toX, toY);
        return ek !== null && this.blockedEdges.has(ek);
      });
      this.add(this.player);

      this.hud = new VitalsHud(() => this.player!.vitals, this.uiScale);
      this.add(this.hud);

      // Chat system setup
      if (this.chatLog) {
        this.remove(this.chatLog);
        this.chatLog = null;
      }
      if (this.chatInputPanel) {
        this.remove(this.chatInputPanel);
        this.chatInputPanel = null;
      }
      this.chatMessages = [];
      this.chatOpen = false;
      this.chatInputText = "";
      this.playerName =
        context.data.type === "load"
          ? (context.data.save.playerName ?? context.data.save.name)
          : context.data.playerName;

      // Chat input/hint panel sits at the very bottom-left.
      // UI_REF_HEIGHT (600) is the design-unit screen height; multiplying by
      // uiScale converts to ScreenElement pixel coordinates.
      const inputPanelH = 20;
      const inputY = (UI_REF_HEIGHT - 8) * this.uiScale; // 8 design-units from bottom
      this.chatInputPanel = new ex.ScreenElement({
        pos: ex.vec(8 * this.uiScale, inputY),
        z: 100,
        anchor: ex.vec(0, 1),
      });
      this.updateChatInputPanel();
      this.add(this.chatInputPanel);

      // Chat log sits just above the input panel (2 design-unit gap)
      const chatLogY = (UI_REF_HEIGHT - 8 - inputPanelH - 2) * this.uiScale;
      this.chatLog = new ChatLog(() => this.chatMessages, this.uiScale, chatLogY);
      this.add(this.chatLog);

      // Restore berry bush states from save
      if (context.data.type === "load" && context.data.save.bushes) {
        this.restoreBushStates(context.data.save.bushes);
      }

      // Restore tree states from save
      if (context.data.type === "load" && context.data.save.trees) {
        this.restoreTreeStates(context.data.save.trees);
      }

      // Restore rock states from save
      if (context.data.type === "load" && context.data.save.rocks) {
        this.restoreRockStates(context.data.save.rocks);
      }

      // Restore ground item states from save, or clear them for a new game
      if (context.data.type === "load" && context.data.save.groundItems) {
        this.restoreGroundItemStates(context.data.save.groundItems);
      } else if (context.data.type === "new") {
        this.restoreGroundItemStates([]);
      }

      // Restore building states from save, or clear them for a new game
      if (context.data.type === "load" && context.data.save.buildings) {
        this.restoreBuildingStates(context.data.save.buildings);
      } else if (context.data.type === "new") {
        this.restoreBuildingStates([]);
      }

      // Restore edge building states from save, or clear them for a new game
      if (context.data.type === "load" && context.data.save.edgeBuildings) {
        this.restoreEdgeBuildingStates(context.data.save.edgeBuildings);
      } else if (context.data.type === "new") {
        this.restoreEdgeBuildingStates([]);
      }

      // Sheep: restore from save or spawn fresh
      if (context.data.type === "load" && context.data.save.sheep) {
        this.restoreSheepStates(context.data.save.sheep);
      } else if (context.data.type === "new") {
        this.spawnInitialSheep();
      }

      // Cows: restore from save or spawn fresh
      if (context.data.type === "load" && context.data.save.cows) {
        this.restoreCowStates(context.data.save.cows);
      } else if (context.data.type === "new") {
        this.spawnInitialCows();
      }

      // NPCs: always clear old ones first, then restore or spawn fresh
      this.clearAllNPCs();
      if (context.data.type === "load" && context.data.save.npcs) {
        this.restoreNPCStates(context.data.save.npcs);
      } else if (context.data.type === "new") {
        this.spawnInitialNPCs();
      }

      // Restore player's claimed bed AFTER clearAllNPCs (which clears claimedBeds)
      if (context.data.type === "load" && context.data.save.playerClaimedBed) {
        const pb = context.data.save.playerClaimedBed;
        this.claimedBeds.set(tileKey(pb.x, pb.y), "__player__");
      }

      // Load LLM config for NPC brains
      void loadLLMConfig().then((config) => {
        this.llmConfig = config;
      });

      // Recalculate indoor lighting after restoring buildings
      this.recalculateIndoorLighting();

      // Restore sleeping state — must run after buildings are restored so the
      // bed Building exists in buildingByTile.
      if (context.data.type === "load" && context.data.save.player.sleeping) {
        const ss = context.data.save.player.sleeping;
        const bedKey = tileKey(ss.bedTileX, ss.bedTileY);
        const bed = this.buildingByTile.get(bedKey);
        if (
          bed &&
          (bed.type.id === "bed" || bed.type.id === "bedroll") &&
          bed.state === "complete"
        ) {
          this.enterSleep(bed);
        }
      }
    }

    if (this.player) {
      this.camera.clearAllStrategies();
      this.camera.zoom = 3.5;
      this.camera.strategy.lockToActor(this.player);
      const mapBounds = new ex.BoundingBox(0, 0, MAP_COLS * TILE_SIZE, MAP_ROWS * TILE_SIZE);
      this.camera.strategy.limitCameraBounds(mapBounds);
    }
  }

  override onPreUpdate(engine: ex.Engine, delta: number): void {
    const kb = engine.input.keyboard;

    // Lazily create NPC debug panel on first update (engine dimensions are reliable here)
    if (!this.npcDebugPanel) {
      this.npcDebugPanel = new NPCDebugPanel(engine.drawWidth, engine.drawHeight);
      this.npcDebugPanel.graphics.visible = false;
      this.add(this.npcDebugPanel);
      this.npcDebugPanel.setNPCs(this.npcList.filter((n) => !n.isDead));
    }

    // NPC debug panel toggle (backtick)
    if (kb.wasPressed(ex.Keys.Backquote)) {
      this.npcDebugVisible = !this.npcDebugVisible;
      if (this.npcDebugPanel) {
        this.npcDebugPanel.graphics.visible = this.npcDebugVisible;
        this.npcDebugPanel.setNPCs(this.npcList.filter((n) => !n.isDead));
      }
    }
    // Cycle NPC in debug panel with left/right when panel is open
    if (this.npcDebugVisible && this.npcDebugPanel) {
      if (kb.wasPressed(ex.Keys.ArrowLeft)) this.npcDebugPanel.cycleNPC(-1);
      if (kb.wasPressed(ex.Keys.ArrowRight)) this.npcDebugPanel.cycleNPC(1);
    }

    // Planning mode input handling
    if (this.planningMode) {
      this.handlePlanningInput(kb);
      return; // Block all other input while planning
    }

    // Item picker overlay input handling
    if (this.itemPickerOpen) {
      const maxVis = this.PICKER_MAX_VISIBLE;
      if (wasActionPressed(kb, "moveUp")) {
        this.itemPickerIndex = Math.max(0, this.itemPickerIndex - 1);
        if (this.itemPickerIndex < this.itemPickerScroll) {
          this.itemPickerScroll = this.itemPickerIndex;
        }
        this.updateItemPicker();
      }
      if (wasActionPressed(kb, "moveDown")) {
        this.itemPickerIndex = Math.min(this.itemPickerItems.length - 1, this.itemPickerIndex + 1);
        if (this.itemPickerIndex >= this.itemPickerScroll + maxVis) {
          this.itemPickerScroll = this.itemPickerIndex - maxVis + 1;
        }
        this.updateItemPicker();
      }
      if (wasActionPressed(kb, "confirm") || wasActionPressed(kb, "action")) {
        this.pickItemFromPicker();
      }
      if (wasActionPressed(kb, "back")) {
        this.closeItemPicker();
      }
      return; // Block all other input while picker is open
    }

    // Cooking menu input handling
    if (this.cookingMenuOpen) {
      this.handleCookingMenuInput(kb);
      return; // Block all other input while cooking menu is open
    }

    // Storage menu input handling
    if (this.storageMenuOpen) {
      this.handleStorageMenuInput(kb);
      return; // Block all other input while storage menu is open
    }

    // Chat input handling
    if (this.chatOpen) {
      this.handleChatInput(kb);
      return; // Block all other input while chat is open
    }

    // Chat message expiry cleanup
    this.updateChatCleanup();

    // Tree branch dropping
    this.updateTreeBranchDrops();

    // Despawn expired ground items
    this.updateGroundItemDespawn(delta);

    // Creature AI, breeding, and wild spawning
    this.updateSheep(delta);
    this.updateCows(delta);
    this.updateBreeding(delta);
    this.updateWildSpawn(delta);
    this.updateCowWildSpawn(delta);
    this.updateNPCs(delta);

    // Death check while inventory is open (game keeps running)
    if (this.inventoryMenuOpen && this.player && !isAlive(this.player.vitals)) {
      this.closeInventoryMenu();
      const cause = this.getDeathCause();
      void engine.goToScene("game-over", { sceneActivationData: { cause } });
      return;
    }

    // Inventory menu: game world continues updating, only player input is blocked
    if (this.inventoryMenuOpen) {
      this.handleInventoryMenuInput(kb);
      return;
    }

    // Sleeping: only allow pause and waking up
    if (this.playerSleeping && this.sleepingBed) {
      if (wasActionPressed(kb, "pause")) {
        void engine.goToScene("pause-menu");
      }
      const bedWorldX = this.sleepingBed.pos.x;
      const bedWorldY = this.sleepingBed.pos.y;
      if (this.actionPrompt) {
        this.actionPrompt.text = "[E] Get Up";
        this.actionPrompt.pos = ex.vec(bedWorldX, bedWorldY - TILE_SIZE / 2 - 4);
        this.actionPrompt.graphics.visible = true;
      }
      if (wasActionPressed(kb, "action")) {
        this.exitSleep();
      }
      return;
    }

    if (wasActionPressed(kb, "pause")) {
      void engine.goToScene("pause-menu");
    }
    if (wasActionPressed(kb, "inventory")) {
      this.openInventoryMenu();
    }
    if (wasActionPressed(kb, "chat")) {
      this.openChat();
    }
    if (
      this.player &&
      !this.player.isBusy() &&
      !this.player.isMoving() &&
      !this.player.isExhausted()
    ) {
      if (wasActionPressed(kb, "build")) {
        this.enterPlanningMode();
      }
    }

    if (this.player && !isAlive(this.player.vitals)) {
      const cause = this.getDeathCause();
      void engine.goToScene("game-over", { sceneActivationData: { cause } });
    }

    // Attack handling (blocked when exhausted)
    if (
      this.player &&
      !this.player.isBusy() &&
      !this.player.isMoving() &&
      !this.player.isExhausted()
    ) {
      if (wasActionPressed(kb, "attack")) {
        const weapon = this.player.inventory.equipment[EquipmentSlot.MainHand];

        // ── Bow (ranged) attack ──────────────────────────────────
        if (weapon?.id === "bow") {
          // Check for arrows in OffHand
          const offHand = this.player.inventory.equipment[EquipmentSlot.OffHand];
          if (!offHand || offHand.id !== "arrow") {
            this.spawnPickupText("No Arrows!", this.player.pos.x, this.player.pos.y - 16);
          } else {
            const style = this.player.startAttack();
            const facing = this.player.getFacingTile();
            const targetX = facing.x * TILE_SIZE + TILE_SIZE / 2;
            const targetY = facing.y * TILE_SIZE + TILE_SIZE / 2;
            // Shoot effect positioned closer to the player (bowstring snap)
            const effectX = this.player.pos.x + (targetX - this.player.pos.x) * 0.3;
            const effectY = this.player.pos.y + (targetY - this.player.pos.y) * 0.3;
            this.add(new AttackEffect(effectX, effectY, style, this.player.getFacing()));

            // Consume one arrow (consumed even if blocked — you still shot)
            consumeArrow(this.player.inventory);

            // Check if a wall/fence blocks the arrow from even leaving
            const bowPlayerTX = this.player!.getTileX();
            const bowPlayerTY = this.player!.getTileY();
            const bowEdgeKey = edgeKeyBetween(bowPlayerTX, bowPlayerTY, facing.x, facing.y);
            const bowBlockedByEdge = bowEdgeKey != null && this.blockedEdges.has(bowEdgeKey);
            if (bowBlockedByEdge) {
              // Arrow hits the wall immediately — reduce bow durability but don't spawn projectile
              if (weapon.durability != null) {
                weapon.durability -= 1;
                if (weapon.durability <= 0) {
                  this.player!.inventory.equipment[EquipmentSlot.MainHand] = null;
                  this.player!.refreshSprite();
                  this.spawnPickupText(
                    `${weapon.name} broke!`,
                    this.player!.pos.x,
                    this.player!.pos.y - 16,
                  );
                }
              }
            } else {
              // Canonical item definition for stats/multipliers
              const canonical = ITEMS[weapon.id] ?? weapon;
              const baseDamage = canonical.stats.attack ?? 0;

              // Spawn the arrow projectile starting from the facing tile
              const playerDir = this.player.getFacing();
              const arrow = new ArrowProjectile({
                startTileX: facing.x,
                startTileY: facing.y,
                direction: playerDir,
                maxRange: 5,
                onTileReached: (tx: number, ty: number) => {
                  return this.applyArrowDamageAt(tx, ty, baseDamage, canonical);
                },
                isEdgeBlocked: (fromTX: number, fromTY: number, toTX: number, toTY: number) => {
                  const ek = edgeKeyBetween(fromTX, fromTY, toTX, toTY);
                  return ek !== null && this.blockedEdges.has(ek);
                },
              });
              this.add(arrow);

              // Bow durability loss
              if (weapon.durability != null) {
                weapon.durability -= 1;
                if (weapon.durability <= 0) {
                  this.player!.inventory.equipment[EquipmentSlot.MainHand] = null;
                  this.player!.refreshSprite();
                  this.spawnPickupText(
                    `${weapon.name} broke!`,
                    this.player!.pos.x,
                    this.player!.pos.y - 16,
                  );
                }
              }
            }
          }
        } else {
          // ── Melee attack (swing / thrust) ────────────────────────
          const style = this.player.startAttack();
          const facing = this.player.getFacingTile();
          const targetX = facing.x * TILE_SIZE + TILE_SIZE / 2;
          const targetY = facing.y * TILE_SIZE + TILE_SIZE / 2;
          // Position between player and facing tile center
          const blend = style === "swing" ? 0.55 : 0.7;
          const effectX = this.player.pos.x + (targetX - this.player.pos.x) * blend;
          const effectY = this.player.pos.y + (targetY - this.player.pos.y) * blend;
          this.add(new AttackEffect(effectX, effectY, style, this.player.getFacing()));

          // Apply damage to resources on the facing tile
          // Unarmed attacks deal 1 damage with no tool multipliers
          const UNARMED_DAMAGE = 1;
          // Always look up the canonical item definition for stats and multipliers
          // so that old saves with stale item copies still work correctly.
          const canonical = weapon ? (ITEMS[weapon.id] ?? weapon) : null;
          const baseDamage = canonical ? (canonical.stats.attack ?? 0) : UNARMED_DAMAGE;
          const facingKey = tileKey(facing.x, facing.y);

          // Check if a wall/fence blocks melee from reaching the facing tile
          const playerTX = this.player!.getTileX();
          const playerTY = this.player!.getTileY();
          const meleeEdgeKey = edgeKeyBetween(playerTX, playerTY, facing.x, facing.y);
          const meleeBlockedByEdge = meleeEdgeKey != null && this.blockedEdges.has(meleeEdgeKey);

          // Only damage entities on the facing tile if not blocked by a wall/fence
          if (!meleeBlockedByEdge) {
            // Rock mining
            const rock = this.rockByTile.get(facingKey);
            if (rock) {
              const mult = canonical?.toolMultipliers?.mineable ?? 1;
              const damage = baseDamage * mult;
              const drops = rock.takeDamage(damage);
              for (const drop of drops) {
                this.dropResourceNear(rock.tileX, rock.tileY, drop);
              }
              if (damage > 0) {
                this.spawnPickupText(`-${damage}`, targetX, targetY);
              }
            }

            // Tree chopping
            const tree = this.treeByTile.get(facingKey);
            if (tree && !tree.isChoppedDown()) {
              const mult = canonical?.toolMultipliers?.tree ?? 1;
              const damage = baseDamage * mult;
              const result = tree.takeDamage(damage);
              for (const drop of result.drops) {
                this.dropResourceNear(tree.tileX, tree.tileY, drop);
              }
              if (damage > 0) {
                this.spawnPickupText(`-${damage}`, targetX, targetY);
              }
            }

            // Sheep damage
            const sheepTarget = this.sheepByTile.get(facingKey);
            if (sheepTarget && !sheepTarget.isDead) {
              const mult = canonical?.toolMultipliers?.creature ?? 1;
              const damage = baseDamage * mult;
              const drops = sheepTarget.takeDamage(damage);
              for (const drop of drops) {
                this.dropResourceNear(sheepTarget.tileX, sheepTarget.tileY, drop);
              }
              if (damage > 0) {
                this.spawnPickupText(`-${damage}`, targetX, targetY);
              }
              if (sheepTarget.isDead) {
                this.removeSheep(sheepTarget);
              }
            }

            // Cow damage
            const cowTarget = this.cowByTile.get(facingKey);
            if (cowTarget && !cowTarget.isDead) {
              const mult = canonical?.toolMultipliers?.creature ?? 1;
              const damage = baseDamage * mult;
              const drops = cowTarget.takeDamage(damage);
              for (const drop of drops) {
                this.dropResourceNear(cowTarget.tileX, cowTarget.tileY, drop);
              }
              if (damage > 0) {
                this.spawnPickupText(`-${damage}`, targetX, targetY);
              }
              if (cowTarget.isDead) {
                this.removeCow(cowTarget);
              }
            }

            // Tile-based building construction / repair / damage (floors)
            const building = this.buildingByTile.get(facingKey);
            if (building) {
              if (building.state === "hologram") {
                if (weapon?.id === "hammer") {
                  const delivered = building.deliverMaterial(this.player!.inventory);
                  if (delivered) {
                    const itemName = ITEMS[delivered]?.name ?? delivered;
                    this.spawnPickupText(`+[${itemName}]`, targetX, targetY);
                    if ((building.state as string) === "complete") {
                      this.spawnPickupText("Built!", targetX, targetY - 16);
                      if (building.isSolid()) {
                        this.blockedTiles.add(facingKey);
                      }
                      this.recalculateIndoorLighting();
                    }
                  } else {
                    const nextReq = building.getNextRequired();
                    if (nextReq) {
                      const reqName = ITEMS[nextReq]?.name ?? nextReq;
                      this.spawnPickupText(`Need [${reqName}]!`, targetX, targetY);
                    }
                  }
                }
              } else {
                if (weapon?.id === "hammer") {
                  const mult = canonical?.toolMultipliers?.building ?? 1;
                  const repairAmount = baseDamage * mult;
                  const repaired = building.repair(repairAmount);
                  if (repaired > 0) {
                    this.spawnPickupText(`+${repaired}`, targetX, targetY);
                  }
                } else {
                  const damage = baseDamage;
                  const destroyed = building.takeBuildingDamage(damage);
                  if (damage > 0) {
                    this.spawnPickupText(`-${damage}`, targetX, targetY);
                  }
                  if (destroyed) {
                    this.removeBuilding(building, facingKey);
                  }
                }
              }
            }
          } // end if (!meleeBlockedByEdge)

          // Edge-based building construction / repair / damage (walls, fences)
          // Always reachable — you can hit the wall/fence itself even when it blocks
          const facingEdgeKey = edgeKeyBetween(playerTX, playerTY, facing.x, facing.y);
          const edgeBuilding =
            facingEdgeKey != null ? this.edgeBuildings.get(facingEdgeKey) : undefined;
          if (edgeBuilding) {
            if (edgeBuilding.state === "hologram") {
              if (weapon?.id === "hammer") {
                const delivered = edgeBuilding.deliverMaterial(this.player!.inventory);
                if (delivered) {
                  const itemName = ITEMS[delivered]?.name ?? delivered;
                  this.spawnPickupText(`+[${itemName}]`, targetX, targetY);
                  if ((edgeBuilding.state as string) === "complete") {
                    this.spawnPickupText("Built!", targetX, targetY - 16);
                    if (edgeBuilding.isSolid()) {
                      this.blockedEdges.add(facingEdgeKey!);
                    }
                    this.recalculateIndoorLighting();
                  }
                } else {
                  const nextReq = edgeBuilding.getNextRequired();
                  if (nextReq) {
                    const reqName = ITEMS[nextReq]?.name ?? nextReq;
                    this.spawnPickupText(`Need [${reqName}]!`, targetX, targetY);
                  }
                }
              }
            } else {
              if (weapon?.id === "hammer") {
                const mult = canonical?.toolMultipliers?.building ?? 1;
                const repairAmount = baseDamage * mult;
                const repaired = edgeBuilding.repair(repairAmount);
                if (repaired > 0) {
                  this.spawnPickupText(`+${repaired}`, targetX, targetY);
                }
              } else {
                const damage = baseDamage;
                const destroyed = edgeBuilding.takeBuildingDamage(damage);
                if (damage > 0) {
                  this.spawnPickupText(`-${damage}`, targetX, targetY);
                }
                if (destroyed) {
                  this.removeEdgeBuilding(edgeBuilding, facingEdgeKey!);
                }
              }
            }
          }

          // Weapon durability loss: -1 per attack
          if (weapon && weapon.durability != null) {
            weapon.durability -= 1;
            if (weapon.durability <= 0) {
              this.player!.inventory.equipment[EquipmentSlot.MainHand] = null;
              this.player!.refreshSprite();
              this.spawnPickupText(
                `${weapon.name} broke!`,
                this.player!.pos.x,
                this.player!.pos.y - 16,
              );
            }
          }
        }
      }
    }

    // Action prompt + interaction
    if (this.player && !this.player.isBusy() && !this.player.isMoving()) {
      const facing = this.player.getFacingTile();
      const facingKey = tileKey(facing.x, facing.y);
      const facingBuilding = this.buildingByTile.get(facingKey);
      const exhausted = this.player.isExhausted();

      // Bed/bedroll interaction — always allowed, even when exhausted
      if (
        facingBuilding &&
        (facingBuilding.type.id === "bed" || facingBuilding.type.id === "bedroll") &&
        facingBuilding.state === "complete"
      ) {
        const worldX = facing.x * TILE_SIZE + TILE_SIZE / 2;
        const worldY = facing.y * TILE_SIZE + TILE_SIZE / 2;
        const bedKey = tileKey(facing.x, facing.y);
        const bedOwner = this.claimedBeds.get(bedKey);
        const playerOwns = bedOwner === "__player__";
        const unclaimed = !bedOwner;

        if (this.actionPrompt) {
          if (unclaimed) {
            this.actionPrompt.text = "[E] Claim";
          } else if (playerOwns) {
            this.actionPrompt.text = "[E] Sleep";
          } else {
            this.actionPrompt.text = "Taken";
          }
          this.actionPrompt.pos = ex.vec(worldX, worldY - TILE_SIZE / 2 - 4);
          this.actionPrompt.graphics.visible = true;
        }

        if (wasActionPressed(kb, "action")) {
          if (unclaimed) {
            // Claim the bed
            this.claimedBeds.set(bedKey, "__player__");
            this.spawnPickupText("Claimed!", worldX, worldY);
          } else if (playerOwns) {
            // Sleep in the bed
            this.enterSleep(facingBuilding);
          }
          // If taken by NPC, do nothing
        }
      } else if (exhausted) {
        // Too tired to do anything — hide prompt
        if (this.actionPrompt) {
          this.actionPrompt.graphics.visible = false;
        }
      } else {
        // Normal interactions (only when not exhausted)
        const bush = this.bushByTile.get(facingKey);
        const facingWater = this.waterTiles.has(facingKey);
        const groundStack = this.groundItems.get(facingKey);
        const hasGroundItems = groundStack && !groundStack.isEmpty();
        const facingSheep = this.sheepByTile.get(facingKey);
        const hasSheep = facingSheep && !facingSheep.isDead;
        const facingCow = this.cowByTile.get(facingKey);
        const hasCow = facingCow && !facingCow.isDead;

        if (bush?.canPick()) {
          // Berry bush interaction
          if (this.actionPrompt) {
            this.actionPrompt.text = "[E] Pick";
            this.actionPrompt.pos = ex.vec(bush.pos.x, bush.pos.y - TILE_SIZE / 2 - 4);
            this.actionPrompt.graphics.visible = true;
          }

          if (wasActionPressed(kb, "action")) {
            this.player.startPicking();

            // Delay the actual pick until the animation finishes
            const currentBush = bush;
            const currentPlayer = this.player;
            setTimeout(() => {
              const berry = currentBush.pick();
              if (berry) {
                currentPlayer.inventory.bag.push(berry);
                this.spawnPickupText(`+[${berry.name}]`, currentBush.pos.x, currentBush.pos.y);
              }
            }, 450);
          }
        } else if (facingWater) {
          // Water drinking interaction
          const waterWorldX = facing.x * TILE_SIZE + TILE_SIZE / 2;
          const waterWorldY = facing.y * TILE_SIZE + TILE_SIZE / 2;

          if (this.actionPrompt) {
            this.actionPrompt.text = "[E] Drink";
            this.actionPrompt.pos = ex.vec(waterWorldX, waterWorldY - TILE_SIZE / 2 - 4);
            this.actionPrompt.graphics.visible = true;
          }

          if (wasActionPressed(kb, "action")) {
            this.player.startDrinking();

            // Spawn floating text after the drinking animation completes
            setTimeout(() => {
              this.spawnPickupText("+Thirst", waterWorldX, waterWorldY);
            }, 950);
          }
        } else if (hasSheep) {
          // Sheep petting interaction
          const sheepWorldX = facingSheep.pos.x;
          const sheepWorldY = facingSheep.pos.y;

          if (this.actionPrompt) {
            this.actionPrompt.text = "[E] Pet";
            this.actionPrompt.pos = ex.vec(sheepWorldX, sheepWorldY - TILE_SIZE / 2 - 4);
            this.actionPrompt.graphics.visible = true;
          }

          if (wasActionPressed(kb, "action")) {
            facingSheep.toggleFollow();
            this.spawnPickupText("*baaaa*", sheepWorldX, sheepWorldY);
          }
        } else if (hasCow) {
          // Cow petting interaction
          const cowWorldX = facingCow.pos.x;
          const cowWorldY = facingCow.pos.y;

          if (this.actionPrompt) {
            this.actionPrompt.text = "[E] Pet";
            this.actionPrompt.pos = ex.vec(cowWorldX, cowWorldY - TILE_SIZE / 2 - 4);
            this.actionPrompt.graphics.visible = true;
          }

          if (wasActionPressed(kb, "action")) {
            facingCow.toggleFollow();
            this.spawnPickupText("*moooo*", cowWorldX, cowWorldY);
          }
        } else if (hasGroundItems) {
          // Ground item interaction
          const worldX = facing.x * TILE_SIZE + TILE_SIZE / 2;
          const worldY = facing.y * TILE_SIZE + TILE_SIZE / 2;
          const count = groundStack.getCount();

          if (this.actionPrompt) {
            this.actionPrompt.text = count > 1 ? `[E] Pick up (${count})` : "[E] Pick up";
            this.actionPrompt.pos = ex.vec(worldX, worldY - TILE_SIZE / 2 - 4);
            this.actionPrompt.graphics.visible = true;
          }

          if (wasActionPressed(kb, "action")) {
            if (count === 1) {
              // Single item: pick up directly
              this.pickupSingleItem(groundStack, facingKey, worldX, worldY);
            } else {
              // Multiple items: open item picker
              this.openItemPicker(groundStack, facingKey, worldX, worldY);
            }
          }
        } else if (
          facingBuilding &&
          facingBuilding.type.storage &&
          facingBuilding.state === "complete"
        ) {
          // Storage box interaction
          const worldX = facing.x * TILE_SIZE + TILE_SIZE / 2;
          const worldY = facing.y * TILE_SIZE + TILE_SIZE / 2;
          if (this.actionPrompt) {
            this.actionPrompt.text = "[E] Open";
            this.actionPrompt.pos = ex.vec(worldX, worldY - TILE_SIZE / 2 - 4);
            this.actionPrompt.graphics.visible = true;
          }
          if (wasActionPressed(kb, "action")) {
            this.openStorageMenu(facingBuilding);
          }
        } else if (
          facingBuilding &&
          facingBuilding.type.fire &&
          facingBuilding.state === "complete"
        ) {
          // Fire building interaction (light / cook)
          const worldX = facing.x * TILE_SIZE + TILE_SIZE / 2;
          const worldY = facing.y * TILE_SIZE + TILE_SIZE / 2;

          if (facingBuilding.isBurning) {
            // Fire is burning — offer cooking
            if (this.actionPrompt) {
              this.actionPrompt.text = "[E] Cook";
              this.actionPrompt.pos = ex.vec(worldX, worldY - TILE_SIZE / 2 - 4);
              this.actionPrompt.graphics.visible = true;
            }

            if (wasActionPressed(kb, "action")) {
              this.openCookingMenu(facingBuilding);
            }
          } else if (!facingBuilding.type.fire.autoIgnite) {
            // Unlit fire pit/hearth — offer to light
            const fireCfg = facingBuilding.type.fire;
            const inventory = this.player.inventory;
            const canLight = fireCfg.fuelCost.every(
              (req) => inventory.bag.filter((item) => item.id === req.itemId).length >= req.count,
            );

            if (canLight) {
              if (this.actionPrompt) {
                this.actionPrompt.text = "[E] Light";
                this.actionPrompt.pos = ex.vec(worldX, worldY - TILE_SIZE / 2 - 4);
                this.actionPrompt.graphics.visible = true;
              }

              if (wasActionPressed(kb, "action")) {
                // Consume fuel items
                for (const req of fireCfg.fuelCost) {
                  for (let i = 0; i < req.count; i++) {
                    const idx = inventory.bag.findIndex((item) => item.id === req.itemId);
                    if (idx !== -1) inventory.bag.splice(idx, 1);
                  }
                }
                facingBuilding.ignite();
                this.spawnPickupText("Lit!", worldX, worldY);
              }
            } else {
              // Show what's needed
              const costStr = fireCfg.fuelCost
                .map((req) => `${req.count}x ${ITEMS[req.itemId]?.name ?? req.itemId}`)
                .join(" + ");
              if (this.actionPrompt) {
                this.actionPrompt.text = `Need ${costStr}`;
                this.actionPrompt.pos = ex.vec(worldX, worldY - TILE_SIZE / 2 - 4);
                this.actionPrompt.graphics.visible = true;
              }
            }
          } else if (this.actionPrompt) {
            // Auto-ignite building that already burned out (shouldn't happen — it gets removed)
            this.actionPrompt.graphics.visible = false;
          }
        } else {
          // Edge building interaction (doors/gates on edges)
          const pTX = this.player.getTileX();
          const pTY = this.player.getTileY();
          const fEdgeKey = edgeKeyBetween(pTX, pTY, facing.x, facing.y);
          const facingEdge = fEdgeKey != null ? this.edgeBuildings.get(fEdgeKey) : undefined;
          if (facingEdge && facingEdge.type.interactable && facingEdge.state === "complete") {
            const worldX = facing.x * TILE_SIZE + TILE_SIZE / 2;
            const worldY = facing.y * TILE_SIZE + TILE_SIZE / 2;
            const promptText = facingEdge.isOpen ? "[E] Close" : "[E] Open";

            if (this.actionPrompt) {
              this.actionPrompt.text = promptText;
              this.actionPrompt.pos = ex.vec(worldX, worldY - TILE_SIZE / 2 - 4);
              this.actionPrompt.graphics.visible = true;
            }

            if (wasActionPressed(kb, "action")) {
              facingEdge.toggle();
              if (facingEdge.isSolid()) {
                this.blockedEdges.add(fEdgeKey!);
              } else {
                this.blockedEdges.delete(fEdgeKey!);
              }
              this.recalculateIndoorLighting();
            }
          } else if (
            facingBuilding &&
            facingBuilding.type.interactable &&
            facingBuilding.state === "complete"
          ) {
            // Tile-based building interaction (toggle open/close)
            const worldX = facing.x * TILE_SIZE + TILE_SIZE / 2;
            const worldY = facing.y * TILE_SIZE + TILE_SIZE / 2;
            const promptText = facingBuilding.isOpen ? "[E] Close" : "[E] Open";

            if (this.actionPrompt) {
              this.actionPrompt.text = promptText;
              this.actionPrompt.pos = ex.vec(worldX, worldY - TILE_SIZE / 2 - 4);
              this.actionPrompt.graphics.visible = true;
            }

            if (wasActionPressed(kb, "action")) {
              facingBuilding.toggle();
              if (facingBuilding.isSolid()) {
                this.blockedTiles.add(facingKey);
              } else {
                this.blockedTiles.delete(facingKey);
              }
            }
          } else if (this.actionPrompt) {
            this.actionPrompt.graphics.visible = false;
          }
        }
      }
    } else if (this.actionPrompt) {
      this.actionPrompt.graphics.visible = false;
    }
  }

  private getDeathCause(): DeathCause {
    if (!this.player) return "both";
    const { hunger, thirst } = this.player.vitals;
    if (hunger <= 0 && thirst <= 0) return "both";
    if (hunger <= 0) return "starvation";
    return "dehydration";
  }

  // ==================== Sleeping ====================

  private enterSleep(bed: Building): void {
    if (!this.player) return;
    this.playerSleeping = true;
    this.sleepingBed = bed;
    this.player.sleepEnergyRate = bed.type.id === "bedroll" ? 3 : 5;
    this.player.lockInput();

    // Save original position so we can snap back on wake-up
    this.preSleepPos = this.player.pos.clone();

    // Position the player's head on the pillow.  The character sprite always
    // has the head at the TOP of the 32×32 frame, so we rotate the whole
    // actor to point the head toward the headboard, then nudge toward the
    // footboard so the head lands on the pillow.
    //
    // Rotation 0 (N): headboard top    → actor rotation 0,       nudge +y
    // Rotation 1 (E): headboard right  → actor rotation 90° CW,  nudge +y (maps to +x on screen)
    // Rotation 2 (S): headboard bottom → actor rotation 180°,    nudge +y (maps to -y on screen)
    // Rotation 3 (W): headboard left   → actor rotation 270° CW, nudge +y (maps to -x on screen)
    const rot = bed.tileRotation;
    const NUDGE = 3;
    const offsets = [
      { dx: 0, dy: NUDGE },
      { dx: NUDGE, dy: 0 },
      { dx: 0, dy: -NUDGE },
      { dx: -NUDGE, dy: 0 },
    ];

    this.player.pos.x = bed.pos.x + offsets[rot].dx;
    this.player.pos.y = bed.pos.y + offsets[rot].dy;
    // Rotate the actor so the head (sprite top) points toward the headboard
    this.player.rotation = (rot * Math.PI) / 2;
    this.player.enterBed("down");

    // Create a blanket overlay (z=11, above the player at z=10) that hides
    // the character's body below the head.  The blanket is drawn in default
    // (rotation 0) coordinates and then canvas-rotated to match the bed.
    // Colours match the bed sheet (Gray clothing colour: 100, 100, 105).
    this.blanketOverlay = new ex.Actor({
      pos: ex.vec(bed.pos.x, bed.pos.y),
      anchor: ex.vec(0.5, 0.5),
      z: 11,
    });

    const blanketCanvas = new ex.Canvas({
      width: TILE_SIZE,
      height: TILE_SIZE,
      cache: true,
      draw: (ctx) => {
        ctx.imageSmoothingEnabled = false;

        // Apply the same rotation as the bed sprite
        if (rot !== 0) {
          ctx.save();
          ctx.translate(TILE_SIZE / 2, TILE_SIZE / 2);
          ctx.rotate((rot * Math.PI) / 2);
          ctx.translate(-TILE_SIZE / 2, -TILE_SIZE / 2);
        }

        // Sheet area: x 2-30, y 14-30 (matches drawBed exactly)
        const sx = 2;
        const sw = 28;
        const sy = 14;
        const sh = 16;

        // Base sheet colour
        ctx.fillStyle = "rgb(100,100,105)";
        ctx.fillRect(sx, sy, sw, sh);

        // Subtle body bump — slightly lighter centre strip
        ctx.fillStyle = "rgb(112,112,117)";
        ctx.fillRect(sx + 6, sy + 1, sw - 12, sh - 3);

        // Vertical fold lines
        ctx.fillStyle = "rgb(80,80,84)";
        ctx.fillRect(sx + 4, sy, 1, sh);
        ctx.fillRect(sx + sw - 5, sy, 1, sh);

        // Horizontal fold
        ctx.fillRect(sx, sy + Math.floor(sh / 2), sw, 1);

        // Top edge highlight (blanket pulled up to chin)
        ctx.fillStyle = "rgb(131,131,135)";
        ctx.fillRect(sx + 1, sy, sw - 2, 1);

        // Bottom edge shadow
        ctx.fillStyle = "rgb(70,70,74)";
        ctx.fillRect(sx, sy + sh - 1, sw, 1);

        if (rot !== 0) {
          ctx.restore();
        }
      },
    });

    this.blanketOverlay.graphics.use(blanketCanvas);
    this.add(this.blanketOverlay);
  }

  private exitSleep(): void {
    if (!this.player) return;

    // Move the player back to where they were standing and reset rotation
    if (this.preSleepPos) {
      this.player.pos.x = this.preSleepPos.x;
      this.player.pos.y = this.preSleepPos.y;
      this.preSleepPos = null;
    }
    this.player.rotation = 0;

    // Remove blanket overlay
    if (this.blanketOverlay) {
      this.remove(this.blanketOverlay);
      this.blanketOverlay = null;
    }

    this.playerSleeping = false;
    this.sleepingBed = null;
    this.player.exitBed();
    this.player.unlockInput();
    if (this.actionPrompt) {
      this.actionPrompt.graphics.visible = false;
    }
  }

  getPlayerState(): SaveData["player"] | null {
    if (!this.player) return null;

    // When sleeping the player's position is on the bed, not where they were
    // standing.  Save the pre-sleep tile as the canonical position so loading
    // without sleep support still puts them in a sensible spot.
    const sleeping =
      this.playerSleeping && this.sleepingBed && this.preSleepPos
        ? {
            preSleepTileX: Math.floor(this.preSleepPos.x / TILE_SIZE),
            preSleepTileY: Math.floor(this.preSleepPos.y / TILE_SIZE),
            bedTileX: this.sleepingBed.tileX,
            bedTileY: this.sleepingBed.tileY,
          }
        : undefined;

    // Use the pre-sleep position as the saved tile so older loaders still work
    const tileX = sleeping ? sleeping.preSleepTileX : this.player.getTileX();
    const tileY = sleeping ? sleeping.preSleepTileY : this.player.getTileY();

    return {
      tileX,
      tileY,
      appearance: this.player.appearance,
      equipment: this.player.inventory.equipment,
      bag: this.player.inventory.bag,
      maxWeight: this.player.inventory.maxWeight,
      vitals: this.player.vitals,
      sleeping,
    };
  }

  /**
   * Apply arrow damage at a tile. Returns true if the arrow hit something and should stop.
   */
  private applyArrowDamageAt(tx: number, ty: number, baseDamage: number, canonical: Item): boolean {
    const key = tileKey(tx, ty);
    const worldX = tx * TILE_SIZE + TILE_SIZE / 2;
    const worldY = ty * TILE_SIZE + TILE_SIZE / 2;

    // Rock
    const rock = this.rockByTile.get(key);
    if (rock) {
      const mult = canonical.toolMultipliers?.mineable ?? 1;
      const damage = baseDamage * mult;
      const drops = rock.takeDamage(damage);
      for (const drop of drops) {
        this.dropResourceNear(rock.tileX, rock.tileY, drop);
      }
      if (damage > 0) {
        this.spawnPickupText(`-${damage}`, worldX, worldY);
      }
      return true;
    }

    // Tree
    const tree = this.treeByTile.get(key);
    if (tree && !tree.isChoppedDown()) {
      const mult = canonical.toolMultipliers?.tree ?? 1;
      const damage = baseDamage * mult;
      const result = tree.takeDamage(damage);
      for (const drop of result.drops) {
        this.dropResourceNear(tree.tileX, tree.tileY, drop);
      }
      if (damage > 0) {
        this.spawnPickupText(`-${damage}`, worldX, worldY);
      }
      return true;
    }

    // Sheep
    const sheepTarget = this.sheepByTile.get(key);
    if (sheepTarget && !sheepTarget.isDead) {
      const mult = canonical.toolMultipliers?.creature ?? 1;
      const damage = baseDamage * mult;
      const drops = sheepTarget.takeDamage(damage);
      for (const drop of drops) {
        this.dropResourceNear(sheepTarget.tileX, sheepTarget.tileY, drop);
      }
      if (damage > 0) {
        this.spawnPickupText(`-${damage}`, worldX, worldY);
      }
      if (sheepTarget.isDead) {
        this.removeSheep(sheepTarget);
      }
      return true;
    }

    // Cow
    const cowTarget = this.cowByTile.get(key);
    if (cowTarget && !cowTarget.isDead) {
      const mult = canonical.toolMultipliers?.creature ?? 1;
      const damage = baseDamage * mult;
      const drops = cowTarget.takeDamage(damage);
      for (const drop of drops) {
        this.dropResourceNear(cowTarget.tileX, cowTarget.tileY, drop);
      }
      if (damage > 0) {
        this.spawnPickupText(`-${damage}`, worldX, worldY);
      }
      if (cowTarget.isDead) {
        this.removeCow(cowTarget);
      }
      return true;
    }

    // Tile-based building (floors) — arrows damage but don't construct/repair
    const building = this.buildingByTile.get(key);
    if (building && building.state !== "hologram") {
      const damage = baseDamage;
      const destroyed = building.takeBuildingDamage(damage);
      if (damage > 0) {
        this.spawnPickupText(`-${damage}`, worldX, worldY);
      }
      if (destroyed) {
        this.removeBuilding(building, key);
      }
      return true;
    }

    // Blocked tiles (solid buildings like furnaces) stop the arrow even as holograms
    if (this.blockedTiles.has(key)) {
      return true;
    }

    return false;
  }

  private spawnPickupText(text: string, x: number, y: number): void {
    this.add(new FloatingText(text, x, y - TILE_SIZE / 2));
  }

  getBushStates(): BerryBushSaveState[] {
    return this.bushes.map((bush) => bush.getState());
  }

  private restoreBushStates(states: BerryBushSaveState[]): void {
    for (const saved of states) {
      const key = tileKey(saved.tileX, saved.tileY);
      const bush = this.bushByTile.get(key);
      if (bush) {
        bush.restoreState(saved);
      }
    }
  }

  getTreeStates(): TreeSaveState[] {
    return this.trees.map((tree) => tree.getState());
  }

  private restoreTreeStates(states: TreeSaveState[]): void {
    for (const saved of states) {
      const key = tileKey(saved.tileX, saved.tileY);
      const tree = this.treeByTile.get(key);
      if (tree) {
        tree.restoreState(saved);
      }
    }
  }

  getRockStates(): BigRockSaveState[] {
    return this.rocks.map((rock) => rock.getState());
  }

  private restoreRockStates(states: BigRockSaveState[]): void {
    for (const saved of states) {
      const key = tileKey(saved.tileX, saved.tileY);
      const rock = this.rockByTile.get(key);
      if (rock) {
        rock.restoreState(saved);
      }
    }
  }

  /** Process pending branch drops for all trees. */
  private updateTreeBranchDrops(): void {
    for (const tree of this.trees) {
      if (tree.isChoppedDown()) continue; // Stumps don't drop branches

      if (tree.consumePendingDrop()) {
        this.tryDropBranch(tree);
      }
    }
  }

  /** Attempt to drop a branch on a random valid adjacent tile. */
  private tryDropBranch(tree: Tree): void {
    const candidates: { tx: number; ty: number }[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tx = tree.tileX + dx;
        const ty = tree.tileY + dy;
        if (tx < 0 || tx >= MAP_COLS || ty < 0 || ty >= MAP_ROWS) continue;
        const key = tileKey(tx, ty);
        if (this.blockedTiles.has(key)) continue;
        if (this.waterTiles.has(key)) continue;
        // Skip tiles that already have a branch
        const stack = this.groundItems.get(key);
        if (stack && !stack.isEmpty()) {
          const items = stack.getItems();
          if (items.some((item) => item.id === "branch")) continue;
        }
        candidates.push({ tx, ty });
      }
    }

    if (candidates.length === 0) return;
    const chosen = candidates[Math.floor(Math.random() * candidates.length)];
    this.dropItemAt(chosen.tx, chosen.ty, { ...ITEMS["branch"] });
  }

  /** Remove non-permanent ground items that have exceeded their lifespan. */
  private updateGroundItemDespawn(delta: number): void {
    const toRemove: number[] = [];
    for (const [key, stack] of this.groundItems) {
      stack.tickDespawn(delta, GROUND_ITEM_DESPAWN_MS);
      if (stack.isEmpty()) {
        toRemove.push(key);
      }
    }
    for (const key of toRemove) {
      const stack = this.groundItems.get(key);
      if (stack) {
        this.remove(stack);
        this.groundItems.delete(key);
      }
    }
  }

  getPlayerInventory(): InventoryState | null {
    return this.player?.inventory ?? null;
  }

  getPlayer(): Player | null {
    return this.player;
  }

  // ==================== Ground Item System ====================

  /**
   * Drop a resource item on a random walkable adjacent tile around (cx, cy).
   * Falls back to the center tile if no walkable neighbor exists.
   */
  private dropResourceNear(cx: number, cy: number, item: Item): void {
    const candidates: { tx: number; ty: number }[] = [];
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 0 || tx >= MAP_COLS || ty < 0 || ty >= MAP_ROWS) continue;
        const key = tileKey(tx, ty);
        if (this.blockedTiles.has(key)) continue;
        if (this.waterTiles.has(key)) continue;
        candidates.push({ tx, ty });
      }
    }
    if (candidates.length > 0) {
      const chosen = candidates[Math.floor(Math.random() * candidates.length)];
      this.dropItemAt(chosen.tx, chosen.ty, item);
    } else {
      // Fallback: drop on the entity tile itself
      this.dropItemAt(cx, cy, item);
    }
  }

  /** Drop an item onto a tile. Creates a GroundItemStack if none exists. */
  dropItemAt(tx: number, ty: number, item: Item, permanent = false): void {
    const key = tileKey(tx, ty);
    let stack = this.groundItems.get(key);
    if (!stack) {
      stack = new GroundItemStack(tx, ty);
      this.groundItems.set(key, stack);
      this.add(stack);
    }
    stack.addItem(item, permanent);
  }

  /** Get ground items at a tile position. */
  getGroundItemsAt(tx: number, ty: number): Item[] | null {
    const key = tileKey(tx, ty);
    const stack = this.groundItems.get(key);
    if (!stack || stack.isEmpty()) return null;
    return stack.getItems();
  }

  /** Remove a ground item by index from a tile. Cleans up empty stacks. */
  private removeGroundItem(key: number, index: number): Item | null {
    const stack = this.groundItems.get(key);
    if (!stack) return null;
    const item = stack.removeItem(index);
    if (stack.isEmpty()) {
      this.remove(stack);
      this.groundItems.delete(key);
    }
    return item;
  }

  /** Pick up a single item from a ground stack. */
  private pickupSingleItem(
    _stack: GroundItemStack,
    key: number,
    worldX: number,
    worldY: number,
  ): void {
    if (!this.player) return;
    this.player.startPickingUpItem();

    const currentPlayer = this.player;
    const currentKey = key;
    setTimeout(() => {
      const item = this.removeGroundItem(currentKey, 0);
      if (item) {
        addItemToBag(currentPlayer.inventory, item);
        this.spawnPickupText(`+[${item.name}]`, worldX, worldY);
      }
    }, 700); // Slightly before animation ends
  }

  // ==================== Item Picker Overlay ====================

  private readonly PICKER_PANEL_WIDTH = 200;
  private readonly PICKER_LINE_HEIGHT = 22;
  private readonly PICKER_MAX_VISIBLE = 8;

  private openItemPicker(
    stack: GroundItemStack,
    key: number,
    _worldX: number,
    _worldY: number,
  ): void {
    this.itemPickerOpen = true;
    this.itemPickerItems = stack.getItems();
    this.itemPickerIndex = 0;
    this.itemPickerTileKey = key;
    this.itemPickerScroll = 0;

    // Lock player input while picker is open
    this.player?.lockInput();

    // Hide action prompt
    if (this.actionPrompt) this.actionPrompt.graphics.visible = false;

    // Create ScreenElement panel (same pattern as build/cooking/storage menus)
    this.itemPickerPanel = new ex.ScreenElement({
      x: 8 * this.uiScale,
      y: 40 * this.uiScale,
      z: 200,
    });
    this.add(this.itemPickerPanel);
    this.updateItemPicker();
  }

  private updateItemPicker(): void {
    if (!this.itemPickerPanel) return;

    const items = this.itemPickerItems;
    const w = this.PICKER_PANEL_WIDTH;
    const lh = this.PICKER_LINE_HEIGHT;
    const maxVis = this.PICKER_MAX_VISIBLE;
    const headerH = 28;
    const hintH = 28;
    const visibleCount = Math.min(items.length, maxVis);
    const contentH = Math.max(1, visibleCount) * lh;
    const h = headerH + contentH + hintH + 16;
    const menuIdx = this.itemPickerIndex;
    const scroll = this.itemPickerScroll;

    const canvas = new ex.Canvas({
      width: Math.round(w * this.uiScale),
      height: Math.round(h * this.uiScale),
      cache: false,
      draw: (ctx) => {
        ctx.imageSmoothingEnabled = false;
        ctx.scale(this.uiScale, this.uiScale);

        // Background with rounded corners
        ctx.fillStyle = "rgba(10, 10, 20, 0.88)";
        const r = 4;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(w - r, 0);
        ctx.arcTo(w, 0, w, r, r);
        ctx.lineTo(w, h - r);
        ctx.arcTo(w, h, w - r, h, r);
        ctx.lineTo(r, h);
        ctx.arcTo(0, h, 0, h - r, r);
        ctx.lineTo(0, r);
        ctx.arcTo(0, 0, r, 0, r);
        ctx.closePath();
        ctx.fill();

        // Border (earthy green for ground items)
        ctx.strokeStyle = "rgba(120, 180, 80, 0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Header
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.fillText("PICK UP", w / 2, 18);

        // Divider
        ctx.strokeStyle = "rgba(120, 180, 80, 0.25)";
        ctx.beginPath();
        ctx.moveTo(8, headerH);
        ctx.lineTo(w - 8, headerH);
        ctx.stroke();

        // Item count badge (right side of header)
        ctx.font = "9px monospace";
        ctx.textAlign = "right";
        ctx.fillStyle = "#888888";
        ctx.fillText(`${items.length}`, w - 10, 18);

        // Scroll-up indicator
        if (scroll > 0) {
          ctx.fillStyle = "#666666";
          ctx.font = "9px monospace";
          ctx.textAlign = "center";
          ctx.fillText("\u25b2", w / 2, headerH + 8);
        }

        // Items list
        const visStart = scroll;
        const visEnd = Math.min(items.length, scroll + maxVis);

        for (let vi = 0; vi < maxVis; vi++) {
          const realIdx = visStart + vi;
          if (realIdx >= visEnd) break;

          const item = items[realIdx];
          const selected = realIdx === menuIdx;
          const y = headerH + 6 + vi * lh + lh / 2;

          // Selection highlight bar
          if (selected) {
            ctx.fillStyle = "rgba(120, 180, 80, 0.12)";
            ctx.fillRect(4, headerH + 4 + vi * lh, w - 8, lh);
          }

          // Item name with rarity color
          const prefix = selected ? "> " : "  ";
          ctx.textAlign = "left";
          ctx.font = selected ? "bold 11px monospace" : "11px monospace";

          if (selected) {
            ctx.fillStyle = "#f0c040";
          } else {
            ctx.fillStyle = RARITY_COLORS[item.rarity] ?? "#cccccc";
          }

          let name = isStackable(item) ? `${item.name} x${getItemQuantity(item)}` : item.name;
          if (name.length > 22) name = name.slice(0, 21) + "\u2026";
          ctx.fillText(`${prefix}${name}`, 8, y + 1);
        }

        // Empty state
        if (items.length === 0) {
          ctx.textAlign = "center";
          ctx.font = "11px monospace";
          ctx.fillStyle = "#666666";
          ctx.fillText("Nothing here", w / 2, headerH + lh / 2 + 6);
        }

        // Scroll-down indicator
        if (visEnd < items.length) {
          ctx.fillStyle = "#666666";
          ctx.font = "9px monospace";
          ctx.textAlign = "center";
          ctx.fillText("\u25bc", w / 2, headerH + contentH + 4);
        }

        // Bottom divider
        const bottomDivY = headerH + contentH + 8;
        ctx.strokeStyle = "rgba(120, 180, 80, 0.25)";
        ctx.beginPath();
        ctx.moveTo(8, bottomDivY);
        ctx.lineTo(w - 8, bottomDivY);
        ctx.stroke();

        // Hint text
        ctx.textAlign = "center";
        ctx.font = "9px monospace";
        ctx.fillStyle = "#666666";
        ctx.fillText("[E] Take  [Esc] Cancel", w / 2, bottomDivY + 14);
      },
    });

    this.itemPickerPanel.graphics.use(canvas);
  }

  private pickItemFromPicker(): void {
    if (!this.player) return;
    const stack = this.groundItems.get(this.itemPickerTileKey);
    if (!stack) {
      this.closeItemPicker();
      return;
    }

    const facing = this.player.getFacingTile();
    const worldX = facing.x * TILE_SIZE + TILE_SIZE / 2;
    const worldY = facing.y * TILE_SIZE + TILE_SIZE / 2;

    this.player.startPickingUpItem();

    const currentPlayer = this.player;
    const currentKey = this.itemPickerTileKey;
    const pickIndex = this.itemPickerIndex;

    this.closeItemPicker();

    setTimeout(() => {
      const item = this.removeGroundItem(currentKey, pickIndex);
      if (item) {
        addItemToBag(currentPlayer.inventory, item);
        this.spawnPickupText(`+[${item.name}]`, worldX, worldY);
      }
    }, 700);
  }

  private closeItemPicker(): void {
    this.itemPickerOpen = false;
    this.itemPickerItems = [];
    this.itemPickerIndex = 0;
    this.itemPickerScroll = 0;

    // Unlock player input
    this.player?.unlockInput();

    // Clean up UI
    if (this.itemPickerPanel) {
      this.remove(this.itemPickerPanel);
      this.itemPickerPanel = null;
    }
  }

  // ==================== Ground Item Save/Load ====================

  getGroundItemStates(): GroundItemSaveState[] {
    const states: GroundItemSaveState[] = [];
    for (const stack of this.groundItems.values()) {
      if (!stack.isEmpty()) {
        const entries = stack.getEntries();
        states.push({
          tileX: stack.tileX,
          tileY: stack.tileY,
          items: entries.map((e) => e.item),
          ages: entries.map((e) => e.age),
          permanent: entries.map((e) => e.permanent),
        });
      }
    }
    return states;
  }

  private restoreGroundItemStates(states: GroundItemSaveState[]): void {
    // Clear all existing ground items (including initial small rocks)
    for (const stack of this.groundItems.values()) {
      this.remove(stack);
    }
    this.groundItems.clear();

    // Restore saved ground items
    for (const saved of states) {
      for (let i = 0; i < saved.items.length; i++) {
        const item = saved.items[i];
        migrateItemDurability(item);
        migrateItemStacking(item);
        const age = saved.ages?.[i] ?? 0;
        const perm = saved.permanent?.[i] ?? false;
        const key = tileKey(saved.tileX, saved.tileY);
        let stack = this.groundItems.get(key);
        if (!stack) {
          stack = new GroundItemStack(saved.tileX, saved.tileY);
          this.groundItems.set(key, stack);
          this.add(stack);
        }
        stack.addItemWithState(item, age, perm);
      }
    }
  }

  // ==================== Planning Mode ====================

  private enterPlanningMode(): void {
    if (!this.player || this.planningMode) return;

    this.planningMode = true;
    this.player.lockInput();
    this.planPlayerTileX = this.player.getTileX();
    this.planPlayerTileY = this.player.getTileY();
    this.planCursorX = this.planPlayerTileX;
    this.planCursorY = this.planPlayerTileY;
    this.planMenuIndex = 0;
    this.planMenuOpen = true;
    this.selectedBuildType = null;
    this.planEdgeOrientation = "N";
    this.planTileRotation = 0;

    // Compute indoor tiles once for bed placement validation
    this.indoorTilesCache = getIndoorTiles(this.buildingByTile, this.edgeBuildings);

    // Create radius overlay
    this.createPlanRadiusOverlay();

    // Create cursor
    this.planCursor = new PlanCursor(this.planCursorX, this.planCursorY);
    this.add(this.planCursor);
    this.updateCursorValidity();

    // Create build menu panel
    this.createPlanMenu();
  }

  private exitPlanningMode(confirm: boolean): void {
    if (!this.player) return;

    if (confirm) {
      // Spawn tile-based buildings as holograms
      for (const planned of this.plannedBuildings.values()) {
        const key = tileKey(planned.x, planned.y);

        // Indoor-only buildings (bed, hearth) replace the existing floor tile
        if (planned.type.requiresIndoor) {
          const existingFloor = this.buildingByTile.get(key);
          if (existingFloor && existingFloor.type.id === "floor") {
            this.remove(existingFloor);
            const idx = this.buildings.indexOf(existingFloor);
            if (idx !== -1) this.buildings.splice(idx, 1);
            this.buildingByTile.delete(key);
          }
        }

        // allowIndoor buildings (boxes) sit on top of the floor — keep the floor alive
        if (planned.type.allowIndoor) {
          const existingFloor = this.buildingByTile.get(key);
          if (existingFloor && existingFloor.type.id === "floor") {
            this.floorsUnderBuildings.set(key, existingFloor);
            this.buildingByTile.delete(key);
            // Floor stays in this.buildings and scene for rendering + serialization
          }
        }

        const building = new Building(
          planned.type,
          planned.x,
          planned.y,
          "hologram",
          planned.rotation,
        );
        building.onDestroy = () => this.removeBuilding(building, key);
        building.onFireStateChange = () => this.recalculateIndoorLighting();
        this.buildings.push(building);
        this.buildingByTile.set(key, building);
        this.add(building);
      }

      // Spawn edge-based buildings (walls, fences) as holograms
      for (const planned of this.plannedEdges.values()) {
        const edgeBuilding = new EdgeBuilding(planned.type, planned.edgeKey, "hologram");
        edgeBuilding.onDestroy = () => this.removeEdgeBuilding(edgeBuilding, planned.edgeKey);
        this.edgeBuildingsList.push(edgeBuilding);
        this.edgeBuildings.set(planned.edgeKey, edgeBuilding);
        this.add(edgeBuilding);
        // Refresh fence autotile connections for neighbors
        if (edgeBuilding.isFenceType()) {
          this.refreshFenceNeighbors(planned.edgeKey);
        }
      }
    }

    // Clean up ghost actors from planned tile buildings
    for (const planned of this.plannedBuildings.values()) {
      this.remove(planned.actor);
    }
    this.plannedBuildings.clear();

    // Clean up ghost actors from planned edge buildings
    for (const planned of this.plannedEdges.values()) {
      this.remove(planned.actor);
    }
    this.plannedEdges.clear();

    // Clean up UI
    if (this.planCursor) {
      this.remove(this.planCursor);
      this.planCursor = null;
    }
    if (this.planRadiusOverlay) {
      this.remove(this.planRadiusOverlay);
      this.planRadiusOverlay = null;
    }
    this.cleanupPlanMenu();

    this.planningMode = false;
    this.selectedBuildType = null;
    this.indoorTilesCache = null;
    this.player.unlockInput();
  }

  private handlePlanningInput(kb: ex.Keyboard): void {
    // Escape exits planning mode without confirming
    if (wasActionPressed(kb, "back")) {
      this.exitPlanningMode(false);
      return;
    }

    if (this.planMenuOpen) {
      // Menu navigation
      if (wasActionPressed(kb, "moveUp")) {
        this.planMenuIndex = Math.max(0, this.planMenuIndex - 1);
        this.updatePlanMenu();
      }
      if (wasActionPressed(kb, "moveDown")) {
        this.planMenuIndex = Math.min(BUILDING_TYPES.length - 1, this.planMenuIndex + 1);
        this.updatePlanMenu();
      }
      // Select a build type and enter placement mode
      if (wasActionPressed(kb, "action") || wasActionPressed(kb, "confirm")) {
        this.selectedBuildType = BUILDING_TYPES[this.planMenuIndex];
        this.planMenuOpen = false;
        // Switch cursor mode based on placement type
        const isEdge = this.selectedBuildType.placement === "edge";
        this.planCursor?.setEdgeMode(isEdge);
        if (isEdge) {
          this.planCursor?.setOrientation(this.planEdgeOrientation);
        }
        this.updatePlanMenu();
        this.updateCursorValidity();
      }
    } else {
      // Placement mode — cursor movement
      let dx = 0;
      let dy = 0;
      if (wasActionPressed(kb, "moveUp")) dy = -1;
      if (wasActionPressed(kb, "moveDown")) dy = 1;
      if (wasActionPressed(kb, "moveLeft")) dx = -1;
      if (wasActionPressed(kb, "moveRight")) dx = 1;

      if (dx !== 0 || dy !== 0) {
        const newX = this.planCursorX + dx;
        const newY = this.planCursorY + dy;
        // Clamp within 5-tile Chebyshev distance of player
        if (
          Math.abs(newX - this.planPlayerTileX) <= 5 &&
          Math.abs(newY - this.planPlayerTileY) <= 5 &&
          newX >= 0 &&
          newX < MAP_COLS &&
          newY >= 0 &&
          newY < MAP_ROWS
        ) {
          this.planCursorX = newX;
          this.planCursorY = newY;
          this.planCursor?.moveTo(newX, newY);
          this.updateCursorValidity();
        }
      }

      // Rotate building orientation
      if (wasActionPressed(kb, "rotate")) {
        if (this.selectedBuildType?.placement === "edge") {
          const cycle: EdgeOrientation[] = ["N", "E", "S", "W"];
          const idx = cycle.indexOf(this.planEdgeOrientation);
          this.planEdgeOrientation = cycle[(idx + 1) % 4];
          this.planCursor?.setOrientation(this.planEdgeOrientation);
          this.updateCursorValidity();
        } else if (this.selectedBuildType?.placement === "tile") {
          this.planTileRotation = (this.planTileRotation + 1) % 4;
          this.updateCursorValidity();
        }
      }

      // Place a building at cursor
      if (wasActionPressed(kb, "action") || wasActionPressed(kb, "confirm")) {
        if (this.selectedBuildType) {
          this.placePlannedBuilding();
        } else if (this.plannedBuildings.size > 0 || this.plannedEdges.size > 0) {
          // No type selected + confirm = finalize
          this.exitPlanningMode(true);
          return;
        }
      }

      // Remove a planned building at cursor
      if (wasActionPressed(kb, "drop")) {
        this.removePlannedBuilding();
      }

      // Go back to menu to pick a different type (or deselect)
      if (wasActionPressed(kb, "inventory")) {
        this.selectedBuildType = null;
        this.planMenuOpen = true;
        this.planCursor?.setEdgeMode(false);
        this.updatePlanMenu();
        this.updateCursorValidity();
      }

      // Confirm all planned builds with build key
      if (wasActionPressed(kb, "build")) {
        if (this.plannedBuildings.size > 0 || this.plannedEdges.size > 0) {
          this.exitPlanningMode(true);
          return;
        }
      }
    }
  }

  private placePlannedBuilding(): void {
    if (!this.selectedBuildType) return;

    if (this.selectedBuildType.placement === "edge") {
      this.placePlannedEdgeBuilding();
    } else {
      this.placePlannedTileBuilding();
    }
  }

  private placePlannedTileBuilding(): void {
    if (!this.selectedBuildType) return;
    const key = tileKey(this.planCursorX, this.planCursorY);

    // Validate placement
    if (!this.isTileValidForBuilding(this.planCursorX, this.planCursorY)) return;

    // Create ghost actor for visual feedback
    const worldX = this.planCursorX * TILE_SIZE + TILE_SIZE / 2;
    const worldY = this.planCursorY * TILE_SIZE + TILE_SIZE / 2;
    const ghost = new ex.Actor({
      pos: ex.vec(worldX, worldY),
      width: TILE_SIZE,
      height: TILE_SIZE,
      anchor: ex.vec(0.5, 0.5),
      z: 5,
    });
    ghost.graphics.use(
      buildingGraphic(this.selectedBuildType.id, "ghost", false, this.planTileRotation),
    );
    ghost.graphics.opacity = 0.4;
    this.add(ghost);

    this.plannedBuildings.set(key, {
      type: this.selectedBuildType,
      x: this.planCursorX,
      y: this.planCursorY,
      rotation: this.planTileRotation,
      actor: ghost,
    });

    this.updateCursorValidity();
  }

  private placePlannedEdgeBuilding(): void {
    if (!this.selectedBuildType) return;

    const edgeKey = edgeKeyFromTileAndDir(
      this.planCursorX,
      this.planCursorY,
      this.planEdgeOrientation,
    );
    if (edgeKey == null) return;

    // Validate placement
    if (!this.isEdgeValidForBuilding(edgeKey)) return;

    const decoded = decodeEdgeKey(edgeKey);
    const { wx, wy } = edgeToWorldPos(decoded.x, decoded.y, decoded.axis);
    const isH = decoded.axis === "h";

    const ghost = new ex.Actor({
      pos: ex.vec(wx, wy),
      width: isH ? TILE_SIZE : 8,
      height: isH ? 8 : TILE_SIZE,
      anchor: ex.vec(0.5, 0.5),
      z: 6,
    });
    ghost.graphics.use(edgeBuildingGraphic(this.selectedBuildType.id, "ghost", decoded.axis));
    ghost.graphics.opacity = 0.4;
    this.add(ghost);

    this.plannedEdges.set(edgeKey, {
      type: this.selectedBuildType,
      edgeKey,
      axis: decoded.axis,
      x: decoded.x,
      y: decoded.y,
      actor: ghost,
    });

    this.updateCursorValidity();
  }

  private removePlannedBuilding(): void {
    if (this.selectedBuildType?.placement === "edge") {
      // Remove planned edge at current cursor orientation
      const edgeKey = edgeKeyFromTileAndDir(
        this.planCursorX,
        this.planCursorY,
        this.planEdgeOrientation,
      );
      if (edgeKey != null) {
        const planned = this.plannedEdges.get(edgeKey);
        if (planned) {
          this.remove(planned.actor);
          this.plannedEdges.delete(edgeKey);
          this.updateCursorValidity();
          return;
        }
      }
    }

    // Remove planned tile building at cursor
    const key = tileKey(this.planCursorX, this.planCursorY);
    const planned = this.plannedBuildings.get(key);
    if (planned) {
      this.remove(planned.actor);
      this.plannedBuildings.delete(key);
      this.updateCursorValidity();
    }
  }

  private isTileValidForBuilding(tx: number, ty: number): boolean {
    const key = tileKey(tx, ty);

    // Indoor-only buildings (bed): must be placed on a completed indoor floor
    if (this.selectedBuildType?.requiresIndoor) {
      const existing = this.buildingByTile.get(key);
      if (!existing || existing.type.id !== "floor" || existing.state !== "complete") return false;
      if (!this.indoorTilesCache?.has(key)) return false;
      if (this.plannedBuildings.has(key)) return false;
      if (this.player && tx === this.player.getTileX() && ty === this.player.getTileY())
        return false;
      return true;
    }

    // Can't place on already-planned tiles
    if (this.plannedBuildings.has(key)) return false;
    // Can't place on player's tile
    if (this.player && tx === this.player.getTileX() && ty === this.player.getTileY()) return false;

    // Buildings that allow indoor placement can go on completed indoor floors OR normal outdoor tiles
    if (this.selectedBuildType?.allowIndoor) {
      const existing = this.buildingByTile.get(key);
      if (existing) {
        // Allow placement on completed indoor floor tiles
        return (
          existing.type.id === "floor" &&
          existing.state === "complete" &&
          !!this.indoorTilesCache?.has(key)
        );
      }
      // Fall through to normal outdoor checks
    }

    // Can't place on blocked tiles (trees, rocks, bushes, water, other buildings)
    if (this.blockedTiles.has(key)) return false;
    if (this.waterTiles.has(key)) return false;
    // Can't place on existing buildings (including holograms)
    if (this.buildingByTile.has(key)) return false;
    return true;
  }

  private isEdgeValidForBuilding(edgeKey: number): boolean {
    // Already has a real building on this edge
    if (this.edgeBuildings.has(edgeKey)) return false;
    // Already planned on this edge
    if (this.plannedEdges.has(edgeKey)) return false;
    return true;
  }

  private updateCursorValidity(): void {
    if (!this.planCursor) return;

    if (this.selectedBuildType?.placement === "edge") {
      const edgeKey = edgeKeyFromTileAndDir(
        this.planCursorX,
        this.planCursorY,
        this.planEdgeOrientation,
      );
      const valid = edgeKey != null && this.isEdgeValidForBuilding(edgeKey);
      this.planCursor.setValid(valid);
    } else {
      const valid = this.isTileValidForBuilding(this.planCursorX, this.planCursorY);
      this.planCursor.setValid(valid);
    }
  }

  // ==================== Planning Mode UI ====================

  private createPlanRadiusOverlay(): void {
    if (!this.player) return;

    const centerX = this.planPlayerTileX * TILE_SIZE + TILE_SIZE / 2;
    const centerY = this.planPlayerTileY * TILE_SIZE + TILE_SIZE / 2;
    const radius = 5;
    const size = (radius * 2 + 1) * TILE_SIZE;

    this.planRadiusOverlay = new ex.Actor({
      pos: ex.vec(centerX, centerY),
      anchor: ex.vec(0.5, 0.5),
      z: 1,
    });

    const canvas = new ex.Canvas({
      width: size,
      height: size,
      cache: true,
      draw: (ctx) => {
        ctx.imageSmoothingEnabled = false;

        // Subtle blue tinted interior
        ctx.fillStyle = "rgba(0, 100, 200, 0.04)";
        ctx.fillRect(0, 0, size, size);

        // Dashed border
        ctx.strokeStyle = "rgba(80, 160, 255, 0.5)";
        ctx.lineWidth = 2;
        ctx.setLineDash([6, 4]);
        ctx.strokeRect(1, 1, size - 2, size - 2);
        ctx.setLineDash([]);
      },
    });

    this.planRadiusOverlay.graphics.use(canvas);
    this.add(this.planRadiusOverlay);
  }

  private readonly PLAN_PANEL_WIDTH = 220;
  private readonly PLAN_LINE_HEIGHT = 22;

  private createPlanMenu(): void {
    this.planMenuPanel = new ex.ScreenElement({
      x: 8 * this.uiScale,
      y: 40 * this.uiScale,
      z: 200,
    });
    this.add(this.planMenuPanel);
    this.updatePlanMenu();
  }

  private updatePlanMenu(): void {
    if (!this.planMenuPanel) return;

    const w = this.PLAN_PANEL_WIDTH;
    const lh = this.PLAN_LINE_HEIGHT;
    const headerH = 28;
    const hintH = 40;
    const h = headerH + BUILDING_TYPES.length * lh + hintH + 12;
    const menuOpen = this.planMenuOpen;
    const menuIdx = this.planMenuIndex;
    const activeId = this.selectedBuildType?.id ?? null;

    const canvas = new ex.Canvas({
      width: Math.round(w * this.uiScale),
      height: Math.round(h * this.uiScale),
      cache: false,
      draw: (ctx) => {
        ctx.imageSmoothingEnabled = false;
        ctx.scale(this.uiScale, this.uiScale);

        // Background
        ctx.fillStyle = "rgba(10, 10, 20, 0.88)";
        ctx.beginPath();
        const r = 4;
        ctx.moveTo(r, 0);
        ctx.lineTo(w - r, 0);
        ctx.arcTo(w, 0, w, r, r);
        ctx.lineTo(w, h - r);
        ctx.arcTo(w, h, w - r, h, r);
        ctx.lineTo(r, h);
        ctx.arcTo(0, h, 0, h - r, r);
        ctx.lineTo(0, r);
        ctx.arcTo(0, 0, r, 0, r);
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = "rgba(80, 160, 255, 0.3)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Header
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.fillText("BUILD", w / 2, 18);

        // Divider
        ctx.strokeStyle = "rgba(80, 160, 255, 0.2)";
        ctx.beginPath();
        ctx.moveTo(8, headerH);
        ctx.lineTo(w - 8, headerH);
        ctx.stroke();

        // Options
        for (let i = 0; i < BUILDING_TYPES.length; i++) {
          const bt = BUILDING_TYPES[i];
          const y = headerH + 6 + i * lh + lh / 2;
          const selected = menuOpen && i === menuIdx;
          const active = !menuOpen && bt.id === activeId;

          // Selection highlight bar
          if (selected) {
            ctx.fillStyle = "rgba(240, 192, 64, 0.12)";
            ctx.fillRect(4, headerH + 4 + i * lh, w - 8, lh);
          }

          // Name
          const prefix = selected ? "> " : active ? "* " : "  ";
          ctx.textAlign = "left";
          ctx.font = selected || active ? "bold 12px monospace" : "12px monospace";
          ctx.fillStyle = selected ? "#f0c040" : active ? "#40c0ff" : "#ffffff";
          ctx.fillText(prefix + bt.name, 8, y + 1);

          // Cost
          const costStr = bt.ingredients
            .map((ing) => `${ing.count}x${ITEMS[ing.itemId]?.name ?? ing.itemId}`)
            .join(" ");
          ctx.textAlign = "right";
          ctx.font = "10px monospace";
          ctx.fillStyle = selected ? "#f0c040" : active ? "#40c0ff" : "#888888";
          ctx.fillText(costStr, w - 8, y + 1);
        }

        // Hint text
        ctx.textAlign = "center";
        ctx.font = "9px monospace";
        ctx.fillStyle = "#666666";
        const hintY = headerH + 6 + BUILDING_TYPES.length * lh + 12;
        if (menuOpen) {
          ctx.fillText("[E] Select  [Esc] Cancel", w / 2, hintY);
        } else {
          ctx.fillText("[E] Place  [Q] Remove  [I] Menu", w / 2, hintY);
          ctx.fillText("[R] Rotate  [B] Confirm  [Esc] Cancel", w / 2, hintY + 12);
        }
      },
    });

    this.planMenuPanel.graphics.use(canvas);
  }

  private cleanupPlanMenu(): void {
    if (this.planMenuPanel) {
      this.remove(this.planMenuPanel);
      this.planMenuPanel = null;
    }
  }

  // ==================== Cooking Menu ====================

  private openCookingMenu(building: Building): void {
    if (!this.player) return;
    this.cookingMenuOpen = true;
    this.cookingMenuIndex = 0;
    this.cookingBuilding = building;
    this.player.lockInput();

    this.cookingMenuPanel = new ex.ScreenElement({
      x: 8 * this.uiScale,
      y: 40 * this.uiScale,
      z: 200,
    });
    this.add(this.cookingMenuPanel);
    this.updateCookingMenu();
  }

  private closeCookingMenu(): void {
    this.cookingMenuOpen = false;
    this.cookingBuilding = null;
    if (this.cookingMenuPanel) {
      this.remove(this.cookingMenuPanel);
      this.cookingMenuPanel = null;
    }
    this.player?.unlockInput();
  }

  /** Get cookable items from the player's inventory. */
  private getCookableItems(): {
    item: Item;
    bagIndex: number;
    recipe: (typeof COOKING_RECIPES)[0];
  }[] {
    if (!this.player) return [];
    const results: {
      item: Item;
      bagIndex: number;
      recipe: (typeof COOKING_RECIPES)[0];
    }[] = [];
    for (let i = 0; i < this.player.inventory.bag.length; i++) {
      const item = this.player.inventory.bag[i];
      const recipe = COOKING_RECIPE_MAP[item.id];
      if (recipe) {
        results.push({ item, bagIndex: i, recipe });
      }
    }
    return results;
  }

  private handleCookingMenuInput(kb: ex.Keyboard): void {
    if (wasActionPressed(kb, "back")) {
      this.closeCookingMenu();
      return;
    }

    const cookable = this.getCookableItems();

    if (cookable.length > 0) {
      if (wasActionPressed(kb, "moveUp")) {
        this.cookingMenuIndex = Math.max(0, this.cookingMenuIndex - 1);
        this.updateCookingMenu();
      }
      if (wasActionPressed(kb, "moveDown")) {
        this.cookingMenuIndex = Math.min(cookable.length - 1, this.cookingMenuIndex + 1);
        this.updateCookingMenu();
      }
      if (wasActionPressed(kb, "action") || wasActionPressed(kb, "confirm")) {
        const entry = cookable[this.cookingMenuIndex];
        if (entry && this.player && this.cookingBuilding?.isBurning) {
          // Consume the raw item
          this.player.inventory.bag.splice(entry.bagIndex, 1);

          // Add the cooked item
          const cookedItem = ITEMS[entry.recipe.outputId];
          if (cookedItem) {
            addItemToBag(this.player.inventory, { ...cookedItem });
            const worldX = this.cookingBuilding.pos.x;
            const worldY = this.cookingBuilding.pos.y;
            this.spawnPickupText(`+[${cookedItem.name}]`, worldX, worldY);
          }

          // Close menu after cooking
          this.closeCookingMenu();
        }
      }
    }
  }

  private readonly COOK_PANEL_WIDTH = 240;
  private readonly COOK_LINE_HEIGHT = 22;

  private updateCookingMenu(): void {
    if (!this.cookingMenuPanel) return;

    const cookable = this.getCookableItems();
    const w = this.COOK_PANEL_WIDTH;
    const lh = this.COOK_LINE_HEIGHT;
    const headerH = 28;
    const hintH = 28;
    const contentH = Math.max(1, cookable.length) * lh;
    const h = headerH + contentH + hintH + 16;
    const menuIdx = this.cookingMenuIndex;

    const canvas = new ex.Canvas({
      width: Math.round(w * this.uiScale),
      height: Math.round(h * this.uiScale),
      cache: false,
      draw: (ctx) => {
        ctx.imageSmoothingEnabled = false;
        ctx.scale(this.uiScale, this.uiScale);

        // Background
        ctx.fillStyle = "rgba(10, 10, 20, 0.88)";
        const r = 4;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(w - r, 0);
        ctx.arcTo(w, 0, w, r, r);
        ctx.lineTo(w, h - r);
        ctx.arcTo(w, h, w - r, h, r);
        ctx.lineTo(r, h);
        ctx.arcTo(0, h, 0, h - r, r);
        ctx.lineTo(0, r);
        ctx.arcTo(0, 0, r, 0, r);
        ctx.closePath();
        ctx.fill();

        // Border
        ctx.strokeStyle = "rgba(255, 140, 40, 0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Header
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.fillText("COOK", w / 2, 18);

        // Divider
        ctx.strokeStyle = "rgba(255, 140, 40, 0.25)";
        ctx.beginPath();
        ctx.moveTo(8, headerH);
        ctx.lineTo(w - 8, headerH);
        ctx.stroke();

        if (cookable.length === 0) {
          // Nothing to cook
          ctx.textAlign = "center";
          ctx.font = "11px monospace";
          ctx.fillStyle = "#666666";
          ctx.fillText("Nothing to cook", w / 2, headerH + lh / 2 + 6);
        } else {
          // List cookable items
          for (let i = 0; i < cookable.length; i++) {
            const entry = cookable[i];
            const y = headerH + 6 + i * lh + lh / 2;
            const selected = i === menuIdx;

            // Selection highlight
            if (selected) {
              ctx.fillStyle = "rgba(255, 140, 40, 0.12)";
              ctx.fillRect(4, headerH + 4 + i * lh, w - 8, lh);
            }

            const inputName = entry.item.name;
            const outputName = ITEMS[entry.recipe.outputId]?.name ?? entry.recipe.outputId;
            const prefix = selected ? "> " : "  ";

            ctx.textAlign = "left";
            ctx.font = selected ? "bold 11px monospace" : "11px monospace";
            ctx.fillStyle = selected ? "#ff9944" : "#cccccc";
            ctx.fillText(`${prefix}${inputName}`, 8, y + 1);

            ctx.fillStyle = selected ? "#ff9944" : "#888888";
            ctx.font = "10px monospace";
            ctx.textAlign = "right";
            ctx.fillText(`→ ${outputName}`, w - 8, y + 1);
          }
        }

        // Hint text
        ctx.textAlign = "center";
        ctx.font = "9px monospace";
        ctx.fillStyle = "#666666";
        const hintY = headerH + contentH + 14;
        if (cookable.length > 0) {
          ctx.fillText("[E] Cook  [Esc] Cancel", w / 2, hintY);
        } else {
          ctx.fillText("[Esc] Cancel", w / 2, hintY);
        }
      },
    });

    this.cookingMenuPanel.graphics.use(canvas);
  }

  // ==================== Storage Menu ====================

  private openStorageMenu(building: Building): void {
    if (!this.player) return;
    this.storageMenuOpen = true;
    this.storageBuilding = building;
    this.storageFocus = "bag";
    this.storageBagIndex = 0;
    this.storageBoxIndex = 0;
    this.storageBagScroll = 0;
    this.player.lockInput();

    this.storageMenuPanel = new ex.ScreenElement({
      x: 8 * this.uiScale,
      y: 40 * this.uiScale,
      z: 200,
    });
    this.add(this.storageMenuPanel);
    this.updateStorageMenu();
  }

  private closeStorageMenu(): void {
    this.storageMenuOpen = false;
    this.storageBuilding = null;
    if (this.storageMenuPanel) {
      this.remove(this.storageMenuPanel);
      this.storageMenuPanel = null;
    }
    this.player?.unlockInput();
  }

  private readonly STORAGE_PANEL_WIDTH = 380;
  private readonly STORAGE_LINE_HEIGHT = 20;
  private readonly STORAGE_MAX_VISIBLE = 8;

  private handleStorageMenuInput(kb: ex.Keyboard): void {
    if (wasActionPressed(kb, "back")) {
      this.closeStorageMenu();
      return;
    }

    if (!this.player || !this.storageBuilding) return;

    const bag = this.player.inventory.bag;
    const slots = this.storageBuilding.storageSlots;
    const maxVis = this.STORAGE_MAX_VISIBLE;

    // Switch focus between bag and box
    if (wasActionPressed(kb, "moveLeft")) {
      this.storageFocus = "bag";
      this.updateStorageMenu();
    }
    if (wasActionPressed(kb, "moveRight")) {
      this.storageFocus = "box";
      this.updateStorageMenu();
    }

    // Navigate within focused column
    if (wasActionPressed(kb, "moveUp")) {
      if (this.storageFocus === "bag") {
        this.storageBagIndex = Math.max(0, this.storageBagIndex - 1);
        // Scroll up if needed
        if (this.storageBagIndex < this.storageBagScroll) {
          this.storageBagScroll = this.storageBagIndex;
        }
      } else {
        this.storageBoxIndex = Math.max(0, this.storageBoxIndex - 1);
      }
      this.updateStorageMenu();
    }
    if (wasActionPressed(kb, "moveDown")) {
      if (this.storageFocus === "bag") {
        this.storageBagIndex = Math.min(bag.length - 1, this.storageBagIndex + 1);
        // Scroll down if needed
        if (this.storageBagIndex >= this.storageBagScroll + maxVis) {
          this.storageBagScroll = this.storageBagIndex - maxVis + 1;
        }
      } else {
        this.storageBoxIndex = Math.min(slots.length - 1, this.storageBoxIndex + 1);
      }
      this.updateStorageMenu();
    }

    // Transfer item
    if (wasActionPressed(kb, "action") || wasActionPressed(kb, "confirm")) {
      if (this.storageFocus === "bag") {
        // Bag → Box: find first empty slot
        if (bag.length > 0 && this.storageBagIndex < bag.length) {
          const emptyIdx = slots.indexOf(null);
          if (emptyIdx !== -1) {
            const item = bag.splice(this.storageBagIndex, 1)[0];
            slots[emptyIdx] = item;
            // Clamp index after removal
            if (this.storageBagIndex >= bag.length && bag.length > 0) {
              this.storageBagIndex = bag.length - 1;
            }
            if (this.storageBagIndex < 0) this.storageBagIndex = 0;
            // Adjust scroll
            if (this.storageBagScroll > 0 && bag.length <= this.storageBagScroll + maxVis) {
              this.storageBagScroll = Math.max(0, bag.length - maxVis);
            }
            const worldX = this.storageBuilding.pos.x;
            const worldY = this.storageBuilding.pos.y;
            this.spawnPickupText(`Stored [${item.name}]`, worldX, worldY);
          } else {
            const worldX = this.storageBuilding.pos.x;
            const worldY = this.storageBuilding.pos.y;
            this.spawnPickupText("Box Full!", worldX, worldY);
          }
        }
      } else {
        // Box → Bag
        const slotItem = slots[this.storageBoxIndex];
        if (slotItem) {
          slots[this.storageBoxIndex] = null;
          bag.push(slotItem);
          const worldX = this.storageBuilding.pos.x;
          const worldY = this.storageBuilding.pos.y;
          this.spawnPickupText(`+[${slotItem.name}]`, worldX, worldY);
        }
      }
      this.updateStorageMenu();
    }
  }

  private updateStorageMenu(): void {
    if (!this.storageMenuPanel || !this.storageBuilding || !this.player) return;

    const building = this.storageBuilding;
    const bag = this.player.inventory.bag;
    const slots = building.storageSlots;
    const pw = this.STORAGE_PANEL_WIDTH;
    const lh = this.STORAGE_LINE_HEIGHT;
    const maxVis = this.STORAGE_MAX_VISIBLE;

    const headerH = 28;
    const subHeaderH = 24;
    const hintH = 36;
    const contentRows = Math.max(maxVis, slots.length);
    const contentH = contentRows * lh;
    const ph = headerH + subHeaderH + contentH + hintH + 12;
    const colW = Math.floor((pw - 16) / 2); // each column width (with padding)

    const focusCol = this.storageFocus;
    const bagIdx = this.storageBagIndex;
    const boxIdx = this.storageBoxIndex;
    const bagScroll = this.storageBagScroll;
    const inv = this.player.inventory;

    const canvas = new ex.Canvas({
      width: Math.round(pw * this.uiScale),
      height: Math.round(ph * this.uiScale),
      cache: false,
      draw: (ctx) => {
        ctx.imageSmoothingEnabled = false;
        ctx.scale(this.uiScale, this.uiScale);

        // Background with rounded corners
        ctx.fillStyle = "rgba(10, 10, 20, 0.88)";
        const r = 4;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(pw - r, 0);
        ctx.arcTo(pw, 0, pw, r, r);
        ctx.lineTo(pw, ph - r);
        ctx.arcTo(pw, ph, pw - r, ph, r);
        ctx.lineTo(r, ph);
        ctx.arcTo(0, ph, 0, ph - r, r);
        ctx.lineTo(0, r);
        ctx.arcTo(0, 0, r, 0, r);
        ctx.closePath();
        ctx.fill();

        // Border (warm amber to match wood crate)
        ctx.strokeStyle = "rgba(180, 140, 60, 0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Title
        const boxName = building.type.name;
        const slotCount = slots.length;
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.fillText(`${boxName} (${slotCount})`, pw / 2, 18);

        // Title divider
        ctx.strokeStyle = "rgba(180, 140, 60, 0.25)";
        ctx.beginPath();
        ctx.moveTo(8, headerH);
        ctx.lineTo(pw - 8, headerH);
        ctx.stroke();

        // Column positions
        const leftX = 8;
        const rightX = 8 + colW + 8; // 8px gap between columns
        const contentTop = headerH + subHeaderH;

        // Center vertical divider
        const divX = Math.floor(pw / 2);
        ctx.strokeStyle = "rgba(180, 140, 60, 0.15)";
        ctx.beginPath();
        ctx.moveTo(divX, headerH + 4);
        ctx.lineTo(divX, contentTop + contentH + 4);
        ctx.stroke();

        // Sub-headers
        ctx.font = "bold 11px monospace";
        ctx.textAlign = "left";
        // BAG header
        ctx.fillStyle = focusCol === "bag" ? "#f0c040" : "#888888";
        ctx.fillText("BAG", leftX, headerH + 16);
        // Focused underline accent
        if (focusCol === "bag") {
          ctx.fillStyle = "rgba(240, 192, 64, 0.4)";
          ctx.fillRect(leftX, headerH + 19, 24, 1);
        }
        // STORAGE header
        ctx.fillStyle = focusCol === "box" ? "#f0c040" : "#888888";
        ctx.fillText("STORAGE", rightX, headerH + 16);
        if (focusCol === "box") {
          ctx.fillStyle = "rgba(240, 192, 64, 0.4)";
          ctx.fillRect(rightX, headerH + 19, 52, 1);
        }

        // === BAG COLUMN (left) ===
        const bagVisStart = bagScroll;
        const bagVisEnd = Math.min(bag.length, bagScroll + maxVis);

        // Scroll-up indicator
        if (bagScroll > 0) {
          ctx.fillStyle = "#666666";
          ctx.font = "9px monospace";
          ctx.textAlign = "left";
          ctx.fillText("...", leftX + 8, contentTop + 4);
        }

        for (let vi = 0; vi < maxVis; vi++) {
          const realIdx = bagVisStart + vi;
          const y = contentTop + vi * lh + lh / 2 + 4;

          if (realIdx < bagVisEnd) {
            const item = bag[realIdx];
            const selected = focusCol === "bag" && realIdx === bagIdx;

            // Selection highlight
            if (selected) {
              ctx.fillStyle = "rgba(240, 192, 64, 0.1)";
              ctx.fillRect(leftX - 2, contentTop + vi * lh + 2, colW, lh);
            }

            const prefix = selected ? "> " : "  ";
            ctx.textAlign = "left";
            ctx.font = selected ? "bold 11px monospace" : "11px monospace";
            ctx.fillStyle = selected ? "#f0c040" : "#cccccc";

            // Truncate long names to fit column
            let name = isStackable(item) ? `${item.name} x${getItemQuantity(item)}` : item.name;
            if (name.length > 18) name = name.slice(0, 17) + "…";
            ctx.fillText(`${prefix}${name}`, leftX, y);
          }
        }

        // Scroll-down indicator
        if (bagVisEnd < bag.length) {
          ctx.fillStyle = "#666666";
          ctx.font = "9px monospace";
          ctx.textAlign = "left";
          ctx.fillText("...", leftX + 8, contentTop + maxVis * lh + 4);
        }

        // Empty bag message
        if (bag.length === 0) {
          ctx.fillStyle = "#444444";
          ctx.font = "11px monospace";
          ctx.textAlign = "left";
          ctx.fillText("  (empty)", leftX, contentTop + lh / 2 + 4);
        }

        // === BOX COLUMN (right) ===
        for (let i = 0; i < slots.length; i++) {
          if (i >= maxVis * 2) break; // safety cap for display
          const y = contentTop + i * lh + lh / 2 + 4;
          const item = slots[i];
          const selected = focusCol === "box" && i === boxIdx;

          // Selection highlight
          if (selected) {
            ctx.fillStyle = "rgba(240, 192, 64, 0.1)";
            ctx.fillRect(rightX - 2, contentTop + i * lh + 2, colW, lh);
          }

          const slotNum = `${i + 1}. `;
          ctx.textAlign = "left";

          if (item) {
            const prefix = selected ? "> " : "  ";
            ctx.font = selected ? "bold 11px monospace" : "11px monospace";
            ctx.fillStyle = selected ? "#f0c040" : "#cccccc";
            let name = isStackable(item) ? `${item.name} x${getItemQuantity(item)}` : item.name;
            if (name.length > 15) name = name.slice(0, 14) + "…";
            ctx.fillText(`${prefix}${slotNum}${name}`, rightX, y);
          } else {
            const prefix = selected ? "> " : "  ";
            ctx.font = "11px monospace";
            ctx.fillStyle = selected ? "#f0c040" : "#444444";
            ctx.fillText(`${prefix}${slotNum}---`, rightX, y);
          }
        }

        // Bottom divider
        const bottomDivY = contentTop + contentH + 4;
        ctx.strokeStyle = "rgba(180, 140, 60, 0.25)";
        ctx.beginPath();
        ctx.moveTo(8, bottomDivY);
        ctx.lineTo(pw - 8, bottomDivY);
        ctx.stroke();

        // Hint text
        ctx.textAlign = "center";
        ctx.font = "9px monospace";
        ctx.fillStyle = "#666666";
        const hintY1 = bottomDivY + 14;
        ctx.fillText("[E] Transfer  [\u2190\u2192] Switch  [Esc] Close", pw / 2, hintY1);

        // Weight display
        const curWeight = totalWeight(inv);
        const maxW = inv.maxWeight;
        const overWeight = curWeight > maxW;
        ctx.font = "9px monospace";
        ctx.fillStyle = overWeight ? "#ff4444" : "#666666";
        ctx.fillText(`Weight: ${curWeight}/${maxW}`, pw / 2, hintY1 + 14);
      },
    });

    this.storageMenuPanel.graphics.use(canvas);
  }

  // ==================== Chat System ====================

  private readonly CHAT_INPUT_WIDTH = 280;
  private readonly CHAT_INPUT_HEIGHT = 20;
  private readonly CHAT_MAX_INPUT = 80;

  private openChat(): void {
    if (!this.player || this.chatOpen) return;
    this.chatOpen = true;
    this.chatInputText = "";
    this.chatMode = "talk";
    this.player.lockInput();
    this.updateChatInputPanel();
  }

  private closeChat(): void {
    this.chatOpen = false;
    this.chatLog?.scrollToBottom();
    if (this.player) {
      this.player.unlockInput();
    }
    this.updateChatInputPanel();
  }

  private handleChatInput(kb: ex.Keyboard): void {
    // Arrow keys scroll the chat log (NOT WASD — those are for typing!)
    if (kb.wasPressed(ex.Keys.ArrowUp)) {
      this.chatLog?.scrollUp();
      return;
    }
    if (kb.wasPressed(ex.Keys.ArrowDown)) {
      this.chatLog?.scrollDown();
      return;
    }

    // Tab cycles chat mode
    if (kb.wasPressed(ex.Keys.Tab)) {
      const idx = CHAT_MODE_ORDER.indexOf(this.chatMode);
      this.chatMode = CHAT_MODE_ORDER[(idx + 1) % CHAT_MODE_ORDER.length];
      this.updateChatInputPanel();
      return;
    }

    // Enter sends or closes
    if (kb.wasPressed(ex.Keys.Enter)) {
      if (this.chatInputText.trim().length > 0) {
        this.sendChatMessage();
      }
      this.closeChat();
      return;
    }

    // Escape closes without sending
    if (kb.wasPressed(ex.Keys.Escape)) {
      this.closeChat();
      return;
    }

    // Backspace removes last character
    if (kb.wasPressed(ex.Keys.Backspace)) {
      if (this.chatInputText.length > 0) {
        this.chatInputText = this.chatInputText.slice(0, -1);
        this.updateChatInputPanel();
      }
      return;
    }

    // Check for printable key presses
    if (this.chatInputText.length >= this.CHAT_MAX_INPUT) return;

    const shift = kb.isHeld(ex.Keys.ShiftLeft) || kb.isHeld(ex.Keys.ShiftRight);

    // Check all printable keys
    for (const key of kb.getKeys()) {
      if (!kb.wasPressed(key)) continue;
      const ch = chatKeyToChar(key, shift);
      if (ch !== null) {
        this.chatInputText += ch;
        this.updateChatInputPanel();
        return;
      }
    }
  }

  private sendChatMessage(): void {
    if (!this.player) return;
    const msg: ChatMessage = {
      sender: this.playerName,
      text: this.chatInputText.trim(),
      tileX: this.player.getTileX(),
      tileY: this.player.getTileY(),
      mode: this.chatMode,
      timestamp: Date.now(),
    };

    // The sender always sees their own message
    this.chatMessages.push(msg);
    this.chatLog?.scrollToBottom();

    // Distribute to nearby NPC agents
    this.distributeMessageToNPCs(msg, null);

    // Spawn speech bubble as a child of the player (auto-attaches via constructor)
    new SpeechBubble(msg.text, this.player, msg.mode);
  }

  /**
   * Renders the bottom-left chat hint / text input panel.
   * - When chat is closed: "Press [T] to chat" in dim text
   * - When chat is open + empty: placeholder "Currently talking [Press tab to cycle]" in mode color
   * - When chat is open + typing: user text in mode color with blinking cursor
   */
  private updateChatInputPanel(): void {
    if (!this.chatInputPanel) return;

    const panelW = this.CHAT_INPUT_WIDTH;
    const panelH = this.CHAT_INPUT_HEIGHT;

    const canvas = new ex.Canvas({
      width: Math.round(panelW * this.uiScale),
      height: Math.round(panelH * this.uiScale),
      cache: false,
      draw: (ctx) => {
        ctx.imageSmoothingEnabled = false;
        ctx.scale(this.uiScale, this.uiScale);

        // Background (shared by both idle hint and active input)
        ctx.fillStyle = "rgba(10, 10, 20, 0.6)";
        this.drawRoundRect(ctx, 0, 0, panelW, panelH, 3);
        ctx.fill();

        if (!this.chatOpen) {
          // Idle hint: "Press [T] to chat"
          ctx.font = "10px monospace";
          ctx.textBaseline = "middle";
          ctx.fillStyle = "#888888";
          ctx.fillText("Press [T] to chat", 6, panelH / 2);
          return;
        }

        // Active chat: add teal border on top of shared background
        ctx.strokeStyle = "rgba(80, 200, 180, 0.35)";
        ctx.lineWidth = 1;
        this.drawRoundRect(ctx, 0, 0, panelW, panelH, 3);
        ctx.stroke();

        const modeColor = CHAT_MODE_COLORS[this.chatMode];
        ctx.font = "10px monospace";
        ctx.textBaseline = "middle";
        const textY = panelH / 2;

        if (this.chatInputText.length === 0) {
          // Placeholder text in mode color (dimmed)
          const verb = CHAT_MODE_VERBS[this.chatMode];
          ctx.fillStyle = modeColor;
          ctx.globalAlpha = 0.45;
          ctx.fillText(`Currently ${verb} [Press tab to cycle]`, 6, textY);
          ctx.globalAlpha = 1;

          // Blinking cursor at start
          const cursorOn = Math.floor(Date.now() / 500) % 2 === 0;
          if (cursorOn) {
            ctx.fillStyle = modeColor;
            ctx.fillRect(6, textY - 5, 1, 11);
          }
        } else {
          // User text in mode color
          const maxTextW = panelW - 12;
          let displayText = this.chatInputText;

          // Truncate from the left if text overflows
          while (ctx.measureText(displayText + "_").width > maxTextW && displayText.length > 0) {
            displayText = displayText.slice(1);
          }

          ctx.fillStyle = modeColor;
          ctx.fillText(displayText, 6, textY);

          // Blinking cursor after text
          const cursorOn = Math.floor(Date.now() / 500) % 2 === 0;
          if (cursorOn) {
            const cursorX = 6 + ctx.measureText(displayText).width;
            ctx.fillRect(cursorX, textY - 5, 1, 11);
          }
        }
      },
    });

    this.chatInputPanel.graphics.use(canvas);
  }

  private updateChatCleanup(): void {
    const now = Date.now();
    this.chatMessages = this.chatMessages.filter((msg) => now - msg.timestamp <= CHAT_EXPIRE_MS);
  }

  /** Draw a rounded rectangle path (shared helper). */
  private drawRoundRect(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    r: number,
  ): void {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }

  // ==================== Inventory Menu ====================

  private readonly INV_PANEL_WIDTH = 300;
  private readonly INV_LINE_HEIGHT = 22;
  private readonly INV_MAX_VISIBLE = 8;
  private readonly INV_DETAIL_LINE_H = 12;

  private openInventoryMenu(): void {
    if (!this.player || this.inventoryMenuOpen) return;
    this.inventoryMenuOpen = true;
    this.inventoryTab = "equipment";
    this.inventoryEquipIndex = 0;
    this.inventoryBagIndex = 0;
    this.inventoryBagScroll = 0;
    this.inventoryCraftIndex = 0;
    this.inventoryCraftScroll = 0;
    this.inventoryFilterText = "";
    this.inventoryFilterActive = false;
    this.inventorySortMode = "default";
    this.inventoryOnFilterBar = false;
    this.inventoryEquipSubmenuOpen = false;
    this.inventoryEquipSubmenuSlot = null;
    this.inventoryEquipSubmenuItems = [];
    this.inventoryEquipSubmenuIndex = 0;
    this.inventoryEquipSubmenuScroll = 0;
    this.rebuildInventoryViewBag();
    this.player.lockInput();

    this.inventoryMenuPanel = new ex.ScreenElement({
      x: 8 * this.uiScale,
      y: 40 * this.uiScale,
      z: 200,
    });
    this.add(this.inventoryMenuPanel);
    this.updateInventoryMenu();
  }

  private closeInventoryMenu(): void {
    this.inventoryMenuOpen = false;
    this.inventoryFilterActive = false;
    if (this.inventoryMenuPanel) {
      this.remove(this.inventoryMenuPanel);
      this.inventoryMenuPanel = null;
    }
    this.player?.unlockInput();
  }

  private handleInventoryMenuInput(kb: ex.Keyboard): void {
    // Filter typing mode captures all keyboard input
    if (this.inventoryFilterActive) {
      this.handleInventoryFilterInput(kb);
      return;
    }

    // Equipment submenu captures input
    if (this.inventoryEquipSubmenuOpen) {
      this.handleInventoryEquipSubmenuInput(kb);
      return;
    }

    // Close menu
    if (wasActionPressed(kb, "back") || wasActionPressed(kb, "inventory")) {
      this.closeInventoryMenu();
      return;
    }

    // Tab navigation (left / right)
    if (wasActionPressed(kb, "moveLeft")) {
      if (this.inventoryTab === "bag") {
        this.inventoryTab = "equipment";
        this.updateInventoryMenu();
        return;
      }
      if (this.inventoryTab === "craft") {
        this.inventoryTab = "bag";
        this.rebuildInventoryViewBag();
        this.enterInventoryBagPanel();
        this.updateInventoryMenu();
        return;
      }
    }

    if (wasActionPressed(kb, "moveRight")) {
      if (this.inventoryTab === "equipment") {
        this.inventoryTab = "bag";
        this.rebuildInventoryViewBag();
        this.enterInventoryBagPanel();
        this.updateInventoryMenu();
        return;
      }
      if (this.inventoryTab === "bag") {
        if (RECIPES.length > 0) {
          this.inventoryTab = "craft";
          this.updateInventoryMenu();
        }
        return;
      }
    }

    // Tab-specific input
    if (this.inventoryTab === "equipment") {
      this.handleInventoryEquipInput(kb);
    } else if (this.inventoryTab === "bag") {
      this.handleInventoryBagInput(kb);
    } else if (this.inventoryTab === "craft") {
      this.handleInventoryCraftInput(kb);
    }
  }

  private handleInventoryEquipInput(kb: ex.Keyboard): void {
    if (!this.player) return;
    const slotCount = ALL_EQUIPMENT_SLOTS.length;

    if (wasActionPressed(kb, "moveUp")) {
      this.inventoryEquipIndex = (this.inventoryEquipIndex - 1 + slotCount) % slotCount;
      this.updateInventoryMenu();
    }
    if (wasActionPressed(kb, "moveDown")) {
      this.inventoryEquipIndex = (this.inventoryEquipIndex + 1) % slotCount;
      this.updateInventoryMenu();
    }
    if (wasActionPressed(kb, "confirm") || wasActionPressed(kb, "action")) {
      this.openEquipSubmenu();
    }
    if (wasActionPressed(kb, "repair")) {
      const slot = ALL_EQUIPMENT_SLOTS[this.inventoryEquipIndex];
      const item = this.player.inventory.equipment[slot];
      const repaired = repairItem(this.player.inventory, slot);
      if (repaired) {
        this.spawnPickupText(
          `Repaired with ${repaired}!`,
          this.player.pos.x,
          this.player.pos.y - 16,
        );
        this.rebuildInventoryViewBag();
      } else if (item && item.durability != null && item.durability < (item.maxDurability ?? 0)) {
        const config = DURABILITY_CONFIG[item.id];
        if (config) {
          const matName = ITEMS[config.repairItemId]?.name ?? config.repairItemId;
          this.spawnPickupText(`Need ${matName}!`, this.player.pos.x, this.player.pos.y - 16);
        }
      }
      this.updateInventoryMenu();
    }
  }

  private openEquipSubmenu(): void {
    if (!this.player) return;
    const slot = ALL_EQUIPMENT_SLOTS[this.inventoryEquipIndex];

    // Build list of bag items that fit this slot
    const items: { item: Item; realIndex: number }[] = [];
    for (let i = 0; i < this.player.inventory.bag.length; i++) {
      const item = this.player.inventory.bag[i];
      if (item.slot === slot) {
        items.push({ item, realIndex: i });
      }
    }

    const hasEquipped = this.player.inventory.equipment[slot] != null;

    // Don't open if there's nothing to show
    if (items.length === 0 && !hasEquipped) return;

    this.inventoryEquipSubmenuOpen = true;
    this.inventoryEquipSubmenuSlot = slot;
    this.inventoryEquipSubmenuItems = items;
    this.inventoryEquipSubmenuIndex = 0;
    this.inventoryEquipSubmenuScroll = 0;
    this.updateInventoryMenu();
  }

  private handleInventoryEquipSubmenuInput(kb: ex.Keyboard): void {
    if (!this.player || !this.inventoryEquipSubmenuSlot) return;

    // Close submenu
    if (wasActionPressed(kb, "back")) {
      this.inventoryEquipSubmenuOpen = false;
      this.updateInventoryMenu();
      return;
    }

    // Close entire inventory
    if (wasActionPressed(kb, "inventory")) {
      this.inventoryEquipSubmenuOpen = false;
      this.closeInventoryMenu();
      return;
    }

    const items = this.inventoryEquipSubmenuItems;
    const slot = this.inventoryEquipSubmenuSlot;
    const hasEquipped = this.player.inventory.equipment[slot] != null;
    const totalOptions = items.length + (hasEquipped ? 1 : 0);
    const maxVis = this.INV_MAX_VISIBLE;

    if (totalOptions === 0) return;

    if (wasActionPressed(kb, "moveUp")) {
      if (this.inventoryEquipSubmenuIndex > 0) {
        this.inventoryEquipSubmenuIndex--;
        if (this.inventoryEquipSubmenuIndex < this.inventoryEquipSubmenuScroll) {
          this.inventoryEquipSubmenuScroll = this.inventoryEquipSubmenuIndex;
        }
        this.updateInventoryMenu();
      }
    }
    if (wasActionPressed(kb, "moveDown")) {
      if (this.inventoryEquipSubmenuIndex < totalOptions - 1) {
        this.inventoryEquipSubmenuIndex++;
        if (this.inventoryEquipSubmenuIndex >= this.inventoryEquipSubmenuScroll + maxVis) {
          this.inventoryEquipSubmenuScroll = this.inventoryEquipSubmenuIndex - maxVis + 1;
        }
        this.updateInventoryMenu();
      }
    }

    if (wasActionPressed(kb, "confirm") || wasActionPressed(kb, "action")) {
      if (this.inventoryEquipSubmenuIndex < items.length) {
        // Equip the selected bag item
        const entry = items[this.inventoryEquipSubmenuIndex];
        equipItem(this.player.inventory, entry.realIndex);
      } else {
        // Unequip current item
        unequipItem(this.player.inventory, slot);
      }
      this.player.refreshSprite();
      this.inventoryEquipSubmenuOpen = false;
      this.rebuildInventoryViewBag();
      this.updateInventoryMenu();
    }
  }

  private handleInventoryBagInput(kb: ex.Keyboard): void {
    if (!this.player) return;
    const inv = this.player.inventory;

    // X cycles sort mode (works from anywhere in bag tab)
    if (kb.wasPressed(ex.Keys.KeyX)) {
      if (this.inventorySortMode === "default") this.inventorySortMode = "a-z";
      else if (this.inventorySortMode === "a-z") this.inventorySortMode = "z-a";
      else this.inventorySortMode = "default";
      this.rebuildInventoryViewBag();
      this.clampInventoryBagIndex();
      this.updateInventoryMenu();
      return;
    }

    // Filter bar
    if (this.inventoryOnFilterBar) {
      if (wasActionPressed(kb, "confirm") || wasActionPressed(kb, "action")) {
        this.inventoryFilterActive = true;
        this.updateInventoryMenu();
        return;
      }
      if (wasActionPressed(kb, "moveDown") && this.inventoryViewBag.length > 0) {
        this.inventoryOnFilterBar = false;
        this.inventoryBagIndex = 0;
        this.inventoryBagScroll = 0;
        this.updateInventoryMenu();
      }
      return;
    }

    // Item list
    const viewLen = this.inventoryViewBag.length;
    if (viewLen === 0) {
      if (wasActionPressed(kb, "moveUp")) {
        this.inventoryOnFilterBar = true;
        this.updateInventoryMenu();
      }
      return;
    }

    const maxVis = this.INV_MAX_VISIBLE - 1; // account for filter bar row

    if (wasActionPressed(kb, "moveUp")) {
      if (this.inventoryBagIndex > 0) {
        this.inventoryBagIndex--;
        if (this.inventoryBagIndex < this.inventoryBagScroll) {
          this.inventoryBagScroll = this.inventoryBagIndex;
        }
      } else {
        this.inventoryOnFilterBar = true;
      }
      this.updateInventoryMenu();
    }

    if (wasActionPressed(kb, "moveDown")) {
      if (this.inventoryBagIndex < viewLen - 1) {
        this.inventoryBagIndex++;
        if (this.inventoryBagIndex >= this.inventoryBagScroll + maxVis) {
          this.inventoryBagScroll = this.inventoryBagIndex - maxVis + 1;
        }
        this.updateInventoryMenu();
      }
    }

    if (wasActionPressed(kb, "confirm") || wasActionPressed(kb, "action")) {
      const entry = this.inventoryViewBag[this.inventoryBagIndex];
      if (!entry) return;

      if (isConsumable(entry.item)) {
        const newVitals = consumeItem(inv, entry.realIndex, this.player.vitals);
        if (newVitals) {
          this.player.vitals = newVitals;
        }
      } else {
        equipItem(inv, entry.realIndex);
        this.player.refreshSprite();
      }

      this.rebuildInventoryViewBag();
      if (inv.bag.length === 0) {
        this.inventoryTab = "equipment";
        this.inventoryOnFilterBar = false;
      } else if (this.inventoryViewBag.length === 0) {
        this.inventoryOnFilterBar = true;
      }
      this.clampInventoryBagIndex();
      this.updateInventoryMenu();
    }

    if (wasActionPressed(kb, "drop")) {
      this.dropInventoryItem();
    }
  }

  private handleInventoryFilterInput(kb: ex.Keyboard): void {
    if (
      kb.wasPressed(ex.Keys.Escape) ||
      kb.wasPressed(ex.Keys.Enter) ||
      kb.wasPressed(ex.Keys.Tab)
    ) {
      this.inventoryFilterActive = false;
      if (this.inventoryViewBag.length > 0) {
        this.inventoryOnFilterBar = false;
        this.inventoryBagIndex = 0;
        this.inventoryBagScroll = 0;
      }
      this.updateInventoryMenu();
      return;
    }

    if (kb.wasPressed(ex.Keys.Backspace)) {
      this.inventoryFilterText = this.inventoryFilterText.slice(0, -1);
      this.rebuildInventoryViewBag();
      this.inventoryBagIndex = 0;
      this.inventoryBagScroll = 0;
      this.updateInventoryMenu();
      return;
    }

    const pressed = kb.getKeys();
    const shift = kb.isHeld(ex.Keys.ShiftLeft) || kb.isHeld(ex.Keys.ShiftRight);
    for (const key of pressed) {
      if (!kb.wasPressed(key)) continue;
      const ch = this.inventoryKeyToChar(key, shift);
      if (ch && this.inventoryFilterText.length < 16) {
        this.inventoryFilterText += ch;
        this.rebuildInventoryViewBag();
        this.inventoryBagIndex = 0;
        this.inventoryBagScroll = 0;
        this.updateInventoryMenu();
        break;
      }
    }
  }

  private handleInventoryCraftInput(kb: ex.Keyboard): void {
    if (!this.player) return;
    const recipeCount = RECIPES.length;
    if (recipeCount === 0) return;

    if (wasActionPressed(kb, "moveUp")) {
      if (this.inventoryCraftIndex > 0) {
        this.inventoryCraftIndex--;
        if (this.inventoryCraftIndex < this.inventoryCraftScroll) {
          this.inventoryCraftScroll = this.inventoryCraftIndex;
        }
        this.updateInventoryMenu();
      }
    }
    if (wasActionPressed(kb, "moveDown")) {
      if (this.inventoryCraftIndex < recipeCount - 1) {
        this.inventoryCraftIndex++;
        if (this.inventoryCraftIndex >= this.inventoryCraftScroll + this.INV_MAX_VISIBLE) {
          this.inventoryCraftScroll = this.inventoryCraftIndex - this.INV_MAX_VISIBLE + 1;
        }
        this.updateInventoryMenu();
      }
    }
    if (wasActionPressed(kb, "confirm") || wasActionPressed(kb, "action")) {
      const recipe = RECIPES[this.inventoryCraftIndex];
      if (recipe && craft(this.player.inventory, recipe)) {
        this.rebuildInventoryViewBag();
        this.updateInventoryMenu();
      }
    }
  }

  private rebuildInventoryViewBag(): void {
    if (!this.player) {
      this.inventoryViewBag = [];
      return;
    }
    let entries = this.player.inventory.bag.map((item, i) => ({
      item,
      realIndex: i,
    }));
    const query = this.inventoryFilterText.trim().toLowerCase();
    if (query) {
      entries = entries.filter((e) => e.item.name.toLowerCase().includes(query));
    }
    if (this.inventorySortMode === "a-z") {
      entries.sort((a, b) => a.item.name.localeCompare(b.item.name));
    } else if (this.inventorySortMode === "z-a") {
      entries.sort((a, b) => b.item.name.localeCompare(a.item.name));
    }
    this.inventoryViewBag = entries;
  }

  private clampInventoryBagIndex(): void {
    const len = this.inventoryViewBag.length;
    if (len === 0) {
      this.inventoryBagIndex = 0;
      this.inventoryBagScroll = 0;
    } else if (this.inventoryBagIndex >= len) {
      this.inventoryBagIndex = len - 1;
    }
    if (this.inventoryBagScroll > this.inventoryBagIndex) {
      this.inventoryBagScroll = this.inventoryBagIndex;
    }
    const maxVis = this.INV_MAX_VISIBLE - 1;
    if (this.inventoryBagIndex >= this.inventoryBagScroll + maxVis) {
      this.inventoryBagScroll = this.inventoryBagIndex - maxVis + 1;
    }
  }

  private enterInventoryBagPanel(): void {
    if (this.inventoryViewBag.length > 0) {
      this.inventoryOnFilterBar = false;
      this.inventoryBagIndex = Math.min(this.inventoryBagIndex, this.inventoryViewBag.length - 1);
    } else {
      this.inventoryOnFilterBar = true;
    }
  }

  private dropInventoryItem(): void {
    if (!this.player || this.inventoryOnFilterBar) return;
    const entry = this.inventoryViewBag[this.inventoryBagIndex];
    if (!entry) return;

    this.player.inventory.bag.splice(entry.realIndex, 1);
    const playerTileX = this.player.getTileX();
    const playerTileY = this.player.getTileY();
    this.dropItemAt(playerTileX, playerTileY, entry.item);

    this.rebuildInventoryViewBag();
    if (this.player.inventory.bag.length === 0) {
      this.inventoryTab = "equipment";
      this.inventoryOnFilterBar = false;
    } else if (this.inventoryViewBag.length === 0) {
      this.inventoryOnFilterBar = true;
    }
    this.clampInventoryBagIndex();
    this.updateInventoryMenu();
  }

  private inventoryKeyToChar(key: ex.Keys, shift: boolean): string | null {
    const str = key as string;
    if (str.startsWith("Key") && str.length === 4) {
      const letter = str[3];
      return shift ? letter : letter.toLowerCase();
    }
    if (str.startsWith("Digit") && str.length === 6) return str[5];
    if (key === ex.Keys.Space) return " ";
    if (key === ex.Keys.Minus) return shift ? "_" : "-";
    return null;
  }

  /** Draw full item detail at a given Y position. Returns the Y after the last line. */
  private drawItemDetail(
    ctx: CanvasRenderingContext2D,
    item: Item,
    startY: number,
    maxTextW: number,
    leftX: number,
  ): number {
    const canonical = ITEMS[item.id] ?? item;
    const dlh = this.INV_DETAIL_LINE_H;
    let y = startY;

    // Rarity + slot/type + dye
    ctx.font = "9px monospace";
    ctx.textAlign = "left";
    let typeLine = canonical.rarity as string;
    if (isConsumable(canonical)) {
      typeLine += " \u00b7 Consumable";
    } else if (canonical.slot) {
      typeLine += ` \u00b7 ${EQUIPMENT_SLOT_LABELS[canonical.slot]}`;
    }
    if (item.dye) {
      typeLine += ` (${item.dye})`;
    }
    ctx.fillStyle = RARITY_COLORS[canonical.rarity] ?? "#888888";
    ctx.fillText(typeLine, leftX, y);
    y += dlh;

    // Description (word-wrapped, never truncated)
    ctx.fillStyle = "#999999";
    const words = canonical.description.split(" ");
    let line = "";
    for (const word of words) {
      const testLine = line ? `${line} ${word}` : word;
      if (ctx.measureText(testLine).width > maxTextW) {
        if (line) {
          ctx.fillText(line, leftX, y);
          y += dlh;
        }
        line = word;
      } else {
        line = testLine;
      }
    }
    if (line) {
      ctx.fillText(line, leftX, y);
      y += dlh;
    }

    // Stats
    const statParts: string[] = [];
    if (canonical.stats.attack) statParts.push(`ATK +${canonical.stats.attack}`);
    if (canonical.stats.defense) statParts.push(`DEF +${canonical.stats.defense}`);
    if (canonical.stats.speed) statParts.push(`SPD +${canonical.stats.speed}`);
    if (statParts.length > 0) {
      ctx.fillStyle = "#66cc66";
      ctx.fillText(statParts.join("  "), leftX, y);
      y += dlh;
    }

    // Tool multipliers
    if (canonical.toolMultipliers) {
      const labels: Record<string, string> = {
        tree: "Trees",
        mineable: "Rocks",
        building: "Buildings",
      };
      const toolParts: string[] = [];
      for (const [category, mult] of Object.entries(canonical.toolMultipliers)) {
        if (mult && mult > 1) {
          toolParts.push(`${mult}x vs ${labels[category] ?? category}`);
        }
      }
      if (toolParts.length > 0) {
        ctx.fillStyle = "#66cc66";
        ctx.fillText(toolParts.join("  "), leftX, y);
        y += dlh;
      }
    }

    // Consumable effects
    if (isConsumable(canonical) && canonical.consumable) {
      const effectParts: string[] = [];
      if (canonical.consumable.hungerRestore)
        effectParts.push(`Hunger +${canonical.consumable.hungerRestore}`);
      if (canonical.consumable.thirstRestore)
        effectParts.push(`Thirst +${canonical.consumable.thirstRestore}`);
      if (canonical.consumable.healthRestore)
        effectParts.push(`Health +${canonical.consumable.healthRestore}`);
      if (effectParts.length > 0) {
        ctx.fillStyle = "#66cc66";
        ctx.fillText(effectParts.join("  "), leftX, y);
        y += dlh;
      }
    }

    // Durability
    if (item.durability != null && item.maxDurability != null) {
      const durRatio = item.durability / item.maxDurability;
      ctx.fillStyle = durRatio > 0.25 ? "#66cc66" : "#ff6666";
      ctx.fillText(`Durability: ${item.durability}/${item.maxDurability}`, leftX, y);
      y += dlh;

      // Repair material
      const durConfig = DURABILITY_CONFIG[item.id];
      if (durConfig) {
        const repairName = ITEMS[durConfig.repairItemId]?.name ?? durConfig.repairItemId;
        ctx.fillStyle = "#888888";
        ctx.fillText(`Repair: ${repairName}`, leftX, y);
        y += dlh;
      }
    }

    // Weight
    ctx.fillStyle = "#888888";
    ctx.fillText(`Weight: ${canonical.weight}`, leftX, y);
    y += dlh;

    return y;
  }

  private updateInventoryMenu(): void {
    if (!this.inventoryMenuPanel || !this.player) return;

    const inv = this.player.inventory;
    const pw = this.INV_PANEL_WIDTH;
    const lh = this.INV_LINE_HEIGHT;
    const maxVis = this.INV_MAX_VISIBLE;
    const tab = this.inventoryTab;

    const headerH = 28;
    const tabBarH = 24;
    const contentH = maxVis * lh;
    const detailH = 90;
    const hintH = 24;
    const ph = headerH + tabBarH + contentH + detailH + hintH + 14;

    // Snapshot state for draw closure
    const equipIdx = this.inventoryEquipIndex;
    const bagIdx = this.inventoryBagIndex;
    const bagScroll = this.inventoryBagScroll;
    const craftIdx = this.inventoryCraftIndex;
    const craftScroll = this.inventoryCraftScroll;
    const viewBag = [...this.inventoryViewBag];
    const filterText = this.inventoryFilterText;
    const filterActive = this.inventoryFilterActive;
    const onFilterBar = this.inventoryOnFilterBar;
    const sortMode = this.inventorySortMode;
    const bagTotal = inv.bag.length;
    const filteredCount = viewBag.length;
    const curWeight = totalWeight(inv);
    const maxWeight = inv.maxWeight;

    // Equipment submenu state snapshot
    const submenuOpen = this.inventoryEquipSubmenuOpen;
    const submenuSlot = this.inventoryEquipSubmenuSlot;
    const submenuItems = [...this.inventoryEquipSubmenuItems];
    const submenuIdx = this.inventoryEquipSubmenuIndex;
    const submenuScroll = this.inventoryEquipSubmenuScroll;
    const submenuEquipped = submenuSlot ? inv.equipment[submenuSlot] : null;
    const submenuTotalOptions = submenuItems.length + (submenuEquipped ? 1 : 0);

    const canvas = new ex.Canvas({
      width: Math.round(pw * this.uiScale),
      height: Math.round(ph * this.uiScale),
      cache: false,
      draw: (ctx) => {
        ctx.imageSmoothingEnabled = false;
        ctx.scale(this.uiScale, this.uiScale);
        const detailMaxW = pw - 16; // text wrap width

        // ── Background with rounded corners ──
        ctx.fillStyle = "rgba(10, 10, 20, 0.88)";
        const r = 4;
        ctx.beginPath();
        ctx.moveTo(r, 0);
        ctx.lineTo(pw - r, 0);
        ctx.arcTo(pw, 0, pw, r, r);
        ctx.lineTo(pw, ph - r);
        ctx.arcTo(pw, ph, pw - r, ph, r);
        ctx.lineTo(r, ph);
        ctx.arcTo(0, ph, 0, ph - r, r);
        ctx.lineTo(0, r);
        ctx.arcTo(0, 0, r, 0, r);
        ctx.closePath();
        ctx.fill();

        // Border (warm gold)
        ctx.strokeStyle = "rgba(200, 170, 80, 0.35)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // ── Header ──
        ctx.fillStyle = "#ffffff";
        ctx.font = "bold 14px monospace";
        ctx.textAlign = "center";
        ctx.fillText("INVENTORY", pw / 2, 18);

        // Header divider
        ctx.strokeStyle = "rgba(200, 170, 80, 0.25)";
        ctx.beginPath();
        ctx.moveTo(8, headerH);
        ctx.lineTo(pw - 8, headerH);
        ctx.stroke();

        // ── Tab bar ──
        const tabY = headerH + 16;
        const tabW = Math.floor(pw / 3);
        ctx.font = "bold 10px monospace";
        ctx.textAlign = "center";

        // EQUIP tab
        const eqX = Math.floor(tabW * 0.5);
        ctx.fillStyle = tab === "equipment" ? "#f0c040" : "#666666";
        ctx.fillText("EQUIP", eqX, tabY);
        if (tab === "equipment") {
          ctx.fillStyle = "rgba(240, 192, 64, 0.5)";
          ctx.fillRect(eqX - 20, tabY + 3, 40, 1);
        }

        // BAG tab
        const bagX = Math.floor(tabW * 1.5);
        let bagLabel = "BAG";
        if (bagTotal > 0) bagLabel += ` (${bagTotal})`;
        ctx.fillStyle = tab === "bag" ? "#f0c040" : "#666666";
        ctx.fillText(bagLabel, bagX, tabY);
        if (tab === "bag") {
          const labelW = ctx.measureText(bagLabel).width;
          ctx.fillStyle = "rgba(240, 192, 64, 0.5)";
          ctx.fillRect(bagX - labelW / 2, tabY + 3, labelW, 1);
        }

        // CRAFT tab
        const craftTabX = Math.floor(tabW * 2.5);
        ctx.fillStyle = tab === "craft" ? "#f0c040" : "#666666";
        ctx.fillText("CRAFT", craftTabX, tabY);
        if (tab === "craft") {
          ctx.fillStyle = "rgba(240, 192, 64, 0.5)";
          ctx.fillRect(craftTabX - 22, tabY + 3, 44, 1);
        }

        // Tab divider
        ctx.strokeStyle = "rgba(200, 170, 80, 0.15)";
        ctx.beginPath();
        ctx.moveTo(8, headerH + tabBarH);
        ctx.lineTo(pw - 8, headerH + tabBarH);
        ctx.stroke();

        const contentTop = headerH + tabBarH;
        const detailTop = contentTop + contentH + 4;

        // ═══════════════ EQUIPMENT TAB ═══════════════
        if (tab === "equipment") {
          if (submenuOpen && submenuSlot) {
            // ── Equipment submenu ──
            // Submenu header
            ctx.textAlign = "left";
            ctx.font = "bold 11px monospace";
            ctx.fillStyle = "#f0c040";
            ctx.fillText(`EQUIP: ${EQUIPMENT_SLOT_LABELS[submenuSlot]}`, 8, contentTop + 16);

            // Submenu divider
            ctx.strokeStyle = "rgba(200, 170, 80, 0.2)";
            ctx.beginPath();
            ctx.moveTo(8, contentTop + 22);
            ctx.lineTo(pw - 8, contentTop + 22);
            ctx.stroke();

            const listTop = contentTop + 28;
            const visStart = submenuScroll;
            const visEnd = Math.min(submenuTotalOptions, submenuScroll + maxVis - 1);

            // Scroll-up indicator
            if (submenuScroll > 0) {
              ctx.fillStyle = "#666666";
              ctx.font = "9px monospace";
              ctx.textAlign = "left";
              ctx.fillText("...", 14, listTop - 2);
            }

            for (let vi = 0; vi < maxVis - 1; vi++) {
              const optIdx = visStart + vi;
              if (optIdx >= visEnd) break;

              const selected = optIdx === submenuIdx;
              const y = listTop + vi * lh + lh / 2;

              // Selection highlight
              if (selected) {
                ctx.fillStyle = "rgba(200, 170, 80, 0.12)";
                ctx.fillRect(4, listTop + vi * lh - 2, pw - 8, lh);
              }

              const prefix = selected ? "> " : "  ";

              if (optIdx < submenuItems.length) {
                // Bag item
                const entry = submenuItems[optIdx];
                const canonical = ITEMS[entry.item.id] ?? entry.item;
                ctx.textAlign = "left";
                ctx.font = selected ? "bold 11px monospace" : "11px monospace";
                ctx.fillStyle = selected
                  ? "#f0c040"
                  : (RARITY_COLORS[entry.item.rarity] ?? "#cccccc");
                ctx.fillText(`${prefix}${entry.item.name}`, 8, y);

                // Stats right-aligned
                const sp: string[] = [];
                if (canonical.stats.attack) sp.push(`ATK+${canonical.stats.attack}`);
                if (canonical.stats.defense) sp.push(`DEF+${canonical.stats.defense}`);
                if (canonical.stats.speed) sp.push(`SPD+${canonical.stats.speed}`);
                if (sp.length > 0) {
                  ctx.textAlign = "right";
                  ctx.font = "9px monospace";
                  ctx.fillStyle = selected ? "#f0c040" : "#66cc66";
                  ctx.fillText(sp.join(" "), pw - 8, y);
                }
              } else {
                // Unequip option
                ctx.textAlign = "left";
                ctx.font = selected ? "bold 11px monospace" : "11px monospace";
                ctx.fillStyle = selected ? "#f0c040" : "#cc8844";
                ctx.fillText(`${prefix}Unequip`, 8, y);
              }
            }

            // Scroll-down indicator
            if (visEnd < submenuTotalOptions) {
              ctx.fillStyle = "#666666";
              ctx.font = "9px monospace";
              ctx.textAlign = "left";
              ctx.fillText("...", 14, listTop + (maxVis - 1) * lh + 2);
            }

            // Detail for selected submenu item
            let detailItem: Item | null = null;
            if (submenuIdx < submenuItems.length) {
              detailItem = submenuItems[submenuIdx].item;
            } else if (submenuEquipped) {
              detailItem = submenuEquipped;
            }
            if (detailItem) {
              // Divider above detail
              ctx.strokeStyle = "rgba(200, 170, 80, 0.15)";
              ctx.beginPath();
              ctx.moveTo(8, detailTop - 2);
              ctx.lineTo(pw - 8, detailTop - 2);
              ctx.stroke();

              this.drawItemDetail(ctx, detailItem, detailTop + 6, detailMaxW, 8);
            }
          } else {
            // ── Normal equipment slot list ──
            const slotCount = ALL_EQUIPMENT_SLOTS.length;
            for (let i = 0; i < slotCount; i++) {
              const slot = ALL_EQUIPMENT_SLOTS[i];
              const item = inv.equipment[slot];
              const selected = i === equipIdx;
              const y = contentTop + 6 + i * lh + lh / 2;

              if (selected) {
                ctx.fillStyle = "rgba(200, 170, 80, 0.12)";
                ctx.fillRect(4, contentTop + 4 + i * lh, pw - 8, lh);
              }

              const prefix = selected ? "> " : "  ";
              ctx.textAlign = "left";
              ctx.font = "10px monospace";
              ctx.fillStyle = "#888888";
              const slotLabel = EQUIPMENT_SLOT_LABELS[slot];
              ctx.fillText(`${prefix}${slotLabel}:`, 8, y);

              const labelWidth = ctx.measureText(`${prefix}${slotLabel}: `).width;
              if (item) {
                ctx.font = selected ? "bold 11px monospace" : "11px monospace";
                ctx.fillStyle = selected ? "#f0c040" : (RARITY_COLORS[item.rarity] ?? "#ffffff");
                let displayName = item.name;
                if (isStackable(item)) {
                  displayName += ` x${getItemQuantity(item)}`;
                }
                if (item.durability != null && item.maxDurability != null) {
                  displayName += ` [${item.durability}/${item.maxDurability}]`;
                }
                ctx.fillText(displayName, 8 + labelWidth, y);

                const canonical = ITEMS[item.id] ?? item;
                const sp: string[] = [];
                if (canonical.stats.attack) sp.push(`ATK+${canonical.stats.attack}`);
                if (canonical.stats.defense) sp.push(`DEF+${canonical.stats.defense}`);
                if (canonical.stats.speed) sp.push(`SPD+${canonical.stats.speed}`);
                if (sp.length > 0) {
                  ctx.textAlign = "right";
                  ctx.font = "9px monospace";
                  ctx.fillStyle = selected ? "#f0c040" : "#66cc66";
                  ctx.fillText(sp.join(" "), pw - 8, y);
                }
              } else {
                ctx.font = "11px monospace";
                ctx.fillStyle = selected ? "#f0c040" : "#444444";
                ctx.fillText("(empty)", 8 + labelWidth, y);
              }
            }

            // Weight
            ctx.textAlign = "center";
            ctx.font = "10px monospace";
            ctx.fillStyle = curWeight > maxWeight ? "#ff4444" : "#888888";
            ctx.fillText(
              `Weight: ${curWeight}/${maxWeight}`,
              pw / 2,
              contentTop + slotCount * lh + 16,
            );

            // Full detail of selected slot item
            const selSlot = ALL_EQUIPMENT_SLOTS[equipIdx];
            const selItem = inv.equipment[selSlot];
            if (selItem) {
              ctx.strokeStyle = "rgba(200, 170, 80, 0.15)";
              ctx.beginPath();
              ctx.moveTo(8, detailTop - 2);
              ctx.lineTo(pw - 8, detailTop - 2);
              ctx.stroke();

              this.drawItemDetail(ctx, selItem, detailTop + 6, detailMaxW, 8);
            }
          }
        }

        // ═══════════════ BAG TAB ═══════════════
        if (tab === "bag") {
          // Filter bar
          const filterY = contentTop + 14;
          ctx.textAlign = "left";
          if (filterActive) {
            ctx.font = "bold 10px monospace";
            ctx.fillStyle = "#66cc66";
            ctx.fillText(`/ ${filterText}_`, 8, filterY);
          } else if (onFilterBar) {
            ctx.font = "bold 10px monospace";
            ctx.fillStyle = "#f0c040";
            ctx.fillText(filterText ? `> / ${filterText}` : "> / ...", 8, filterY);
          } else if (filterText) {
            ctx.font = "10px monospace";
            ctx.fillStyle = "#888888";
            ctx.fillText(`/ ${filterText}`, 8, filterY);
          } else {
            ctx.font = "10px monospace";
            ctx.fillStyle = "#555555";
            ctx.fillText("/ ...", 8, filterY);
          }

          // Sort mode indicator
          if (sortMode !== "default") {
            ctx.textAlign = "right";
            ctx.font = "9px monospace";
            ctx.fillStyle = "#888888";
            ctx.fillText(sortMode === "a-z" ? "A\u2011Z" : "Z\u2011A", pw - 8, filterY);
          }

          const itemsTop = contentTop + 24;
          const itemMaxVis = maxVis - 1;

          // Scroll-up indicator
          if (bagScroll > 0) {
            ctx.fillStyle = "#666666";
            ctx.font = "9px monospace";
            ctx.textAlign = "left";
            ctx.fillText("...", 14, itemsTop - 2);
          }

          // Item list
          for (let vi = 0; vi < itemMaxVis; vi++) {
            const realIdx = bagScroll + vi;
            if (realIdx >= viewBag.length) break;
            const entry = viewBag[realIdx];
            const selected = !onFilterBar && realIdx === bagIdx;
            const y = itemsTop + vi * lh + lh / 2;

            if (selected) {
              ctx.fillStyle = "rgba(200, 170, 80, 0.12)";
              ctx.fillRect(4, itemsTop + vi * lh - 2, pw - 8, lh);
            }

            const prefix = selected ? "> " : "  ";
            ctx.textAlign = "left";
            ctx.font = selected ? "bold 11px monospace" : "11px monospace";
            ctx.fillStyle = selected ? "#f0c040" : (RARITY_COLORS[entry.item.rarity] ?? "#cccccc");
            const bagDisplayName = isStackable(entry.item)
              ? `${entry.item.name} x${getItemQuantity(entry.item)}`
              : entry.item.name;
            ctx.fillText(`${prefix}${bagDisplayName}`, 8, y);

            // Weight right-aligned (multiply by quantity for stacks)
            ctx.textAlign = "right";
            ctx.font = "9px monospace";
            ctx.fillStyle = selected ? "#f0c040" : "#666666";
            const displayWeight = isStackable(entry.item)
              ? (entry.item.weight * getItemQuantity(entry.item)).toFixed(1)
              : `${entry.item.weight}`;
            ctx.fillText(displayWeight, pw - 8, y);
          }

          // Scroll-down indicator
          if (bagScroll + itemMaxVis < viewBag.length) {
            ctx.fillStyle = "#666666";
            ctx.font = "9px monospace";
            ctx.textAlign = "left";
            ctx.fillText("...", 14, itemsTop + itemMaxVis * lh + 2);
          }

          // Empty states
          if (bagTotal === 0) {
            ctx.textAlign = "center";
            ctx.font = "11px monospace";
            ctx.fillStyle = "#444444";
            ctx.fillText("Empty", pw / 2, itemsTop + lh);
          } else if (filteredCount === 0) {
            ctx.textAlign = "center";
            ctx.font = "11px monospace";
            ctx.fillStyle = "#444444";
            ctx.fillText("No matches", pw / 2, itemsTop + lh);
          }

          // Weight
          ctx.textAlign = "center";
          ctx.font = "10px monospace";
          ctx.fillStyle = curWeight > maxWeight ? "#ff4444" : "#888888";
          ctx.fillText(`Weight: ${curWeight}/${maxWeight}`, pw / 2, contentTop + contentH - 4);

          // Full detail of selected bag item
          if (!onFilterBar && viewBag.length > 0 && bagIdx < viewBag.length) {
            const selItem = viewBag[bagIdx].item;
            ctx.strokeStyle = "rgba(200, 170, 80, 0.15)";
            ctx.beginPath();
            ctx.moveTo(8, detailTop - 2);
            ctx.lineTo(pw - 8, detailTop - 2);
            ctx.stroke();

            this.drawItemDetail(ctx, selItem, detailTop + 6, detailMaxW, 8);
          }
        }

        // ═══════════════ CRAFT TAB ═══════════════
        if (tab === "craft") {
          const recipes = RECIPES;
          const visStart = craftScroll;
          const visEnd = Math.min(recipes.length, craftScroll + maxVis);

          // Scroll-up indicator
          if (craftScroll > 0) {
            ctx.fillStyle = "#666666";
            ctx.font = "9px monospace";
            ctx.textAlign = "center";
            ctx.fillText("\u25b2", pw / 2, contentTop + 8);
          }

          // Recipe list
          for (let vi = 0; vi < maxVis; vi++) {
            const recipeIdx = visStart + vi;
            if (recipeIdx >= visEnd) break;

            const recipe = recipes[recipeIdx];
            const available = canCraft(inv, recipe);
            const selected = recipeIdx === craftIdx;
            const y = contentTop + 6 + vi * lh + lh / 2;

            if (selected) {
              ctx.fillStyle = "rgba(200, 170, 80, 0.12)";
              ctx.fillRect(4, contentTop + 4 + vi * lh, pw - 8, lh);
            }

            const prefix = selected ? "> " : "  ";
            ctx.textAlign = "left";
            ctx.font = selected ? "bold 11px monospace" : "11px monospace";
            if (selected) {
              ctx.fillStyle = "#f0c040";
            } else if (available) {
              ctx.fillStyle = "#ffffff";
            } else {
              ctx.fillStyle = "#666666";
            }
            ctx.fillText(`${prefix}${recipe.name}`, 8, y);

            // Cost right-aligned (show alternatives separated by "/")
            const costStr = recipe.ingredients
              .map((ing) => {
                const names = [ITEMS[ing.itemId]?.name ?? ing.itemId];
                if (ing.alternatives) {
                  for (const alt of ing.alternatives) {
                    names.push(ITEMS[alt]?.name ?? alt);
                  }
                }
                return `${ing.count}x${names.join("/")}`;
              })
              .join(" ");
            ctx.textAlign = "right";
            ctx.font = "9px monospace";
            if (selected) {
              ctx.fillStyle = "#f0c040";
            } else if (available) {
              ctx.fillStyle = "#888888";
            } else {
              ctx.fillStyle = "#444444";
            }
            ctx.fillText(costStr, pw - 8, y);
          }

          // Scroll-down indicator
          if (visEnd < recipes.length) {
            ctx.fillStyle = "#666666";
            ctx.font = "9px monospace";
            ctx.textAlign = "center";
            ctx.fillText("\u25bc", pw / 2, contentTop + maxVis * lh + 4);
          }

          // Empty state
          if (recipes.length === 0) {
            ctx.textAlign = "center";
            ctx.font = "11px monospace";
            ctx.fillStyle = "#444444";
            ctx.fillText("No recipes", pw / 2, contentTop + lh);
          }

          // Full detail of selected recipe result
          if (recipes.length > 0 && craftIdx < recipes.length) {
            const recipe = recipes[craftIdx];
            const resultItem = ITEMS[recipe.resultId];

            if (resultItem) {
              ctx.strokeStyle = "rgba(200, 170, 80, 0.15)";
              ctx.beginPath();
              ctx.moveTo(8, detailTop - 2);
              ctx.lineTo(pw - 8, detailTop - 2);
              ctx.stroke();

              // Arrow prefix + result name
              ctx.textAlign = "left";
              ctx.font = "bold 10px monospace";
              ctx.fillStyle = RARITY_COLORS[resultItem.rarity] ?? "#ffffff";
              ctx.fillText(`\u2192 ${resultItem.name}`, 8, detailTop + 6);

              // Full detail below the arrow line
              this.drawItemDetail(ctx, resultItem, detailTop + 18, detailMaxW, 8);
            }
          }
        }

        // ── Bottom divider ──
        const bottomDivY = contentTop + contentH + detailH - 2;
        ctx.strokeStyle = "rgba(200, 170, 80, 0.25)";
        ctx.beginPath();
        ctx.moveTo(8, bottomDivY);
        ctx.lineTo(pw - 8, bottomDivY);
        ctx.stroke();

        // ── Hint text ──
        ctx.textAlign = "center";
        ctx.font = "9px monospace";
        ctx.fillStyle = "#666666";
        const hintY = bottomDivY + 14;

        if (tab === "equipment") {
          if (submenuOpen) {
            if (submenuIdx < submenuItems.length) {
              ctx.fillText("[E] Equip  [Esc] Back", pw / 2, hintY);
            } else {
              ctx.fillText("[E] Unequip  [Esc] Back", pw / 2, hintY);
            }
          } else {
            const selSlotForHint = ALL_EQUIPMENT_SLOTS[equipIdx];
            const selItemForHint = inv.equipment[selSlotForHint];
            if (
              selItemForHint &&
              selItemForHint.durability != null &&
              selItemForHint.maxDurability != null &&
              selItemForHint.durability < selItemForHint.maxDurability
            ) {
              ctx.fillText("[E] Select  [V] Repair  [I] Close", pw / 2, hintY);
            } else {
              ctx.fillText("[E] Select  [\u2190\u2192] Tab  [I] Close", pw / 2, hintY);
            }
          }
        } else if (tab === "bag") {
          if (filterActive) {
            ctx.fillStyle = "#66cc66";
            ctx.fillText("Type to search \u00b7 [Esc] Done", pw / 2, hintY);
          } else if (onFilterBar) {
            ctx.fillText("[E] Search  [X] Sort  [I] Close", pw / 2, hintY);
          } else if (viewBag.length > 0) {
            ctx.fillText("[E] Use  [Q] Drop  [X] Sort  [I] Close", pw / 2, hintY);
          } else {
            ctx.fillText("[\u2190\u2192] Tab  [I] Close", pw / 2, hintY);
          }
        } else if (tab === "craft") {
          if (RECIPES.length > 0 && craftIdx < RECIPES.length && canCraft(inv, RECIPES[craftIdx])) {
            ctx.fillText("[E] Craft  [\u2190\u2192] Tab  [I] Close", pw / 2, hintY);
          } else if (RECIPES.length > 0) {
            ctx.fillStyle = "#555555";
            ctx.fillText("Missing materials  [\u2190\u2192] Tab  [I] Close", pw / 2, hintY);
          } else {
            ctx.fillText("[\u2190\u2192] Tab  [I] Close", pw / 2, hintY);
          }
        }
      },
    });

    this.inventoryMenuPanel.graphics.use(canvas);
  }

  // ==================== Building Management (tile-based) ====================

  private removeBuilding(building: Building, key: number): void {
    this.blockedTiles.delete(key);
    this.buildingByTile.delete(key);
    const idx = this.buildings.indexOf(building);
    if (idx !== -1) this.buildings.splice(idx, 1);
    // Restore the floor underneath if this was an allowIndoor building (box) on a floor
    const hiddenFloor = this.floorsUnderBuildings.get(key);
    if (hiddenFloor) {
      this.floorsUnderBuildings.delete(key);
      this.buildingByTile.set(key, hiddenFloor);
    }
    // If the player is sleeping in this bed, wake them up
    if (this.sleepingBed === building) {
      this.exitSleep();
    }
    // If the player has this storage box open, close it
    if (this.storageBuilding === building) {
      this.closeStorageMenu();
    }
    // Drop stored items on the ground
    if (building.type.storage) {
      for (const item of building.storageSlots) {
        if (item) {
          this.dropResourceNear(building.tileX, building.tileY, item);
        }
      }
    }
    this.recalculateIndoorLighting();
  }

  // ==================== Edge Building Management ====================

  private removeEdgeBuilding(edgeBuilding: EdgeBuilding, edgeKey: number): void {
    this.blockedEdges.delete(edgeKey);
    this.edgeBuildings.delete(edgeKey);
    const idx = this.edgeBuildingsList.indexOf(edgeBuilding);
    if (idx !== -1) this.edgeBuildingsList.splice(idx, 1);
    // Refresh fence neighbors after removal
    if (edgeBuilding.isFenceType()) {
      this.refreshFenceNeighbors(edgeKey);
    }
    this.recalculateIndoorLighting();
  }

  // ==================== Indoor Lighting ====================

  private recalculateIndoorLighting(): void {
    this.darknessOverlay?.recalculate(this.buildingByTile, this.edgeBuildings);
  }

  // ==================== Fence Autotile ====================

  private computeFenceConnections(edgeKey: number): FenceConnections {
    const decoded = decodeEdgeKey(edgeKey);
    const neighbors = getEdgeNeighbors(decoded.x, decoded.y, decoded.axis);

    const hasFenceAt = (k: number): boolean => {
      const eb = this.edgeBuildings.get(k);
      return eb != null && eb.isFenceType();
    };

    return {
      startConnected: neighbors.start.some(hasFenceAt),
      endConnected: neighbors.end.some(hasFenceAt),
    };
  }

  private refreshFenceNeighbors(edgeKey: number): void {
    const decoded = decodeEdgeKey(edgeKey);
    const neighbors = getEdgeNeighbors(decoded.x, decoded.y, decoded.axis);
    const allNeighborKeys = [...neighbors.start, ...neighbors.end];
    for (const nk of allNeighborKeys) {
      const nb = this.edgeBuildings.get(nk);
      if (nb && nb.isFenceType()) {
        nb.updateGraphic(this.computeFenceConnections(nk));
      }
    }
    // Also refresh the edge itself if it still exists
    const self = this.edgeBuildings.get(edgeKey);
    if (self && self.isFenceType()) {
      self.updateGraphic(this.computeFenceConnections(edgeKey));
    }
  }

  // ==================== Building Save/Load (tile-based) ====================

  getBuildingStates(): BuildingSaveState[] {
    return this.buildings.map((b) => b.getState());
  }

  private restoreBuildingStates(states: BuildingSaveState[]): void {
    // Clear any existing buildings
    for (const building of this.buildings) {
      this.remove(building);
    }
    this.buildings = [];
    this.buildingByTile.clear();
    this.floorsUnderBuildings.clear();

    for (const saved of states) {
      const type = BUILDING_TYPE_MAP[saved.typeId];
      if (!type) continue;
      // Only restore tile-based buildings (floors); skip old wall/fence entries
      if (type.placement !== "tile") continue;

      const building = new Building(type, saved.tileX, saved.tileY, saved.state, saved.rotation);
      building.restoreState(saved);
      building.onDestroy = () => this.removeBuilding(building, tileKey(saved.tileX, saved.tileY));
      building.onFireStateChange = () => this.recalculateIndoorLighting();

      const key = tileKey(saved.tileX, saved.tileY);
      this.buildings.push(building);

      // Handle floor/box overlap: when two buildings share a tile, stash the floor
      const existing = this.buildingByTile.get(key);
      if (existing) {
        if (existing.type.id === "floor" && type.allowIndoor) {
          // Existing is floor, new building (box) goes on top
          this.floorsUnderBuildings.set(key, existing);
        } else if (type.id === "floor" && existing.type.allowIndoor) {
          // New building is a floor that goes under the existing box
          this.floorsUnderBuildings.set(key, building);
          this.add(building);
          continue; // keep the box in buildingByTile, skip the set below
        }
      }
      this.buildingByTile.set(key, building);
      this.add(building);

      // Restore blocked state
      if (building.isSolid()) {
        this.blockedTiles.add(key);
      }
    }
  }

  // ==================== Edge Building Save/Load ====================

  getEdgeBuildingStates(): EdgeBuildingSaveState[] {
    return this.edgeBuildingsList.map((b) => b.getState());
  }

  private restoreEdgeBuildingStates(states: EdgeBuildingSaveState[]): void {
    // Clear any existing edge buildings
    for (const eb of this.edgeBuildingsList) {
      this.remove(eb);
    }
    this.edgeBuildingsList = [];
    this.edgeBuildings.clear();
    this.blockedEdges.clear();

    for (const saved of states) {
      const type = BUILDING_TYPE_MAP[saved.typeId];
      if (!type) continue;

      const edgeBuilding = new EdgeBuilding(type, saved.edgeKey, saved.state);
      edgeBuilding.restoreState(saved);
      edgeBuilding.onDestroy = () => this.removeEdgeBuilding(edgeBuilding, saved.edgeKey);

      this.edgeBuildingsList.push(edgeBuilding);
      this.edgeBuildings.set(saved.edgeKey, edgeBuilding);
      this.add(edgeBuilding);

      if (edgeBuilding.isSolid()) {
        this.blockedEdges.add(saved.edgeKey);
      }
    }

    // Compute all fence connections after all are placed
    for (const eb of this.edgeBuildingsList) {
      if (eb.isFenceType()) {
        eb.updateGraphic(this.computeFenceConnections(eb.edgeKey));
      }
    }
  }

  // ==================== Sheep System ====================

  /** Spawn initial sheep for a new game. */
  private spawnInitialSheep(): void {
    const centerX = MAP_COLS / 2;
    const centerY = MAP_ROWS / 2;
    let placed = 0;
    let attempts = 0;

    while (placed < INITIAL_SHEEP_COUNT && attempts < 500) {
      attempts++;
      const sx = Math.floor(Math.random() * MAP_COLS);
      const sy = Math.floor(Math.random() * MAP_ROWS);

      // Skip near spawn
      if (Math.abs(sx - centerX) <= SPAWN_EXCLUSION && Math.abs(sy - centerY) <= SPAWN_EXCLUSION) {
        continue;
      }
      const key = tileKey(sx, sy);
      if (this.blockedTiles.has(key)) continue;
      if (this.waterTiles.has(key)) continue;

      this.addSheep(sx, sy);
      placed++;
    }
  }

  /** Create a sheep at the given tile and register it in all tracking structures. */
  private addSheep(tileX: number, tileY: number): Sheep {
    const sheep = new Sheep(tileX, tileY);
    sheep.setSpriteSheet(getSheepSpriteSheet());
    sheep.setBlockedCheck((fromX, fromY, toX, toY) => {
      if (this.blockedTiles.has(tileKey(toX, toY))) return true;
      const ek = edgeKeyBetween(fromX, fromY, toX, toY);
      return ek !== null && this.blockedEdges.has(ek);
    });
    this.sheepList.push(sheep);
    const key = tileKey(tileX, tileY);
    this.sheepByTile.set(key, sheep);
    this.sheepRegisteredTile.set(sheep, key);
    this.blockedTiles.add(key);
    this.add(sheep);
    return sheep;
  }

  /** Remove a sheep from all tracking structures and the scene. */
  private removeSheep(sheep: Sheep): void {
    const idx = this.sheepList.indexOf(sheep);
    if (idx !== -1) this.sheepList.splice(idx, 1);
    const registeredKey = this.sheepRegisteredTile.get(sheep);
    const key = registeredKey ?? tileKey(sheep.tileX, sheep.tileY);
    if (this.sheepByTile.get(key) === sheep) {
      this.sheepByTile.delete(key);
    }
    this.blockedTiles.delete(key);
    this.sheepRegisteredTile.delete(sheep);
    // Also clean up target tile if sheep was moving
    if (sheep.isMoving()) {
      const targetKey = tileKey(sheep.getTargetTileX(), sheep.getTargetTileY());
      if (!this.sheepByTile.has(targetKey)) {
        this.blockedTiles.delete(targetKey);
      }
    }
    this.remove(sheep);
  }

  /** Update sheep AI and tile tracking each frame. */
  private updateSheep(delta: number): void {
    if (!this.player) return;

    const playerTX = this.player.getTileX();
    const playerTY = this.player.getTileY();
    const playerFacing = this.player.getFacing();

    for (const sheep of this.sheepList) {
      if (sheep.isDead) continue;

      // Reconcile tile tracking: Creature.onPreUpdate updates tileX/tileY
      // AFTER the scene's onPreUpdate, so we compare against the last
      // registered tile to detect moves that completed in the previous frame.
      const currentKey = tileKey(sheep.tileX, sheep.tileY);
      const registeredKey = this.sheepRegisteredTile.get(sheep) ?? currentKey;
      if (currentKey !== registeredKey) {
        // Remove from old tile
        if (this.sheepByTile.get(registeredKey) === sheep) {
          this.sheepByTile.delete(registeredKey);
          this.blockedTiles.delete(registeredKey);
        }
        // Add to new tile
        this.sheepByTile.set(currentKey, sheep);
        this.blockedTiles.add(currentKey);
        this.sheepRegisteredTile.set(sheep, currentKey);
      }

      // Run AI
      sheep.updateAI(delta, playerTX, playerTY, playerFacing);

      // When sheep starts moving, also block the target tile
      if (sheep.isMoving()) {
        const targetKey = tileKey(sheep.getTargetTileX(), sheep.getTargetTileY());
        this.blockedTiles.add(targetKey);
      }
    }
  }

  /** Wild spawning: every 10min, if ≤ 10 sheep, spawn one on a random open tile. */
  private updateWildSpawn(delta: number): void {
    this.wildSpawnTimer -= delta;
    if (this.wildSpawnTimer > 0) return;
    this.wildSpawnTimer = WILD_SPAWN_INTERVAL_MS;

    const aliveSheep = this.sheepList.filter((s) => !s.isDead).length;
    if (aliveSheep > WILD_SPAWN_MAX_SHEEP) return;

    // Try to find a random walkable, non-water, non-blocked tile
    for (let attempt = 0; attempt < 50; attempt++) {
      const sx = Math.floor(Math.random() * MAP_COLS);
      const sy = Math.floor(Math.random() * MAP_ROWS);
      const key = tileKey(sx, sy);

      if (this.blockedTiles.has(key)) continue;
      if (this.waterTiles.has(key)) continue;
      // Don't spawn on player's tile
      if (this.player && sx === this.player.getTileX() && sy === this.player.getTileY()) continue;

      this.addSheep(sx, sy);
      return;
    }
  }

  // ==================== Cow System ====================

  /** Spawn initial cows for a new game. */
  private spawnInitialCows(): void {
    const centerX = MAP_COLS / 2;
    const centerY = MAP_ROWS / 2;
    let placed = 0;
    let attempts = 0;

    while (placed < INITIAL_COW_COUNT && attempts < 500) {
      attempts++;
      const sx = Math.floor(Math.random() * MAP_COLS);
      const sy = Math.floor(Math.random() * MAP_ROWS);

      // Skip near spawn
      if (Math.abs(sx - centerX) <= SPAWN_EXCLUSION && Math.abs(sy - centerY) <= SPAWN_EXCLUSION) {
        continue;
      }
      const key = tileKey(sx, sy);
      if (this.blockedTiles.has(key)) continue;
      if (this.waterTiles.has(key)) continue;

      this.addCow(sx, sy);
      placed++;
    }
  }

  /** Create a cow at the given tile and register it in all tracking structures. */
  private addCow(tileX: number, tileY: number): Cow {
    const cow = new Cow(tileX, tileY);
    cow.setSpriteSheet(getCowSpriteSheet());
    cow.setBlockedCheck((fromX, fromY, toX, toY) => {
      if (this.blockedTiles.has(tileKey(toX, toY))) return true;
      const ek = edgeKeyBetween(fromX, fromY, toX, toY);
      return ek !== null && this.blockedEdges.has(ek);
    });
    this.cowList.push(cow);
    const key = tileKey(tileX, tileY);
    this.cowByTile.set(key, cow);
    this.cowRegisteredTile.set(cow, key);
    this.blockedTiles.add(key);
    this.add(cow);
    return cow;
  }

  /** Remove a cow from all tracking structures and the scene. */
  private removeCow(cow: Cow): void {
    const idx = this.cowList.indexOf(cow);
    if (idx !== -1) this.cowList.splice(idx, 1);
    const registeredKey = this.cowRegisteredTile.get(cow);
    const key = registeredKey ?? tileKey(cow.tileX, cow.tileY);
    if (this.cowByTile.get(key) === cow) {
      this.cowByTile.delete(key);
    }
    this.blockedTiles.delete(key);
    this.cowRegisteredTile.delete(cow);
    // Also clean up target tile if cow was moving
    if (cow.isMoving()) {
      const targetKey = tileKey(cow.getTargetTileX(), cow.getTargetTileY());
      if (!this.cowByTile.has(targetKey)) {
        this.blockedTiles.delete(targetKey);
      }
    }
    this.remove(cow);
  }

  /** Update cow AI and tile tracking each frame. */
  private updateCows(delta: number): void {
    if (!this.player) return;

    const playerTX = this.player.getTileX();
    const playerTY = this.player.getTileY();
    const playerFacing = this.player.getFacing();

    for (const cow of this.cowList) {
      if (cow.isDead) continue;

      const currentKey = tileKey(cow.tileX, cow.tileY);
      const registeredKey = this.cowRegisteredTile.get(cow) ?? currentKey;
      if (currentKey !== registeredKey) {
        if (this.cowByTile.get(registeredKey) === cow) {
          this.cowByTile.delete(registeredKey);
          this.blockedTiles.delete(registeredKey);
        }
        this.cowByTile.set(currentKey, cow);
        this.blockedTiles.add(currentKey);
        this.cowRegisteredTile.set(cow, currentKey);
      }

      cow.updateAI(delta, playerTX, playerTY, playerFacing);

      if (cow.isMoving()) {
        const targetKey = tileKey(cow.getTargetTileX(), cow.getTargetTileY());
        this.blockedTiles.add(targetKey);
      }
    }
  }

  /** Wild spawning for cows: every 10min, if ≤ 10 cows, spawn one on a random open tile. */
  private updateCowWildSpawn(delta: number): void {
    this.cowWildSpawnTimer -= delta;
    if (this.cowWildSpawnTimer > 0) return;
    this.cowWildSpawnTimer = WILD_SPAWN_INTERVAL_MS;

    const aliveCows = this.cowList.filter((c) => !c.isDead).length;
    if (aliveCows > WILD_SPAWN_MAX_COWS) return;

    for (let attempt = 0; attempt < 50; attempt++) {
      const sx = Math.floor(Math.random() * MAP_COLS);
      const sy = Math.floor(Math.random() * MAP_ROWS);
      const key = tileKey(sx, sy);

      if (this.blockedTiles.has(key)) continue;
      if (this.waterTiles.has(key)) continue;
      if (this.player && sx === this.player.getTileX() && sy === this.player.getTileY()) continue;

      this.addCow(sx, sy);
      return;
    }
  }

  // ==================== Breeding (shared sheep + cow) ====================

  /**
   * Breeding: every 60s, detect enclosed pens containing animals.
   * Total animal count (sheep + cows) determines pen capacity.
   * Spawns same type as majority in pen (random if tied).
   */
  private updateBreeding(delta: number): void {
    this.breedingTimer -= delta;
    if (this.breedingTimer > 0) return;
    this.breedingTimer = BREEDING_INTERVAL_MS;

    // Collect positions of all living, non-following, non-moving animals
    // Track which are sheep vs cow by index
    const breedingAnimals: { x: number; y: number; kind: "sheep" | "cow" }[] = [];

    for (const s of this.sheepList) {
      if (!s.isDead && !s.following && !s.isMoving()) {
        breedingAnimals.push({ x: s.tileX, y: s.tileY, kind: "sheep" });
      }
    }
    for (const c of this.cowList) {
      if (!c.isDead && !c.following && !c.isMoving()) {
        breedingAnimals.push({ x: c.tileX, y: c.tileY, kind: "cow" });
      }
    }

    if (breedingAnimals.length < 2) return;

    // Create a copy of blockedTiles that excludes animal positions,
    // so the enclosure flood-fill can connect through animal-occupied tiles.
    const animalTileKeys = new Set<number>();
    for (const a of breedingAnimals) {
      animalTileKeys.add(tileKey(a.x, a.y));
    }
    const blockedForBreeding = new Set<number>();
    for (const bk of this.blockedTiles) {
      if (!animalTileKeys.has(bk)) {
        blockedForBreeding.add(bk);
      }
    }

    const positions = breedingAnimals.map((a) => ({ x: a.x, y: a.y }));
    const enclosures = detectBreedingEnclosures(
      positions,
      this.edgeBuildings,
      blockedForBreeding,
      this.waterTiles,
    );

    for (const enc of enclosures) {
      // Determine what kind of animals are in this enclosure
      let sheepCount = 0;
      let cowCount = 0;
      for (const idx of enc.creatureIndices) {
        if (breedingAnimals[idx].kind === "sheep") sheepCount++;
        else cowCount++;
      }

      // Find a free tile inside the enclosure
      const freeTiles: number[] = [];
      for (const tk of enc.tiles) {
        if (!this.blockedTiles.has(tk) && !this.waterTiles.has(tk)) {
          freeTiles.push(tk);
        }
      }

      if (freeTiles.length === 0) continue;

      const spawnKey = freeTiles[Math.floor(Math.random() * freeTiles.length)];
      const spawnX = spawnKey % MAP_COLS;
      const spawnY = Math.floor(spawnKey / MAP_COLS);

      // Spawn same type as majority, random if tied
      if (sheepCount > cowCount) {
        this.addSheep(spawnX, spawnY);
      } else if (cowCount > sheepCount) {
        this.addCow(spawnX, spawnY);
      } else {
        // Equal count — pick randomly
        if (Math.random() < 0.5) {
          this.addSheep(spawnX, spawnY);
        } else {
          this.addCow(spawnX, spawnY);
        }
      }
    }
  }

  // ==================== Sheep Save/Load ====================

  getSheepStates(): SheepSaveState[] {
    return this.sheepList.filter((s) => !s.isDead).map((s) => s.getState());
  }

  private restoreSheepStates(states: SheepSaveState[]): void {
    // Clear any existing sheep
    for (const sheep of this.sheepList) {
      const key = tileKey(sheep.tileX, sheep.tileY);
      if (this.sheepByTile.get(key) === sheep) {
        this.sheepByTile.delete(key);
        this.blockedTiles.delete(key);
      }
      this.remove(sheep);
    }
    this.sheepList = [];
    this.sheepByTile.clear();
    this.sheepRegisteredTile.clear();

    for (const saved of states) {
      const sheep = this.addSheep(saved.tileX, saved.tileY);
      sheep.restoreState(saved);
    }
  }

  // ==================== Cow Save/Load ====================

  getCowStates(): CowSaveState[] {
    return this.cowList.filter((c) => !c.isDead).map((c) => c.getState());
  }

  private restoreCowStates(states: CowSaveState[]): void {
    // Clear any existing cows
    for (const cow of this.cowList) {
      const key = tileKey(cow.tileX, cow.tileY);
      if (this.cowByTile.get(key) === cow) {
        this.cowByTile.delete(key);
        this.blockedTiles.delete(key);
      }
      this.remove(cow);
    }
    this.cowList = [];
    this.cowByTile.clear();
    this.cowRegisteredTile.clear();

    for (const saved of states) {
      const cow = this.addCow(saved.tileX, saved.tileY);
      cow.restoreState(saved);
    }
  }

  // ==================== NPC System ====================

  private spawnInitialNPCs(): void {
    const center = 32;
    for (const def of NPC_DEFINITIONS) {
      // Find a random walkable tile within 10 tiles of center
      let tx = center;
      let ty = center;
      for (let attempts = 0; attempts < 50; attempts++) {
        tx = center + Math.floor(Math.random() * 20) - 10;
        ty = center + Math.floor(Math.random() * 20) - 10;
        if (tx < 0 || tx >= MAP_COLS || ty < 0 || ty >= MAP_ROWS) continue;
        const k = tileKey(tx, ty);
        if (this.blockedTiles.has(k) || this.waterTiles.has(k)) continue;
        break;
      }
      this.addNPC(tx, ty, def);
    }
  }

  private addNPC(
    tileX: number,
    tileY: number,
    def: (typeof NPC_DEFINITIONS)[0],
    saved?: NPCSaveState,
  ): NPC {
    const npc = new NPC(tileX, tileY, def, saved ?? undefined);
    npc.setBlockedCheck((fromX, fromY, toX, toY) => {
      const toKey = tileKey(toX, toY);
      if (this.blockedTiles.has(toKey)) return true;
      const ek = edgeKeyBetween(fromX, fromY, toX, toY);
      return ek !== null && this.blockedEdges.has(ek);
    });
    this.npcList.push(npc);
    const key = tileKey(tileX, tileY);
    this.npcByTile.set(key, npc);
    this.npcRegisteredTile.set(npc, key);
    this.blockedTiles.add(key);
    this.add(npc);

    // Attach thought indicator as child
    const indicator = new NPCThoughtIndicator(npc);
    npc.addChild(indicator);

    // Restore bed claim if NPC has one saved
    if (npc.claimedBed) {
      this.claimedBeds.set(tileKey(npc.claimedBed.x, npc.claimedBed.y), npc.npcId);
    }

    // Update debug panel NPC list
    this.npcDebugPanel?.setNPCs(this.npcList.filter((n) => !n.isDead));

    return npc;
  }

  private removeNPC(npc: NPC): void {
    const key = this.npcRegisteredTile.get(npc);
    if (key !== undefined) {
      if (this.npcByTile.get(key) === npc) {
        this.npcByTile.delete(key);
        this.blockedTiles.delete(key);
      }
      this.npcRegisteredTile.delete(npc);
    }
    this.npcList = this.npcList.filter((n) => n !== npc);
    const controller = this.npcInFlight.get(npc.npcId);
    if (controller) {
      controller.abort();
      this.npcInFlight.delete(npc.npcId);
    }
    this.remove(npc);
  }

  private updateNPCs(_delta: number): void {
    for (const npc of this.npcList) {
      if (npc.isDead) continue;

      // Tile tracking reconciliation (same pattern as sheep)
      const currentKey = tileKey(npc.tileX, npc.tileY);
      const registeredKey = this.npcRegisteredTile.get(npc);
      if (registeredKey !== currentKey) {
        if (registeredKey !== undefined) {
          if (this.npcByTile.get(registeredKey) === npc) {
            this.npcByTile.delete(registeredKey);
            this.blockedTiles.delete(registeredKey);
          }
        }
        this.npcByTile.set(currentKey, npc);
        this.blockedTiles.add(currentKey);
        this.npcRegisteredTile.set(npc, currentKey);
      }

      // Death check
      if (npc.vitals.health <= 0) {
        npc.isDead = true;
        // Drop inventory items on the ground
        for (const item of npc.inventory.bag) {
          this.dropResourceNear(npc.tileX, npc.tileY, item);
        }
        npc.inventory.bag = [];
        this.removeNPC(npc);
        continue;
      }

      // Decision trigger — only if NPC is idle and no in-flight LLM call
      if (!npc.isBusy() && !this.npcInFlight.has(npc.npcId)) {
        // Check for pending path from move_to
        if (npc.pendingPath.length > 0) {
          const nextDir = npc.pendingPath.shift()!;
          const moved = npc.moveToTile(nextDir);
          if (!moved) {
            npc.pendingPath = []; // Path blocked, clear it
          }
          continue;
        }

        // No LLM config or no API key — random wander fallback
        if (!this.llmConfig.apiKey && this.llmConfig.provider !== "ollama") {
          this.npcFallbackWander(npc);
          continue;
        }

        // Call the LLM brain
        this.triggerNPCDecision(npc);
      }
    }
  }

  private npcFallbackWander(npc: NPC): void {
    // Simple random wander (sheep-like) — used when no LLM config is set
    npc.debugLastAction = "(no LLM — fallback wander)";
    npc.debugLastResult = "✓ fallback";
    if (Math.random() < 0.3) {
      const dirs = ["up", "down", "left", "right"] as const;
      const dir = dirs[Math.floor(Math.random() * 4)];
      npc.moveToTile(dir);
      npc.pushDebugHistory(`{"action":"move","direction":"${dir}"}`, "✓ fallback");
    } else {
      npc.startWaiting(2000 + Math.random() * 3000);
      npc.pushDebugHistory('{"action":"wait"}', "✓ fallback");
    }
  }

  private triggerNPCDecision(npc: NPC): void {
    const abortController = new AbortController();
    this.npcInFlight.set(npc.npcId, abortController);
    npc.debugThinking = true;

    const snapshot = this.getWorldSnapshotForNPC(npc);
    // Auto-complete todos whose conditions are already met
    npc.autoCheckTodos();
    // Diff visible entity states (HP changes, bush picked, etc.)
    const worldChanges = npc.diffVisibleEntities(snapshot.entities);
    const config = this.llmConfig;

    decideNextAction(npc, snapshot, config, abortController.signal)
      .then(async (action) => {
        if (npc.isDead) {
          this.npcInFlight.delete(npc.npcId);
          npc.debugThinking = false;
          return;
        }

        // Clear chat inbox since the brain has consumed them
        npc.chatInbox = [];

        // Intercept plan → route through thinking model to create todo list
        if (action.action === "plan") {
          npc.debugLastAction = '{"action":"plan"}';
          npc.debugLastResult = "⏳ Planning...";
          const todos = await thinkAboutPlan(npc, snapshot, config, abortController.signal);
          npc.todoList = todos;
          const summary = todos.map((t) => t.task).join(" → ");
          npc.debugLastResult = `✓ Plan: ${summary.slice(0, 80)}`;
          npc.pushDebugHistory('{"action":"plan"}', `✓ ${todos.length} todos`, worldChanges);
          this.npcInFlight.delete(npc.npcId);
          npc.debugThinking = false;
          return;
        }

        // Intercept think → route through thinking model
        if (action.action === "think") {
          npc.debugLastAction = '{"action":"think"}';
          npc.debugLastResult = "⏳ Thinking...";
          const answer = await thinkAboutQuestion(npc, snapshot, config, abortController.signal);
          npc.debugLastResult = `✓ Thought: ${answer.slice(0, 80)}`;
          npc.pushDebugHistory('{"action":"think"}', `✓ ${answer.slice(0, 60)}`, worldChanges);
          this.npcInFlight.delete(npc.npcId);
          npc.debugThinking = false;
          return;
        }

        // All other actions — execute normally
        const result = executeNPCAction(npc, action, this.getNPCInterface());
        const actionJson = JSON.stringify(action);
        const resultStr = result.success
          ? `✓ ${result.reason ?? "ok"}`
          : `✗ ${result.reason ?? "failed"}`;
        npc.debugLastResult = resultStr;
        npc.pushDebugHistory(actionJson, resultStr, worldChanges);
        this.npcInFlight.delete(npc.npcId);
        npc.debugThinking = false;
      })
      .catch((err: unknown) => {
        this.npcInFlight.delete(npc.npcId);
        npc.debugThinking = false;
        if (!String(err).includes("aborted")) {
          npc.debugLastResult = `✗ ${String(err)}`;
        }
      });
  }

  private getWorldSnapshotForNPC(npc: NPC): ReturnType<typeof buildWorldSnapshot> {
    const entities: EntityInfo[] = [];
    const cx = npc.tileX;
    const cy = npc.tileY;

    for (let dy = -10; dy <= 10; dy++) {
      for (let dx = -10; dx <= 10; dx++) {
        const tx = cx + dx;
        const ty = cy + dy;
        if (tx < 0 || tx >= MAP_COLS || ty < 0 || ty >= MAP_ROWS) continue;
        const key = tileKey(tx, ty);

        // Water
        if (this.waterTiles.has(key)) {
          entities.push({ type: "building", x: tx, y: ty, details: "water (drinkable)" });
        }

        // Berry bush
        const bush = this.bushByTile.get(key);
        if (bush) {
          entities.push({
            type: "bush",
            x: tx,
            y: ty,
            details: bush.canPick() ? "berry bush (has berries)" : "berry bush (no berries)",
          });
        }

        // Tree
        const tree = this.treeByTile.get(key);
        if (tree) {
          entities.push({
            type: "tree",
            x: tx,
            y: ty,
            details: tree.isChoppedDown()
              ? "stump (regrowing)"
              : `tree (HP:${tree.hp}/${tree.maxHp})`,
          });
        }

        // Rock
        const rock = this.rockByTile.get(key);
        if (rock) {
          entities.push({ type: "rock", x: tx, y: ty, details: "big rock" });
        }

        // Ground items
        const stack = this.groundItems.get(key);
        if (stack && !stack.isEmpty()) {
          const items = stack.getItems();
          const names = items.map((i) => i.name).join(", ");
          entities.push({ type: "ground_items", x: tx, y: ty, details: names });
        }

        // Building
        const building = this.buildingByTile.get(key);
        if (building) {
          let detail = `${building.type.name} (${building.state}, HP:${building.hp}/${building.type.maxHp})`;
          if (building.state === "hologram") {
            const delivered = building.materialsDelivered;
            const total = building.type.ingredients.reduce((s, i) => s + i.count, 0);
            detail += ` [${delivered}/${total} materials delivered]`;
          }
          if (building.type.storage && building.storageSlots) {
            const used = building.storageSlots.filter((s) => s !== null).length;
            const slots = building.storageSlots.length;
            detail += ` [${used}/${slots} items]`;
          }
          if (building.isBurning) detail += " [burning]";
          // Show bed/bedroll claim status
          if (building.type.id === "bed" || building.type.id === "bedroll") {
            const bedOwner = this.claimedBeds.get(key);
            if (bedOwner === npc.npcId) {
              detail += " [YOUR bed]";
            } else if (bedOwner === "__player__") {
              detail += " [claimed by player]";
            } else if (bedOwner) {
              const ownerNpc = this.npcList.find((n) => n.npcId === bedOwner);
              detail += ` [claimed by ${ownerNpc?.npcName ?? "someone"}]`;
            } else {
              detail += " [unclaimed]";
            }
          }
          entities.push({ type: "building", x: tx, y: ty, details: detail });
        }

        // Sheep
        const sheep = this.sheepByTile.get(key);
        if (sheep && !sheep.isDead) {
          entities.push({
            type: "sheep",
            x: tx,
            y: ty,
            details: `sheep (HP: ${sheep.hp}/${sheep.maxHp})`,
          });
        }

        // Cow
        const cow = this.cowByTile.get(key);
        if (cow && !cow.isDead) {
          entities.push({
            type: "cow",
            x: tx,
            y: ty,
            details: `cow (HP: ${cow.hp}/${cow.maxHp})`,
          });
        }

        // Other NPCs
        const otherNpc = this.npcByTile.get(key);
        if (otherNpc && otherNpc !== npc && !otherNpc.isDead) {
          entities.push({
            type: "npc",
            x: tx,
            y: ty,
            details: `${otherNpc.npcName} facing ${otherNpc.facing}`,
          });
        }
      }
    }

    // Player
    if (this.player) {
      const px = this.player.getTileX();
      const py = this.player.getTileY();
      if (chebyshevDistance(cx, cy, px, py) <= 10) {
        entities.push({
          type: "player",
          x: px,
          y: py,
          details: `player "${this.playerName}" facing ${this.player.getFacing()}`,
        });
      }
    }

    // Edge buildings in vision (check all edges in the range)
    for (const [edgeKey, edge] of this.edgeBuildings) {
      const decoded = decodeEdgeKey(edgeKey);
      if (!decoded) continue;
      const { x: ex2, y: ey } = decoded;
      if (chebyshevDistance(cx, cy, ex2, ey) <= 10) {
        let detail = `${edge.type.name} (${edge.state})`;
        if (edge.type.interactable) detail += edge.isOpen ? " [open]" : " [closed]";
        entities.push({ type: "edge_building", x: ex2, y: ey, details: detail });
      }
    }

    // Update NPC's object permanence with everything visible
    npc.updateKnownLocations(entities);

    return buildWorldSnapshot(entities, [...npc.chatInbox]);
  }

  private getNPCInterface(): GameWorldNPCInterface {
    return {
      getBushAt: (x, y) => this.bushByTile.get(tileKey(x, y)),
      getTreeAt: (x, y) => this.treeByTile.get(tileKey(x, y)),
      getRockAt: (x, y) => this.rockByTile.get(tileKey(x, y)),
      getGroundItemsAt: (x, y) => this.groundItems.get(tileKey(x, y)),
      getBuildingAt: (x, y) => this.buildingByTile.get(tileKey(x, y)),
      getEdgeBetween: (fromX, fromY, toX, toY) => {
        const ek = edgeKeyBetween(fromX, fromY, toX, toY);
        return ek != null ? this.edgeBuildings.get(ek) : undefined;
      },
      isWaterTile: (x, y) => this.waterTiles.has(tileKey(x, y)),
      isBlockedTile: (x, y) => this.blockedTiles.has(tileKey(x, y)),
      getPlayerInfo: () => {
        if (!this.player) return null;
        return {
          tileX: this.player.getTileX(),
          tileY: this.player.getTileY(),
          name: this.playerName,
        };
      },
      npcDropItem: (_npc, item, tx, ty) => {
        this.dropItemAt(tx, ty, item, false);
      },
      npcToggleDoor: (edge) => {
        edge.toggle();
        const ek = this.findEdgeKey(edge);
        if (ek !== null) {
          if (edge.isSolid()) {
            this.blockedEdges.add(ek);
          } else {
            this.blockedEdges.delete(ek);
          }
        }
        this.recalculateIndoorLighting();
      },
      npcToggleTileDoor: (building) => {
        building.toggle();
        const k = tileKey(building.tileX, building.tileY);
        if (building.isSolid()) {
          this.blockedTiles.add(k);
        } else {
          this.blockedTiles.delete(k);
        }
      },
      npcChat: (npc2, text, mode) => {
        const msg: ChatMessage = {
          sender: npc2.npcName,
          text,
          tileX: npc2.tileX,
          tileY: npc2.tileY,
          mode,
          timestamp: Date.now(),
        };
        this.chatMessages.push(msg);
        this.chatLog?.scrollToBottom();
        new SpeechBubble(msg.text, npc2, msg.mode);
        // Add to sender's own chat history so they remember what they said
        npc2.pushChatHistory(msg);
        this.distributeMessageToNPCs(msg, npc2);
      },
      npcPlaceBuilding: (buildingId, x, y, rotation, orientation) => {
        const buildType = BUILDING_TYPE_MAP[buildingId];
        if (!buildType) return false;

        // Edge buildings (walls, fences, doors) use orientation (N/E/S/W)
        if (buildType.placement === "edge") {
          const dir = (orientation ?? "N") as import("../systems/edge-key.ts").EdgeOrientation;
          const ek = edgeKeyFromTileAndDir(x, y, dir);
          if (ek == null) return false;
          if (this.edgeBuildings.has(ek)) return false;
          const edge = new EdgeBuilding(buildType, ek, "hologram");
          edge.onDestroy = () => {
            this.edgeBuildings.delete(ek);
            this.blockedEdges.delete(ek);
            this.edgeBuildingsList = this.edgeBuildingsList.filter((e) => e !== edge);
            this.recalculateIndoorLighting();
          };
          this.edgeBuildingsList.push(edge);
          this.edgeBuildings.set(ek, edge);
          if (edge.isSolid()) this.blockedEdges.add(ek);
          this.add(edge);
          return true;
        }

        // Tile buildings (beds, fires, boxes, floors)
        const k = tileKey(x, y);
        if (this.blockedTiles.has(k) || this.waterTiles.has(k)) return false;
        if (this.buildingByTile.has(k)) return false;
        const building = new Building(buildType, x, y, "hologram", rotation);
        building.onDestroy = () => this.removeBuilding(building, k);
        building.onFireStateChange = () => this.recalculateIndoorLighting();
        this.buildings.push(building);
        this.buildingByTile.set(k, building);
        this.add(building);
        return true;
      },
      dropResourceNear: (cx2, cy2, item) => {
        this.dropResourceNear(cx2, cy2, item);
      },
      findPathDirections: (fromX, fromY, toX, toY) => {
        const path = findPath(fromX, fromY, toX, toY, (fx, fy, tx, ty) => {
          const k = tileKey(tx, ty);
          if (this.blockedTiles.has(k)) return true;
          const ek = edgeKeyBetween(fx, fy, tx, ty);
          return ek !== null && this.blockedEdges.has(ek);
        });
        if (!path || path.length === 0) return null;
        // Convert tile positions to directions
        const dirs: import("../actors/player.ts").Direction[] = [];
        let px = fromX;
        let py = fromY;
        for (const step of path) {
          if (step.x < px) dirs.push("left");
          else if (step.x > px) dirs.push("right");
          else if (step.y < py) dirs.push("up");
          else dirs.push("down");
          px = step.x;
          py = step.y;
        }
        return dirs;
      },
      isBedClaimed: (x, y) => {
        return this.claimedBeds.has(tileKey(x, y));
      },
      claimBed: (npc2, x, y) => {
        const k = tileKey(x, y);
        if (this.claimedBeds.has(k)) return false;
        this.claimedBeds.set(k, npc2.npcId);
        return true;
      },
      npcAttackAt: (npc2, x, y) => {
        const key = tileKey(x, y);
        const mainHand = npc2.inventory.equipment[EquipmentSlot.MainHand];
        const canonical = mainHand ? ITEMS[mainHand.id] : null;
        const baseDamage = canonical ? (canonical.stats.attack ?? 0) : 1; // UNARMED_DAMAGE = 1

        // Attack sheep
        const sheep = this.sheepByTile.get(key);
        if (sheep && !sheep.isDead) {
          const mult = canonical?.toolMultipliers?.creature ?? 1;
          const damage = baseDamage * mult;
          const drops = sheep.takeDamage(damage);
          for (const drop of drops) {
            this.dropResourceNear(sheep.tileX, sheep.tileY, drop);
          }
          if (sheep.isDead) this.removeSheep(sheep);
          return;
        }

        // Attack cow
        const cow = this.cowByTile.get(key);
        if (cow && !cow.isDead) {
          const mult = canonical?.toolMultipliers?.creature ?? 1;
          const damage = baseDamage * mult;
          const drops = cow.takeDamage(damage);
          for (const drop of drops) {
            this.dropResourceNear(cow.tileX, cow.tileY, drop);
          }
          if (cow.isDead) this.removeCow(cow);
          return;
        }

        // Degrade weapon durability
        if (mainHand && mainHand.durability != null) {
          mainHand.durability -= 1;
          if (mainHand.durability <= 0) {
            npc2.inventory.equipment[EquipmentSlot.MainHand] = null;
            npc2.refreshSprite();
          }
        }
      },
    };
  }

  private findEdgeKey(edge: EdgeBuilding): number | null {
    for (const [key, e] of this.edgeBuildings) {
      if (e === edge) return key;
    }
    return null;
  }

  private distributeMessageToNPCs(msg: ChatMessage, sender: NPC | null): void {
    for (const npc of this.npcList) {
      if (npc === sender) continue;
      if (npc.isDead) continue;
      const dist = chebyshevDistance(msg.tileX, msg.tileY, npc.tileX, npc.tileY);
      if (dist <= CHAT_MODE_RADIUS[msg.mode]) {
        npc.chatInbox.push(msg);
        npc.pushChatHistory(msg);
      }
    }
  }

  // ==================== NPC Save/Load ====================

  getPlayerName(): string {
    return this.playerName;
  }

  getPlayerClaimedBed(): { x: number; y: number } | undefined {
    for (const [key, owner] of this.claimedBeds) {
      if (owner === "__player__") {
        const x = key % 64;
        const y = Math.floor(key / 64);
        return { x, y };
      }
    }
    return undefined;
  }

  getNPCStates(): NPCSaveState[] {
    return this.npcList.filter((n) => !n.isDead).map((n) => n.getState());
  }

  private clearAllNPCs(): void {
    // Abort all in-flight LLM calls
    for (const controller of this.npcInFlight.values()) {
      controller.abort();
    }
    this.npcInFlight.clear();

    // Remove all NPC actors from the scene
    for (const npc of this.npcList) {
      const key = tileKey(npc.tileX, npc.tileY);
      if (this.npcByTile.get(key) === npc) {
        this.npcByTile.delete(key);
        this.blockedTiles.delete(key);
      }
      this.remove(npc);
    }
    this.npcList = [];
    this.npcByTile.clear();
    this.npcRegisteredTile.clear();
    this.claimedBeds.clear();
  }

  private restoreNPCStates(states: NPCSaveState[]): void {
    for (const saved of states) {
      // Find matching definition for the NPC ID
      const def = NPC_DEFINITIONS.find((d) => d.npcId === saved.npcId);
      if (!def) continue;
      this.addNPC(saved.tileX, saved.tileY, def, saved);
    }
  }
}
