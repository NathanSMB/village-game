# Sprite Pipeline Guide

This document explains how sprites are created, exported, and loaded into the game. It covers the Aseprite Lua scripting API used to generate `.aseprite` files programmatically, the shell-based export pipeline that converts them to PNG sprite sheets, and how the game loads them at runtime.

## Aseprite Binary Location

The export pipeline and Lua scripts require the Aseprite CLI binary. The path depends on how Aseprite was installed.

### Common Paths

| Install Method         | Path                                                                                                 |
| ---------------------- | ---------------------------------------------------------------------------------------------------- |
| Steam (Linux)          | `~/.local/share/Steam/steamapps/common/Aseprite/aseprite`                                            |
| Steam (Linux, alt)     | `~/.steam/steam/steamapps/common/Aseprite/aseprite`                                                  |
| Steam (macOS)          | `~/Library/Application Support/Steam/steamapps/common/Aseprite/Aseprite.app/Contents/MacOS/aseprite` |
| Steam (Windows)        | `C:\Program Files (x86)\Steam\steamapps\common\Aseprite\Aseprite.exe`                                |
| Direct install (Linux) | `/usr/bin/aseprite` or `/usr/local/bin/aseprite`                                                     |
| Direct install (macOS) | `/Applications/Aseprite.app/Contents/MacOS/aseprite`                                                 |
| Built from source      | Wherever you built it, typically `~/aseprite/build/bin/aseprite`                                     |

The export script (`scripts/export-sprites.sh`) has the path hardcoded at the top. Update the `ASEPRITE` variable if your install differs.

## Directory Structure

```
apps/game/
├── assets/                          # Source .aseprite files (checked into git)
│   ├── ground/
│   │   └── grass.aseprite
│   └── characters/
│       ├── body/
│       │   ├── body-male.aseprite
│       │   └── body-female.aseprite
│       ├── hair/
│       │   ├── hair-short.aseprite
│       │   ├── hair-long.aseprite
│       │   ├── hair-ponytail.aseprite
│       │   └── hair-curly.aseprite
│       ├── facial-hair/
│       │   ├── facial-stubble.aseprite
│       │   ├── facial-beard.aseprite
│       │   ├── facial-mustache.aseprite
│       │   └── facial-full.aseprite
│       └── equipment/
│           ├── torso/
│           │   └── tunic.aseprite
│           ├── legs/
│           │   └── pants.aseprite
│           └── feet/
│               └── boots.aseprite
├── scripts/                         # Build scripts and Lua generators
│   ├── export-sprites.sh            # Exports all .aseprite → .png
│   ├── create-grass.lua
│   ├── create-body.lua
│   ├── create-hair.lua
│   ├── create-facial-hair.lua
│   └── create-equipment.lua
└── src/
    └── sprites/                     # Generated PNGs (gitignored, not checked in)
        ├── ground/
        │   ├── grass.png
        │   └── grass.json
        └── characters/
            ├── body/
            ├── hair/
            ├── facial-hair/
            └── equipment/
                ├── torso/
                ├── legs/
                └── feet/
```

**Key rule:** `.aseprite` files in `assets/` are the source of truth and are checked into git. The `.png` files in `src/sprites/` are generated output and are gitignored. Never edit the PNGs directly — always edit the `.aseprite` source and re-export.

## Writing Lua Scripts for Aseprite

Aseprite has a built-in Lua scripting API that can create, modify, and save sprite files. We use this to generate placeholder sprites programmatically. You can later open these `.aseprite` files in the Aseprite GUI and hand-edit them — the export pipeline doesn't care how the file was created.

### Running a Lua Script

```bash
aseprite -b --script-param script-path="/full/path/to/script.lua" --script script.lua
```

- `-b` (batch mode) runs without opening the GUI
- `--script` specifies the Lua file to execute
- `--script-param` passes parameters accessible via `app.params["param-name"]` in Lua

We pass `script-path` so the Lua script can resolve relative paths to the output directory.

### Lua Script Structure

Every sprite creation script follows this pattern:

```lua
-- 1. Set up dimensions and output path
local W = 32          -- sprite width in pixels
local H = 32          -- sprite height in pixels
local FRAMES = 12     -- total number of frames

local scriptPath = app.params["script-path"] or "."
local outputDir = app.fs.joinPath(app.fs.filePath(scriptPath), "..", "assets", "characters", "body")

-- 2. Define colors
local MY_COLOR = Color{ r = 255, g = 0, b = 255, a = 255 }
local CLEAR = Color{ r = 0, g = 0, b = 0, a = 0 }

-- 3. Define helper functions for drawing
local function px(img, x, y, c)
  if x >= 0 and x < W and y >= 0 and y < H then
    img:drawPixel(x, y, c)
  end
end

local function rect(img, x, y, w, h, c)
  for dy = 0, h - 1 do
    for dx = 0, w - 1 do
      px(img, x + dx, y + dy, c)
    end
  end
end

local function clearImg(img)
  for y = 0, H - 1 do
    for x = 0, W - 1 do
      img:drawPixel(x, y, CLEAR)
    end
  end
end

-- 4. Define a drawing function that takes (img, direction, pose)
local function drawMySprite(img, dir, pose)
  clearImg(img)
  -- dir: 0=down, 1=up, 2=left, 3=right
  -- pose: 0=idle, 1=walk1, 2=walk2
  rect(img, 10, 10, 12, 12, MY_COLOR)
end

-- 5. Create the sprite, fill each frame, save
local function createSprite(filename, drawFunc)
  local spr = Sprite{ width = W, height = H, colorMode = ColorMode.RGB }

  -- Sprite starts with 1 frame, add the rest
  for i = 2, FRAMES do
    spr:newEmptyFrame()
  end

  -- Fill each frame
  for dir = 0, 3 do
    for pose = 0, 2 do
      local frameIdx = dir * 3 + pose + 1  -- Lua is 1-indexed
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      local img = cel.image
      drawFunc(img, dir, pose)
      spr.frames[frameIdx].duration = 0.2  -- 200ms per frame
    end
  end

  spr:saveAs(app.fs.joinPath(outputDir, filename))
  print("Created " .. filename)
end

createSprite("my-sprite.aseprite", drawMySprite)
```

### Key Aseprite Lua API Concepts

#### Creating a Sprite

```lua
local spr = Sprite{ width = 32, height = 32, colorMode = ColorMode.RGB }
```

This creates a new in-memory sprite. It starts with 1 frame and 1 layer.

#### Adding Frames

```lua
spr:newEmptyFrame()  -- appends a new empty frame
```

Frames are 1-indexed in Lua. After creating a sprite and adding 11 more frames, you have `spr.frames[1]` through `spr.frames[12]`.

#### Creating Cels (Drawing Targets)

A "cel" is the content of a layer on a specific frame. You need one to draw on:

```lua
app.activeFrame = spr.frames[frameIdx]  -- set the active frame context
local cel = spr:newCel(spr.layers[1], frameIdx)
local img = cel.image  -- this is the Image object you draw on
```

#### Drawing Pixels

```lua
img:drawPixel(x, y, Color{ r = 255, g = 0, b = 0, a = 255 })
```

Coordinates are 0-indexed. `(0, 0)` is the top-left corner. The alpha channel must be set explicitly — `a = 255` is fully opaque, `a = 0` is fully transparent.

#### Colors

```lua
local red = Color{ r = 255, g = 0, b = 0, a = 255 }
local transparent = Color{ r = 0, g = 0, b = 0, a = 0 }
```

Colors are always RGBA. There is no shorthand — you must specify all four components.

#### Tags (Animation Groups)

Tags mark ranges of frames as named animation groups:

```lua
local tag = spr:newTag("walk-down")
tag.fromFrame = spr.frames[1]
tag.toFrame = spr.frames[3]
tag.aniDir = AniDir.FORWARD
```

Tags are optional but useful for organizing animations within a single file (like the grass sprite with 4 variants).

#### Saving

```lua
spr:saveAs("/full/path/to/output.aseprite")
```

The directory must already exist. Use `app.fs.joinPath()` to build paths:

```lua
local path = app.fs.joinPath(baseDir, "subfolder", "file.aseprite")
```

#### File System Helpers

```lua
app.fs.filePath(path)    -- directory portion of a path
app.fs.joinPath(a, b, c) -- join path segments
```

### Frame Layout Convention

All character layer sprites use the same 12-frame layout:

| Frame Index (1-based) | Direction | Pose   |
| --------------------- | --------- | ------ |
| 1                     | Down      | Idle   |
| 2                     | Down      | Walk 1 |
| 3                     | Down      | Walk 2 |
| 4                     | Up        | Idle   |
| 5                     | Up        | Walk 1 |
| 6                     | Up        | Walk 2 |
| 7                     | Left      | Idle   |
| 8                     | Left      | Walk 1 |
| 9                     | Left      | Walk 2 |
| 10                    | Right     | Idle   |
| 11                    | Right     | Walk 1 |
| 12                    | Right     | Walk 2 |

The formula to compute the frame index from direction and pose:

```lua
local frameIdx = dir * 3 + pose + 1
-- dir:  0=down, 1=up, 2=left, 3=right
-- pose: 0=idle, 1=walk1, 2=walk2
```

### Walk Animation Approach

Walk animations use simple pixel offsets to suggest movement:

- **Leg shift:** In walk1 the left leg shifts forward and right leg backward. In walk2 the reverse. For front/back views this means horizontal pixel offsets; for side views it means vertical offsets.
- **Arm swing:** Arms shift up/down opposite to the legs to suggest a natural walking motion.
- **Hair bounce:** Optional — ponytail or long hair can shift slightly between walk frames.

```lua
local legShift = 0
if pose == 1 then legShift = 1 end   -- walk frame 1: shift +1
if pose == 2 then legShift = -1 end  -- walk frame 2: shift -1
```

### Reference Colors for Palette Swapping

Sprites that need runtime recoloring use specific reference colors instead of final colors. The game's compositor replaces these at runtime.

| Reference Color | Hex                              | Usage                 |
| --------------- | -------------------------------- | --------------------- |
| Magenta         | `#FF00FF` / `rgb(255, 0, 255)`   | Skin — base tone      |
| Dark Magenta    | `#CC00CC` / `rgb(204, 0, 204)`   | Skin — shadow         |
| Light Magenta   | `#FF66FF` / `rgb(255, 102, 255)` | Skin — highlight      |
| Cyan            | `#00FFFF` / `rgb(0, 255, 255)`   | Equipment — base      |
| Dark Cyan       | `#00CCCC` / `rgb(0, 204, 204)`   | Equipment — shadow    |
| Light Cyan      | `#66FFFF` / `rgb(102, 255, 255)` | Equipment — highlight |
| Yellow          | `#FFFF00` / `rgb(255, 255, 0)`   | Hair — base           |
| Dark Yellow     | `#CCCC00` / `rgb(204, 204, 0)`   | Hair — shadow         |

In Lua:

```lua
local SKIN = Color{ r = 255, g = 0, b = 255, a = 255 }
local SKIN_SHADOW = Color{ r = 204, g = 0, b = 204, a = 255 }
local SKIN_HIGHLIGHT = Color{ r = 255, g = 102, b = 255, a = 255 }
```

Use 2-3 shades per reference color category (base + shadow, or base + shadow + highlight) to give sprites simple shading that survives the palette swap.

## Export Pipeline

### How It Works

The export script `scripts/export-sprites.sh` converts all `.aseprite` source files into PNG sprite sheets that the game can import via Vite.

The flow:

```
.aseprite source file
    ↓  (Aseprite CLI --sheet)
.png horizontal sprite strip  →  imported by TypeScript via Vite
```

### The Export Script

```bash
#!/bin/bash
set -e
shopt -s globstar  # enable ** recursive globbing

ASEPRITE="$HOME/.local/share/Steam/steamapps/common/Aseprite/aseprite"
```

The script:

1. **Exports ground textures** with `--data` (JSON metadata) and `--list-tags` for animation variant info
2. **Exports all character layers** by globbing `assets/characters/**/*.aseprite`, preserving the directory structure under `src/sprites/`

Each file is exported as a horizontal sprite strip:

```bash
aseprite -b input.aseprite --sheet output.png --sheet-type horizontal
```

Key flags:

| Flag                      | Purpose                                 |
| ------------------------- | --------------------------------------- |
| `-b`                      | Batch mode (no GUI)                     |
| `--sheet output.png`      | Export as a sprite sheet PNG            |
| `--sheet-type horizontal` | All frames in a single row              |
| `--data output.json`      | Optional: export frame metadata as JSON |
| `--format json-array`     | JSON format (array of frames)           |
| `--list-tags`             | Include tag information in the JSON     |

### When to Run the Export

- **After editing any `.aseprite` file** — run `./scripts/export-sprites.sh` or `vp run export-sprites`
- **Before a production build** — the `build` script in `package.json` runs the export automatically: `bash scripts/export-sprites.sh && tsc && vp build`
- **During development** — the dev server (`vp dev`) hot-reloads when PNGs change in `src/sprites/`, so re-exporting updates the game immediately

### Output Format

For a 12-frame character layer, the output PNG is **384x32** (12 frames x 32px each, in a single horizontal row). The game loads this as a `SpriteSheet` with a 32x32 grid.

For the grass tile with 16 frames, the output is **512x32**.

## Adding New Sprites

### Adding a New Equipment Piece

1. Create the Lua script or edit an existing one to add a new draw function
2. Output to `assets/characters/equipment/{slot}/{name}.aseprite`
3. Run the Lua script with Aseprite CLI
4. Run `./scripts/export-sprites.sh`
5. In `systems/character-compositor.ts`, import the new PNG and add it to `LAYER_IMAGES`
6. Update the compositing logic to use the new layer

### Adding a New Ground Tile

1. Create or edit a Lua script to generate the `.aseprite` file
2. Output to `assets/ground/{name}.aseprite`
3. Add an explicit export command in `export-sprites.sh` (ground tiles use `--data` for JSON metadata)
4. Import and use in `systems/sprite-loader.ts`

### Editing Sprites by Hand

The `.aseprite` files generated by Lua scripts are standard Aseprite files. You can open them in the Aseprite GUI, edit the pixel art, and save. The export pipeline doesn't care how the file was created or modified — it just reads the `.aseprite` file and outputs a PNG.

If you hand-edit a sprite:

1. Open the `.aseprite` file in Aseprite
2. Make your changes
3. Save (Ctrl+S)
4. Run `./scripts/export-sprites.sh`
5. The game picks up the new PNGs automatically in dev mode
