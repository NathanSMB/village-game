import * as ex from "excalibur";
import type { CharacterAppearance } from "../types/character.ts";
import type { InventoryState } from "../types/inventory.ts";
import type { Item } from "../types/item.ts";
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
import type {
  BerryBushSaveState,
  GroundItemSaveState,
  TreeSaveState,
  SaveData,
} from "../systems/save-manager.ts";
import { getGrassAnimations, getWaterAnimation, WaterTileType } from "../systems/sprite-loader.ts";
import type { WaterTileTypeValue } from "../systems/sprite-loader.ts";
import type { DeathCause } from "./game-over.ts";

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
      this.player.setBlockedCheck((tx, ty) => this.blockedTiles.has(tileKey(tx, ty)));
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

      // Restore ground item states from save
      if (context.data.type === "load" && context.data.save.groundItems) {
        this.restoreGroundItemStates(context.data.save.groundItems);
      }
    }

    if (this.player) {
      this.camera.clearAllStrategies();
      this.camera.strategy.lockToActor(this.player);
      const mapBounds = new ex.BoundingBox(0, 0, MAP_COLS * TILE_SIZE, MAP_ROWS * TILE_SIZE);
      this.camera.strategy.limitCameraBounds(mapBounds);
    }
  }

  override onPreUpdate(engine: ex.Engine): void {
    const kb = engine.input.keyboard;

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

    if (wasActionPressed(kb, "pause")) {
      void engine.goToScene("pause-menu");
    }
    if (wasActionPressed(kb, "inventory")) {
      void engine.goToScene("inventory");
    }

    if (this.player && !isAlive(this.player.vitals)) {
      const cause = this.getDeathCause();
      void engine.goToScene("game-over", { sceneActivationData: { cause } });
    }

    // Attack handling
    if (this.player && !this.player.isBusy() && !this.player.isMoving()) {
      if (wasActionPressed(kb, "attack")) {
        const style = this.player.startAttack();
        if (style) {
          const facing = this.player.getFacingTile();
          this.add(new AttackEffect(facing.x, facing.y, style, this.player.getFacing()));
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
        if (this.actionPrompt) {
          this.actionPrompt.graphics.visible = false;
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

  /** Update branch counts and process pending drops for all trees. */
  private updateTreeBranchDrops(): void {
    for (const tree of this.trees) {
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
}
