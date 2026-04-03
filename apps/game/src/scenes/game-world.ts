import * as ex from "excalibur";
import type { CharacterAppearance } from "../types/character.ts";
import type { InventoryState } from "../types/inventory.ts";
import { isAlive } from "../types/vitals.ts";
import { Player } from "../actors/player.ts";
import { BerryBush } from "../actors/berry-bush.ts";
import { FloatingText } from "../actors/floating-text.ts";
import { VitalsHud } from "../actors/vitals-hud.ts";
import { wasActionPressed } from "../systems/keybinds.ts";
import type { BerryBushSaveState, SaveData } from "../systems/save-manager.ts";
import { getGrassAnimations } from "../systems/sprite-loader.ts";
import type { DeathCause } from "./game-over.ts";

const MAP_COLS = 64;
const MAP_ROWS = 64;
const TILE_SIZE = 32;
const BUSH_COUNT = 25;
const SPAWN_EXCLUSION = 3; // No bushes within N tiles of center spawn

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
  private blockedTiles = new Set<number>();
  private actionPrompt: ex.Label | null = null;

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

    const grassAnims = getGrassAnimations();

    for (let i = 0; i < MAP_COLS * MAP_ROWS; i++) {
      const tile = this.tilemap.getTileByIndex(i);
      if (!tile) continue;
      const idx = Math.floor(seededRandom() * grassAnims.length);
      tile.addGraphic(grassAnims[idx].clone());
    }

    this.add(this.tilemap);

    // Spawn berry bushes at seeded random positions
    const centerX = MAP_COLS / 2;
    const centerY = MAP_ROWS / 2;
    let placed = 0;

    while (placed < BUSH_COUNT) {
      const bx = Math.floor(seededRandom() * MAP_COLS);
      const by = Math.floor(seededRandom() * MAP_ROWS);

      // Skip tiles near spawn and duplicates
      if (Math.abs(bx - centerX) <= SPAWN_EXCLUSION && Math.abs(by - centerY) <= SPAWN_EXCLUSION) {
        continue;
      }
      const key = tileKey(bx, by);
      if (this.blockedTiles.has(key)) continue;

      const bush = new BerryBush(bx, by);
      this.bushes.push(bush);
      this.bushByTile.set(key, bush);
      this.blockedTiles.add(key);
      this.add(bush);
      placed++;
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

    // Action prompt + berry bush interaction
    if (this.player && !this.player.isPicking()) {
      const facing = this.player.getFacingTile();
      const bush = this.bushByTile.get(tileKey(facing.x, facing.y));

      if (bush?.canPick()) {
        // Show prompt above the bush
        if (this.actionPrompt) {
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

  getPlayerInventory(): InventoryState | null {
    return this.player?.inventory ?? null;
  }

  getPlayer(): Player | null {
    return this.player;
  }
}
