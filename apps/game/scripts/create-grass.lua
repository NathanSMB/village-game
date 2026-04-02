-- Create grass tile sprite with 4 variants x 4 animation frames
-- Run: aseprite -b --script scripts/create-grass.lua

local W = 32
local H = 32
local VARIANTS = 4
local FRAMES_PER_VARIANT = 4
local TOTAL_FRAMES = VARIANTS * FRAMES_PER_VARIANT

-- Get script directory to resolve output path
local scriptPath = app.params["script-path"] or "."
local outputDir = app.fs.joinPath(app.fs.filePath(scriptPath), "..", "assets", "ground")

local spr = Sprite{ width = W, height = H, colorMode = ColorMode.RGB }

-- Add frames (sprite starts with 1 frame, add 15 more)
for i = 2, TOTAL_FRAMES do
  spr:newEmptyFrame()
end

-- Color palette
local BASE_GREEN = Color{ r = 74, g = 140, b = 63, a = 255 }
local DARK_GREEN = Color{ r = 58, g = 115, b = 48, a = 255 }
local LIGHT_GREEN = Color{ r = 95, g = 165, b = 75, a = 255 }
local DIRT = Color{ r = 120, g = 85, b = 55, a = 255 }
local DIRT_DARK = Color{ r = 95, g = 68, b = 42, a = 255 }
local FLOWER_RED = Color{ r = 200, g = 60, b = 60, a = 255 }
local FLOWER_YELLOW = Color{ r = 230, g = 200, b = 60, a = 255 }
local FLOWER_WHITE = Color{ r = 230, g = 230, b = 220, a = 255 }
local ROCK_GRAY = Color{ r = 140, g = 140, b = 135, a = 255 }
local ROCK_DARK = Color{ r = 105, g = 105, b = 100, a = 255 }
local ROCK_LIGHT = Color{ r = 170, g = 170, b = 165, a = 255 }

-- Helper: fill tile with base grass
local function fillGrass(img)
  for y = 0, H - 1 do
    for x = 0, W - 1 do
      img:drawPixel(x, y, BASE_GREEN)
    end
  end
end

-- Helper: add random-looking grass texture dots
local function addGrassTexture(img, seed)
  -- Deterministic pseudo-random using seed
  local s = seed
  local function rand(max)
    s = (s * 1103515245 + 12345) % 2147483648
    return s % max
  end

  -- Scattered dark and light pixels for texture
  for i = 1, 40 do
    local x = rand(W)
    local y = rand(H)
    img:drawPixel(x, y, DARK_GREEN)
  end
  for i = 1, 25 do
    local x = rand(W)
    local y = rand(H)
    img:drawPixel(x, y, LIGHT_GREEN)
  end
end

-- Helper: draw a grass blade (a thin vertical line)
local function drawBlade(img, x, baseY, height, color, lean)
  lean = lean or 0
  for dy = 0, height - 1 do
    local px = x + math.floor(lean * dy / height)
    if px >= 0 and px < W and (baseY - dy) >= 0 then
      img:drawPixel(px, baseY - dy, color)
    end
  end
end

-- Helper: add swaying grass blades with animation offset
local function addBlades(img, frame, seed)
  local s = seed
  local function rand(max)
    s = (s * 1103515245 + 12345) % 2147483648
    return s % max
  end

  local leanPattern = { 0, 1, 0, -1 }
  local lean = leanPattern[frame + 1]

  for i = 1, 8 do
    local x = rand(W)
    local baseY = 28 + rand(4)
    local h = 4 + rand(4)
    local color = (rand(2) == 0) and LIGHT_GREEN or DARK_GREEN
    drawBlade(img, x, baseY, h, color, lean)
  end
end

-- Helper: add small dirt patches
local function addDirt(img, seed)
  local s = seed
  local function rand(max)
    s = (s * 1103515245 + 12345) % 2147483648
    return s % max
  end

  for i = 1, 6 do
    local x = rand(W)
    local y = rand(H)
    img:drawPixel(x, y, DIRT)
    if x + 1 < W then img:drawPixel(x + 1, y, DIRT_DARK) end
  end
end

-- === VARIANT 1: Plain grass ===
for f = 0, 3 do
  local frameIdx = 1 + f
  app.activeFrame = spr.frames[frameIdx]
  local cel = spr:newCel(spr.layers[1], frameIdx)
  local img = cel.image

  fillGrass(img)
  addGrassTexture(img, 100 + f * 7)
  addDirt(img, 200 + f * 3)
  addBlades(img, f, 300)
  spr.frames[frameIdx].duration = 0.4
end

-- === VARIANT 2: Grass with flowers ===
for f = 0, 3 do
  local frameIdx = 5 + f
  app.activeFrame = spr.frames[frameIdx]
  local cel = spr:newCel(spr.layers[1], frameIdx)
  local img = cel.image

  fillGrass(img)
  addGrassTexture(img, 400 + f * 7)
  addDirt(img, 500 + f * 3)
  addBlades(img, f, 600)

  -- Flowers
  local flowers = { { 5, 8, FLOWER_RED }, { 20, 15, FLOWER_YELLOW }, { 12, 24, FLOWER_WHITE }, { 26, 6, FLOWER_RED } }
  for _, fl in ipairs(flowers) do
    local fx, fy, fc = fl[1], fl[2], fl[3]
    img:drawPixel(fx, fy, fc)
    img:drawPixel(fx + 1, fy, fc)
    img:drawPixel(fx, fy + 1, fc)
    -- Center dot
    img:drawPixel(fx, fy, FLOWER_YELLOW)
  end

  spr.frames[frameIdx].duration = 0.4
end

-- === VARIANT 3: Grass with rocks ===
for f = 0, 3 do
  local frameIdx = 9 + f
  app.activeFrame = spr.frames[frameIdx]
  local cel = spr:newCel(spr.layers[1], frameIdx)
  local img = cel.image

  fillGrass(img)
  addGrassTexture(img, 700 + f * 7)
  addDirt(img, 800 + f * 3)
  addBlades(img, f, 900)

  -- Rock 1 (larger)
  for ry = 0, 2 do
    for rx = 0, 3 do
      img:drawPixel(8 + rx, 18 + ry, ROCK_GRAY)
    end
  end
  img:drawPixel(8, 18, ROCK_DARK)
  img:drawPixel(11, 20, ROCK_DARK)
  img:drawPixel(9, 18, ROCK_LIGHT)
  img:drawPixel(10, 18, ROCK_LIGHT)

  -- Rock 2 (smaller)
  img:drawPixel(22, 25, ROCK_GRAY)
  img:drawPixel(23, 25, ROCK_GRAY)
  img:drawPixel(22, 26, ROCK_DARK)
  img:drawPixel(23, 26, ROCK_GRAY)
  img:drawPixel(23, 25, ROCK_LIGHT)

  spr.frames[frameIdx].duration = 0.4
end

-- === VARIANT 4: Tall grass ===
for f = 0, 3 do
  local frameIdx = 13 + f
  app.activeFrame = spr.frames[frameIdx]
  local cel = spr:newCel(spr.layers[1], frameIdx)
  local img = cel.image

  fillGrass(img)
  addGrassTexture(img, 1000 + f * 7)
  addDirt(img, 1100 + f * 3)

  -- More prominent blades
  local s = 1200
  local function rand(max)
    s = (s * 1103515245 + 12345) % 2147483648
    return s % max
  end

  local leanPattern = { 0, 1, 0, -1 }
  local lean = leanPattern[f + 1]

  for i = 1, 16 do
    local x = rand(W)
    local baseY = 28 + rand(4)
    local h = 6 + rand(6)
    local color = (rand(3) == 0) and LIGHT_GREEN or DARK_GREEN
    drawBlade(img, x, baseY, h, color, lean)
  end

  spr.frames[frameIdx].duration = 0.4
end

-- Add tags for each variant
local tags = {
  { name = "plain", from = 1, to = 4 },
  { name = "flowers", from = 5, to = 8 },
  { name = "rocks", from = 9, to = 12 },
  { name = "tall", from = 13, to = 16 },
}

for _, t in ipairs(tags) do
  local tag = spr:newTag(t.name)
  tag.fromFrame = spr.frames[t.from]
  tag.toFrame = spr.frames[t.to]
  tag.aniDir = AniDir.FORWARD
end

-- Save
spr:saveAs(app.fs.joinPath(outputDir, "grass.aseprite"))
print("Created grass.aseprite with " .. TOTAL_FRAMES .. " frames")
