/**
 * NPC Thought Indicator
 *
 * A small status dot drawn above an NPC's head showing what they're currently doing.
 * Attached as a child actor so it moves with the NPC.
 *
 * Color / label key:
 *   Yellow pulsing  = thinking (LLM in-flight)
 *   Blue            = moving
 *   Lime green      = gathering (pick/mine)
 *   Red             = attacking
 *   Cyan            = chatting
 *   Purple          = waiting
 *   Dark blue       = sleeping
 *   Gray            = idle
 */

import * as ex from "excalibur";
import type { NPC } from "./npc.ts";

const DOT_RADIUS = 3;
const LABEL_SIZE = 7;
const OFFSET_Y = -28; // pixels above the NPC center

const STATE_COLORS: Record<string, string> = {
  idle: "#666688",
  moving: "#4488ff",
  picking: "#44dd44",
  drinking: "#44bbff",
  attacking: "#ff4444",
  pickingUp: "#44dd44",
  sleeping: "#334488",
  waiting: "#aa44ff",
  thinking: "#ffdd00",
};

const STATE_LABELS: Record<string, string> = {
  idle: "…",
  moving: "▶",
  picking: "✦",
  drinking: "~",
  attacking: "✕",
  pickingUp: "↑",
  sleeping: "z",
  waiting: "⏸",
  thinking: "?",
};

export class NPCThoughtIndicator extends ex.Actor {
  private npc: NPC;
  private pulseTimer = 0;

  constructor(npc: NPC) {
    super({
      pos: ex.vec(0, OFFSET_Y),
      anchor: ex.vec(0.5, 1),
      z: 20,
    });
    this.npc = npc;

    const canvas = new ex.Canvas({
      width: 24,
      height: 16,
      cache: false,
      draw: (ctx) => this.drawIndicator(ctx),
    });
    this.graphics.use(canvas);
  }

  override onPreUpdate(_engine: ex.Engine, delta: number): void {
    this.pulseTimer += delta;
  }

  private drawIndicator(ctx: CanvasRenderingContext2D): void {
    ctx.clearRect(0, 0, 24, 16);

    const state = this.npc.debugThinking ? "thinking" : this.npc.actionState;
    const color = STATE_COLORS[state] ?? "#888888";
    const label = STATE_LABELS[state] ?? "·";

    // Pulse effect when thinking
    let alpha = 1;
    if (state === "thinking") {
      alpha = 0.5 + 0.5 * Math.sin(this.pulseTimer / 200);
    }

    ctx.globalAlpha = alpha;

    // Background pill
    ctx.fillStyle = "rgba(10,10,20,0.7)";
    ctx.beginPath();
    ctx.roundRect(1, 3, 22, 10, 4);
    ctx.fill();

    // Colored dot
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(6, 8, DOT_RADIUS, 0, Math.PI * 2);
    ctx.fill();

    // Label text
    ctx.fillStyle = "#ffffff";
    ctx.font = `bold ${LABEL_SIZE}px monospace`;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(label, 12, 8);

    ctx.globalAlpha = 1;
  }
}
