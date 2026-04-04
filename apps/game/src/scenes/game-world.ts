import * as ex from "excalibur";
import type { CharacterAppearance } from "../types/character.ts";
import type { InventoryState } from "../types/inventory.ts";
import { EquipmentSlot, type Item } from "../types/item.ts";
import { isAlive } from "../types/vitals.ts";
import { Player } from "../actors/player.ts";
import { BerryBush } from "../actors/berry-bush.ts";
import { BigRock } from "../actors/big-rock.ts";
import { Tree } from "../actors/tree.ts";
import { GroundItemStack } from "../actors/ground-item-stack.ts";
import { FloatingText } from "../actors/floating-text.ts";
import { AttackEffect } from "../actors/attack-effect.ts";
import { VitalsHud } from "../actors/vitals-hud.ts";
import { wasActionPressed } from "../systems/keybinds.ts";
import { ITEMS } from "../data/items.ts";
import { BUILDING_TYPES, BUILDING_TYPE_MAP, type BuildingType } from "../data/buildings.ts";
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
  SaveData,
} from "../systems/save-manager.ts";
import {
  getGrassAnimations,
  getWaterAnimation,
  getSheepSpriteSheet,
  WaterTileType,
} from "../systems/sprite-loader.ts";
import type { WaterTileTypeValue } from "../systems/sprite-loader.ts";
import type { DeathCause } from "./game-over.ts";
import { IndoorDarknessOverlay } from "../systems/indoor-lighting.ts";
import { Sheep } from "../actors/sheep.ts";
import { detectBreedingEnclosures } from "../systems/enclosure.ts";

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
const BREEDING_INTERVAL_MS = 60_000; // 60 seconds
const WILD_SPAWN_INTERVAL_MS = 600_000; // 10 minutes
const WILD_SPAWN_MAX_SHEEP = 10; // Only wild spawn when ≤ 10 sheep alive

export type GameWorldData =
  | { type: "new"; appearance: CharacterAppearance }
  | { type: "load"; save: SaveData };

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
  private itemPickerLabels: ex.Label[] = [];
  private itemPickerBg: ex.Actor | null = null;

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
    { type: BuildingType; x: number; y: number; actor: ex.Actor }
  >();
  private plannedEdges = new Map<
    number,
    { type: BuildingType; edgeKey: number; axis: EdgeAxis; x: number; y: number; actor: ex.Actor }
  >();
  private planEdgeOrientation: EdgeOrientation = "N";
  private planRadiusOverlay: ex.Actor | null = null;
  private planMenuPanel: ex.ScreenElement | null = null;
  private planPlayerTileX = 0;
  private planPlayerTileY = 0;

  override onInitialize(): void {
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

      this.dropItemAt(sx, sy, { ...ITEMS["small_rock"] });
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

      this.hud = new VitalsHud(() => this.player!.vitals);
      this.add(this.hud);

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

      // Recalculate indoor lighting after restoring buildings
      this.recalculateIndoorLighting();
    }

    if (this.player) {
      this.camera.clearAllStrategies();
      this.camera.strategy.lockToActor(this.player);
      const mapBounds = new ex.BoundingBox(0, 0, MAP_COLS * TILE_SIZE, MAP_ROWS * TILE_SIZE);
      this.camera.strategy.limitCameraBounds(mapBounds);
    }
  }

  override onPreUpdate(engine: ex.Engine, delta: number): void {
    const kb = engine.input.keyboard;

    // Planning mode input handling
    if (this.planningMode) {
      this.handlePlanningInput(kb);
      return; // Block all other input while planning
    }

    // Item picker overlay input handling
    if (this.itemPickerOpen) {
      if (wasActionPressed(kb, "moveUp")) {
        this.itemPickerIndex = Math.max(0, this.itemPickerIndex - 1);
        this.updateItemPicker();
      }
      if (wasActionPressed(kb, "moveDown")) {
        this.itemPickerIndex = Math.min(this.itemPickerItems.length - 1, this.itemPickerIndex + 1);
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

    // Tree branch dropping
    this.updateTreeBranchDrops();

    // Sheep AI, breeding, and wild spawning
    this.updateSheep(delta);
    this.updateBreeding(delta);
    this.updateWildSpawn(delta);

    if (wasActionPressed(kb, "pause")) {
      void engine.goToScene("pause-menu");
    }
    if (wasActionPressed(kb, "inventory")) {
      void engine.goToScene("inventory");
    }
    if (this.player && !this.player.isBusy() && !this.player.isMoving()) {
      if (wasActionPressed(kb, "build")) {
        this.enterPlanningMode();
      }
    }

    if (this.player && !isAlive(this.player.vitals)) {
      const cause = this.getDeathCause();
      void engine.goToScene("game-over", { sceneActivationData: { cause } });
    }

    // Attack handling
    if (this.player && !this.player.isBusy() && !this.player.isMoving()) {
      if (wasActionPressed(kb, "attack")) {
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
        const weapon = this.player.inventory.equipment[EquipmentSlot.MainHand];
        // Always look up the canonical item definition for stats and multipliers
        // so that old saves with stale item copies still work correctly.
        const canonical = weapon ? (ITEMS[weapon.id] ?? weapon) : null;
        const baseDamage = canonical ? (canonical.stats.attack ?? 0) : UNARMED_DAMAGE;
        const facingKey = tileKey(facing.x, facing.y);

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

        // Edge-based building construction / repair / damage (walls, fences)
        const playerTX = this.player!.getTileX();
        const playerTY = this.player!.getTileY();
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
      }
    }

    // Action prompt + interaction
    if (this.player && !this.player.isBusy() && !this.player.isMoving()) {
      const facing = this.player.getFacingTile();
      const facingKey = tileKey(facing.x, facing.y);
      const bush = this.bushByTile.get(facingKey);
      const facingWater = this.waterTiles.has(facingKey);
      const groundStack = this.groundItems.get(facingKey);
      const hasGroundItems = groundStack && !groundStack.isEmpty();
      const facingSheep = this.sheepByTile.get(facingKey);
      const hasSheep = facingSheep && !facingSheep.isDead;

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
        } else {
          // Tile-based building interaction (floors don't have doors, but keep for extensibility)
          const facingBuilding = this.buildingByTile.get(facingKey);
          if (
            facingBuilding &&
            facingBuilding.type.interactable &&
            facingBuilding.state === "complete"
          ) {
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

  getPlayerState(): SaveData["player"] | null {
    if (!this.player) return null;
    return {
      tileX: this.player.getTileX(),
      tileY: this.player.getTileY(),
      appearance: this.player.appearance,
      equipment: this.player.inventory.equipment,
      bag: this.player.inventory.bag,
      maxWeight: this.player.inventory.maxWeight,
      vitals: this.player.vitals,
    };
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

  /** Update branch counts and process pending drops for all trees. */
  private updateTreeBranchDrops(): void {
    for (const tree of this.trees) {
      if (tree.isChoppedDown()) continue; // Stumps don't drop branches

      // Recount branches around this tree (handles picked-up branches)
      tree.branchCount = this.countBranchesAroundTree(tree);

      if (tree.consumePendingDrop()) {
        this.tryDropBranch(tree);
      }
    }
  }

  /** Count how many branches exist in tiles adjacent to a tree. */
  private countBranchesAroundTree(tree: Tree): number {
    let count = 0;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const tx = tree.tileX + dx;
        const ty = tree.tileY + dy;
        if (tx < 0 || tx >= MAP_COLS || ty < 0 || ty >= MAP_ROWS) continue;
        const key = tileKey(tx, ty);
        const stack = this.groundItems.get(key);
        if (stack && !stack.isEmpty()) {
          const items = stack.getItems();
          if (items.some((item) => item.id === "branch")) {
            count++;
          }
        }
      }
    }
    return count;
  }

  /** Attempt to drop a branch on a random valid adjacent tile. */
  private tryDropBranch(tree: Tree): void {
    if (tree.branchCount >= 3) return;

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
    tree.branchCount++;
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
  dropItemAt(tx: number, ty: number, item: Item): void {
    const key = tileKey(tx, ty);
    let stack = this.groundItems.get(key);
    if (!stack) {
      stack = new GroundItemStack(tx, ty);
      this.groundItems.set(key, stack);
      this.add(stack);
    }
    stack.addItem(item);
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
        currentPlayer.inventory.bag.push(item);
        this.spawnPickupText(`+[${item.name}]`, worldX, worldY);
      }
    }, 700); // Slightly before animation ends
  }

  // ==================== Item Picker Overlay ====================

  private openItemPicker(
    stack: GroundItemStack,
    key: number,
    worldX: number,
    worldY: number,
  ): void {
    this.itemPickerOpen = true;
    this.itemPickerItems = stack.getItems();
    this.itemPickerIndex = 0;
    this.itemPickerTileKey = key;

    // Lock player input while picker is open
    this.player?.lockInput();

    // Hide action prompt
    if (this.actionPrompt) this.actionPrompt.graphics.visible = false;

    // Create background
    const bgHeight = Math.min(this.itemPickerItems.length, 5) * 20 + 12;
    this.itemPickerBg = new ex.Actor({
      pos: ex.vec(worldX, worldY - TILE_SIZE / 2 - bgHeight - 4),
      width: 140,
      height: bgHeight,
      anchor: ex.vec(0.5, 0),
      z: 100,
    });
    this.itemPickerBg.graphics.use(
      new ex.Rectangle({
        width: 140,
        height: bgHeight,
        color: ex.Color.fromRGB(20, 20, 30, 0.9),
      }),
    );
    this.add(this.itemPickerBg);

    // Create item labels
    const maxVisible = Math.min(this.itemPickerItems.length, 5);
    for (let i = 0; i < maxVisible; i++) {
      const label = new ex.Label({
        text: "",
        pos: ex.vec(worldX - 60, worldY - TILE_SIZE / 2 - bgHeight + i * 20 + 2),
        z: 101,
        font: new ex.Font({
          family: "monospace",
          size: 12,
          color: ex.Color.White,
          textAlign: ex.TextAlign.Left,
          baseAlign: ex.BaseAlign.Top,
        }),
      });
      this.add(label);
      this.itemPickerLabels.push(label);
    }

    this.updateItemPicker();
  }

  private updateItemPicker(): void {
    const maxVisible = this.itemPickerLabels.length;
    for (let i = 0; i < maxVisible; i++) {
      const label = this.itemPickerLabels[i];
      if (i < this.itemPickerItems.length) {
        const item = this.itemPickerItems[i];
        const selected = i === this.itemPickerIndex;
        label.text = selected ? `> ${item.name}` : `  ${item.name}`;
        label.color = selected ? ex.Color.fromHex("#f0c040") : ex.Color.White;
        label.font.bold = selected;
      } else {
        label.text = "";
      }
    }
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
        currentPlayer.inventory.bag.push(item);
        this.spawnPickupText(`+[${item.name}]`, worldX, worldY);
      }
    }, 700);
  }

  private closeItemPicker(): void {
    this.itemPickerOpen = false;
    this.itemPickerItems = [];
    this.itemPickerIndex = 0;

    // Unlock player input
    this.player?.unlockInput();

    // Clean up UI
    if (this.itemPickerBg) {
      this.remove(this.itemPickerBg);
      this.itemPickerBg = null;
    }
    for (const label of this.itemPickerLabels) {
      this.remove(label);
    }
    this.itemPickerLabels = [];
  }

  // ==================== Ground Item Save/Load ====================

  getGroundItemStates(): GroundItemSaveState[] {
    const states: GroundItemSaveState[] = [];
    for (const stack of this.groundItems.values()) {
      if (!stack.isEmpty()) {
        states.push({
          tileX: stack.tileX,
          tileY: stack.tileY,
          items: stack.getItems(),
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
      for (const item of saved.items) {
        this.dropItemAt(saved.tileX, saved.tileY, item);
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
      // Spawn tile-based buildings (floors) as holograms
      for (const planned of this.plannedBuildings.values()) {
        const building = new Building(planned.type, planned.x, planned.y, "hologram");
        building.onDestroy = () => this.removeBuilding(building, tileKey(planned.x, planned.y));
        this.buildings.push(building);
        this.buildingByTile.set(tileKey(planned.x, planned.y), building);
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

      // Rotate edge orientation
      if (wasActionPressed(kb, "rotate") && this.selectedBuildType?.placement === "edge") {
        const cycle: EdgeOrientation[] = ["N", "E", "S", "W"];
        const idx = cycle.indexOf(this.planEdgeOrientation);
        this.planEdgeOrientation = cycle[(idx + 1) % 4];
        this.planCursor?.setOrientation(this.planEdgeOrientation);
        this.updateCursorValidity();
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
    ghost.graphics.use(buildingGraphic(this.selectedBuildType.id, "ghost"));
    ghost.graphics.opacity = 0.4;
    this.add(ghost);

    this.plannedBuildings.set(key, {
      type: this.selectedBuildType,
      x: this.planCursorX,
      y: this.planCursorY,
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
    // Can't place on blocked tiles (trees, rocks, bushes, water, other buildings)
    if (this.blockedTiles.has(key)) return false;
    if (this.waterTiles.has(key)) return false;
    // Can't place on existing buildings (including holograms)
    if (this.buildingByTile.has(key)) return false;
    // Can't place on already-planned tiles
    if (this.plannedBuildings.has(key)) return false;
    // Can't place on player's tile
    if (this.player && tx === this.player.getTileX() && ty === this.player.getTileY()) return false;
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
      x: 8,
      y: 40,
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
      width: w,
      height: h,
      cache: false,
      draw: (ctx) => {
        ctx.imageSmoothingEnabled = false;

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

  // ==================== Building Management (tile-based) ====================

  private removeBuilding(building: Building, key: number): void {
    this.blockedTiles.delete(key);
    this.buildingByTile.delete(key);
    const idx = this.buildings.indexOf(building);
    if (idx !== -1) this.buildings.splice(idx, 1);
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

    for (const saved of states) {
      const type = BUILDING_TYPE_MAP[saved.typeId];
      if (!type) continue;
      // Only restore tile-based buildings (floors); skip old wall/fence entries
      if (type.placement !== "tile") continue;

      const building = new Building(type, saved.tileX, saved.tileY, saved.state);
      building.restoreState(saved);
      building.onDestroy = () => this.removeBuilding(building, tileKey(saved.tileX, saved.tileY));

      const key = tileKey(saved.tileX, saved.tileY);
      this.buildings.push(building);
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

  /** Breeding: every 60s, spawn new sheep in qualifying enclosures. */
  private updateBreeding(delta: number): void {
    this.breedingTimer -= delta;
    if (this.breedingTimer > 0) return;
    this.breedingTimer = BREEDING_INTERVAL_MS;

    // Collect positions of living, non-following sheep
    const breedingSheep: { x: number; y: number; idx: number }[] = [];
    for (let i = 0; i < this.sheepList.length; i++) {
      const s = this.sheepList[i];
      if (!s.isDead && !s.following && !s.isMoving()) {
        breedingSheep.push({ x: s.tileX, y: s.tileY, idx: i });
      }
    }

    if (breedingSheep.length < 2) return;

    // Create a copy of blockedTiles that excludes sheep positions,
    // so the enclosure flood-fill can connect through sheep-occupied tiles.
    const sheepTileKeys = new Set<number>();
    for (const s of breedingSheep) {
      sheepTileKeys.add(tileKey(s.x, s.y));
    }
    const blockedForBreeding = new Set<number>();
    for (const bk of this.blockedTiles) {
      if (!sheepTileKeys.has(bk)) {
        blockedForBreeding.add(bk);
      }
    }

    const positions = breedingSheep.map((s) => ({ x: s.x, y: s.y }));
    const enclosures = detectBreedingEnclosures(
      positions,
      this.edgeBuildings,
      blockedForBreeding,
      this.waterTiles,
    );

    for (const enc of enclosures) {
      // Find a free tile inside the enclosure to spawn on (exclude sheep + other blocked)
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
      this.addSheep(spawnX, spawnY);
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
}
