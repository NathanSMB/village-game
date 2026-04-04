import * as ex from "excalibur";

const EFFECT_DURATION = 300; // ms
const TILE_SIZE = 32;

type AttackStyle = "swing" | "thrust";
type Direction = "down" | "up" | "left" | "right";

/**
 * Visual "air rush" effect that appears on the attacked tile.
 * - Swing: curved arc lines showing the sweep of the weapon
 * - Thrust: straight streak lines showing the forward jab
 * Fades out over EFFECT_DURATION and self-destructs.
 */
export class AttackEffect extends ex.Actor {
  private elapsed = 0;
  private style: AttackStyle;
  private dir: Direction;

  constructor(tileX: number, tileY: number, style: AttackStyle, dir: Direction) {
    super({
      pos: ex.vec(tileX * TILE_SIZE + TILE_SIZE / 2, tileY * TILE_SIZE + TILE_SIZE / 2),
      width: TILE_SIZE,
      height: TILE_SIZE,
      anchor: ex.vec(0.5, 0.5),
      z: 50,
    });
    this.style = style;
    this.dir = dir;

    const canvas = new ex.Canvas({
      width: TILE_SIZE,
      height: TILE_SIZE,
      draw: (ctx) => this.drawEffect(ctx),
      filtering: ex.ImageFiltering.Pixel,
    });
    this.graphics.use(canvas);
  }

  private drawEffect(ctx: CanvasRenderingContext2D): void {
    const t = Math.min(this.elapsed / EFFECT_DURATION, 1);
    const alpha = 0.7 * (1 - t);
    const spread = t * 6; // lines spread out over time

    ctx.save();
    ctx.translate(TILE_SIZE / 2, TILE_SIZE / 2);

    if (this.style === "swing") {
      this.drawSwingEffect(ctx, alpha, spread, t);
    } else {
      this.drawThrustEffect(ctx, alpha, spread, t);
    }

    ctx.restore();
  }

  private drawSwingEffect(
    ctx: CanvasRenderingContext2D,
    alpha: number,
    spread: number,
    t: number,
  ): void {
    // Rotate canvas so the arc opens AWAY from the player
    // Default arc opens to the right (+X direction)
    const rotations: Record<Direction, number> = {
      right: 0,
      down: Math.PI / 2,
      left: Math.PI,
      up: -Math.PI / 2,
    };
    ctx.rotate(rotations[this.dir]);

    // Draw 3 arc lines sweeping across
    for (let i = 0; i < 3; i++) {
      const offset = (i - 1) * (3 + spread);
      const lineAlpha = alpha * (1 - i * 0.2);
      ctx.strokeStyle = `rgba(220, 235, 255, ${lineAlpha})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(0, -2 + offset * 0.3, 8 + i * 3 + spread, -0.8 + t * 0.3, 0.8 + t * 0.3);
      ctx.stroke();
    }

    // Small white streak particles
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.6})`;
    const particleSpread = t * 10;
    ctx.fillRect(-6 - particleSpread, -1, 2, 1);
    ctx.fillRect(5 + particleSpread, 2, 2, 1);
    ctx.fillRect(-3, -5 - particleSpread * 0.5, 1, 2);
  }

  private drawThrustEffect(
    ctx: CanvasRenderingContext2D,
    alpha: number,
    spread: number,
    t: number,
  ): void {
    // Rotate canvas so the arrow points AWAY from the player
    // Default arrow points up (-Y direction)
    const rotations: Record<Direction, number> = {
      up: 0,
      right: Math.PI / 2,
      down: Math.PI,
      left: -Math.PI / 2,
    };
    ctx.rotate(rotations[this.dir]);

    // Draw straight streak lines pointing in attack direction
    const extension = t * 8;

    for (let i = 0; i < 4; i++) {
      const xOff = (i - 1.5) * (2 + spread * 0.4);
      const lineAlpha = alpha * (1 - Math.abs(i - 1.5) * 0.2);
      ctx.strokeStyle = `rgba(220, 235, 255, ${lineAlpha})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(xOff, -4 - extension);
      ctx.lineTo(xOff, 6 + extension * 0.5);
      ctx.stroke();
    }

    // Arrow-head / point at the front
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.8})`;
    ctx.beginPath();
    ctx.moveTo(0, -8 - extension);
    ctx.lineTo(-3 - spread * 0.3, -2 - extension * 0.5);
    ctx.lineTo(3 + spread * 0.3, -2 - extension * 0.5);
    ctx.closePath();
    ctx.fill();
  }

  override onPreUpdate(_engine: ex.Engine, delta: number): void {
    this.elapsed += delta;
    if (this.elapsed >= EFFECT_DURATION) {
      this.kill();
    }
  }
}
