# Character Sprite System

## Overview

Characters are rendered by compositing multiple sprite layers at runtime, with per-character palette swapping for skin tone, hair color, and equipment color. Each layer is a separate `.aseprite` file with animations for all 4 directions × 2 states (idle + walk).

## Sprite Dimensions

- **Character size:** 32x32 pixels (fits one tile)
- **All layers share the same 32x32 canvas** so they align when composited

## Animation States and Directions

Each layer's sprite sheet contains frames for:

| Direction | Idle | Walk Frame 1 | Walk Frame 2 |
| --------- | ---- | ------------ | ------------ |
| Down      | 0    | 1            | 2            |
| Up        | 3    | 4            | 5            |
| Left      | 6    | 7            | 8            |
| Right     | 9    | 10           | 11           |

**Total: 12 frames per layer**, exported as a horizontal strip (384x32 PNG).

- **Idle:** single frame per direction (frame 0, 3, 6, 9)
- **Walk:** 2-frame cycle per direction. The cycle is: idle → walk1 → idle → walk2 (using the idle frame as the neutral pose between steps)

## Layers

Rendered bottom-to-top:

1. **Body** — Base character body with skin. Includes underwear. Separate male/female variants.
2. **Equipment: Feet** — Boots (one style for now)
3. **Equipment: Legs** — Pants (one style for now)
4. **Equipment: Torso** — Tunic (one style for now)
5. **Hair** — Hair style. Each style is a separate file with direction-aware art (e.g. ponytail faces the correct way per direction).

## File Structure

```
apps/game/assets/characters/
├── body/
│   ├── body-male.aseprite       # Male body, 12 frames
│   └── body-female.aseprite     # Female body, 12 frames
├── hair/
│   ├── hair-short.aseprite      # Short hair, 12 frames
│   ├── hair-long.aseprite       # Long hair, 12 frames
│   ├── hair-ponytail.aseprite   # Ponytail, 12 frames
│   ├── hair-curly.aseprite      # Curly hair, 12 frames
│   └── hair-bald.aseprite       # (empty/no file needed)
├── facial-hair/
│   ├── facial-stubble.aseprite  # Only needs down-facing frames (front view)
│   ├── facial-beard.aseprite
│   ├── facial-mustache.aseprite
│   └── facial-full.aseprite
└── equipment/
    ├── torso/
    │   └── tunic.aseprite       # Tunic, 12 frames
    ├── legs/
    │   └── pants.aseprite       # Pants, 12 frames
    └── feet/
        └── boots.aseprite       # Boots, 12 frames
```

## Palette Swapping

Sprites are drawn using **reference colors** that get replaced at runtime with the character's chosen colors.

### Reference Color Map

| Reference Color | Hex       | Purpose               | Replaced With             |
| --------------- | --------- | --------------------- | ------------------------- |
| Magenta         | `#FF00FF` | Skin — base tone      | Character's skin tone     |
| Dark Magenta    | `#CC00CC` | Skin — shadow         | Skin tone darkened 20%    |
| Light Magenta   | `#FF66FF` | Skin — highlight      | Skin tone lightened 15%   |
| Cyan            | `#00FFFF` | Equipment — base      | Equipment slot color      |
| Dark Cyan       | `#00CCCC` | Equipment — shadow    | Equipment color darkened  |
| Light Cyan      | `#66FFFF` | Equipment — highlight | Equipment color lightened |
| Yellow          | `#FFFF00` | Hair — base           | Character's hair color    |
| Dark Yellow     | `#CCCC00` | Hair — shadow         | Hair color darkened       |

Each reference color has a base + shadow + highlight variant for simple shading.

### Runtime Palette Swap Process

For each unique character appearance:

1. Load all required layer PNGs (body, hair, equipment pieces)
2. Create an offscreen canvas (384x32 — full sprite strip)
3. For each layer, draw it to the canvas
4. Scan all pixels and replace reference colors with the character's chosen colors
5. Create an `ImageSource` from the resulting canvas
6. Build `SpriteSheet` and direction/animation data from it
7. **Cache** the result keyed by the full appearance hash — reuse for identical NPCs

### Compositing Order

Layers are composited onto a single canvas in order:

1. Draw body (palette-swapped for skin tone)
2. Draw feet equipment (palette-swapped for feet color)
3. Draw legs equipment (palette-swapped for legs color)
4. Draw torso equipment (palette-swapped for torso color)
5. Draw facial hair if male (palette-swapped for hair color)
6. Draw hair (palette-swapped for hair color)

The final composited strip is one image with all 12 frames, used as a single `SpriteSheet`.

## Direction and Animation at Runtime

The character actor tracks:

- `facing: Direction` — "down" | "up" | "left" | "right"
- `moving: boolean` — whether the character is currently walking

Based on these, the correct graphic is selected:

```
frameIndex = DIRECTION_OFFSET[facing]              // idle
frameIndex = DIRECTION_OFFSET[facing] + walkFrame  // walking (alternates 1, 2)
```

Where `DIRECTION_OFFSET = { down: 0, up: 3, left: 6, right: 9 }`.

The character uses `actor.graphics.use(spriteSheet.getSprite(frameIndex, 0))` each frame, rather than using ExcaliburJS `Animation` objects. This gives direct control over which frame is shown based on movement state.

## Export Pipeline

The existing `scripts/export-sprites.sh` is extended to also export character layers:

```bash
for file in assets/characters/**/*.aseprite; do
  output_dir="src/sprites/characters/$(dirname relative_path)"
  aseprite -b "$file" --sheet "$output.png" --sheet-type horizontal --data "$output.json" --format json-array
done
```

## Integration with Character Creator

The character creator currently draws characters programmatically via `buildCharacterPreview()`. Once the sprite system is built:

1. The creator preview switches to using the same compositing pipeline (just render the "down idle" frame at a larger scale)
2. The in-game character uses the full composited sprite sheet for all directions and animations

## Future Considerations

- **More equipment types:** Each new equipment item is just a new `.aseprite` file following the same 12-frame template
- **More animation states:** Add frames 12-14 for action, 15-17 for hurt, etc. The frame layout extends horizontally
- **NPC variety:** The palette swap + layer system means hundreds of unique-looking NPCs from a small number of base sprites
- **Equipment rendering:** Since equipment is already layered, weapons and accessories follow the same pattern
