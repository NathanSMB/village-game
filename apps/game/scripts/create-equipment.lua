-- Create equipment sprites: tunic, pants, boots
-- 12 frames each: 4 directions x 3 poses
-- Uses cyan reference colors for palette swapping

local W = 32
local H = 32
local FRAMES = 12

local scriptPath = app.params["script-path"] or "."
local baseDir = app.fs.joinPath(app.fs.filePath(scriptPath), "..", "assets", "characters", "equipment")

local CLOTH = Color{ r = 0, g = 255, b = 255, a = 255 }        -- #00FFFF base
local CLOTH_SHADOW = Color{ r = 0, g = 204, b = 204, a = 255 }  -- #00CCCC shadow
local CLOTH_HIGHLIGHT = Color{ r = 102, g = 255, b = 255, a = 255 } -- #66FFFF highlight
local CLEAR = Color{ r = 0, g = 0, b = 0, a = 0 }

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

local bodyW = 10
local bodyX = math.floor((W - bodyW) / 2)
local armW = 2

local function drawTunic(img, dir, pose)
  clearImg(img)

  local armSwing = 0
  if pose == 1 then armSwing = -1 end
  if pose == 2 then armSwing = 1 end

  -- Main torso area
  rect(img, bodyX, 14, bodyW, 9, CLOTH)
  -- Shadow on edges
  rect(img, bodyX, 14, 1, 9, CLOTH_SHADOW)
  rect(img, bodyX + bodyW - 1, 14, 1, 9, CLOTH_SHADOW)
  -- Highlight at top
  rect(img, bodyX + 2, 14, bodyW - 4, 1, CLOTH_HIGHLIGHT)

  -- Sleeves (move with arms)
  local leftArmY = 14 + armSwing
  local rightArmY = 14 - armSwing
  rect(img, bodyX - armW, leftArmY, armW, 4, CLOTH)
  rect(img, bodyX + bodyW, rightArmY, armW, 4, CLOTH)
  px(img, bodyX - armW, leftArmY, CLOTH_SHADOW)
  px(img, bodyX + bodyW + armW - 1, rightArmY, CLOTH_SHADOW)

  -- Collar detail (front view only)
  if dir == 0 then
    px(img, bodyX + 4, 14, CLOTH_SHADOW)
    px(img, bodyX + 5, 14, CLOTH_SHADOW)
  end
end

local function drawPants(img, dir, pose)
  clearImg(img)

  local legShift = 0
  if pose == 1 then legShift = 1 end
  if pose == 2 then legShift = -1 end

  local legW = 3
  local legGap = 2
  local leftLegX = math.floor((W - legGap) / 2) - legW
  local rightLegX = math.floor((W - legGap) / 2) + legGap

  -- Waist area
  rect(img, bodyX, 22, bodyW, 3, CLOTH)
  rect(img, bodyX, 22, bodyW, 1, CLOTH_HIGHLIGHT)

  -- Legs
  if dir == 0 or dir == 1 then
    rect(img, leftLegX + legShift, 24, legW, 5, CLOTH)
    rect(img, rightLegX - legShift, 24, legW, 5, CLOTH)
    -- Shadow
    px(img, leftLegX + legShift, 24, CLOTH_SHADOW)
    px(img, rightLegX - legShift, 24, CLOTH_SHADOW)
  else
    rect(img, leftLegX, 24 - legShift, legW, 5, CLOTH)
    rect(img, rightLegX, 24 + legShift, legW, 5, CLOTH)
    px(img, leftLegX, 24 - legShift, CLOTH_SHADOW)
    px(img, rightLegX, 24 + legShift, CLOTH_SHADOW)
  end
end

local function drawBoots(img, dir, pose)
  clearImg(img)

  local legShift = 0
  if pose == 1 then legShift = 1 end
  if pose == 2 then legShift = -1 end

  local legW = 3
  local legGap = 2
  local leftLegX = math.floor((W - legGap) / 2) - legW
  local rightLegX = math.floor((W - legGap) / 2) + legGap

  if dir == 0 or dir == 1 then
    -- Boots at bottom of legs
    rect(img, leftLegX + legShift - 1, 29, legW + 2, 2, CLOTH)
    rect(img, rightLegX - legShift - 1, 29, legW + 2, 2, CLOTH)
    -- Shadow
    rect(img, leftLegX + legShift - 1, 30, legW + 2, 1, CLOTH_SHADOW)
    rect(img, rightLegX - legShift - 1, 30, legW + 2, 1, CLOTH_SHADOW)
    -- Highlight
    px(img, leftLegX + legShift, 29, CLOTH_HIGHLIGHT)
    px(img, rightLegX - legShift, 29, CLOTH_HIGHLIGHT)
  else
    rect(img, leftLegX - 1, 29 - legShift, legW + 2, 2, CLOTH)
    rect(img, rightLegX - 1, 29 + legShift, legW + 2, 2, CLOTH)
    rect(img, leftLegX - 1, 30 - legShift, legW + 2, 1, CLOTH_SHADOW)
    rect(img, rightLegX - 1, 30 + legShift, legW + 2, 1, CLOTH_SHADOW)
  end
end

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
  spr:saveAs(app.fs.joinPath(baseDir, filename))
  print("Created " .. filename)
end

createSprite("torso/tunic.aseprite", drawTunic)
createSprite("legs/pants.aseprite", drawPants)
createSprite("feet/boots.aseprite", drawBoots)
