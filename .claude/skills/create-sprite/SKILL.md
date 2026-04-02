---
name: create-sprite
description: Create Aseprite sprite files for the village-game project. Use this skill whenever the user wants to add a new sprite, tile, character layer, equipment piece, or any visual asset to the game. Also trigger when the user mentions Aseprite, sprite sheets, pixel art assets, animation frames, or palette-swappable sprites — even if they don't say "create a sprite" explicitly. This skill handles the full pipeline from Lua script generation through Aseprite CLI execution to PNG export.
---

# Create Sprite

This skill creates `.aseprite` sprite files for the village-game project by generating Lua scripts that Aseprite's batch mode executes. It covers the full pipeline: gather requirements → write Lua script → run Aseprite CLI → export PNG sprite sheet.

## Before You Start

Read `docs/sprite-pipeline.md` in the project root for the full pipeline reference. The key things to know:

- **Aseprite binary**: `~/.local/share/Steam/steamapps/common/Aseprite/aseprite`
- **Source files** go in `apps/game/assets/` (checked into git)
- **Exported PNGs** go in `apps/game/src/sprites/` (gitignored, generated)
- **Lua scripts** go in `apps/game/scripts/`
- **Export script**: `apps/game/scripts/export-sprites.sh`

Look at the existing Lua scripts in `apps/game/scripts/` to match the established patterns. Each script follows a consistent structure.

## Step 1: Determine Sprite Type

Ask the user what they're creating. The type determines the frame layout, reference colors, and output location.

### Ground Tiles

- **Dimensions**: 32x32 per frame
- **Frame layout**: Variants × animation frames (e.g., 4 variants × 4 frames = 16 total)
- **No reference colors** needed (ground tiles use final colors directly)
- **Output**: `assets/ground/{name}.aseprite`
- **Tags**: One tag per variant (e.g., "plain", "flowers", "rocks")
- **Example**: `scripts/create-grass.lua`

### Character Layers (body, hair, facial hair)

- **Dimensions**: 32x32 per frame
- **Frame layout**: 12 frames — 4 directions × 3 poses (idle, walk1, walk2)
- **Reference colors**: See palette swap section below
- **Output**: `assets/characters/{category}/{name}.aseprite`
- **Frame index formula**: `frameIdx = dir * 3 + pose + 1` (Lua is 1-indexed)
  - dir: 0=down, 1=up, 2=left, 3=right
  - pose: 0=idle, 1=walk1, 2=walk2
- **Examples**: `scripts/create-body.lua`, `scripts/create-hair.lua`, `scripts/create-facial-hair.lua`

### Equipment

- **Dimensions**: 32x32 per frame
- **Frame layout**: Same 12-frame character layout
- **Reference colors**: Cyan family (for runtime recoloring)
- **Output**: `assets/characters/equipment/{slot}/{name}.aseprite` where slot is `torso`, `legs`, or `feet`
- **Example**: `scripts/create-equipment.lua`

### Custom Sprites

For anything that doesn't fit the above, ask the user about:

- Canvas dimensions
- Number of frames and their purpose
- Whether palette swapping is needed (and which color family)
- Output directory

## Step 2: Gather Parameters

Based on the sprite type, confirm these with the user:

- **Name**: filename for the .aseprite and resulting .png
- **Variants** (ground tiles): how many, what makes each unique
- **Animation**: number of frames, what changes between them
- **Walk animation details** (character layers): how limbs/hair shift between poses
- **Direction awareness** (character layers): what looks different per direction (e.g., ponytail side, eyes only visible from front/side)

## Step 3: Write the Lua Script

### Script Template

Every Lua script follows this skeleton:

```lua
-- Description of what this creates
local W = 32
local H = 32
local FRAMES = 12  -- or whatever the total frame count is

local scriptPath = app.params["script-path"] or "."
local outputDir = app.fs.joinPath(app.fs.filePath(scriptPath), "..", "assets", "path", "to", "output")

-- Define colors (reference colors or final colors)
local MY_COLOR = Color{ r = 255, g = 0, b = 255, a = 255 }
local CLEAR = Color{ r = 0, g = 0, b = 0, a = 0 }

-- Helper: draw a single pixel (with bounds checking)
local function px(img, x, y, c)
  if x >= 0 and x < W and y >= 0 and y < H then
    img:drawPixel(x, y, c)
  end
end

-- Helper: draw a filled rectangle
local function rect(img, x, y, w, h, c)
  for dy = 0, h - 1 do
    for dx = 0, w - 1 do
      px(img, x + dx, y + dy, c)
    end
  end
end

-- Helper: clear the image to transparent
local function clearImg(img)
  for y = 0, H - 1 do
    for x = 0, W - 1 do
      img:drawPixel(x, y, CLEAR)
    end
  end
end

-- Drawing function for a single frame
local function drawFrame(img, dir, pose)
  clearImg(img)
  -- Draw the sprite content here
  -- dir: 0=down, 1=up, 2=left, 3=right
  -- pose: 0=idle, 1=walk1, 2=walk2
end

-- Create sprite, fill frames, save
local function createSprite(filename, drawFunc)
  local spr = Sprite{ width = W, height = H, colorMode = ColorMode.RGB }
  for i = 2, FRAMES do
    spr:newEmptyFrame()
  end

  for dir = 0, 3 do
    for pose = 0, 2 do
      local frameIdx = dir * 3 + pose + 1
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      drawFunc(cel.image, dir, pose)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  spr:saveAs(app.fs.joinPath(outputDir, filename))
  print("Created " .. filename)
end

createSprite("my-sprite.aseprite", drawFrame)
```

### Palette Swap Reference Colors

Character layer sprites use reference colors that the game's compositor replaces at runtime. This is how one sprite file can produce unlimited color variations.

**Skin (magenta family)** — used for body sprites:

- Base: `Color{ r = 255, g = 0, b = 255, a = 255 }` (#FF00FF)
- Shadow: `Color{ r = 204, g = 0, b = 204, a = 255 }` (#CC00CC)
- Highlight: `Color{ r = 255, g = 102, b = 255, a = 255 }` (#FF66FF)

**Equipment (cyan family)** — used for clothing/armor:

- Base: `Color{ r = 0, g = 255, b = 255, a = 255 }` (#00FFFF)
- Shadow: `Color{ r = 0, g = 204, b = 204, a = 255 }` (#00CCCC)
- Highlight: `Color{ r = 102, g = 255, b = 255, a = 255 }` (#66FFFF)

**Hair (yellow family)** — used for hair and facial hair:

- Base: `Color{ r = 255, g = 255, b = 0, a = 255 }` (#FFFF00)
- Shadow: `Color{ r = 204, g = 204, b = 0, a = 255 }` (#CCCC00)

Use 2-3 shades per category (base + shadow, optionally highlight) to give sprites shading that survives palette swapping.

### Walk Animation Patterns

For character layers, walk animation uses pixel offsets:

```lua
-- Leg shift: forward/back between walk frames
local legShift = 0
if pose == 1 then legShift = 1 end
if pose == 2 then legShift = -1 end

-- Arm swing: opposite to legs
local armSwing = 0
if pose == 1 then armSwing = -1 end
if pose == 2 then armSwing = 1 end
```

For front/back views, legs shift horizontally. For side views, legs shift vertically (stepping effect). Arms swing opposite to legs.

### Ground Tile Patterns

Ground tiles use a different frame structure — variants × animation frames with tags:

```lua
-- After creating all frames, add tags for each variant
local tags = {
  { name = "plain", from = 1, to = 4 },
  { name = "flowers", from = 5, to = 8 },
}
for _, t in ipairs(tags) do
  local tag = spr:newTag(t.name)
  tag.fromFrame = spr.frames[t.from]
  tag.toFrame = spr.frames[t.to]
  tag.aniDir = AniDir.FORWARD
end
```

## Step 4: Run the Lua Script

Execute with Aseprite CLI in batch mode:

```bash
ASEPRITE=~/.local/share/Steam/steamapps/common/Aseprite/aseprite
$ASEPRITE -b --script-param script-path="$(pwd)/scripts/{script-name}.lua" --script scripts/{script-name}.lua
```

The `--script-param script-path=` is needed so the Lua script can resolve the output directory relative to itself.

Verify the `.aseprite` file was created in the expected location under `assets/`.

## Step 5: Export to PNG

Run the export pipeline:

```bash
./scripts/export-sprites.sh
```

This exports all `.aseprite` files to PNG sprite sheets in `src/sprites/`. Verify the PNG was created.

If the new sprite is a character layer, it also needs to be:

1. Imported in `src/systems/character-compositor.ts`
2. Added to the `LAYER_IMAGES` map
3. Wired into the compositing logic

If it's a ground tile, it needs to be:

1. Imported in `src/systems/sprite-loader.ts`
2. Used in `src/scenes/game-world.ts`

## Step 6: Integration Checklist

After creating and exporting the sprite, remind the user what code changes are needed to actually use it in the game. The specific changes depend on the sprite type — check the existing patterns in the compositor and sprite loader.
