-- Create water tile sprite with shore transitions
-- 13 tile types x 4 animation frames = 52 frames total
-- Types: center, 4 edges, 4 outer corners, 4 inner corners
-- Animation: gentle ripple effect

local W = 32
local H = 32
local ANIM_FRAMES = 4
local TILE_TYPES = 13
local TOTAL_FRAMES = TILE_TYPES * ANIM_FRAMES

local scriptPath = app.params["script-path"] or "."
local outputDir = app.fs.joinPath(app.fs.filePath(scriptPath), "..", "assets", "ground")

local spr = Sprite{ width = W, height = H, colorMode = ColorMode.RGB }

for i = 2, TOTAL_FRAMES do
  spr:newEmptyFrame()
end

-- Water colors
local WATER_DEEP   = Color{ r = 35, g = 60, b = 120, a = 255 }
local WATER_BASE   = Color{ r = 55, g = 90, b = 155, a = 255 }
local WATER_LIGHT  = Color{ r = 75, g = 120, b = 185, a = 255 }
local WATER_BRIGHT = Color{ r = 100, g = 150, b = 210, a = 255 }

-- Shore / grass colors (must match grass.lua tones)
local GRASS_BASE  = Color{ r = 74, g = 140, b = 63, a = 255 }
local GRASS_DARK  = Color{ r = 58, g = 115, b = 48, a = 255 }
local GRASS_LIGHT = Color{ r = 95, g = 165, b = 75, a = 255 }
local SHORE_WET   = Color{ r = 45, g = 80, b = 65, a = 255 }   -- dark teal at water edge
local SHORE_MUD   = Color{ r = 85, g = 105, b = 60, a = 255 }  -- muddy transition

local CLEAR = Color{ r = 0, g = 0, b = 0, a = 0 }

-- Helpers
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

-- Seeded PRNG
local function makeRng(seed)
  local s = seed
  return function(max)
    s = (s * 1103515245 + 12345) % 2147483648
    return s % max
  end
end

-- Fill tile with base water
local function fillWater(img)
  for y = 0, H - 1 do
    for x = 0, W - 1 do
      img:drawPixel(x, y, WATER_BASE)
    end
  end
end

-- Add subtle depth variation to water
local function addWaterTexture(img, seed)
  local rand = makeRng(seed)
  -- Scattered deeper pixels
  for i = 1, 30 do
    local x = rand(W)
    local y = rand(H)
    img:drawPixel(x, y, WATER_DEEP)
  end
  -- Scattered lighter pixels
  for i = 1, 15 do
    local x = rand(W)
    local y = rand(H)
    img:drawPixel(x, y, WATER_LIGHT)
  end
end

-- Gentle ripple highlights that shift per frame
local function addRipples(img, frame, seed)
  local rand = makeRng(seed)
  local offsets = { 0, 1, 0, -1 }
  local shift = offsets[frame + 1]

  -- Small horizontal ripple lines that drift
  for i = 1, 5 do
    local x = rand(W - 6)
    local y = rand(H - 2)
    local len = 3 + rand(4)
    for dx = 0, len - 1 do
      local rx = x + dx + shift
      if rx >= 0 and rx < W then
        px(img, rx, y, WATER_LIGHT)
      end
    end
  end

  -- Bright highlight specks that move
  for i = 1, 3 do
    local x = rand(W)
    local y = rand(H)
    px(img, x + shift, y, WATER_BRIGHT)
  end
end

-- Fill a region with grass (for shore areas)
local function fillGrass(img, x0, y0, w, h, seed)
  local rand = makeRng(seed)
  for y = y0, y0 + h - 1 do
    for x = x0, x0 + w - 1 do
      if x >= 0 and x < W and y >= 0 and y < H then
        img:drawPixel(x, y, GRASS_BASE)
      end
    end
  end
  -- Texture dots
  for i = 1, math.floor(w * h / 6) do
    local x = x0 + rand(w)
    local y = y0 + rand(h)
    if x >= 0 and x < W and y >= 0 and y < H then
      if rand(2) == 0 then
        img:drawPixel(x, y, GRASS_DARK)
      else
        img:drawPixel(x, y, GRASS_LIGHT)
      end
    end
  end
end

-- Draw shore transition strip (mud + wet edge) at a specific row/column
-- orientation: "h" for horizontal strip, "v" for vertical strip
local function drawShoreStripH(img, y0, seed)
  local rand = makeRng(seed)
  -- 2px muddy transition
  for x = 0, W - 1 do
    px(img, x, y0, SHORE_MUD)
    if rand(3) > 0 then
      px(img, x, y0 + 1, SHORE_WET)
    else
      px(img, x, y0 + 1, SHORE_MUD)
    end
  end
end

local function drawShoreStripV(img, x0, seed)
  local rand = makeRng(seed)
  for y = 0, H - 1 do
    px(img, x0, y, SHORE_MUD)
    if rand(3) > 0 then
      px(img, x0 + 1, y, SHORE_WET)
    else
      px(img, x0 + 1, y, SHORE_MUD)
    end
  end
end

-- Shore depth: how many pixels of grass on the edge
local SHORE = 6

-- ===== TILE TYPE DRAWING FUNCTIONS =====

-- Type 1: Full water center (no shore)
local function drawCenter(img, frame, seed)
  clearImg(img)
  fillWater(img)
  addWaterTexture(img, seed)
  addRipples(img, frame, seed + 1000)
end

-- Type 2: Edge-north (grass on top)
local function drawEdgeN(img, frame, seed)
  clearImg(img)
  fillWater(img)
  addWaterTexture(img, seed)
  fillGrass(img, 0, 0, W, SHORE, seed + 500)
  drawShoreStripH(img, SHORE, seed + 600)
  addRipples(img, frame, seed + 1000)
end

-- Type 3: Edge-south (grass on bottom)
local function drawEdgeS(img, frame, seed)
  clearImg(img)
  fillWater(img)
  addWaterTexture(img, seed)
  fillGrass(img, 0, H - SHORE, W, SHORE, seed + 500)
  drawShoreStripH(img, H - SHORE - 2, seed + 600)
  addRipples(img, frame, seed + 1000)
end

-- Type 4: Edge-east (grass on right)
local function drawEdgeE(img, frame, seed)
  clearImg(img)
  fillWater(img)
  addWaterTexture(img, seed)
  fillGrass(img, W - SHORE, 0, SHORE, H, seed + 500)
  drawShoreStripV(img, W - SHORE - 2, seed + 600)
  addRipples(img, frame, seed + 1000)
end

-- Type 5: Edge-west (grass on left)
local function drawEdgeW(img, frame, seed)
  clearImg(img)
  fillWater(img)
  addWaterTexture(img, seed)
  fillGrass(img, 0, 0, SHORE, H, seed + 500)
  drawShoreStripV(img, SHORE, seed + 600)
  addRipples(img, frame, seed + 1000)
end

-- Type 6-9: Outer corners (grass fills the corner quadrant)
local function drawOuterCornerNW(img, frame, seed)
  clearImg(img)
  fillWater(img)
  addWaterTexture(img, seed)
  fillGrass(img, 0, 0, SHORE, SHORE, seed + 500)
  -- Shore transitions on two edges
  for x = 0, SHORE - 1 do
    px(img, x, SHORE, SHORE_MUD)
    px(img, x, SHORE + 1, SHORE_WET)
  end
  for y = 0, SHORE - 1 do
    px(img, SHORE, y, SHORE_MUD)
    px(img, SHORE + 1, y, SHORE_WET)
  end
  -- Corner blend
  px(img, SHORE, SHORE, SHORE_MUD)
  px(img, SHORE + 1, SHORE + 1, SHORE_WET)
  addRipples(img, frame, seed + 1000)
end

local function drawOuterCornerNE(img, frame, seed)
  clearImg(img)
  fillWater(img)
  addWaterTexture(img, seed)
  fillGrass(img, W - SHORE, 0, SHORE, SHORE, seed + 500)
  for x = W - SHORE, W - 1 do
    px(img, x, SHORE, SHORE_MUD)
    px(img, x, SHORE + 1, SHORE_WET)
  end
  for y = 0, SHORE - 1 do
    px(img, W - SHORE - 1, y, SHORE_MUD)
    px(img, W - SHORE - 2, y, SHORE_WET)
  end
  px(img, W - SHORE - 1, SHORE, SHORE_MUD)
  addRipples(img, frame, seed + 1000)
end

local function drawOuterCornerSW(img, frame, seed)
  clearImg(img)
  fillWater(img)
  addWaterTexture(img, seed)
  fillGrass(img, 0, H - SHORE, SHORE, SHORE, seed + 500)
  for x = 0, SHORE - 1 do
    px(img, x, H - SHORE - 1, SHORE_MUD)
    px(img, x, H - SHORE - 2, SHORE_WET)
  end
  for y = H - SHORE, H - 1 do
    px(img, SHORE, y, SHORE_MUD)
    px(img, SHORE + 1, y, SHORE_WET)
  end
  px(img, SHORE, H - SHORE - 1, SHORE_MUD)
  addRipples(img, frame, seed + 1000)
end

local function drawOuterCornerSE(img, frame, seed)
  clearImg(img)
  fillWater(img)
  addWaterTexture(img, seed)
  fillGrass(img, W - SHORE, H - SHORE, SHORE, SHORE, seed + 500)
  for x = W - SHORE, W - 1 do
    px(img, x, H - SHORE - 1, SHORE_MUD)
    px(img, x, H - SHORE - 2, SHORE_WET)
  end
  for y = H - SHORE, H - 1 do
    px(img, W - SHORE - 1, y, SHORE_MUD)
    px(img, W - SHORE - 2, y, SHORE_WET)
  end
  px(img, W - SHORE - 1, H - SHORE - 1, SHORE_MUD)
  addRipples(img, frame, seed + 1000)
end

-- Type 10-13: L-shaped corners (grass fills two adjacent edges)
-- Used for outer corners (two cardinal sides are land) after slot mapping
-- Shore strips must be CLIPPED to avoid bleeding through the perpendicular grass edge
local function drawInnerCornerNW(img, frame, seed)
  clearImg(img)
  fillWater(img)
  addWaterTexture(img, seed)
  -- Grass on north (full width) and west (below north strip)
  fillGrass(img, 0, 0, W, SHORE, seed + 500)
  fillGrass(img, 0, SHORE, SHORE, H - SHORE, seed + 501)
  -- Horizontal shore: only east of west grass (SHORE to W-1)
  local rand = makeRng(seed + 600)
  for x = SHORE, W - 1 do
    px(img, x, SHORE, SHORE_MUD)
    if rand(3) > 0 then
      px(img, x, SHORE + 1, SHORE_WET)
    else
      px(img, x, SHORE + 1, SHORE_MUD)
    end
  end
  -- Vertical shore: only below north grass (SHORE to H-1)
  rand = makeRng(seed + 601)
  for y = SHORE, H - 1 do
    px(img, SHORE, y, SHORE_MUD)
    if rand(3) > 0 then
      px(img, SHORE + 1, y, SHORE_WET)
    else
      px(img, SHORE + 1, y, SHORE_MUD)
    end
  end
  addRipples(img, frame, seed + 1000)
end

local function drawInnerCornerNE(img, frame, seed)
  clearImg(img)
  fillWater(img)
  addWaterTexture(img, seed)
  -- Grass on north (full width) and east (below north strip)
  fillGrass(img, 0, 0, W, SHORE, seed + 500)
  fillGrass(img, W - SHORE, SHORE, SHORE, H - SHORE, seed + 501)
  -- Horizontal shore: only west of east grass (0 to W-SHORE-1)
  local rand = makeRng(seed + 600)
  for x = 0, W - SHORE - 1 do
    px(img, x, SHORE, SHORE_MUD)
    if rand(3) > 0 then
      px(img, x, SHORE + 1, SHORE_WET)
    else
      px(img, x, SHORE + 1, SHORE_MUD)
    end
  end
  -- Vertical shore: only below north grass (SHORE to H-1)
  rand = makeRng(seed + 601)
  for y = SHORE, H - 1 do
    px(img, W - SHORE - 2, y, SHORE_MUD)
    if rand(3) > 0 then
      px(img, W - SHORE - 1, y, SHORE_WET)
    else
      px(img, W - SHORE - 1, y, SHORE_MUD)
    end
  end
  addRipples(img, frame, seed + 1000)
end

local function drawInnerCornerSW(img, frame, seed)
  clearImg(img)
  fillWater(img)
  addWaterTexture(img, seed)
  -- Grass on south (full width) and west (above south strip)
  fillGrass(img, 0, H - SHORE, W, SHORE, seed + 500)
  fillGrass(img, 0, 0, SHORE, H - SHORE, seed + 501)
  -- Horizontal shore: only east of west grass (SHORE to W-1)
  local rand = makeRng(seed + 600)
  for x = SHORE, W - 1 do
    px(img, x, H - SHORE - 2, SHORE_MUD)
    if rand(3) > 0 then
      px(img, x, H - SHORE - 1, SHORE_WET)
    else
      px(img, x, H - SHORE - 1, SHORE_MUD)
    end
  end
  -- Vertical shore: only above south grass (0 to H-SHORE-1)
  rand = makeRng(seed + 601)
  for y = 0, H - SHORE - 1 do
    px(img, SHORE, y, SHORE_MUD)
    if rand(3) > 0 then
      px(img, SHORE + 1, y, SHORE_WET)
    else
      px(img, SHORE + 1, y, SHORE_MUD)
    end
  end
  addRipples(img, frame, seed + 1000)
end

local function drawInnerCornerSE(img, frame, seed)
  clearImg(img)
  fillWater(img)
  addWaterTexture(img, seed)
  -- Grass on south (full width) and east (above south strip)
  fillGrass(img, 0, H - SHORE, W, SHORE, seed + 500)
  fillGrass(img, W - SHORE, 0, SHORE, H - SHORE, seed + 501)
  -- Horizontal shore: only west of east grass (0 to W-SHORE-1)
  local rand = makeRng(seed + 600)
  for x = 0, W - SHORE - 1 do
    px(img, x, H - SHORE - 2, SHORE_MUD)
    if rand(3) > 0 then
      px(img, x, H - SHORE - 1, SHORE_WET)
    else
      px(img, x, H - SHORE - 1, SHORE_MUD)
    end
  end
  -- Vertical shore: only above south grass (0 to H-SHORE-1)
  rand = makeRng(seed + 601)
  for y = 0, H - SHORE - 1 do
    px(img, W - SHORE - 2, y, SHORE_MUD)
    if rand(3) > 0 then
      px(img, W - SHORE - 1, y, SHORE_WET)
    else
      px(img, W - SHORE - 1, y, SHORE_MUD)
    end
  end
  addRipples(img, frame, seed + 1000)
end

-- All tile draw functions in order
-- Outer corners (two cardinal sides are land) → L-shaped grass (mostly grass)
-- Inner corners (all cardinal water, one diagonal land) → small grass notch (mostly water)
local tileFuncs = {
  drawCenter,
  drawEdgeN,
  drawEdgeS,
  drawEdgeE,
  drawEdgeW,
  drawInnerCornerNW,  -- outer slot: L-shaped grass (correct for 2 cardinal land sides)
  drawInnerCornerNE,
  drawInnerCornerSW,
  drawInnerCornerSE,
  drawOuterCornerNW,  -- inner slot: small grass notch (correct for diagonal-only land)
  drawOuterCornerNE,
  drawOuterCornerSW,
  drawOuterCornerSE,
}

-- Draw all frames
for tileIdx, drawFunc in ipairs(tileFuncs) do
  for f = 0, ANIM_FRAMES - 1 do
    local frameIdx = (tileIdx - 1) * ANIM_FRAMES + f + 1
    app.activeFrame = spr.frames[frameIdx]
    local cel = spr:newCel(spr.layers[1], frameIdx)
    local seed = tileIdx * 100 + f * 37
    drawFunc(cel.image, f, seed)
    spr.frames[frameIdx].duration = 0.5
  end
end

-- Add tags for each tile type
local tagNames = {
  "center",
  "edge-n", "edge-s", "edge-e", "edge-w",
  "corner-nw", "corner-ne", "corner-sw", "corner-se",
  "inner-nw", "inner-ne", "inner-sw", "inner-se",
}

for i, name in ipairs(tagNames) do
  local tag = spr:newTag(name)
  local from = (i - 1) * ANIM_FRAMES + 1
  tag.fromFrame = spr.frames[from]
  tag.toFrame = spr.frames[from + ANIM_FRAMES - 1]
  tag.aniDir = AniDir.FORWARD
end

spr:saveAs(app.fs.joinPath(outputDir, "water.aseprite"))
print("Created water.aseprite with " .. TOTAL_FRAMES .. " frames (" .. TILE_TYPES .. " types x " .. ANIM_FRAMES .. " anim)")
