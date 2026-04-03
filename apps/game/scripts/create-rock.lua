-- Create big rock sprite: 32x32, 4 animation frames (subtle shadow/highlight variation)
-- Run: aseprite -b --script-param script-path="$(pwd)/scripts/create-rock.lua" --script scripts/create-rock.lua

local W = 32
local H = 32
local TOTAL_FRAMES = 4

local scriptPath = app.params["script-path"] or "."
local outputDir = app.fs.joinPath(app.fs.filePath(scriptPath), "..", "assets", "ground")

local spr = Sprite{ width = W, height = H, colorMode = ColorMode.RGB }

for i = 2, TOTAL_FRAMES do
  spr:newEmptyFrame()
end

-- Colors
local CLEAR = Color{ r = 0, g = 0, b = 0, a = 0 }
local ROCK_BASE = Color{ r = 120, g = 115, b = 105, a = 255 }
local ROCK_DARK = Color{ r = 85, g = 80, b = 72, a = 255 }
local ROCK_LIGHT = Color{ r = 155, g = 150, b = 140, a = 255 }
local ROCK_HIGHLIGHT = Color{ r = 180, g = 175, b = 165, a = 255 }
local ROCK_SHADOW = Color{ r = 60, g = 56, b = 50, a = 255 }
local GROUND_SHADOW = Color{ r = 40, g = 55, b = 30, a = 120 }
local MOSS_BASE = Color{ r = 70, g = 100, b = 55, a = 255 }
local MOSS_DARK = Color{ r = 50, g = 75, b = 40, a = 255 }

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

-- Draw shadow directly under the rock
local function drawShadow(img)
  for x = 5, 27 do
    px(img, x, 24, GROUND_SHADOW)
  end
  for x = 7, 25 do
    px(img, x, 25, GROUND_SHADOW)
  end
  for x = 9, 23 do
    px(img, x, 26, GROUND_SHADOW)
  end
end

-- Draw the main rock shape
local function drawRock(img, seed)
  local rand = makeRng(seed)

  -- Large irregular boulder shape (roughly elliptical)
  local CX, CY = 16, 16
  local RX, RY = 11, 9

  -- Fill base shape
  for y = CY - RY, CY + RY do
    for x = CX - RX, CX + RX do
      local dx = (x - CX) / RX
      local dy = (y - CY) / RY
      if dx * dx + dy * dy <= 1.0 then
        px(img, x, y, ROCK_BASE)
      end
    end
  end

  -- Dark bottom/right edge
  for y = CY - RY, CY + RY do
    for x = CX - RX, CX + RX do
      local dx = (x - CX) / RX
      local dy = (y - CY) / RY
      local dist = dx * dx + dy * dy
      if dist > 0.6 and dist <= 1.0 then
        if dy > 0 or dx > 0.3 then
          px(img, x, y, ROCK_DARK)
        end
      end
    end
  end

  -- Very dark shadow at very bottom
  for y = CY + RY - 2, CY + RY do
    for x = CX - RX, CX + RX do
      local dx = (x - CX) / RX
      local dy = (y - CY) / RY
      local dist = dx * dx + dy * dy
      if dist > 0.75 and dist <= 1.0 then
        px(img, x, y, ROCK_SHADOW)
      end
    end
  end

  -- Upper-left highlight region
  for y = CY - RY, CY - 1 do
    for x = CX - RX, CX + 2 do
      local dx = (x - CX) / RX
      local dy = (y - CY) / RY
      local dist = dx * dx + dy * dy
      if dist < 0.5 then
        if rand(3) == 0 then
          px(img, x, y, ROCK_LIGHT)
        end
        if rand(6) == 0 then
          px(img, x, y, ROCK_HIGHLIGHT)
        end
      end
    end
  end

  -- Scattered texture variation
  for i = 1, 30 do
    local ax = CX - RX + rand(RX * 2)
    local ay = CY - RY + rand(RY * 2)
    local dx = (ax - CX) / RX
    local dy = (ay - CY) / RY
    if dx * dx + dy * dy < 0.8 then
      if rand(3) == 0 then
        px(img, ax, ay, ROCK_DARK)
      elseif rand(3) == 0 then
        px(img, ax, ay, ROCK_LIGHT)
      end
    end
  end

  -- Add some moss patches at the base
  for i = 1, 5 do
    local mx = CX - 5 + rand(10)
    local my = CY + 3 + rand(4)
    local mdx = (mx - CX) / RX
    local mdy = (my - CY) / RY
    if mdx * mdx + mdy * mdy < 0.9 then
      px(img, mx, my, MOSS_BASE)
      if rand(2) == 0 then
        px(img, mx + 1, my, MOSS_DARK)
      end
    end
  end

  -- Crack/crevice detail
  local crackY = CY - 2 + rand(4)
  local crackX = CX - 3 + rand(2)
  for i = 0, 3 do
    px(img, crackX + i, crackY, ROCK_SHADOW)
    if rand(2) == 0 then crackY = crackY + 1 end
  end
end

-- Draw a complete frame
local function drawFrame(img, frame)
  clearImg(img)
  drawShadow(img)
  -- Each frame uses a slightly different seed for subtle texture variation
  drawRock(img, 77 + frame * 151)
end

-- Generate 4 animation frames
for f = 0, 3 do
  local idx = 1 + f
  app.activeFrame = spr.frames[idx]
  local cel = spr:newCel(spr.layers[1], idx)
  drawFrame(cel.image, f)
  spr.frames[idx].duration = 0.5
end

spr:saveAs(app.fs.joinPath(outputDir, "rock-big.aseprite"))
print("Created rock-big.aseprite with " .. TOTAL_FRAMES .. " frames")
