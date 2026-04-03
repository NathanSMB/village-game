-- Create hair style sprites: short, long, ponytail, curly
-- 20 frames each: 12 standard (4 dirs x 3 poses) + 8 pick (4 dirs x 2 pick poses)
-- Uses yellow reference colors for palette swapping

local W = 32
local H = 32
local FRAMES = 20

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

local function createHairSprite(filename, drawFunc)
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

  spr:saveAs(app.fs.joinPath(outputDir, filename))
  print("Created " .. filename)
end

createHairSprite("hair-short.aseprite", drawShort)
createHairSprite("hair-long.aseprite", drawLong)
createHairSprite("hair-ponytail.aseprite", drawPonytail)
createHairSprite("hair-curly.aseprite", drawCurly)
