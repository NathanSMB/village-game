import * as ex from "excalibur";
import { type ChatMessage, CHAT_MODE_COLORS } from "../types/chat.ts";

const LOG_WIDTH = 280;
const LINE_HEIGHT = 14;
const MAX_VISIBLE = 6;
const PADDING_X = 6;
const PADDING_Y = 4;
const BORDER_RADIUS = 4;

/**
 * Always-visible screen element that shows a character's personal chat log.
 * Messages were already proximity-filtered at send time, so this just renders
 * whatever is in the array.
 */
export class ChatLog extends ex.ScreenElement {
  private source: () => ChatMessage[];
  private uiScale: number;

  constructor(source: () => ChatMessage[], uiScale: number, yOffset: number) {
    super({
      pos: ex.vec(8 * uiScale, yOffset),
      z: 95,
      anchor: ex.vec(0, 1), // anchor bottom-left so it grows upward
    });
    this.source = source;
    this.uiScale = uiScale;

    const canvas = new ex.Canvas({
      width: Math.round(LOG_WIDTH * uiScale),
      height: Math.round((MAX_VISIBLE * LINE_HEIGHT + PADDING_Y * 2) * uiScale),
      cache: false,
      draw: (ctx) => this.drawLog(ctx),
    });
    this.graphics.use(canvas);
  }

  private drawLog(ctx: CanvasRenderingContext2D): void {
    ctx.scale(this.uiScale, this.uiScale);

    const messages = this.source();
    const now = Date.now();

    if (messages.length === 0) return;

    // Take last MAX_VISIBLE messages
    const display = messages.slice(-MAX_VISIBLE);

    const panelH = display.length * LINE_HEIGHT + PADDING_Y * 2;

    // Semi-transparent background
    ctx.fillStyle = "rgba(10, 10, 20, 0.6)";
    roundRect(ctx, 0, 0, LOG_WIDTH, panelH, BORDER_RADIUS);
    ctx.fill();

    ctx.font = "10px monospace";
    ctx.textBaseline = "top";

    for (let i = 0; i < display.length; i++) {
      const msg = display[i];
      const age = now - msg.timestamp;
      // Fade messages that are older than 4 minutes (240s)
      const fadeStart = 240_000;
      const fadeEnd = 300_000; // 5 min expiry
      let alpha = 1;
      if (age > fadeStart) {
        alpha = Math.max(0, 1 - (age - fadeStart) / (fadeEnd - fadeStart));
      }

      // Timestamp
      const date = new Date(msg.timestamp);
      const hh = String(date.getHours()).padStart(2, "0");
      const mm = String(date.getMinutes()).padStart(2, "0");
      const timeStr = `[${hh}:${mm}]`;

      const y = PADDING_Y + i * LINE_HEIGHT;

      // Draw timestamp in dim color
      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = "#888888";
      ctx.fillText(timeStr, PADDING_X, y);

      // Draw sender + message in mode color
      ctx.globalAlpha = alpha;
      ctx.fillStyle = CHAT_MODE_COLORS[msg.mode];
      const senderText = `${msg.sender}: ${msg.text}`;
      // Truncate if too long
      const maxTextW = LOG_WIDTH - PADDING_X * 2 - 46; // ~46px for timestamp
      let truncated = senderText;
      if (ctx.measureText(truncated).width > maxTextW) {
        while (truncated.length > 0 && ctx.measureText(truncated + "...").width > maxTextW) {
          truncated = truncated.slice(0, -1);
        }
        truncated += "...";
      }
      ctx.fillText(truncated, PADDING_X + 46, y);
    }

    ctx.globalAlpha = 1;
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
