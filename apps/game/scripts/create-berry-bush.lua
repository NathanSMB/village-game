-- Create berry bush sprite: 2 states (full / picked) x 4 animation frames = 8 total
-- Run: aseprite -b --script-param script-path="$(pwd)/scripts/create-berry-bush.lua" --script scripts/create-berry-bush.lua

local W = 32
local H = 32
local FRAMES_PER_STATE = 4
local TOTAL_FRAMES = 8

local scriptPath = app.params["script-path"] or "."
local outputDir = app.fs.joinPath(app.fs.filePath(scriptPath), "..", "assets", "ground")

local spr = Sprite{ width = W, height = H, colorMode = ColorMode.RGB }

for i = 2, TOTAL_FRAMES do
  spr:newEmptyFrame()
end

-- Colors
local CLEAR = Color{ r = 0, g = 0, b = 0, a = 0 }
local LEAF_BASE = Color{ r = 50, g = 120, b = 45, a = 255 }
local LEAF_DARK = Color{ r = 35, g = 90, b = 30, a = 255 }
local LEAF_LIGHT = Color{ r = 70, g = 150, b = 60, a = 255 }
local LEAF_HIGHLIGHT = Color{ r = 90, g = 170, b = 75, a = 255 }
local TRUNK_BASE = Color{ r = 100, g = 70, b = 40, a = 255 }
local TRUNK_DARK = Color{ r = 75, g = 52, b = 30, a = 255 }
local TRUNK_LIGHT = Color{ r = 120, g = 88, b = 52, a = 255 }
local BERRY_BASE = Color{ r = 200, g = 40, b = 50, a = 255 }
local BERRY_HI = Color{ r = 230, g = 80, b = 80, a = 255 }
local BERRY_DARK = Color{ r = 150, g = 25, b = 35, a = 255 }
local SHADOW_COLOR = Color{ r = 30, g = 55, b = 25, a = 140 }

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

-- Draw trunk
local function drawTrunk(img)
  -- Main trunk (4 wide, 5 tall)
  rect(img, 14, 21, 4, 5, TRUNK_BASE)
  -- Dark left edge
  rect(img, 14, 21, 1, 5, TRUNK_DARK)
  -- Light right highlight
  rect(img, 17, 21, 1, 4, TRUNK_LIGHT)
  -- Roots
  px(img, 13, 25, TRUNK_DARK)
  px(img, 18, 25, TRUNK_DARK)
  px(img, 13, 26, TRUNK_DARK)
  px(img, 18, 26, TRUNK_DARK)
end

-- Draw shadow at base (tucked under trunk)
local function drawShadow(img)
  for x = 9, 23 do
    px(img, x, 25, SHADOW_COLOR)
  end
  for x = 11, 21 do
    px(img, x, 26, SHADOW_COLOR)
  end
end

-- Canopy center and radii
local CX, CY = 16, 13
local RX, RY = 10, 8

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
      if dist > 0.65 and dist <= 1.0 then
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
      if dist < 0.45 then
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
  for i = 1, 20 do
    local ax = CX - RX + rand(RX * 2)
    local ay = CY - RY + rand(RY * 2)
    local dx = (ax - CX) / RX
    local dy = (ay - CY) / RY
    if dx * dx + dy * dy < 0.85 then
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

  -- Left edge protruding leaves
  px(img, CX - RX - 1 + sway, CY - 3, LEAF_DARK)
  px(img, CX - RX + sway, CY - 1, LEAF_BASE)
  px(img, CX - RX - 1 + sway, CY + 2, LEAF_LIGHT)

  -- Right edge protruding leaves
  px(img, CX + RX + sway, CY - 2, LEAF_DARK)
  px(img, CX + RX + 1 + sway, CY, LEAF_BASE)
  px(img, CX + RX + sway, CY + 3, LEAF_LIGHT)

  -- Top protruding leaves
  local topSway = offsets[((frame + 1) % 4) + 1]
  px(img, CX - 4 + topSway, CY - RY - 1, LEAF_LIGHT)
  px(img, CX + 3 + topSway, CY - RY, LEAF_BASE)
end

-- Berry positions (well inside canopy bounds)
local BERRY_POSITIONS = {
  { 10, 10 }, { 20, 9 },
  { 14, 15 }, { 22, 13 },
  { 8, 13 },  { 17, 8 },
}

local function drawBerries(img)
  for _, b in ipairs(BERRY_POSITIONS) do
    local bx, by = b[1], b[2]
    px(img, bx, by, BERRY_BASE)
    px(img, bx + 1, by, BERRY_BASE)
    px(img, bx, by + 1, BERRY_DARK)
    px(img, bx + 1, by + 1, BERRY_BASE)
    -- Highlight dot
    px(img, bx, by, BERRY_HI)
  end
end

-- Draw a complete frame
local function drawFrame(img, frame, withBerries)
  clearImg(img)
  drawShadow(img)
  drawTrunk(img)
  -- Each frame uses a different seed for subtle texture variation
  drawCanopy(img, 42 + frame * 137)
  drawSwayLeaves(img, frame)
  if withBerries then
    drawBerries(img)
  end
end

-- Full state (frames 1–4)
for f = 0, 3 do
  local idx = 1 + f
  app.activeFrame = spr.frames[idx]
  local cel = spr:newCel(spr.layers[1], idx)
  drawFrame(cel.image, f, true)
  spr.frames[idx].duration = 0.5
end

-- Picked state (frames 5–8)
for f = 0, 3 do
  local idx = 5 + f
  app.activeFrame = spr.frames[idx]
  local cel = spr:newCel(spr.layers[1], idx)
  drawFrame(cel.image, f, false)
  spr.frames[idx].duration = 0.5
end

-- Tags
local tagDefs = {
  { name = "full", from = 1, to = 4 },
  { name = "picked", from = 5, to = 8 },
}
for _, t in ipairs(tagDefs) do
  local tag = spr:newTag(t.name)
  tag.fromFrame = spr.frames[t.from]
  tag.toFrame = spr.frames[t.to]
  tag.aniDir = AniDir.FORWARD
end

spr:saveAs(app.fs.joinPath(outputDir, "berry-bush.aseprite"))
print("Created berry-bush.aseprite with " .. TOTAL_FRAMES .. " frames")
