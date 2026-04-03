-- Create tree sprite: 4 animation frames (wind sway)
-- Run: aseprite -b --script-param script-path="$(pwd)/scripts/create-tree.lua" --script scripts/create-tree.lua

local W = 32
local H = 32
local TOTAL_FRAMES = 4

local scriptPath = app.params["script-path"] or "."
local outputDir = app.fs.joinPath(app.fs.filePath(scriptPath), "..", "assets", "ground")

local spr = Sprite{ width = W, height = H, colorMode = ColorMode.RGB }

for i = 2, TOTAL_FRAMES do
  spr:newEmptyFrame()
end

-- Colors (deeper forest greens, distinct from berry bush)
local CLEAR = Color{ r = 0, g = 0, b = 0, a = 0 }
local LEAF_BASE = Color{ r = 40, g = 105, b = 50, a = 255 }
local LEAF_DARK = Color{ r = 25, g = 75, b = 32, a = 255 }
local LEAF_LIGHT = Color{ r = 60, g = 135, b = 65, a = 255 }
local LEAF_HIGHLIGHT = Color{ r = 80, g = 160, b = 80, a = 255 }
local TRUNK_BASE = Color{ r = 90, g = 60, b = 35, a = 255 }
local TRUNK_DARK = Color{ r = 65, g = 42, b = 22, a = 255 }
local TRUNK_LIGHT = Color{ r = 115, g = 80, b = 48, a = 255 }
local SHADOW_COLOR = Color{ r = 25, g = 45, b = 20, a = 140 }

-- Helpers
local function px(img, x, y, c)
  if x >= 0 and x < W and y >= 0 and y < H then
    img:drawPixel(x, y, c)
  end
end

local function clearImg(img)
  for y = 0, H - 1 do
    for x = 0, W - 1 do
      img:drawPixel(x, y, CLEAR)
    end
  end
end

local function rect(img, x, y, w, h, c)
  for dy = 0, h - 1 do
    for dx = 0, w - 1 do
      px(img, x + dx, y + dy, c)
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

-- Draw trunk (thicker, extends to bottom of tile)
local function drawTrunk(img)
  -- Main trunk (6 wide, from y=22 to y=29)
  rect(img, 13, 22, 6, 8, TRUNK_BASE)
  -- Dark left edge
  rect(img, 13, 22, 1, 8, TRUNK_DARK)
  rect(img, 14, 22, 1, 8, TRUNK_DARK)
  -- Light right highlight
  rect(img, 18, 22, 1, 7, TRUNK_LIGHT)
  -- Roots spreading at base
  px(img, 12, 28, TRUNK_DARK)
  px(img, 19, 28, TRUNK_DARK)
  px(img, 11, 29, TRUNK_DARK)
  px(img, 12, 29, TRUNK_DARK)
  px(img, 19, 29, TRUNK_DARK)
  px(img, 20, 29, TRUNK_DARK)
  -- Bark texture
  px(img, 15, 24, TRUNK_DARK)
  px(img, 16, 26, TRUNK_LIGHT)
  px(img, 15, 27, TRUNK_DARK)
end

-- Draw shadow at very bottom of tile
local function drawShadow(img)
  for x = 7, 25 do
    px(img, x, 30, SHADOW_COLOR)
  end
  for x = 9, 23 do
    px(img, x, 31, SHADOW_COLOR)
  end
end

-- Canopy center and radii — fills full tile width, top starts at y=0
local CX, CY = 16, 11
local RX, RY = 14, 11

-- Draw the filled canopy ellipse with texture
local function drawCanopy(img, seed)
  local rand = makeRng(seed)

  -- Fill base ellipse shape
  for y = CY - RY, CY + RY do
    for x = CX - RX, CX + RX do
      local dx = (x - CX) / RX
      local dy = (y - CY) / RY
      if dx * dx + dy * dy <= 1.0 then
        px(img, x, y, LEAF_BASE)
      end
    end
  end

  -- Dark edge ring
  for y = CY - RY, CY + RY do
    for x = CX - RX, CX + RX do
      local dx = (x - CX) / RX
      local dy = (y - CY) / RY
      local dist = dx * dx + dy * dy
      if dist > 0.60 and dist <= 1.0 then
        if rand(3) > 0 then
          px(img, x, y, LEAF_DARK)
        end
      end
    end
  end

  -- Upper-left highlight region
  for y = CY - RY, CY - 1 do
    for x = CX - RX, CX + 2 do
      local dx = (x - CX) / RX
      local dy = (y - CY) / RY
      local dist = dx * dx + dy * dy
      if dist < 0.40 then
        if rand(3) == 0 then
          px(img, x, y, LEAF_LIGHT)
        end
        if rand(5) == 0 then
          px(img, x, y, LEAF_HIGHLIGHT)
        end
      end
    end
  end

  -- Scattered leaf texture variation
  for i = 1, 25 do
    local ax = CX - RX + rand(RX * 2)
    local ay = CY - RY + rand(RY * 2)
    local dx = (ax - CX) / RX
    local dy = (ay - CY) / RY
    if dx * dx + dy * dy < 0.80 then
      if rand(2) == 0 then
        px(img, ax, ay, LEAF_DARK)
      else
        px(img, ax, ay, LEAF_LIGHT)
      end
    end
  end
end

-- Protruding leaf pixels that shift per frame for sway effect
local function drawSwayLeaves(img, frame)
  local offsets = { 0, 1, 0, -1 }
  local sway = offsets[frame + 1]

  -- Left edge protruding leaves (positioned relative to larger canopy)
  px(img, CX - RX - 1 + sway, CY - 5, LEAF_DARK)
  px(img, CX - RX + sway, CY - 3, LEAF_BASE)
  px(img, CX - RX - 1 + sway, CY, LEAF_LIGHT)
  px(img, CX - RX + sway, CY + 4, LEAF_DARK)
  px(img, CX - RX - 1 + sway, CY + 7, LEAF_BASE)

  -- Right edge protruding leaves
  px(img, CX + RX + sway, CY - 4, LEAF_DARK)
  px(img, CX + RX + 1 + sway, CY - 1, LEAF_BASE)
  px(img, CX + RX + sway, CY + 3, LEAF_LIGHT)
  px(img, CX + RX + 1 + sway, CY + 6, LEAF_DARK)

  -- Top protruding leaves
  local topSway = offsets[((frame + 1) % 4) + 1]
  px(img, CX - 6 + topSway, CY - RY - 1, LEAF_LIGHT)
  px(img, CX + 5 + topSway, CY - RY, LEAF_BASE)
  px(img, CX - 1 + topSway, CY - RY - 1, LEAF_HIGHLIGHT)
  px(img, CX + 2 + topSway, CY - RY - 1, LEAF_BASE)
end

-- Draw a complete frame
local function drawFrame(img, frame)
  clearImg(img)
  drawShadow(img)
  drawTrunk(img)
  -- Each frame uses a different seed for subtle texture variation
  drawCanopy(img, 77 + frame * 151)
  drawSwayLeaves(img, frame)
end

-- Generate frames 1–4
for f = 0, 3 do
  local idx = 1 + f
  app.activeFrame = spr.frames[idx]
  local cel = spr:newCel(spr.layers[1], idx)
  drawFrame(cel.image, f)
  spr.frames[idx].duration = 0.5
end

-- Tag
local tag = spr:newTag("idle")
tag.fromFrame = spr.frames[1]
tag.toFrame = spr.frames[4]
tag.aniDir = AniDir.FORWARD

spr:saveAs(app.fs.joinPath(outputDir, "tree.aseprite"))
print("Created tree.aseprite with " .. TOTAL_FRAMES .. " frames")
