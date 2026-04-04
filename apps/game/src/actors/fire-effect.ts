import * as ex from "excalibur";

const TILE = 32;

// Fire color palette
const FIRE_RED = "#cc3300";
const FIRE_ORANGE = "#ff6600";
const FIRE_YELLOW = "#ffcc00";
const FIRE_WHITE = "#ffffcc";
const EMBER_RED = "#991100";

/**
 * Animated procedural fire effect rendered as a child actor.
 * Attach to a Building via `addChild()` — inherits parent position.
 */
export class FireEffect extends ex.Actor {
  private phase = Math.random() * Math.PI * 2; // random start for variety

  constructor() {
    super({
      pos: ex.vec(0, 0),
      width: TILE,
      height: TILE,
      anchor: ex.vec(0.5, 0.5),
      z: 6, // just above tile buildings (z=5), same as edges
    });

    const effect = this;
    const canvas = new ex.Canvas({
      width: TILE,
      height: TILE,
      cache: false, // redraws each frame for animation
      draw: (ctx) => {
        effect.drawFire(ctx);
      },
    });
    this.graphics.use(canvas);
  }

  override onPreUpdate(_engine: ex.Engine, delta: number): void {
    this.phase += delta * 0.005;
  }

  private drawFire(ctx: CanvasRenderingContext2D): void {
    ctx.imageSmoothingEnabled = false;
    const cx = TILE / 2;
    const baseY = TILE / 2 + 4; // bottom of flames, offset down from center

    // Ember glow at base
    ctx.fillStyle = EMBER_RED;
    ctx.beginPath();
    ctx.ellipse(cx, baseY + 1, 5, 2, 0, 0, Math.PI * 2);
    ctx.fill();

    // Flame columns
    const columns = [
      { x: -4, seed: 0 },
      { x: -1, seed: 1.7 },
      { x: 2, seed: 3.1 },
      { x: 5, seed: 4.8 },
    ];

    for (const col of columns) {
      const x = cx + col.x;
      // Height oscillates between 6-14 px
      const h = 10 + Math.sin(this.phase * 3.5 + col.seed) * 4;
      const flicker = Math.sin(this.phase * 6 + col.seed * 1.3);

      // Base (red)
      const baseH = Math.ceil(h * 0.35);
      ctx.fillStyle = FIRE_RED;
      ctx.fillRect(x, baseY - baseH, 2, baseH);

      // Middle (orange)
      const midBottom = baseY - baseH;
      const midH = Math.ceil(h * 0.35);
      ctx.fillStyle = FIRE_ORANGE;
      ctx.fillRect(x, midBottom - midH, 2, midH);

      // Upper (yellow)
      const upperBottom = midBottom - midH;
      const upperH = Math.ceil(h * 0.2);
      ctx.fillStyle = FIRE_YELLOW;
      ctx.fillRect(x + (flicker > 0 ? 0 : 1), upperBottom - upperH, 1, upperH);

      // Tip (white, 1px)
      const tipY = upperBottom - upperH - 1;
      ctx.fillStyle = FIRE_WHITE;
      ctx.fillRect(x + (flicker > 0 ? 1 : 0), tipY, 1, 1);
    }

    // Orange glow around base
    ctx.fillStyle = "rgba(255, 102, 0, 0.15)";
    ctx.beginPath();
    ctx.ellipse(cx, baseY, 8, 4, 0, 0, Math.PI * 2);
    ctx.fill();

    // Occasional sparks
    const sparkPhase1 = Math.sin(this.phase * 7.3);
    const sparkPhase2 = Math.sin(this.phase * 5.1 + 2);

    if (sparkPhase1 > 0.6) {
      ctx.fillStyle = FIRE_YELLOW;
      const sparkX = cx + Math.sin(this.phase * 4) * 5;
      const sparkY = baseY - 14 - Math.sin(this.phase * 3) * 3;
      ctx.fillRect(Math.round(sparkX), Math.round(sparkY), 1, 1);
    }

    if (sparkPhase2 > 0.7) {
      ctx.fillStyle = FIRE_ORANGE;
      const sparkX = cx + Math.cos(this.phase * 3.5) * 4;
      const sparkY = baseY - 12 - Math.cos(this.phase * 2.5) * 2;
      ctx.fillRect(Math.round(sparkX), Math.round(sparkY), 1, 1);
    }
  }
}
