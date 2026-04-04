import * as ex from "excalibur";

const TILE_SIZE = 32;

/**
 * Grid-aligned cursor used during planning mode.
 * Shows green when placement is valid, red when invalid.
 */
export class PlanCursor extends ex.Actor {
  private valid = true;
  private currentGraphic: ex.Canvas;

  constructor(tileX: number, tileY: number) {
    super({
      pos: ex.vec(tileX * TILE_SIZE + TILE_SIZE / 2, tileY * TILE_SIZE + TILE_SIZE / 2),
      width: TILE_SIZE,
      height: TILE_SIZE,
      anchor: ex.vec(0.5, 0.5),
      z: 8,
    });

    this.currentGraphic = this.createGraphic(true);
    this.graphics.use(this.currentGraphic);
  }

  private createGraphic(valid: boolean): ex.Canvas {
    return new ex.Canvas({
      width: TILE_SIZE,
      height: TILE_SIZE,
      cache: false,
      draw: (ctx) => {
        ctx.imageSmoothingEnabled = false;
        const fill = valid ? "rgba(0, 200, 80, 0.3)" : "rgba(200, 40, 40, 0.3)";
        const border = valid ? "rgba(0, 255, 100, 0.8)" : "rgba(255, 50, 50, 0.8)";

        ctx.fillStyle = fill;
        ctx.fillRect(0, 0, TILE_SIZE, TILE_SIZE);

        ctx.strokeStyle = border;
        ctx.lineWidth = 2;
        ctx.strokeRect(1, 1, TILE_SIZE - 2, TILE_SIZE - 2);

        // Corner accents
        ctx.strokeStyle = border;
        ctx.lineWidth = 2;
        const c = 6;
        // Top-left
        ctx.beginPath();
        ctx.moveTo(1, c);
        ctx.lineTo(1, 1);
        ctx.lineTo(c, 1);
        ctx.stroke();
        // Top-right
        ctx.beginPath();
        ctx.moveTo(TILE_SIZE - c, 1);
        ctx.lineTo(TILE_SIZE - 1, 1);
        ctx.lineTo(TILE_SIZE - 1, c);
        ctx.stroke();
        // Bottom-left
        ctx.beginPath();
        ctx.moveTo(1, TILE_SIZE - c);
        ctx.lineTo(1, TILE_SIZE - 1);
        ctx.lineTo(c, TILE_SIZE - 1);
        ctx.stroke();
        // Bottom-right
        ctx.beginPath();
        ctx.moveTo(TILE_SIZE - c, TILE_SIZE - 1);
        ctx.lineTo(TILE_SIZE - 1, TILE_SIZE - 1);
        ctx.lineTo(TILE_SIZE - 1, TILE_SIZE - c);
        ctx.stroke();
      },
    });
  }

  /** Move cursor to a tile position. */
  moveTo(tileX: number, tileY: number): void {
    this.pos.x = tileX * TILE_SIZE + TILE_SIZE / 2;
    this.pos.y = tileY * TILE_SIZE + TILE_SIZE / 2;
  }

  /** Set whether the current position is a valid placement. */
  setValid(valid: boolean): void {
    if (valid !== this.valid) {
      this.valid = valid;
      this.currentGraphic = this.createGraphic(valid);
      this.graphics.use(this.currentGraphic);
    }
  }
}
