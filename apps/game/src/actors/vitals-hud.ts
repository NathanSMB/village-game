import * as ex from "excalibur";
import type { VitalsState } from "../types/vitals.ts";

const BAR_W = 120;
const BAR_H = 10;
const BAR_GAP = 4;
const LABEL_W = 14;
const CANVAS_W = LABEL_W + BAR_W + 4;
const CANVAS_H = 3 * BAR_H + 2 * BAR_GAP;

interface BarDef {
  label: string;
  key: keyof VitalsState;
  fg: string;
  bg: string;
}

const BARS: BarDef[] = [
  { label: "H", key: "health", fg: "#cc3333", bg: "#441111" },
  { label: "F", key: "hunger", fg: "#cc8833", bg: "#442211" },
  { label: "W", key: "thirst", fg: "#3388cc", bg: "#112244" },
];

export class VitalsHud extends ex.ScreenElement {
  private vitalsSource: () => VitalsState;

  constructor(vitalsSource: () => VitalsState) {
    super({ pos: ex.vec(8, 8), z: 100, anchor: ex.vec(0, 0) });
    this.vitalsSource = vitalsSource;

    const canvas = new ex.Canvas({
      width: CANVAS_W,
      height: CANVAS_H,
      cache: false, // re-draw every frame so bars update
      draw: (ctx) => this.drawBars(ctx),
    });

    this.graphics.use(canvas);
  }

  private drawBars(ctx: CanvasRenderingContext2D): void {
    const vitals = this.vitalsSource();

    ctx.font = "bold 10px monospace";
    ctx.textBaseline = "middle";

    for (let i = 0; i < BARS.length; i++) {
      const bar = BARS[i];
      const y = i * (BAR_H + BAR_GAP);
      const value = vitals[bar.key];
      const fillW = (value / 100) * BAR_W;
      const barX = LABEL_W;

      // Label
      ctx.fillStyle = "#ffffff";
      ctx.fillText(bar.label, 0, y + BAR_H / 2 + 1);

      // Background
      ctx.fillStyle = bar.bg;
      ctx.fillRect(barX, y, BAR_W, BAR_H);

      // Foreground fill
      if (fillW > 0) {
        ctx.fillStyle = bar.fg;
        ctx.fillRect(barX, y, fillW, BAR_H);
      }
    }
  }
}
