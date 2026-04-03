-- Create male and female body sprites with 20 frames each
-- Frames 1-12:  Down(idle,walk1,walk2), Up(...), Left(...), Right(...)
-- Frames 13-20: Down(reach,grab), Up(reach,grab), Left(reach,grab), Right(reach,grab)
-- Uses magenta reference colors for palette swapping

local W = 32
local H = 32
local FRAMES = 20

local scriptPath = app.params["script-path"] or "."
local outputDir = app.fs.joinPath(app.fs.filePath(scriptPath), "..", "assets", "characters", "body")

-- Reference colors for skin
local SKIN = Color{ r = 255, g = 0, b = 255, a = 255 }       -- #FF00FF base
local SKIN_SHADOW = Color{ r = 204, g = 0, b = 204, a = 255 } -- #CC00CC shadow
local SKIN_HIGHLIGHT = Color{ r = 255, g = 102, b = 255, a = 255 } -- #FF66FF highlight
local UNDERWEAR = Color{ r = 200, g = 200, b = 210, a = 255 }
local EYE = Color{ r = 40, g = 35, b = 30, a = 255 }
local CLEAR = Color{ r = 0, g = 0, b = 0, a = 0 }

-- Directions: down=0, up=1, left=2, right=3
-- Each direction has 3 frames: idle, walk1, walk2

local bodyW = 10
local bodyX = math.floor((W - bodyW) / 2)
local headW = 10
local headX = math.floor((W - headW) / 2)
local armW = 2

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

-- Draw standard arms (idle/walk)
local function drawNormalArms(img, pose)
  local armSwing = 0
  if pose == 1 then armSwing = -1 end
  if pose == 2 then armSwing = 1 end

  local leftArmY = 14 + armSwing
  local rightArmY = 14 - armSwing
  rect(img, bodyX - armW, leftArmY, armW, 8, SKIN)
  rect(img, bodyX + bodyW, rightArmY, armW, 8, SKIN)
  px(img, bodyX - armW, leftArmY, SKIN_SHADOW)
  px(img, bodyX + bodyW + armW - 1, rightArmY, SKIN_SHADOW)
end

-- Draw reaching arms for pick animation
-- pickPose: 0 = reach (extended), 1 = grab (retracted)
local function drawPickArms(img, dir, pickPose)
  local reach = (pickPose == 0)

  if dir == 0 then
    -- Down-facing: right arm extends downward
    -- Left arm normal
    rect(img, bodyX - armW, 14, armW, 8, SKIN)
    px(img, bodyX - armW, 14, SKIN_SHADOW)
    -- Right arm extends down
    local extra = reach and 4 or 2
    rect(img, bodyX + bodyW, 14, armW, 8 + extra, SKIN)
    px(img, bodyX + bodyW + armW - 1, 14, SKIN_SHADOW)
    -- Hand highlight at tip
    px(img, bodyX + bodyW, 14 + 7 + extra, SKIN_HIGHLIGHT)
    px(img, bodyX + bodyW + 1, 14 + 7 + extra, SKIN_HIGHLIGHT)

  elseif dir == 1 then
    -- Up-facing: right arm extends upward
    -- Left arm normal
    rect(img, bodyX - armW, 14, armW, 8, SKIN)
    px(img, bodyX - armW, 14, SKIN_SHADOW)
    -- Right arm extends up
    local extra = reach and 4 or 2
    rect(img, bodyX + bodyW, 14 - extra, armW, 8 + extra, SKIN)
    px(img, bodyX + bodyW + armW - 1, 14 - extra, SKIN_SHADOW)
    px(img, bodyX + bodyW, 14 - extra, SKIN_HIGHLIGHT)
    px(img, bodyX + bodyW + 1, 14 - extra, SKIN_HIGHLIGHT)

  elseif dir == 2 then
    -- Left-facing: left arm extends horizontally to the left
    local len = reach and 6 or 4
    rect(img, bodyX - len, 16, len, armW, SKIN)
    px(img, bodyX - len, 16, SKIN_SHADOW)
    px(img, bodyX - len, 17, SKIN_SHADOW)
    -- Hand at fingertip
    px(img, bodyX - len, 16, SKIN_HIGHLIGHT)
    -- Right arm normal
    rect(img, bodyX + bodyW, 14, armW, 8, SKIN)
    px(img, bodyX + bodyW + armW - 1, 14, SKIN_SHADOW)

  elseif dir == 3 then
    -- Right-facing: right arm extends horizontally to the right
    local len = reach and 6 or 4
    -- Left arm normal
    rect(img, bodyX - armW, 14, armW, 8, SKIN)
    px(img, bodyX - armW, 14, SKIN_SHADOW)
    -- Right arm horizontal
    rect(img, bodyX + bodyW, 16, len, armW, SKIN)
    px(img, bodyX + bodyW + len - 1, 16, SKIN_SHADOW)
    px(img, bodyX + bodyW + len - 1, 17, SKIN_SHADOW)
    -- Hand at fingertip
    px(img, bodyX + bodyW + len - 1, 16, SKIN_HIGHLIGHT)
  end
end

local function drawBody(img, dir, pose, isFemale, skipArms)
  clearImg(img)

  -- Leg offset for walk animation
  local legShift = 0
  if pose == 1 then legShift = 1 end
  if pose == 2 then legShift = -1 end

  -- === HEAD ===
  rect(img, headX + 1, 4, headW - 2, 1, SKIN) -- top
  rect(img, headX, 5, headW, 8, SKIN)          -- main
  rect(img, headX + 1, 13, headW - 2, 1, SKIN) -- chin

  -- Head shadow (sides)
  if dir == 0 or dir == 1 then
    rect(img, headX, 5, 1, 8, SKIN_SHADOW)
    rect(img, headX + headW - 1, 5, 1, 8, SKIN_SHADOW)
  elseif dir == 2 then
    rect(img, headX + headW - 2, 5, 2, 8, SKIN_SHADOW)
  elseif dir == 3 then
    rect(img, headX, 5, 2, 8, SKIN_SHADOW)
  end

  -- Head highlight
  rect(img, headX + 2, 5, 2, 1, SKIN_HIGHLIGHT)

  -- === EYES (only for down and side views) ===
  if dir == 0 then
    px(img, headX + 2, 8, EYE)
    px(img, headX + 3, 8, EYE)
    px(img, headX + headW - 4, 8, EYE)
    px(img, headX + headW - 3, 8, EYE)
  elseif dir == 2 then
    px(img, headX + 1, 8, EYE)
    px(img, headX + 2, 8, EYE)
  elseif dir == 3 then
    px(img, headX + headW - 3, 8, EYE)
    px(img, headX + headW - 2, 8, EYE)
  end

  -- === TORSO ===
  rect(img, bodyX, 14, bodyW, 10, SKIN)
  rect(img, bodyX, 14, 1, 10, SKIN_SHADOW)
  rect(img, bodyX + bodyW - 1, 14, 1, 10, SKIN_SHADOW)

  -- === ARMS ===
  if not skipArms then
    drawNormalArms(img, pose)
  end

  -- === FEMALE CHEST DETAIL + BRA ===
  if isFemale then
    if dir == 0 then
      rect(img, bodyX + 1, 17, 3, 1, SKIN_SHADOW)
      rect(img, bodyX + bodyW - 4, 17, 3, 1, SKIN_SHADOW)
      rect(img, bodyX, 16, bodyW, 2, UNDERWEAR)
    elseif dir == 2 or dir == 3 then
      rect(img, bodyX, 16, bodyW, 2, UNDERWEAR)
    end
  end

  -- === UNDERWEAR ===
  rect(img, bodyX, 22, bodyW, 3, UNDERWEAR)

  -- === LEGS ===
  local legW = 3
  local legGap = 2
  local leftLegX = math.floor((W - legGap) / 2) - legW
  local rightLegX = math.floor((W - legGap) / 2) + legGap

  if dir == 0 or dir == 1 then
    rect(img, leftLegX + legShift, 24, legW, 6, SKIN)
    rect(img, rightLegX - legShift, 24, legW, 6, SKIN)
  elseif dir == 2 or dir == 3 then
    rect(img, leftLegX, 24 - legShift, legW, 6, SKIN)
    rect(img, rightLegX, 24 + legShift, legW, 6, SKIN)
  end

  -- Leg shadow
  px(img, leftLegX + legShift, 24, SKIN_SHADOW)
  px(img, rightLegX - legShift, 24, SKIN_SHADOW)
end

local function createBodySprite(filename, isFemale)
  local spr = Sprite{ width = W, height = H, colorMode = ColorMode.RGB }
  for i = 2, FRAMES do
    spr:newEmptyFrame()
  end

  -- Standard frames (12): 4 directions x 3 poses
  for dir = 0, 3 do
    for pose = 0, 2 do
      local frameIdx = dir * 3 + pose + 1
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      drawBody(cel.image, dir, pose, isFemale)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  -- Pick frames (8): 4 directions x 2 pick poses (reach, grab)
  for dir = 0, 3 do
    for pickPose = 0, 1 do
      local frameIdx = 13 + dir * 2 + pickPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      drawBody(cel.image, dir, 0, isFemale, true) -- idle body, skip arms
      drawPickArms(cel.image, dir, pickPose)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  spr:saveAs(app.fs.joinPath(outputDir, filename))
  print("Created " .. filename)
end

createBodySprite("body-male.aseprite", false)
createBodySprite("body-female.aseprite", true)
