import * as ex from "excalibur";

const BAR_HEIGHT = 3;
const BORDER = 1;

/** Returns a color that transitions green -> yellow -> orange -> red as health decreases. */
function getHealthColor(ratio: number): string {
  if (ratio > 0.75) return "#22cc22";
  if (ratio > 0.5) return "#cccc22";
  if (ratio > 0.25) return "#cc8822";
  return "#cc2222";
}

/**
 * A small health bar rendered as a child actor above a damageable entity.
 * Only visible when the parent's `shouldShow` predicate returns true.
 */
export class HealthBar extends ex.Actor {
  private barWidth: number;
  private canvas: ex.Canvas;
  private getHealth: () => { current: number; max: number };
  private shouldShow: () => boolean;

  constructor(options: {
    barWidth?: number;
    offsetY?: number;
    getHealth: () => { current: number; max: number };
    shouldShow: () => boolean;
  }) {
    const barWidth = options.barWidth ?? 20;
    const totalW = barWidth + BORDER * 2;
    const totalH = BAR_HEIGHT + BORDER * 2;

    super({
      anchor: ex.vec(0.5, 0.5),
      pos: ex.vec(0, options.offsetY ?? -18),
      width: totalW,
      height: totalH,
      z: 2, // above damage flash overlay
    });

    this.barWidth = barWidth;
    this.getHealth = options.getHealth;
    this.shouldShow = options.shouldShow;

    this.canvas = new ex.Canvas({
      width: totalW,
      height: totalH,
      cache: false,
      draw: (ctx) => this.drawBar(ctx),
    });

    this.graphics.use(this.canvas);
    this.graphics.opacity = 0;
  }

  private drawBar(ctx: CanvasRenderingContext2D): void {
    const { current, max } = this.getHealth();
    const ratio = Math.max(0, Math.min(1, current / max));
    const totalW = this.barWidth + BORDER * 2;
    const totalH = BAR_HEIGHT + BORDER * 2;

    // Black border / background
    ctx.fillStyle = "#000000";
    ctx.fillRect(0, 0, totalW, totalH);

    // Dark fill for the empty portion
    ctx.fillStyle = "#1a1a1a";
    ctx.fillRect(BORDER, BORDER, this.barWidth, BAR_HEIGHT);

    // Colored fill for current health
    const fillW = Math.round(ratio * this.barWidth);
    if (fillW > 0) {
      ctx.fillStyle = getHealthColor(ratio);
      ctx.fillRect(BORDER, BORDER, fillW, BAR_HEIGHT);
    }
  }

  override onPreUpdate(_engine: ex.Engine, _delta: number): void {
    this.graphics.opacity = this.shouldShow() ? 1 : 0;
  }
}
