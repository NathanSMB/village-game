import * as ex from "excalibur";

const EFFECT_DURATION = 300; // ms
const CANVAS_SIZE = 64; // larger than a tile so the effect doesn't clip at edges

type AttackStyle = "swing" | "thrust" | "shoot";
type Direction = "down" | "up" | "left" | "right";

/**
 * Visual "air rush" effect that appears near the attacked tile.
 * - Swing: curved arc lines showing the sweep of the weapon
 * - Thrust: straight streak lines showing the forward jab
 * Uses a 64×64 canvas so arcs/lines aren't clipped at the edges.
 * Fades out over EFFECT_DURATION and self-destructs.
 */
export class AttackEffect extends ex.Actor {
  private elapsed = 0;
  private style: AttackStyle;
  private dir: Direction;

  constructor(worldX: number, worldY: number, style: AttackStyle, dir: Direction) {
    super({
      pos: ex.vec(worldX, worldY),
      anchor: ex.vec(0.5, 0.5),
      z: 50,
    });
    this.style = style;
    this.dir = dir;

    const canvas = new ex.Canvas({
      width: CANVAS_SIZE,
      height: CANVAS_SIZE,
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
    ctx.translate(CANVAS_SIZE / 2, CANVAS_SIZE / 2);

    if (this.style === "swing") {
      this.drawSwingEffect(ctx, alpha, spread, t);
    } else if (this.style === "thrust") {
      this.drawThrustEffect(ctx, alpha, spread, t);
    } else {
      this.drawShootEffect(ctx, alpha, spread, t);
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

  private drawShootEffect(
    ctx: CanvasRenderingContext2D,
    alpha: number,
    _spread: number,
    t: number,
  ): void {
    // Small string-release puff at the player's position
    const rotations: Record<Direction, number> = {
      up: 0,
      right: Math.PI / 2,
      down: Math.PI,
      left: -Math.PI / 2,
    };
    ctx.rotate(rotations[this.dir]);

    // Two small horizontal lines representing the bowstring snapping back
    const snap = t * 6;
    ctx.strokeStyle = `rgba(255, 255, 240, ${alpha * 0.8})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-3 - snap, 2);
    ctx.lineTo(3 + snap, 2);
    ctx.stroke();

    // Small puff particles
    ctx.fillStyle = `rgba(255, 255, 255, ${alpha * 0.5})`;
    ctx.fillRect(-1, -2 - t * 4, 2, 1);
    ctx.fillRect(-2 - snap * 0.5, 1, 1, 1);
    ctx.fillRect(2 + snap * 0.5, 1, 1, 1);
  }

  override onPreUpdate(_engine: ex.Engine, delta: number): void {
    this.elapsed += delta;
    if (this.elapsed >= EFFECT_DURATION) {
      this.kill();
    }
  }
}
