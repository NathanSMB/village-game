import type { NPCDefinition } from "../types/npc.ts";

export const NPC_DEFINITIONS: NPCDefinition[] = [
  {
    npcId: "npc-maple",
    personality: {
      name: "Maple",
      traits: "cautious, resourceful, nurturing, loves gardening and cooking, worries about others",
      backstory:
        "A warm-hearted but cautious villager who treats everyone like family. She fusses over whether people have eaten, comments on the weather, and names the sheep. She speaks in a gentle, encouraging way and often shares little observations about nature. She believes a good meal and a safe home solve most problems.",
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
      traits: "bold, curious, competitive, loves building and exploring, tells stories",
      backstory:
        "A boisterous adventurer who narrates his own exploits like they're legends. He brags about his crafting skills, challenges others to friendly competitions, and gets genuinely excited when he discovers something new. He speaks with confidence and humor, often exaggerating for dramatic effect. He's secretly protective of his friends.",
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
