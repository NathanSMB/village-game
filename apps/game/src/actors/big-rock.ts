import * as ex from "excalibur";
import { getRockBigAnimation } from "../systems/sprite-loader.ts";

const TILE_SIZE = 32;

export class BigRock extends ex.Actor {
  readonly tileX: number;
  readonly tileY: number;

  constructor(tileX: number, tileY: number) {
    const px = tileX * TILE_SIZE + TILE_SIZE / 2;
    const py = tileY * TILE_SIZE + TILE_SIZE / 2;
    super({
      pos: ex.vec(px, py),
      width: TILE_SIZE,
      height: TILE_SIZE,
      anchor: ex.vec(0.5, 0.5),
      z: 5,
    });
    this.tileX = tileX;
    this.tileY = tileY;
    this.graphics.use(getRockBigAnimation());
  }
}
