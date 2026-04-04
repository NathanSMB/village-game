-- Create sheep sprite: 4 directions x 3 poses (idle, walk1, walk2) = 12 frames
-- dir: 0=down, 1=up, 2=left, 3=right
-- pose: 0=idle, 1=walk1, 2=walk2
-- Run: aseprite -b --script-param script-path="$(pwd)/scripts/create-sheep.lua" --script scripts/create-sheep.lua

local W = 32
local H = 32
local FRAMES = 12

local scriptPath = app.params["script-path"] or "."
local outputDir = app.fs.joinPath(app.fs.filePath(scriptPath), "..", "assets", "ground")

-- Colors
local CLEAR = Color{ r = 0, g = 0, b = 0, a = 0 }

-- Wool colors (warm off-white)
local WOOL = Color{ r = 235, g = 228, b = 210, a = 255 }
local WOOL_SHADOW = Color{ r = 200, g = 192, b = 175, a = 255 }
local WOOL_LIGHT = Color{ r = 248, g = 244, b = 235, a = 255 }
local WOOL_DARK = Color{ r = 175, g = 168, b = 152, a = 255 }

-- Head/leg colors (dark charcoal)
local HEAD = Color{ r = 55, g = 50, b = 48, a = 255 }
local HEAD_SHADOW = Color{ r = 38, g = 35, b = 33, a = 255 }
local HEAD_LIGHT = Color{ r = 75, g = 68, b = 64, a = 255 }

-- Features
local EYE = Color{ r = 20, g = 18, b = 16, a = 255 }
local EYE_SHINE = Color{ r = 220, g = 220, b = 230, a = 255 }
local EAR_INNER = Color{ r = 160, g = 120, b = 110, a = 255 }

-- Shadow on ground
local SHADOW = Color{ r = 30, g = 40, b = 30, a = 80 }

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

-- ─── Ground shadow ──────────────────────────────────────────────
local function drawShadow(img)
  for x = 8, 23 do
    px(img, x, 28, SHADOW)
  end
  for x = 10, 21 do
    px(img, x, 29, SHADOW)
  end
end

-- ─── Wool body (the fluffy oval) ────────────────────────────────
-- The body is centered around (16, 17) — slightly above center to leave room for legs
local function drawWoolBody(img, dir, pose)
  -- Body bob for walk animation
  local bodyBob = 0
  if pose == 1 then bodyBob = -1 end

  local bx = 8   -- body left X
  local by = 12 + bodyBob  -- body top Y
  local bw = 16  -- body width
  local bh = 12  -- body height

  -- Main wool body fill
  rect(img, bx, by, bw, bh, WOOL)

  -- Rounded corners (cut off the rectangle corners)
  px(img, bx, by, CLEAR)
  px(img, bx + bw - 1, by, CLEAR)
  px(img, bx, by + bh - 1, CLEAR)
  px(img, bx + bw - 1, by + bh - 1, CLEAR)

  -- Top fluff (wider on top, woolly texture)
  rect(img, bx + 1, by - 1, bw - 2, 1, WOOL_LIGHT)
  -- Puff pixels on top
  px(img, bx + 3, by - 2, WOOL)
  px(img, bx + 7, by - 2, WOOL_LIGHT)
  px(img, bx + 11, by - 2, WOOL)

  -- Bottom edge shadow
  rect(img, bx + 1, by + bh - 1, bw - 2, 1, WOOL_SHADOW)

  -- Side shading
  rect(img, bx, by + 1, 1, bh - 2, WOOL_SHADOW)
  rect(img, bx + bw - 1, by + 1, 1, bh - 2, WOOL_SHADOW)

  -- Light highlights (upper-left region for 3D look)
  px(img, bx + 2, by + 1, WOOL_LIGHT)
  px(img, bx + 3, by + 1, WOOL_LIGHT)
  px(img, bx + 4, by + 2, WOOL_LIGHT)

  -- Fluffy texture dots scattered
  px(img, bx + 5, by + 3, WOOL_DARK)
  px(img, bx + 10, by + 4, WOOL_DARK)
  px(img, bx + 3, by + 6, WOOL_DARK)
  px(img, bx + 12, by + 7, WOOL_DARK)
  px(img, bx + 7, by + 8, WOOL_DARK)

  -- Extra fluff highlights
  px(img, bx + 8, by + 2, WOOL_LIGHT)
  px(img, bx + 13, by + 3, WOOL_LIGHT)
  px(img, bx + 6, by + 5, WOOL_LIGHT)

  -- Tail fluff (direction-dependent)
  if dir == 2 then
    -- Facing left: tail on right
    px(img, bx + bw, by + 2, WOOL)
    px(img, bx + bw, by + 3, WOOL_LIGHT)
    px(img, bx + bw + 1, by + 2, WOOL_SHADOW)
  elseif dir == 3 then
    -- Facing right: tail on left
    px(img, bx - 1, by + 2, WOOL)
    px(img, bx - 1, by + 3, WOOL_LIGHT)
    px(img, bx - 2, by + 2, WOOL_SHADOW)
  else
    -- Front/back: small tail bump on right side
    px(img, bx + bw, by + 3, WOOL)
    px(img, bx + bw, by + 4, WOOL_SHADOW)
  end
end

-- ─── Legs ───────────────────────────────────────────────────────
local function drawLegs(img, dir, pose)
  local bodyBob = 0
  if pose == 1 then bodyBob = -1 end

  local legTop = 23 + bodyBob  -- legs start where body ends
  local legH = 5

  -- Walk animation: legs shift
  local frontShift = 0
  local backShift = 0
  if pose == 1 then frontShift = 1; backShift = -1 end
  if pose == 2 then frontShift = -1; backShift = 1 end

  if dir == 0 or dir == 1 then
    -- Front/back view: 4 legs visible
    -- Front-left leg
    rect(img, 10, legTop + frontShift, 2, legH, HEAD)
    px(img, 10, legTop + frontShift, HEAD_LIGHT)
    -- Front-right leg
    rect(img, 20, legTop + backShift, 2, legH, HEAD)
    px(img, 20, legTop + backShift, HEAD_LIGHT)
    -- Back-left leg (slightly behind)
    rect(img, 13, legTop + backShift, 2, legH, HEAD_SHADOW)
    -- Back-right leg
    rect(img, 17, legTop + frontShift, 2, legH, HEAD_SHADOW)

    -- Hooves (lighter tips)
    px(img, 10, legTop + legH - 1 + frontShift, HEAD_LIGHT)
    px(img, 11, legTop + legH - 1 + frontShift, HEAD_LIGHT)
    px(img, 20, legTop + legH - 1 + backShift, HEAD_LIGHT)
    px(img, 21, legTop + legH - 1 + backShift, HEAD_LIGHT)

  elseif dir == 2 then
    -- Left view: 2 visible legs (near side), 2 far-side legs behind
    -- Far legs (darker, behind body)
    rect(img, 13, legTop + backShift, 2, legH, HEAD_SHADOW)
    rect(img, 19, legTop + frontShift, 2, legH, HEAD_SHADOW)
    -- Near legs (brighter, in front)
    rect(img, 11, legTop + frontShift, 2, legH, HEAD)
    px(img, 11, legTop + frontShift, HEAD_LIGHT)
    rect(img, 17, legTop + backShift, 2, legH, HEAD)
    px(img, 17, legTop + backShift, HEAD_LIGHT)
    -- Hooves
    px(img, 11, legTop + legH - 1 + frontShift, HEAD_LIGHT)
    px(img, 12, legTop + legH - 1 + frontShift, HEAD_LIGHT)
    px(img, 17, legTop + legH - 1 + backShift, HEAD_LIGHT)
    px(img, 18, legTop + legH - 1 + backShift, HEAD_LIGHT)

  else
    -- Right view: mirror of left
    rect(img, 11, legTop + frontShift, 2, legH, HEAD_SHADOW)
    rect(img, 17, legTop + backShift, 2, legH, HEAD_SHADOW)
    rect(img, 13, legTop + backShift, 2, legH, HEAD)
    px(img, 14, legTop + backShift, HEAD_LIGHT)
    rect(img, 19, legTop + frontShift, 2, legH, HEAD)
    px(img, 20, legTop + frontShift, HEAD_LIGHT)
    -- Hooves
    px(img, 13, legTop + legH - 1 + backShift, HEAD_LIGHT)
    px(img, 14, legTop + legH - 1 + backShift, HEAD_LIGHT)
    px(img, 19, legTop + legH - 1 + frontShift, HEAD_LIGHT)
    px(img, 20, legTop + legH - 1 + frontShift, HEAD_LIGHT)
  end
end

-- ─── Head ───────────────────────────────────────────────────────
local function drawHead(img, dir, pose)
  local bodyBob = 0
  if pose == 1 then bodyBob = -1 end

  -- Head bob when walking (opposite of body)
  local headBob = 0
  if pose == 1 then headBob = 0 end
  if pose == 2 then headBob = -1 end

  if dir == 0 then
    -- Facing down (toward camera): head in front of body
    local hx = 12
    local hy = 6 + bodyBob + headBob

    -- Head shape (6x7 with rounded top)
    rect(img, hx, hy + 1, 8, 6, HEAD)
    rect(img, hx + 1, hy, 6, 1, HEAD)
    -- Shading
    px(img, hx, hy + 1, HEAD_SHADOW)
    px(img, hx + 7, hy + 1, HEAD_SHADOW)
    rect(img, hx + 1, hy + 6, 6, 1, HEAD_SHADOW)
    -- Light on forehead
    px(img, hx + 3, hy + 1, HEAD_LIGHT)
    px(img, hx + 4, hy + 1, HEAD_LIGHT)

    -- Eyes
    px(img, hx + 2, hy + 3, EYE)
    px(img, hx + 5, hy + 3, EYE)
    -- Eye shine
    px(img, hx + 2, hy + 2, EYE_SHINE)
    px(img, hx + 5, hy + 2, EYE_SHINE)

    -- Nose/mouth
    px(img, hx + 3, hy + 5, HEAD_LIGHT)
    px(img, hx + 4, hy + 5, HEAD_LIGHT)

    -- Ears (sticking out sides)
    px(img, hx - 1, hy + 1, HEAD)
    px(img, hx - 1, hy + 2, HEAD)
    px(img, hx - 1, hy + 2, EAR_INNER)
    px(img, hx + 8, hy + 1, HEAD)
    px(img, hx + 8, hy + 2, HEAD)
    px(img, hx + 8, hy + 2, EAR_INNER)

    -- Wool tuft on top
    px(img, hx + 2, hy - 1, WOOL)
    px(img, hx + 3, hy - 1, WOOL_LIGHT)
    px(img, hx + 4, hy - 1, WOOL)
    px(img, hx + 5, hy - 1, WOOL_LIGHT)
    px(img, hx + 3, hy - 2, WOOL)
    px(img, hx + 4, hy - 2, WOOL)

  elseif dir == 1 then
    -- Facing up (away from camera): back of head
    local hx = 12
    local hy = 6 + bodyBob + headBob

    -- Head shape
    rect(img, hx, hy + 1, 8, 6, HEAD)
    rect(img, hx + 1, hy, 6, 1, HEAD)
    -- Shading
    px(img, hx, hy + 1, HEAD_SHADOW)
    px(img, hx + 7, hy + 1, HEAD_SHADOW)
    rect(img, hx + 1, hy + 6, 6, 1, HEAD_SHADOW)
    -- Subtle highlight on top
    px(img, hx + 3, hy + 1, HEAD_LIGHT)
    px(img, hx + 4, hy + 1, HEAD_LIGHT)

    -- Ears
    px(img, hx - 1, hy + 1, HEAD)
    px(img, hx - 1, hy + 2, EAR_INNER)
    px(img, hx + 8, hy + 1, HEAD)
    px(img, hx + 8, hy + 2, EAR_INNER)

    -- Wool tuft on top (bigger since viewed from back)
    px(img, hx + 2, hy - 1, WOOL)
    px(img, hx + 3, hy - 1, WOOL_LIGHT)
    px(img, hx + 4, hy - 1, WOOL)
    px(img, hx + 5, hy - 1, WOOL_LIGHT)
    px(img, hx + 3, hy - 2, WOOL_LIGHT)
    px(img, hx + 4, hy - 2, WOOL)
    px(img, hx + 2, hy - 2, WOOL_SHADOW)
    px(img, hx + 5, hy - 2, WOOL_SHADOW)

  elseif dir == 2 then
    -- Facing left: head on left side of body
    local hx = 3
    local hy = 8 + bodyBob + headBob

    -- Head shape (7x7)
    rect(img, hx, hy + 1, 7, 6, HEAD)
    rect(img, hx + 1, hy, 5, 1, HEAD)
    -- Shading
    px(img, hx, hy + 1, HEAD_SHADOW)
    px(img, hx, hy + 6, HEAD_SHADOW)
    rect(img, hx + 1, hy + 6, 5, 1, HEAD_SHADOW)
    -- Light
    px(img, hx + 2, hy + 1, HEAD_LIGHT)
    px(img, hx + 3, hy + 1, HEAD_LIGHT)

    -- Eye (only one visible from side)
    px(img, hx + 2, hy + 3, EYE)
    px(img, hx + 2, hy + 2, EYE_SHINE)

    -- Nose
    px(img, hx, hy + 4, HEAD_LIGHT)
    px(img, hx - 1, hy + 4, HEAD_LIGHT)

    -- Ear (top, pointing left-up)
    px(img, hx + 1, hy - 1, HEAD)
    px(img, hx, hy - 1, EAR_INNER)
    px(img, hx + 2, hy - 1, HEAD)

    -- Wool tuft
    px(img, hx + 4, hy - 1, WOOL)
    px(img, hx + 5, hy - 1, WOOL_LIGHT)
    px(img, hx + 5, hy - 2, WOOL)
    px(img, hx + 6, hy - 1, WOOL)

  else
    -- Facing right: mirror of left
    local hx = 22
    local hy = 8 + bodyBob + headBob

    -- Head shape
    rect(img, hx, hy + 1, 7, 6, HEAD)
    rect(img, hx + 1, hy, 5, 1, HEAD)
    -- Shading
    px(img, hx + 6, hy + 1, HEAD_SHADOW)
    px(img, hx + 6, hy + 6, HEAD_SHADOW)
    rect(img, hx + 1, hy + 6, 5, 1, HEAD_SHADOW)
    -- Light
    px(img, hx + 3, hy + 1, HEAD_LIGHT)
    px(img, hx + 4, hy + 1, HEAD_LIGHT)

    -- Eye
    px(img, hx + 4, hy + 3, EYE)
    px(img, hx + 4, hy + 2, EYE_SHINE)

    -- Nose
    px(img, hx + 6, hy + 4, HEAD_LIGHT)
    px(img, hx + 7, hy + 4, HEAD_LIGHT)

    -- Ear
    px(img, hx + 4, hy - 1, HEAD)
    px(img, hx + 5, hy - 1, EAR_INNER)
    px(img, hx + 6, hy - 1, HEAD)

    -- Wool tuft
    px(img, hx - 1, hy - 1, WOOL)
    px(img, hx, hy - 1, WOOL_LIGHT)
    px(img, hx, hy - 2, WOOL)
    px(img, hx + 1, hy - 1, WOOL)
  end
end

-- ─── Full frame ─────────────────────────────────────────────────
local function drawFrame(img, dir, pose)
  clearImg(img)
  drawShadow(img)
  drawLegs(img, dir, pose)
  drawWoolBody(img, dir, pose)
  drawHead(img, dir, pose)
end

-- ─── Create sprite ──────────────────────────────────────────────
local spr = Sprite{ width = W, height = H, colorMode = ColorMode.RGB }
for i = 2, FRAMES do
  spr:newEmptyFrame()
end

for dir = 0, 3 do
  for pose = 0, 2 do
    local frameIdx = dir * 3 + pose + 1
    app.activeFrame = spr.frames[frameIdx]
    local cel = spr:newCel(spr.layers[1], frameIdx)
    drawFrame(cel.image, dir, pose)
    spr.frames[frameIdx].duration = 0.2
  end
end

-- Tags for each direction
local tagDefs = {
  { name = "down",  from = 1, to = 3 },
  { name = "up",    from = 4, to = 6 },
  { name = "left",  from = 7, to = 9 },
  { name = "right", from = 10, to = 12 },
}
for _, t in ipairs(tagDefs) do
  local tag = spr:newTag(t.name)
  tag.fromFrame = spr.frames[t.from]
  tag.toFrame = spr.frames[t.to]
  tag.aniDir = AniDir.FORWARD
end

spr:saveAs(app.fs.joinPath(outputDir, "sheep.aseprite"))
print("Created sheep.aseprite with " .. FRAMES .. " frames")
