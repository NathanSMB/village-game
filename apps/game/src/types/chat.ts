export type ChatMode = "whisper" | "talk" | "yell";

export interface ChatMessage {
  sender: string;
  text: string;
  tileX: number;
  tileY: number;
  mode: ChatMode;
  timestamp: number; // Date.now()
}

export const CHAT_MODE_RADIUS: Record<ChatMode, number> = {
  whisper: 1,
  talk: 3,
  yell: 6,
};

export const CHAT_MODE_ORDER: ChatMode[] = ["whisper", "talk", "yell"];
export const CHAT_EXPIRE_MS = 300_000; // 5 minutes

export const CHAT_MODE_COLORS: Record<ChatMode, string> = {
  whisper: "#a0a0b0", // dim gray
  talk: "#ffffff", // white
  yell: "#ffcc44", // bold gold
};

export const CHAT_MODE_LABELS: Record<ChatMode, string> = {
  whisper: "WHISPER",
  talk: "TALK",
  yell: "YELL",
};

/** Verb form for placeholder text: "Currently whispering" etc. */
export const CHAT_MODE_VERBS: Record<ChatMode, string> = {
  whisper: "whispering",
  talk: "talking",
  yell: "yelling",
};

export function chebyshevDistance(x1: number, y1: number, x2: number, y2: number): number {
  return Math.max(Math.abs(x1 - x2), Math.abs(y1 - y2));
}
