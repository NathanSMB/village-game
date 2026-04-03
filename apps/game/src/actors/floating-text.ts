import * as ex from "excalibur";

const FLOAT_DURATION = 1000;
const FLOAT_DISTANCE = 24;

export class FloatingText extends ex.Actor {
  private elapsed = 0;
  private startY: number;
  private label: ex.Label;

  constructor(text: string, x: number, y: number) {
    super({
      pos: ex.vec(x, y),
      z: 60,
      anchor: ex.vec(0.5, 1),
    });
    this.startY = y;

    this.label = new ex.Label({
      text,
      font: new ex.Font({
        family: "monospace",
        size: 14,
        bold: true,
        color: ex.Color.White,
        textAlign: ex.TextAlign.Center,
        baseAlign: ex.BaseAlign.Bottom,
        shadow: { offset: ex.vec(1, 1), color: ex.Color.Black },
      }),
    });
    this.graphics.use(this.label.graphics.current!);
  }

  override onPreUpdate(_engine: ex.Engine, delta: number): void {
    this.elapsed += delta;
    const t = Math.min(this.elapsed / FLOAT_DURATION, 1);
    this.pos.y = this.startY - FLOAT_DISTANCE * t;
    this.graphics.opacity = 1 - t;
    if (t >= 1) {
      this.kill();
    }
  }
}
