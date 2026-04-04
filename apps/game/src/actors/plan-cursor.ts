import * as ex from "excalibur";
import type { EdgeOrientation } from "../systems/edge-key.ts";

const TILE_SIZE = 32;
const WALL_THICKNESS = 8;

/**
 * Grid-aligned cursor used during planning mode.
 * Shows green when placement is valid, red when invalid.
 * Supports two modes: tile mode (full tile highlight) and edge mode
 * (thin bar on one side of the tile).
 */
export class PlanCursor extends ex.Actor {
  private valid = true;
  private edgeMode = false;
  private orientation: EdgeOrientation = "N";
  private currentGraphic: ex.Canvas;

  constructor(tileX: number, tileY: number) {
    super({
      pos: ex.vec(tileX * TILE_SIZE + TILE_SIZE / 2, tileY * TILE_SIZE + TILE_SIZE / 2),
      width: TILE_SIZE,
      height: TILE_SIZE,
      anchor: ex.vec(0.5, 0.5),
      z: 8,
    });

    this.currentGraphic = this.createGraphic();
    this.graphics.use(this.currentGraphic);
  }

  private createGraphic(): ex.Canvas {
    const valid = this.valid;
    const edgeMode = this.edgeMode;
    const orient = this.orientation;

    return new ex.Canvas({
      width: TILE_SIZE,
      height: TILE_SIZE,
      cache: false,
      draw: (ctx) => {
        ctx.imageSmoothingEnabled = false;
        const fill = valid ? "rgba(0, 200, 80, 0.3)" : "rgba(200, 40, 40, 0.3)";
        const border = valid ? "rgba(0, 255, 100, 0.8)" : "rgba(255, 50, 50, 0.8)";
        const edgeFill = valid ? "rgba(0, 255, 100, 0.5)" : "rgba(255, 50, 50, 0.5)";

        if (edgeMode) {
          // Draw a subtle tile outline
          ctx.strokeStyle = valid ? "rgba(0, 200, 80, 0.15)" : "rgba(200, 40, 40, 0.15)";
          ctx.lineWidth = 1;
          ctx.strokeRect(0.5, 0.5, TILE_SIZE - 1, TILE_SIZE - 1);

          // Draw the highlighted edge bar
          ctx.fillStyle = edgeFill;
          ctx.strokeStyle = border;
          ctx.lineWidth = 2;
          const t = WALL_THICKNESS;
          const half = t / 2;
          switch (orient) {
            case "N":
              ctx.fillRect(0, -half, TILE_SIZE, t);
              ctx.strokeRect(0, -half, TILE_SIZE, t);
              break;
            case "S":
              ctx.fillRect(0, TILE_SIZE - half, TILE_SIZE, t);
              ctx.strokeRect(0, TILE_SIZE - half, TILE_SIZE, t);
              break;
            case "W":
              ctx.fillRect(-half, 0, t, TILE_SIZE);
              ctx.strokeRect(-half, 0, t, TILE_SIZE);
              break;
            case "E":
              ctx.fillRect(TILE_SIZE - half, 0, t, TILE_SIZE);
              ctx.strokeRect(TILE_SIZE - half, 0, t, TILE_SIZE);
              break;
          }
        } else {
          // Full-tile highlight (unchanged from original)
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
        }
      },
    });
  }

  private refresh(): void {
    this.currentGraphic = this.createGraphic();
    this.graphics.use(this.currentGraphic);
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
      this.refresh();
    }
  }

  /** Enable or disable edge placement mode. */
  setEdgeMode(enabled: boolean): void {
    if (enabled !== this.edgeMode) {
      this.edgeMode = enabled;
      this.refresh();
    }
  }

  /** Set the edge orientation (N/E/S/W). */
  setOrientation(dir: EdgeOrientation): void {
    if (dir !== this.orientation) {
      this.orientation = dir;
      this.refresh();
    }
  }
}
