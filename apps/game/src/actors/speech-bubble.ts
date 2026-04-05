import * as ex from "excalibur";
import { type ChatMode, CHAT_MODE_COLORS } from "../types/chat.ts";

/** Display duration per chat mode (ms). */
const MODE_DURATION: Record<ChatMode, number> = {
  whisper: 4000,
  talk: 6000,
  yell: 8000,
};

/** Font size per chat mode. */
const MODE_FONT_SIZE: Record<ChatMode, number> = {
  whisper: 8,
  talk: 10,
  yell: 12,
};

/** Fade-out starts this many ms before the bubble expires. */
const FADE_LEAD_MS = 2000;

const PADDING_X = 6;
const PADDING_Y = 4;
const POINTER_H = 5;
const BORDER_RADIUS = 4;
const MAX_BUBBLE_WIDTH = 160;
/** Vertical offset above the parent actor's origin. */
const FOLLOW_OFFSET_Y = 20;

/**
 * World-space speech bubble that appears above an entity.
 * Added as a **child** of the speaker actor so it inherits the parent's
 * transform and moves perfectly in sync — no jitter from velocity
 * interpolation mismatches.
 */
export class SpeechBubble extends ex.Actor {
  private elapsed = 0;
  private duration: number;
  private mode: ChatMode;
  private text: string;

  constructor(text: string, parent: ex.Actor, mode: ChatMode) {
    // Position is relative to the parent actor
    super({
      pos: ex.vec(0, -FOLLOW_OFFSET_Y),
      z: 65,
      anchor: ex.vec(0.5, 1),
    });
    this.text = text;
    this.mode = mode;
    this.duration = MODE_DURATION[mode];

    // Attach as a child so we inherit the parent's world transform
    parent.addChild(this);

    this.rebuildGraphic();
  }

  private rebuildGraphic(): void {
    const fontSize = MODE_FONT_SIZE[this.mode];
    const bold = this.mode === "yell";
    const color = CHAT_MODE_COLORS[this.mode];

    // Measure text to size the bubble
    const measureCanvas = document.createElement("canvas");
    const mCtx = measureCanvas.getContext("2d")!;
    mCtx.font = `${bold ? "bold " : ""}${fontSize}px monospace`;

    // Word-wrap text into lines
    const lines = wrapText(mCtx, this.text, MAX_BUBBLE_WIDTH - PADDING_X * 2);
    const lineHeight = fontSize + 3;
    const textWidth = Math.min(
      MAX_BUBBLE_WIDTH - PADDING_X * 2,
      Math.max(...lines.map((l) => mCtx.measureText(l).width)),
    );

    const bubbleW = Math.ceil(textWidth + PADDING_X * 2);
    const bubbleH = Math.ceil(lines.length * lineHeight + PADDING_Y * 2);
    const totalH = bubbleH + POINTER_H;

    const canvas = new ex.Canvas({
      width: bubbleW,
      height: totalH,
      cache: true,
      draw: (ctx) => {
        // Draw bubble body
        ctx.fillStyle = "rgba(10, 10, 20, 0.85)";
        ctx.strokeStyle = color;
        ctx.lineWidth = 1;

        roundRect(ctx, 0, 0, bubbleW, bubbleH, BORDER_RADIUS);
        ctx.fill();
        ctx.stroke();

        // Draw pointer triangle
        const cx = bubbleW / 2;
        ctx.beginPath();
        ctx.moveTo(cx - 4, bubbleH);
        ctx.lineTo(cx, bubbleH + POINTER_H);
        ctx.lineTo(cx + 4, bubbleH);
        ctx.closePath();
        ctx.fillStyle = "rgba(10, 10, 20, 0.85)";
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.stroke();

        // Patch the gap between bubble and pointer
        ctx.fillStyle = "rgba(10, 10, 20, 0.85)";
        ctx.fillRect(cx - 3, bubbleH - 1, 6, 2);

        // Draw text
        ctx.font = `${bold ? "bold " : ""}${fontSize}px monospace`;
        ctx.fillStyle = color;
        ctx.textBaseline = "top";
        ctx.textAlign = "left";

        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i], PADDING_X, PADDING_Y + i * lineHeight);
        }
      },
    });

    this.graphics.use(canvas);
  }

  override onPostUpdate(_engine: ex.Engine, delta: number): void {
    this.elapsed += delta;
    const remaining = this.duration - this.elapsed;

    if (remaining <= 0) {
      this.parent?.removeChild(this);
      this.kill();
      return;
    }

    // Fade out during the last FADE_LEAD_MS
    if (remaining < FADE_LEAD_MS) {
      this.graphics.opacity = remaining / FADE_LEAD_MS;
    }
  }
}

/** Draw a rounded rectangle path. */
function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

/** Word-wrap text into lines that fit within maxWidth. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const test = current ? `${current} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && current) {
      lines.push(current);
      current = word;
    } else {
      current = test;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}
