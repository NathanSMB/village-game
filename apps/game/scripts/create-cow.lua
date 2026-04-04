-- Create cow sprite: 4 directions x 3 poses (idle, walk1, walk2) = 12 frames
-- dir: 0=down, 1=up, 2=left, 3=right
-- pose: 0=idle, 1=walk1, 2=walk2
-- Run: aseprite -b --script-param script-path="$(pwd)/scripts/create-cow.lua" --script scripts/create-cow.lua

local W = 32
local H = 32
local FRAMES = 12

local scriptPath = app.params["script-path"] or "."
local outputDir = app.fs.joinPath(app.fs.filePath(scriptPath), "..", "assets", "ground")

-- Colors
local CLEAR = Color{ r = 0, g = 0, b = 0, a = 0 }

-- Body colors (brown cow)
local BODY = Color{ r = 140, g = 85, b = 50, a = 255 }
local BODY_SHADOW = Color{ r = 105, g = 60, b = 35, a = 255 }
local BODY_LIGHT = Color{ r = 175, g = 115, b = 72, a = 255 }
local BODY_DARK = Color{ r = 80, g = 48, b = 28, a = 255 }

-- White patches
local PATCH = Color{ r = 235, g = 228, b = 215, a = 255 }
local PATCH_SHADOW = Color{ r = 200, g = 192, b = 178, a = 255 }
local PATCH_LIGHT = Color{ r = 248, g = 244, b = 235, a = 255 }

-- Head colors (darker brown)
local HEAD = Color{ r = 110, g = 70, b = 42, a = 255 }
local HEAD_SHADOW = Color{ r = 80, g = 48, b = 28, a = 255 }
local HEAD_LIGHT = Color{ r = 145, g = 95, b = 60, a = 255 }

-- Features
local EYE = Color{ r = 25, g = 20, b = 15, a = 255 }
local EYE_SHINE = Color{ r = 200, g = 200, b = 210, a = 255 }
local NOSE = Color{ r = 160, g = 110, b = 85, a = 255 }
local EAR_INNER = Color{ r = 170, g = 120, b = 100, a = 255 }

-- Horns
local HORN = Color{ r = 210, g = 195, b = 165, a = 255 }
local HORN_D = Color{ r = 175, g = 160, b = 130, a = 255 }

-- Shadow on ground
local SHADOW = Color{ r = 30, g = 40, b = 30, a = 80 }

-- Leg colors (dark brown, like head)
local LEG = Color{ r = 100, g = 65, b = 38, a = 255 }
local LEG_SHADOW = Color{ r = 70, g = 45, b = 25, a = 255 }
local LEG_LIGHT = Color{ r = 130, g = 85, b = 55, a = 255 }
local HOOF = Color{ r = 55, g = 40, b = 28, a = 255 }

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

-- Ground shadow
local function drawShadow(img)
  for x = 7, 24 do
    px(img, x, 28, SHADOW)
  end
  for x = 9, 22 do
    px(img, x, 29, SHADOW)
  end
end

-- Cow body (large brown rectangle with white patches)
local function drawBody(img, dir, pose)
  local bodyBob = 0
  if pose == 1 then bodyBob = -1 end

  local bx = 7    -- body left X
  local by = 12 + bodyBob  -- body top Y
  local bw = 18   -- body width (wider than sheep)
  local bh = 12   -- body height

  -- Main body fill
  rect(img, bx, by, bw, bh, BODY)

  -- Rounded corners
  px(img, bx, by, CLEAR)
  px(img, bx + bw - 1, by, CLEAR)
  px(img, bx, by + bh - 1, CLEAR)
  px(img, bx + bw - 1, by + bh - 1, CLEAR)

  -- Top edge highlight
  rect(img, bx + 1, by, bw - 2, 1, BODY_LIGHT)

  -- Bottom edge shadow
  rect(img, bx + 1, by + bh - 1, bw - 2, 1, BODY_SHADOW)

  -- Side shading
  rect(img, bx, by + 1, 1, bh - 2, BODY_SHADOW)
  rect(img, bx + bw - 1, by + 1, 1, bh - 2, BODY_SHADOW)

  -- Light highlights (upper region for 3D look)
  px(img, bx + 2, by + 1, BODY_LIGHT)
  px(img, bx + 3, by + 1, BODY_LIGHT)
  px(img, bx + 4, by + 2, BODY_LIGHT)

  -- White patches (cow pattern)
  -- Large white patch on body center
  rect(img, bx + 5, by + 2, 5, 4, PATCH)
  rect(img, bx + 4, by + 3, 7, 2, PATCH)
  -- Patch shading
  px(img, bx + 4, by + 4, PATCH_SHADOW)
  px(img, bx + 10, by + 3, PATCH_SHADOW)
  px(img, bx + 6, by + 2, PATCH_LIGHT)
  px(img, bx + 7, by + 2, PATCH_LIGHT)

  -- Second smaller patch
  rect(img, bx + 11, by + 5, 4, 3, PATCH)
  px(img, bx + 14, by + 7, PATCH_SHADOW)
  px(img, bx + 11, by + 5, PATCH_LIGHT)

  -- Subtle body texture
  px(img, bx + 3, by + 5, BODY_DARK)
  px(img, bx + 8, by + 8, BODY_DARK)
  px(img, bx + 14, by + 3, BODY_DARK)

  -- Tail (direction-dependent)
  if dir == 2 then
    -- Facing left: tail on right
    px(img, bx + bw, by + 2, BODY)
    px(img, bx + bw, by + 3, BODY_SHADOW)
    px(img, bx + bw + 1, by + 3, BODY_DARK)
    px(img, bx + bw + 1, by + 4, BODY_DARK)
  elseif dir == 3 then
    -- Facing right: tail on left
    px(img, bx - 1, by + 2, BODY)
    px(img, bx - 1, by + 3, BODY_SHADOW)
    px(img, bx - 2, by + 3, BODY_DARK)
    px(img, bx - 2, by + 4, BODY_DARK)
  else
    -- Front/back: tail on right side
    px(img, bx + bw, by + 3, BODY)
    px(img, bx + bw, by + 4, BODY_SHADOW)
    px(img, bx + bw + 1, by + 4, BODY_DARK)
  end
end

-- Legs
local function drawLegs(img, dir, pose)
  local bodyBob = 0
  if pose == 1 then bodyBob = -1 end

  local legTop = 23 + bodyBob
  local legH = 5

  local frontShift = 0
  local backShift = 0
  if pose == 1 then frontShift = 1; backShift = -1 end
  if pose == 2 then frontShift = -1; backShift = 1 end

  if dir == 0 or dir == 1 then
    -- Front/back view: 4 legs visible
    -- Front-left leg
    rect(img, 9, legTop + frontShift, 2, legH, LEG)
    px(img, 9, legTop + frontShift, LEG_LIGHT)
    -- Front-right leg
    rect(img, 21, legTop + backShift, 2, legH, LEG)
    px(img, 21, legTop + backShift, LEG_LIGHT)
    -- Back-left leg
    rect(img, 12, legTop + backShift, 2, legH, LEG_SHADOW)
    -- Back-right leg
    rect(img, 18, legTop + frontShift, 2, legH, LEG_SHADOW)

    -- Hooves
    px(img, 9, legTop + legH - 1 + frontShift, HOOF)
    px(img, 10, legTop + legH - 1 + frontShift, HOOF)
    px(img, 21, legTop + legH - 1 + backShift, HOOF)
    px(img, 22, legTop + legH - 1 + backShift, HOOF)

  elseif dir == 2 then
    -- Left view
    rect(img, 12, legTop + backShift, 2, legH, LEG_SHADOW)
    rect(img, 19, legTop + frontShift, 2, legH, LEG_SHADOW)
    rect(img, 10, legTop + frontShift, 2, legH, LEG)
    px(img, 10, legTop + frontShift, LEG_LIGHT)
    rect(img, 17, legTop + backShift, 2, legH, LEG)
    px(img, 17, legTop + backShift, LEG_LIGHT)
    -- Hooves
    px(img, 10, legTop + legH - 1 + frontShift, HOOF)
    px(img, 11, legTop + legH - 1 + frontShift, HOOF)
    px(img, 17, legTop + legH - 1 + backShift, HOOF)
    px(img, 18, legTop + legH - 1 + backShift, HOOF)

  else
    -- Right view (mirror of left)
    rect(img, 11, legTop + frontShift, 2, legH, LEG_SHADOW)
    rect(img, 17, legTop + backShift, 2, legH, LEG_SHADOW)
    rect(img, 13, legTop + backShift, 2, legH, LEG)
    px(img, 14, legTop + backShift, LEG_LIGHT)
    rect(img, 20, legTop + frontShift, 2, legH, LEG)
    px(img, 21, legTop + frontShift, LEG_LIGHT)
    -- Hooves
    px(img, 13, legTop + legH - 1 + backShift, HOOF)
    px(img, 14, legTop + legH - 1 + backShift, HOOF)
    px(img, 20, legTop + legH - 1 + frontShift, HOOF)
    px(img, 21, legTop + legH - 1 + frontShift, HOOF)
  end
end

-- Head
local function drawHead(img, dir, pose)
  local bodyBob = 0
  if pose == 1 then bodyBob = -1 end

  local headBob = 0
  if pose == 1 then headBob = 0 end
  if pose == 2 then headBob = -1 end

  if dir == 0 then
    -- Facing down (toward camera)
    local hx = 11
    local hy = 6 + bodyBob + headBob

    -- Head shape (10x7 - wider than sheep)
    rect(img, hx, hy + 1, 10, 6, HEAD)
    rect(img, hx + 1, hy, 8, 1, HEAD)
    -- Shading
    px(img, hx, hy + 1, HEAD_SHADOW)
    px(img, hx + 9, hy + 1, HEAD_SHADOW)
    rect(img, hx + 1, hy + 6, 8, 1, HEAD_SHADOW)
    -- Light on forehead
    px(img, hx + 3, hy + 1, HEAD_LIGHT)
    px(img, hx + 4, hy + 1, HEAD_LIGHT)
    px(img, hx + 5, hy + 1, HEAD_LIGHT)

    -- White blaze on face
    px(img, hx + 4, hy + 2, PATCH)
    px(img, hx + 5, hy + 2, PATCH)
    px(img, hx + 4, hy + 3, PATCH)
    px(img, hx + 5, hy + 3, PATCH)

    -- Eyes
    px(img, hx + 2, hy + 3, EYE)
    px(img, hx + 7, hy + 3, EYE)
    px(img, hx + 2, hy + 2, EYE_SHINE)
    px(img, hx + 7, hy + 2, EYE_SHINE)

    -- Nose / muzzle (wider than sheep)
    rect(img, hx + 3, hy + 5, 4, 1, NOSE)
    px(img, hx + 3, hy + 5, HEAD_LIGHT)
    px(img, hx + 6, hy + 5, HEAD_LIGHT)

    -- Ears
    px(img, hx - 1, hy + 1, HEAD)
    px(img, hx - 1, hy + 2, EAR_INNER)
    px(img, hx + 10, hy + 1, HEAD)
    px(img, hx + 10, hy + 2, EAR_INNER)

    -- Horns
    px(img, hx + 1, hy - 1, HORN)
    px(img, hx, hy - 2, HORN)
    px(img, hx, hy - 2, HORN_D)
    px(img, hx + 8, hy - 1, HORN)
    px(img, hx + 9, hy - 2, HORN)
    px(img, hx + 9, hy - 2, HORN_D)

  elseif dir == 1 then
    -- Facing up (away from camera)
    local hx = 11
    local hy = 6 + bodyBob + headBob

    -- Head shape
    rect(img, hx, hy + 1, 10, 6, HEAD)
    rect(img, hx + 1, hy, 8, 1, HEAD)
    -- Shading
    px(img, hx, hy + 1, HEAD_SHADOW)
    px(img, hx + 9, hy + 1, HEAD_SHADOW)
    rect(img, hx + 1, hy + 6, 8, 1, HEAD_SHADOW)
    px(img, hx + 4, hy + 1, HEAD_LIGHT)
    px(img, hx + 5, hy + 1, HEAD_LIGHT)

    -- Ears
    px(img, hx - 1, hy + 1, HEAD)
    px(img, hx - 1, hy + 2, EAR_INNER)
    px(img, hx + 10, hy + 1, HEAD)
    px(img, hx + 10, hy + 2, EAR_INNER)

    -- Horns (more visible from back)
    px(img, hx + 1, hy - 1, HORN)
    px(img, hx, hy - 2, HORN)
    px(img, hx - 1, hy - 2, HORN_D)
    px(img, hx + 8, hy - 1, HORN)
    px(img, hx + 9, hy - 2, HORN)
    px(img, hx + 10, hy - 2, HORN_D)

    -- White patch on back of head
    px(img, hx + 4, hy + 2, PATCH)
    px(img, hx + 5, hy + 2, PATCH)

  elseif dir == 2 then
    -- Facing left
    local hx = 2
    local hy = 8 + bodyBob + headBob

    -- Head shape (8x7)
    rect(img, hx, hy + 1, 8, 6, HEAD)
    rect(img, hx + 1, hy, 6, 1, HEAD)
    -- Shading
    px(img, hx, hy + 1, HEAD_SHADOW)
    px(img, hx, hy + 6, HEAD_SHADOW)
    rect(img, hx + 1, hy + 6, 6, 1, HEAD_SHADOW)
    px(img, hx + 2, hy + 1, HEAD_LIGHT)
    px(img, hx + 3, hy + 1, HEAD_LIGHT)

    -- Eye
    px(img, hx + 2, hy + 3, EYE)
    px(img, hx + 2, hy + 2, EYE_SHINE)

    -- Nose / muzzle
    px(img, hx, hy + 4, NOSE)
    px(img, hx - 1, hy + 4, NOSE)
    px(img, hx - 1, hy + 5, HEAD_SHADOW)

    -- Ear
    px(img, hx + 2, hy - 1, HEAD)
    px(img, hx + 1, hy - 1, EAR_INNER)

    -- Horn
    px(img, hx + 4, hy - 1, HORN)
    px(img, hx + 5, hy - 2, HORN)
    px(img, hx + 5, hy - 2, HORN_D)

    -- White blaze
    px(img, hx + 3, hy + 2, PATCH)
    px(img, hx + 3, hy + 3, PATCH)

  else
    -- Facing right (mirror of left)
    local hx = 22
    local hy = 8 + bodyBob + headBob

    -- Head shape
    rect(img, hx, hy + 1, 8, 6, HEAD)
    rect(img, hx + 1, hy, 6, 1, HEAD)
    -- Shading
    px(img, hx + 7, hy + 1, HEAD_SHADOW)
    px(img, hx + 7, hy + 6, HEAD_SHADOW)
    rect(img, hx + 1, hy + 6, 6, 1, HEAD_SHADOW)
    px(img, hx + 4, hy + 1, HEAD_LIGHT)
    px(img, hx + 5, hy + 1, HEAD_LIGHT)

    -- Eye
    px(img, hx + 5, hy + 3, EYE)
    px(img, hx + 5, hy + 2, EYE_SHINE)

    -- Nose / muzzle
    px(img, hx + 7, hy + 4, NOSE)
    px(img, hx + 8, hy + 4, NOSE)
    px(img, hx + 8, hy + 5, HEAD_SHADOW)

    -- Ear
    px(img, hx + 5, hy - 1, HEAD)
    px(img, hx + 6, hy - 1, EAR_INNER)

    -- Horn
    px(img, hx + 3, hy - 1, HORN)
    px(img, hx + 2, hy - 2, HORN)
    px(img, hx + 2, hy - 2, HORN_D)

    -- White blaze
    px(img, hx + 4, hy + 2, PATCH)
    px(img, hx + 4, hy + 3, PATCH)
  end
end

-- Full frame
local function drawFrame(img, dir, pose)
  clearImg(img)
  drawShadow(img)
  drawLegs(img, dir, pose)
  drawBody(img, dir, pose)
  drawHead(img, dir, pose)
end

-- Create sprite
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

spr:saveAs(app.fs.joinPath(outputDir, "cow.aseprite"))
print("Created cow.aseprite with " .. FRAMES .. " frames")
