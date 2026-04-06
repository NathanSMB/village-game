import type { NPCMemoryState } from "../types/npc.ts";

const MAX_NOTES = 20;

export function createMemory(): NPCMemoryState {
  return { notes: [] };
}

export function addNote(memory: NPCMemoryState, note: string): boolean {
  if (memory.notes.length >= MAX_NOTES) return false;
  memory.notes.push(note);
  return true;
}

export function removeNote(memory: NPCMemoryState, index: number): boolean {
  if (index < 0 || index >= memory.notes.length) return false;
  memory.notes.splice(index, 1);
  return true;
}

export function serializeMemory(memory: NPCMemoryState): NPCMemoryState {
  return { notes: [...memory.notes] };
}

export function deserializeMemory(data: NPCMemoryState): NPCMemoryState {
  return { notes: [...(data.notes ?? [])] };
}
