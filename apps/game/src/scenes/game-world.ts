import * as ex from "excalibur";
import type { CharacterAppearance } from "../types/character.ts";
import { Player } from "../actors/player.ts";
import { wasActionPressed } from "../systems/keybinds.ts";
import type { SaveData } from "../systems/save-manager.ts";
import { getGrassAnimations } from "../systems/sprite-loader.ts";

const MAP_COLS = 64;
const MAP_ROWS = 64;
const TILE_SIZE = 32;

export type GameWorldData =
  | { type: "new"; appearance: CharacterAppearance }
  | { type: "load"; save: SaveData };

export class GameWorld extends ex.Scene<GameWorldData> {
  private tilemap!: ex.TileMap;
  private player: Player | null = null;

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

      let appearance: CharacterAppearance;
      let startX: number;
      let startY: number;

      if (context.data.type === "new") {
        appearance = context.data.appearance;
        startX = (MAP_COLS / 2) * TILE_SIZE + TILE_SIZE / 2;
        startY = (MAP_ROWS / 2) * TILE_SIZE + TILE_SIZE / 2;
      } else {
        appearance = context.data.save.player.appearance;
        startX = context.data.save.player.tileX * TILE_SIZE + TILE_SIZE / 2;
        startY = context.data.save.player.tileY * TILE_SIZE + TILE_SIZE / 2;
      }

      this.player = new Player(appearance, ex.vec(startX, startY));
      this.add(this.player);
    }

    if (this.player) {
      this.camera.clearAllStrategies();
      this.camera.strategy.lockToActor(this.player);
      const mapBounds = new ex.BoundingBox(0, 0, MAP_COLS * TILE_SIZE, MAP_ROWS * TILE_SIZE);
      this.camera.strategy.limitCameraBounds(mapBounds);
    }
  }

  override onPreUpdate(engine: ex.Engine): void {
    if (wasActionPressed(engine.input.keyboard, "pause")) {
      void engine.goToScene("pause-menu");
    }
  }

  getPlayerState(): SaveData["player"] | null {
    if (!this.player) return null;
    return {
      tileX: this.player.getTileX(),
      tileY: this.player.getTileY(),
      appearance: this.player.appearance,
    };
  }
}
