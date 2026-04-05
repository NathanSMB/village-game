/**
 * NPC Debug Inspector Panel
 *
 * A ScreenElement overlay toggled with the backtick (`) key.
 * Shows per-NPC debug state: action, vitals, last LLM response, memory, history.
 * Cycle through NPCs with Left/Right arrow keys while panel is open.
 */

import * as ex from "excalibur";
import type { NPC } from "./npc.ts";

const W = 340;
const H = 460;
const PAD = 10;
const LINE = 13;
const SECTION_GAP = 8;
const BG = "rgba(8,8,18,0.92)";
const BORDER = "#334466";
const HEAD_COLOR = "#88aaff";
const LABEL_COLOR = "#667799";
const VALUE_COLOR = "#ddddee";
const OK_COLOR = "#44dd88";
const ERR_COLOR = "#ff6655";
const DIM_COLOR = "#445566";

function truncate(s: string, max: number): string {
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function vitalsBar(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  label: string,
  value: number,
  max: number,
  color: string,
): void {
  const BAR_W = 80;
  const BAR_H = 7;
  ctx.fillStyle = LABEL_COLOR;
  ctx.font = `9px monospace`;
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(label, x, y + BAR_H / 2);

  // Background
  ctx.fillStyle = "#1a1a2e";
  ctx.fillRect(x + 20, y, BAR_W, BAR_H);

  // Fill
  ctx.fillStyle = color;
  ctx.fillRect(x + 20, y, BAR_W * Math.max(0, Math.min(1, value / max)), BAR_H);

  // Value text
  ctx.fillStyle = VALUE_COLOR;
  ctx.textAlign = "right";
  ctx.fillText(`${Math.round(value)}`, x + 20 + BAR_W + 26, y + BAR_H / 2);
}

export class NPCDebugPanel extends ex.ScreenElement {
  private npcs: NPC[] = [];
  private selectedIndex = 0;
  private canvas: ex.Canvas;

  constructor(screenWidth: number, screenHeight: number) {
    super({
      x: screenWidth - W - 8,
      y: (screenHeight - H) / 2,
      z: 300,
      anchor: ex.vec(0, 0),
    });

    this.canvas = new ex.Canvas({
      width: W,
      height: H,
      cache: false,
      draw: (ctx) => this.draw(ctx),
    });
    this.graphics.use(this.canvas);
  }

  setNPCs(npcs: NPC[]): void {
    this.npcs = npcs;
    this.selectedIndex = Math.min(this.selectedIndex, Math.max(0, npcs.length - 1));
  }

  cycleNPC(dir: number): void {
    if (this.npcs.length === 0) return;
    this.selectedIndex = (this.selectedIndex + dir + this.npcs.length) % this.npcs.length;
  }

  private draw(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, W, H);

    // Background
    ctx.fillStyle = BG;
    ctx.beginPath();
    ctx.roundRect(0, 0, W, H, 6);
    ctx.fill();
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(0.5, 0.5, W - 1, H - 1, 6);
    ctx.stroke();

    if (this.npcs.length === 0) {
      ctx.fillStyle = DIM_COLOR;
      ctx.font = "12px monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("No NPCs in scene", W / 2, H / 2);
      return;
    }

    const npc = this.npcs[this.selectedIndex];
    let y = PAD;

    // ── Header ────────────────────────────────────────────────────────
    ctx.fillStyle = HEAD_COLOR;
    ctx.font = "bold 13px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.fillText("NPC DEBUG", W / 2, y);
    y += LINE + 2;

    // NPC selector
    ctx.font = "11px monospace";
    ctx.fillStyle = DIM_COLOR;
    if (this.npcs.length > 1) {
      ctx.fillText("← →  to cycle", W / 2, y);
    }
    y += LINE;

    // NPC name + state
    const stateLabel = npc.debugThinking ? "💭 thinking" : npc.actionState;
    const stateColor = npc.debugThinking
      ? "#ffdd00"
      : npc.actionState === "idle"
        ? DIM_COLOR
        : OK_COLOR;

    ctx.font = "bold 12px monospace";
    ctx.textAlign = "left";
    ctx.fillStyle = VALUE_COLOR;
    ctx.fillText(npc.npcName, PAD, y);

    ctx.textAlign = "right";
    ctx.fillStyle = stateColor;
    ctx.fillText(stateLabel, W - PAD, y);
    y += LINE + 2;

    // NPC index badge
    ctx.textAlign = "center";
    ctx.font = "10px monospace";
    ctx.fillStyle = DIM_COLOR;
    ctx.fillText(
      `[${this.selectedIndex + 1}/${this.npcs.length}]  (${npc.tileX}, ${npc.tileY})  facing ${npc.facing}`,
      W / 2,
      y,
    );
    y += LINE + 2;

    // Current goal
    ctx.textAlign = "left";
    ctx.font = "bold 10px monospace";
    ctx.fillStyle = LABEL_COLOR;
    ctx.fillText("GOAL", PAD, y);
    ctx.font = "10px monospace";
    ctx.fillStyle = npc.currentGoal ? "#ffdd66" : ERR_COLOR;
    ctx.fillText(truncate(npc.currentGoal || "(no goal set)", 30), PAD + 40, y);
    y += LINE;

    // Divider
    y += 4;
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    y += 6;

    // ── Vitals ────────────────────────────────────────────────────────
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("VITALS", PAD, y);
    y += LINE;

    vitalsBar(ctx, PAD, y, "HP", npc.vitals.health, 100, "#ff5555");
    y += 12;
    vitalsBar(ctx, PAD, y, "FD", npc.vitals.hunger, 100, "#ffaa44");
    y += 12;
    vitalsBar(ctx, PAD, y, "TH", npc.vitals.thirst, 100, "#44aaff");
    y += 12;
    vitalsBar(ctx, PAD, y, "EN", npc.vitals.energy, 1000, "#aa44ff");
    y += 12 + SECTION_GAP;

    // Divider
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    y += 6;

    // ── Last Action ───────────────────────────────────────────────────
    ctx.fillStyle = LABEL_COLOR;
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "left";
    ctx.textBaseline = "top";
    ctx.fillText("LAST ACTION", PAD, y);
    y += LINE;

    ctx.font = "10px monospace";
    ctx.fillStyle = VALUE_COLOR;
    ctx.fillText(truncate(npc.debugLastAction || "(none)", 44), PAD, y);
    y += LINE;

    const resultIsOk = npc.debugLastResult.startsWith("✓") || npc.debugLastResult === "";
    ctx.fillStyle = resultIsOk ? OK_COLOR : ERR_COLOR;
    ctx.fillText(truncate(npc.debugLastResult || "—", 44), PAD, y);
    y += LINE + SECTION_GAP;

    // ── Last LLM Response ─────────────────────────────────────────────
    ctx.fillStyle = BORDER;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    y += 6;

    ctx.fillStyle = LABEL_COLOR;
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("LLM RESPONSE", PAD, y);
    y += LINE;

    ctx.font = "9px monospace";
    ctx.fillStyle = VALUE_COLOR;
    const resp = npc.debugLastResponse || "(none yet)";
    // Word-wrap at ~42 chars, show 3 lines max
    const words = resp.split(" ");
    let line = "";
    let lineCount = 0;
    for (const word of words) {
      if (lineCount >= 3) break;
      const test = line ? `${line} ${word}` : word;
      if (test.length > 42) {
        ctx.fillText(truncate(line, 44), PAD, y);
        y += LINE - 1;
        lineCount++;
        line = word;
      } else {
        line = test;
      }
    }
    if (line && lineCount < 3) {
      ctx.fillText(truncate(line, 44), PAD, y);
      y += LINE - 1;
    }
    y += SECTION_GAP;

    // ── Memory ────────────────────────────────────────────────────────
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    y += 6;

    ctx.fillStyle = LABEL_COLOR;
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`MEMORY  (${npc.memory.notes.length}/20)`, PAD, y);
    y += LINE;

    ctx.font = "9px monospace";
    if (npc.memory.notes.length === 0) {
      ctx.fillStyle = DIM_COLOR;
      ctx.fillText("(no notes)", PAD, y);
      y += LINE - 1;
    } else {
      for (let i = 0; i < Math.min(3, npc.memory.notes.length); i++) {
        ctx.fillStyle = VALUE_COLOR;
        ctx.fillText(`[${i}] ${truncate(npc.memory.notes[i], 40)}`, PAD, y);
        y += LINE - 1;
      }
      if (npc.memory.notes.length > 3) {
        ctx.fillStyle = DIM_COLOR;
        ctx.fillText(`  +${npc.memory.notes.length - 3} more`, PAD, y);
        y += LINE - 1;
      }
    }
    y += SECTION_GAP;

    // ── Action History ────────────────────────────────────────────────
    ctx.strokeStyle = BORDER;
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    ctx.moveTo(PAD, y);
    ctx.lineTo(W - PAD, y);
    ctx.stroke();
    y += 6;

    ctx.fillStyle = LABEL_COLOR;
    ctx.font = "bold 10px monospace";
    ctx.textAlign = "left";
    ctx.fillText("HISTORY", PAD, y);
    y += LINE;

    if (npc.debugHistory.length === 0) {
      ctx.font = "9px monospace";
      ctx.fillStyle = DIM_COLOR;
      ctx.fillText("(no actions yet)", PAD, y);
    } else {
      const now = Date.now();
      for (let i = 0; i < Math.min(5, npc.debugHistory.length); i++) {
        const entry = npc.debugHistory[i];
        const ageS = Math.round((now - entry.time) / 1000);
        const isOk = entry.result.startsWith("✓");

        ctx.font = "9px monospace";
        ctx.fillStyle = isOk ? OK_COLOR : ERR_COLOR;
        ctx.textAlign = "left";
        ctx.fillText(truncate(entry.action, 35), PAD, y);

        ctx.fillStyle = DIM_COLOR;
        ctx.textAlign = "right";
        ctx.fillText(`${ageS}s`, W - PAD, y);
        y += LINE - 2;
      }
    }

    // ── Footer hint ───────────────────────────────────────────────────
    ctx.fillStyle = DIM_COLOR;
    ctx.font = "9px monospace";
    ctx.textAlign = "center";
    ctx.textBaseline = "bottom";
    ctx.fillText("[ ` ] close  |  [ ← → ] cycle NPC", W / 2, H - 4);
  }
}
