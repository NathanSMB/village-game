-- Create hair style sprites: short, long, ponytail, curly
-- 52 frames each: 12 standard (4 dirs x 3 poses) + 8 pick (4 dirs x 2 pick poses)
--                + 16 drink (4 dirs x 4 drink poses)
--                + 16 pickup-item (4 dirs x 4 pickup poses)
-- Uses yellow reference colors for palette swapping

local W = 32
local H = 32
local FRAMES = 76

local scriptPath = app.params["script-path"] or "."
local outputDir = app.fs.joinPath(app.fs.filePath(scriptPath), "..", "assets", "characters", "hair")

local HAIR = Color{ r = 255, g = 255, b = 0, a = 255 }        -- #FFFF00 base
local HAIR_SHADOW = Color{ r = 204, g = 204, b = 0, a = 255 }  -- #CCCC00 shadow
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

local headW = 10
local headX = math.floor((W - headW) / 2)

-- dir: 0=down, 1=up, 2=left, 3=right

local function drawShort(img, dir, pose)
  clearImg(img)
  rect(img, headX + 1, 2, headW - 2, 1, HAIR)
  rect(img, headX, 3, headW, 2, HAIR)
  rect(img, headX, 4, headW, 1, HAIR_SHADOW)
end

local function drawLong(img, dir, pose)
  clearImg(img)
  rect(img, headX + 1, 2, headW - 2, 1, HAIR)
  rect(img, headX, 3, headW, 2, HAIR)
  rect(img, headX, 4, headW, 1, HAIR_SHADOW)

  if dir == 0 then
    rect(img, headX - 1, 5, 2, 10, HAIR)
    rect(img, headX + headW - 1, 5, 2, 10, HAIR)
    px(img, headX - 1, 14, HAIR_SHADOW)
    px(img, headX + headW, 14, HAIR_SHADOW)
  elseif dir == 1 then
    rect(img, headX - 1, 5, headW + 2, 10, HAIR)
    rect(img, headX, 14, headW, 1, HAIR_SHADOW)
  elseif dir == 2 then
    rect(img, headX + headW - 2, 5, 3, 10, HAIR)
    px(img, headX + headW, 14, HAIR_SHADOW)
  elseif dir == 3 then
    rect(img, headX - 1, 5, 3, 10, HAIR)
    px(img, headX - 1, 14, HAIR_SHADOW)
  end
end

local function drawPonytail(img, dir, pose)
  clearImg(img)
  rect(img, headX + 1, 2, headW - 2, 1, HAIR)
  rect(img, headX, 3, headW, 2, HAIR)
  rect(img, headX, 4, headW, 1, HAIR_SHADOW)

  local bounce = 0
  if pose == 1 then bounce = -1 end
  if pose == 2 then bounce = 1 end

  if dir == 0 then
    rect(img, headX + 3, 5, 4, 1, HAIR_SHADOW)
  elseif dir == 1 then
    rect(img, headX + 3, 5, 4, 2, HAIR)
    rect(img, headX + 4, 7, 2, 6 + bounce, HAIR)
    px(img, headX + 4, 12 + bounce, HAIR_SHADOW)
    px(img, headX + 5, 12 + bounce, HAIR_SHADOW)
  elseif dir == 2 then
    rect(img, headX + headW - 1, 4, 4, 2, HAIR)
    rect(img, headX + headW + 1, 6, 2, 4 + bounce, HAIR)
    px(img, headX + headW + 1, 9 + bounce, HAIR_SHADOW)
  elseif dir == 3 then
    rect(img, headX - 3, 4, 4, 2, HAIR)
    rect(img, headX - 3, 6, 2, 4 + bounce, HAIR)
    px(img, headX - 3, 9 + bounce, HAIR_SHADOW)
  end
end

local function drawCurly(img, dir, pose)
  clearImg(img)
  rect(img, headX - 1, 1, headW + 2, 1, HAIR)
  rect(img, headX - 1, 2, headW + 2, 3, HAIR)
  rect(img, headX - 1, 4, headW + 2, 1, HAIR_SHADOW)

  if dir == 0 then
    rect(img, headX - 1, 5, 2, 5, HAIR)
    rect(img, headX + headW - 1, 5, 2, 5, HAIR)
    px(img, headX - 1, 9, HAIR_SHADOW)
    px(img, headX + headW, 9, HAIR_SHADOW)
  elseif dir == 1 then
    rect(img, headX - 1, 5, headW + 2, 5, HAIR)
    rect(img, headX, 9, headW, 1, HAIR_SHADOW)
  elseif dir == 2 then
    rect(img, headX + headW - 1, 5, 3, 5, HAIR)
    px(img, headX + headW + 1, 9, HAIR_SHADOW)
  elseif dir == 3 then
    rect(img, headX - 2, 5, 3, 5, HAIR)
    px(img, headX - 2, 9, HAIR_SHADOW)
  end
end

-- Drink variants: same hair style but shifted down to match kneeling body
local function drawDrinkShort(img, dir, drinkPose)
  clearImg(img)
  local dropAmounts = { 2, 5, 5, 5 }
  local dropY = dropAmounts[drinkPose + 1]

  rect(img, headX + 1, 2 + dropY, headW - 2, 1, HAIR)
  rect(img, headX, 3 + dropY, headW, 2, HAIR)
  rect(img, headX, 4 + dropY, headW, 1, HAIR_SHADOW)
end

local function drawDrinkLong(img, dir, drinkPose)
  clearImg(img)
  local dropAmounts = { 2, 5, 5, 5 }
  local dropY = dropAmounts[drinkPose + 1]

  rect(img, headX + 1, 2 + dropY, headW - 2, 1, HAIR)
  rect(img, headX, 3 + dropY, headW, 2, HAIR)
  rect(img, headX, 4 + dropY, headW, 1, HAIR_SHADOW)

  if dir == 0 then
    rect(img, headX - 1, 5 + dropY, 2, 10, HAIR)
    rect(img, headX + headW - 1, 5 + dropY, 2, 10, HAIR)
    px(img, headX - 1, 14 + dropY, HAIR_SHADOW)
    px(img, headX + headW, 14 + dropY, HAIR_SHADOW)
  elseif dir == 1 then
    rect(img, headX - 1, 5 + dropY, headW + 2, 10, HAIR)
    rect(img, headX, 14 + dropY, headW, 1, HAIR_SHADOW)
  elseif dir == 2 then
    rect(img, headX + headW - 2, 5 + dropY, 3, 10, HAIR)
    px(img, headX + headW, 14 + dropY, HAIR_SHADOW)
  elseif dir == 3 then
    rect(img, headX - 1, 5 + dropY, 3, 10, HAIR)
    px(img, headX - 1, 14 + dropY, HAIR_SHADOW)
  end
end

local function drawDrinkPonytail(img, dir, drinkPose)
  clearImg(img)
  local dropAmounts = { 2, 5, 5, 5 }
  local dropY = dropAmounts[drinkPose + 1]

  rect(img, headX + 1, 2 + dropY, headW - 2, 1, HAIR)
  rect(img, headX, 3 + dropY, headW, 2, HAIR)
  rect(img, headX, 4 + dropY, headW, 1, HAIR_SHADOW)

  -- Ponytail hangs down more when kneeling (no bounce during drink)
  if dir == 0 then
    rect(img, headX + 3, 5 + dropY, 4, 1, HAIR_SHADOW)
  elseif dir == 1 then
    rect(img, headX + 3, 5 + dropY, 4, 2, HAIR)
    rect(img, headX + 4, 7 + dropY, 2, 6, HAIR)
    px(img, headX + 4, 12 + dropY, HAIR_SHADOW)
    px(img, headX + 5, 12 + dropY, HAIR_SHADOW)
  elseif dir == 2 then
    rect(img, headX + headW - 1, 4 + dropY, 4, 2, HAIR)
    rect(img, headX + headW + 1, 6 + dropY, 2, 4, HAIR)
    px(img, headX + headW + 1, 9 + dropY, HAIR_SHADOW)
  elseif dir == 3 then
    rect(img, headX - 3, 4 + dropY, 4, 2, HAIR)
    rect(img, headX - 3, 6 + dropY, 2, 4, HAIR)
    px(img, headX - 3, 9 + dropY, HAIR_SHADOW)
  end
end

local function drawDrinkCurly(img, dir, drinkPose)
  clearImg(img)
  local dropAmounts = { 2, 5, 5, 5 }
  local dropY = dropAmounts[drinkPose + 1]

  rect(img, headX - 1, 1 + dropY, headW + 2, 1, HAIR)
  rect(img, headX - 1, 2 + dropY, headW + 2, 3, HAIR)
  rect(img, headX - 1, 4 + dropY, headW + 2, 1, HAIR_SHADOW)

  if dir == 0 then
    rect(img, headX - 1, 5 + dropY, 2, 5, HAIR)
    rect(img, headX + headW - 1, 5 + dropY, 2, 5, HAIR)
    px(img, headX - 1, 9 + dropY, HAIR_SHADOW)
    px(img, headX + headW, 9 + dropY, HAIR_SHADOW)
  elseif dir == 1 then
    rect(img, headX - 1, 5 + dropY, headW + 2, 5, HAIR)
    rect(img, headX, 9 + dropY, headW, 1, HAIR_SHADOW)
  elseif dir == 2 then
    rect(img, headX + headW - 1, 5 + dropY, 3, 5, HAIR)
    px(img, headX + headW + 1, 9 + dropY, HAIR_SHADOW)
  elseif dir == 3 then
    rect(img, headX - 2, 5 + dropY, 3, 5, HAIR)
    px(img, headX - 2, 9 + dropY, HAIR_SHADOW)
  end
end

-- Pickup-item variants: same hair style but shifted down to match bending body
local function drawPickupShort(img, dir, pickupPose)
  clearImg(img)
  local dropAmounts = { 1, 3, 4, 2 }
  local dropY = dropAmounts[pickupPose + 1]

  rect(img, headX + 1, 2 + dropY, headW - 2, 1, HAIR)
  rect(img, headX, 3 + dropY, headW, 2, HAIR)
  rect(img, headX, 4 + dropY, headW, 1, HAIR_SHADOW)
end

local function drawPickupLong(img, dir, pickupPose)
  clearImg(img)
  local dropAmounts = { 1, 3, 4, 2 }
  local dropY = dropAmounts[pickupPose + 1]

  rect(img, headX + 1, 2 + dropY, headW - 2, 1, HAIR)
  rect(img, headX, 3 + dropY, headW, 2, HAIR)
  rect(img, headX, 4 + dropY, headW, 1, HAIR_SHADOW)

  if dir == 0 then
    rect(img, headX - 1, 5 + dropY, 2, 10, HAIR)
    rect(img, headX + headW - 1, 5 + dropY, 2, 10, HAIR)
    px(img, headX - 1, 14 + dropY, HAIR_SHADOW)
    px(img, headX + headW, 14 + dropY, HAIR_SHADOW)
  elseif dir == 1 then
    rect(img, headX - 1, 5 + dropY, headW + 2, 10, HAIR)
    rect(img, headX, 14 + dropY, headW, 1, HAIR_SHADOW)
  elseif dir == 2 then
    rect(img, headX + headW - 2, 5 + dropY, 3, 10, HAIR)
    px(img, headX + headW, 14 + dropY, HAIR_SHADOW)
  elseif dir == 3 then
    rect(img, headX - 1, 5 + dropY, 3, 10, HAIR)
    px(img, headX - 1, 14 + dropY, HAIR_SHADOW)
  end
end

local function drawPickupPonytail(img, dir, pickupPose)
  clearImg(img)
  local dropAmounts = { 1, 3, 4, 2 }
  local dropY = dropAmounts[pickupPose + 1]

  rect(img, headX + 1, 2 + dropY, headW - 2, 1, HAIR)
  rect(img, headX, 3 + dropY, headW, 2, HAIR)
  rect(img, headX, 4 + dropY, headW, 1, HAIR_SHADOW)

  -- Ponytail hangs down when bending (no bounce)
  if dir == 0 then
    rect(img, headX + 3, 5 + dropY, 4, 1, HAIR_SHADOW)
  elseif dir == 1 then
    rect(img, headX + 3, 5 + dropY, 4, 2, HAIR)
    rect(img, headX + 4, 7 + dropY, 2, 6, HAIR)
    px(img, headX + 4, 12 + dropY, HAIR_SHADOW)
    px(img, headX + 5, 12 + dropY, HAIR_SHADOW)
  elseif dir == 2 then
    rect(img, headX + headW - 1, 4 + dropY, 4, 2, HAIR)
    rect(img, headX + headW + 1, 6 + dropY, 2, 4, HAIR)
    px(img, headX + headW + 1, 9 + dropY, HAIR_SHADOW)
  elseif dir == 3 then
    rect(img, headX - 3, 4 + dropY, 4, 2, HAIR)
    rect(img, headX - 3, 6 + dropY, 2, 4, HAIR)
    px(img, headX - 3, 9 + dropY, HAIR_SHADOW)
  end
end

local function drawPickupCurly(img, dir, pickupPose)
  clearImg(img)
  local dropAmounts = { 1, 3, 4, 2 }
  local dropY = dropAmounts[pickupPose + 1]

  rect(img, headX - 1, 1 + dropY, headW + 2, 1, HAIR)
  rect(img, headX - 1, 2 + dropY, headW + 2, 3, HAIR)
  rect(img, headX - 1, 4 + dropY, headW + 2, 1, HAIR_SHADOW)

  if dir == 0 then
    rect(img, headX - 1, 5 + dropY, 2, 5, HAIR)
    rect(img, headX + headW - 1, 5 + dropY, 2, 5, HAIR)
    px(img, headX - 1, 9 + dropY, HAIR_SHADOW)
    px(img, headX + headW, 9 + dropY, HAIR_SHADOW)
  elseif dir == 1 then
    rect(img, headX - 1, 5 + dropY, headW + 2, 5, HAIR)
    rect(img, headX, 9 + dropY, headW, 1, HAIR_SHADOW)
  elseif dir == 2 then
    rect(img, headX + headW - 1, 5 + dropY, 3, 5, HAIR)
    px(img, headX + headW + 1, 9 + dropY, HAIR_SHADOW)
  elseif dir == 3 then
    rect(img, headX - 2, 5 + dropY, 3, 5, HAIR)
    px(img, headX - 2, 9 + dropY, HAIR_SHADOW)
  end
end

local function createHairSprite(filename, drawFunc, drinkDrawFunc, pickupDrawFunc)
  local spr = Sprite{ width = W, height = H, colorMode = ColorMode.RGB }
  for i = 2, FRAMES do
    spr:newEmptyFrame()
  end

  -- Standard frames (12)
  for dir = 0, 3 do
    for pose = 0, 2 do
      local frameIdx = dir * 3 + pose + 1
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      drawFunc(cel.image, dir, pose)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  -- Pick frames (8): same as idle (pose=0) — hair doesn't change while picking
  for dir = 0, 3 do
    for pickPose = 0, 1 do
      local frameIdx = 13 + dir * 2 + pickPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      drawFunc(cel.image, dir, 0)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  -- Drink frames (16): hair shifted down to match kneeling body
  for dir = 0, 3 do
    for drinkPose = 0, 3 do
      local frameIdx = 21 + dir * 4 + drinkPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      drinkDrawFunc(cel.image, dir, drinkPose)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  -- Pickup-item frames (16): hair shifted down for bending body
  for dir = 0, 3 do
    for pickupPose = 0, 3 do
      local frameIdx = 37 + dir * 4 + pickupPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      pickupDrawFunc(cel.image, dir, pickupPose)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  -- Swing attack frames (12): hair same as idle
  for dir = 0, 3 do
    for swingPose = 0, 2 do
      local frameIdx = 53 + dir * 3 + swingPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      drawFunc(cel.image, dir, 0)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  -- Thrust attack frames (12): hair same as idle
  for dir = 0, 3 do
    for thrustPose = 0, 2 do
      local frameIdx = 65 + dir * 3 + thrustPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      drawFunc(cel.image, dir, 0)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  spr:saveAs(app.fs.joinPath(outputDir, filename))
  print("Created " .. filename)
end

createHairSprite("hair-short.aseprite", drawShort, drawDrinkShort, drawPickupShort)
createHairSprite("hair-long.aseprite", drawLong, drawDrinkLong, drawPickupLong)
createHairSprite("hair-ponytail.aseprite", drawPonytail, drawDrinkPonytail, drawPickupPonytail)
createHairSprite("hair-curly.aseprite", drawCurly, drawDrinkCurly, drawPickupCurly)
