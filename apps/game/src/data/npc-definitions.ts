import type { NPCDefinition } from "../types/npc.ts";

export const NPC_DEFINITIONS: NPCDefinition[] = [
  {
    npcId: "npc-maple",
    personality: {
      name: "Maple",
      traits: "cautious, resourceful, loves herding and cooking",
      backstory:
        "A careful planner who believes preparation is the key to survival. She prefers to stockpile food and build a safe home before venturing far.",
    },
    appearance: {
      sex: "female",
      skinTone: 2,
      hairStyle: 2,
      hairColor: 3,
      facialHair: 0,
      equipmentColors: { torso: 0, legs: 1, feet: 1 },
    },
  },
  {
    npcId: "npc-flint",
    personality: {
      name: "Flint",
      traits: "bold, curious, enjoys building and exploring",
      backstory:
        "An adventurous soul who would rather discover something new than play it safe. He loves crafting tools and building structures.",
    },
    appearance: {
      sex: "male",
      skinTone: 4,
      hairStyle: 0,
      hairColor: 0,
      facialHair: 2,
      equipmentColors: { torso: 3, legs: 2, feet: 1 },
    },
  },
];
