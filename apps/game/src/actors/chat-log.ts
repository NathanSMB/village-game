import * as ex from "excalibur";
import { type ChatMessage, CHAT_MODE_COLORS } from "../types/chat.ts";

const LOG_WIDTH = 280;
const LINE_HEIGHT = 12;
const MAX_LINES = 10; // max visible lines (wrapped)
const PADDING_X = 6;
const PADDING_Y = 4;
const BORDER_RADIUS = 4;
const TIMESTAMP_W = 46;
const TEXT_X = PADDING_X + TIMESTAMP_W;
const MAX_TEXT_W = LOG_WIDTH - PADDING_X * 2 - TIMESTAMP_W;

/**
 * Always-visible screen element that shows a character's personal chat log.
 * Messages wrap instead of truncating so the full text is visible.
 */
export class ChatLog extends ex.ScreenElement {
  private source: () => ChatMessage[];
  private uiScale: number;

  /** How many messages to scroll back from the newest. 0 = bottom. */
  scrollOffset = 0;

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
      height: Math.round((MAX_LINES * LINE_HEIGHT + PADDING_Y * 2) * uiScale),
      cache: false,
      draw: (ctx) => this.drawLog(ctx),
    });
    this.graphics.use(canvas);
  }

  scrollUp(): boolean {
    const total = this.source().length;
    if (this.scrollOffset < total - 1) {
      this.scrollOffset++;
      return true;
    }
    return false;
  }

  scrollDown(): boolean {
    if (this.scrollOffset > 0) {
      this.scrollOffset--;
      return true;
    }
    return false;
  }

  scrollToBottom(): void {
    this.scrollOffset = 0;
  }

  private drawLog(ctx: CanvasRenderingContext2D): void {
    ctx.scale(this.uiScale, this.uiScale);
    ctx.font = "10px monospace";

    const messages = this.source();
    const now = Date.now();
    const total = messages.length;
    if (total === 0) return;

    // Clamp scroll
    if (this.scrollOffset >= total) this.scrollOffset = total - 1;

    // Build wrapped lines from messages (newest first, then reverse for display)
    // Each "display line" = { text, color, alpha, isFirstLine, timeStr }
    interface DisplayLine {
      text: string;
      color: string;
      alpha: number;
      timeStr: string;
      isFirstLine: boolean;
    }

    const allLines: DisplayLine[] = [];
    // Process messages from newest to oldest, starting from scrollOffset
    for (let mi = total - 1 - this.scrollOffset; mi >= 0; mi--) {
      const msg = messages[mi];
      const age = now - msg.timestamp;
      const fadeStart = 240_000;
      const fadeEnd = 300_000;
      let alpha = 1;
      if (age > fadeStart) {
        alpha = Math.max(0, 1 - (age - fadeStart) / (fadeEnd - fadeStart));
      }

      const date = new Date(msg.timestamp);
      const hh = String(date.getHours()).padStart(2, "0");
      const mm = String(date.getMinutes()).padStart(2, "0");
      const timeStr = `[${hh}:${mm}]`;

      const color = CHAT_MODE_COLORS[msg.mode];
      const fullText = `${msg.sender}: ${msg.text}`;

      // Word-wrap the text
      const wrapped = wrapText(ctx, fullText, MAX_TEXT_W);
      // Add lines in reverse order (we'll reverse the whole array later)
      for (let li = wrapped.length - 1; li >= 0; li--) {
        allLines.push({
          text: wrapped[li],
          color,
          alpha,
          timeStr: li === 0 ? timeStr : "",
          isFirstLine: li === 0,
        });
      }

      if (allLines.length >= MAX_LINES) break;
    }

    // Reverse so oldest is at top, newest at bottom
    allLines.reverse();

    // Take only the last MAX_LINES
    const display = allLines.slice(-MAX_LINES);

    const hasOlder = this.scrollOffset < total - 1 && allLines.length >= MAX_LINES;
    const hasNewer = this.scrollOffset > 0;

    const panelH = display.length * LINE_HEIGHT + PADDING_Y * 2;

    // Background
    ctx.fillStyle = "rgba(10, 10, 20, 0.6)";
    roundRect(ctx, 0, 0, LOG_WIDTH, panelH, BORDER_RADIUS);
    ctx.fill();

    ctx.font = "10px monospace";
    ctx.textBaseline = "top";

    for (let i = 0; i < display.length; i++) {
      const line = display[i];
      const y = PADDING_Y + i * LINE_HEIGHT;

      // Timestamp (only on first line of a message)
      if (line.timeStr) {
        ctx.globalAlpha = line.alpha * 0.5;
        ctx.fillStyle = "#888888";
        ctx.fillText(line.timeStr, PADDING_X, y);
      }

      // Message text
      ctx.globalAlpha = line.alpha;
      ctx.fillStyle = line.color;
      ctx.fillText(line.text, TEXT_X, y);
    }

    ctx.globalAlpha = 1;

    // Scroll indicators
    ctx.font = "9px monospace";
    ctx.fillStyle = "#666666";
    ctx.textAlign = "right";
    if (hasOlder) {
      ctx.textBaseline = "top";
      ctx.fillText("\u25b2 more", LOG_WIDTH - PADDING_X, 2);
    }
    if (hasNewer) {
      ctx.textBaseline = "bottom";
      ctx.fillText("\u25bc more", LOG_WIDTH - PADDING_X, panelH - 2);
    }
    ctx.textAlign = "left";
  }
}

/** Word-wrap text to fit within maxWidth pixels. */
function wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let currentLine = "";

  for (const word of words) {
    const testLine = currentLine ? `${currentLine} ${word}` : word;
    if (ctx.measureText(testLine).width > maxWidth && currentLine) {
      lines.push(currentLine);
      currentLine = word;
    } else {
      currentLine = testLine;
    }
  }
  if (currentLine) lines.push(currentLine);
  return lines.length > 0 ? lines : [""];
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
