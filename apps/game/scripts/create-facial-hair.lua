-- Create facial hair sprites: stubble, beard, mustache, full
-- 20 frames each: 12 standard + 8 pick (same as idle for facial hair)
-- Uses yellow reference colors for palette swapping

local W = 32
local H = 32
local FRAMES = 20

local scriptPath = app.params["script-path"] or "."
local outputDir = app.fs.joinPath(app.fs.filePath(scriptPath), "..", "assets", "characters", "facial-hair")

local HAIR = Color{ r = 255, g = 255, b = 0, a = 255 }
local HAIR_SHADOW = Color{ r = 204, g = 204, b = 0, a = 255 }
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

local function drawStubble(img, dir, pose)
  clearImg(img)
  if dir ~= 0 then return end
  px(img, headX + 2, 12, HAIR)
  px(img, headX + 4, 12, HAIR)
  px(img, headX + 6, 12, HAIR)
  px(img, headX + headW - 3, 12, HAIR)
  px(img, headX + 3, 13, HAIR)
  px(img, headX + 5, 13, HAIR)
end

local function drawMustache(img, dir, pose)
  clearImg(img)
  if dir == 0 then
    rect(img, headX + 2, 10, 2, 1, HAIR)
    rect(img, headX + headW - 4, 10, 2, 1, HAIR)
  elseif dir == 2 then
    px(img, headX + 1, 10, HAIR)
  elseif dir == 3 then
    px(img, headX + headW - 2, 10, HAIR)
  end
end

local function drawBeard(img, dir, pose)
  clearImg(img)
  if dir == 0 then
    rect(img, headX + 1, 12, headW - 2, 2, HAIR)
    rect(img, headX + 2, 14, headW - 4, 1, HAIR_SHADOW)
  elseif dir == 2 then
    rect(img, headX, 12, 3, 2, HAIR)
    px(img, headX + 1, 14, HAIR_SHADOW)
  elseif dir == 3 then
    rect(img, headX + headW - 3, 12, 3, 2, HAIR)
    px(img, headX + headW - 2, 14, HAIR_SHADOW)
  end
end

local function drawFull(img, dir, pose)
  clearImg(img)
  if dir == 0 then
    rect(img, headX + 2, 10, 2, 1, HAIR)
    rect(img, headX + headW - 4, 10, 2, 1, HAIR)
    rect(img, headX, 12, headW, 2, HAIR)
    rect(img, headX + 1, 14, headW - 2, 1, HAIR)
    rect(img, headX + 2, 15, headW - 4, 1, HAIR_SHADOW)
  elseif dir == 2 then
    px(img, headX + 1, 10, HAIR)
    rect(img, headX, 12, 3, 3, HAIR)
    px(img, headX + 1, 15, HAIR_SHADOW)
  elseif dir == 3 then
    px(img, headX + headW - 2, 10, HAIR)
    rect(img, headX + headW - 3, 12, 3, 3, HAIR)
    px(img, headX + headW - 2, 15, HAIR_SHADOW)
  end
end

local function createSprite(filename, drawFunc)
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

  -- Pick frames (8): same as idle — facial hair doesn't change while picking
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

createSprite("facial-stubble.aseprite", drawStubble)
createSprite("facial-mustache.aseprite", drawMustache)
createSprite("facial-beard.aseprite", drawBeard)
createSprite("facial-full.aseprite", drawFull)
