import * as ex from "excalibur";
import type { CharacterAppearance } from "../types/character.ts";
import type { InventoryState } from "../types/inventory.ts";
import { isAlive } from "../types/vitals.ts";
import { Player } from "../actors/player.ts";
import { VitalsHud } from "../actors/vitals-hud.ts";
import { wasActionPressed } from "../systems/keybinds.ts";
import type { SaveData } from "../systems/save-manager.ts";
import { getGrassAnimations } from "../systems/sprite-loader.ts";
import type { DeathCause } from "./game-over.ts";

const MAP_COLS = 64;
const MAP_ROWS = 64;
const TILE_SIZE = 32;

export type GameWorldData =
  | { type: "new"; appearance: CharacterAppearance }
  | { type: "load"; save: SaveData };

export class GameWorld extends ex.Scene<GameWorldData> {
  private tilemap!: ex.TileMap;
  private player: Player | null = null;
  private hud: VitalsHud | null = null;

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
      this.add(this.player);

      this.hud = new VitalsHud(() => this.player!.vitals);
      this.add(this.hud);
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

  getPlayerInventory(): InventoryState | null {
    return this.player?.inventory ?? null;
  }

  getPlayer(): Player | null {
    return this.player;
  }
}
