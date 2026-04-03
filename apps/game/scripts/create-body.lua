-- Create male and female body sprites with 12 frames each
-- Frames: Down(idle,walk1,walk2), Up(idle,walk1,walk2), Left(idle,walk1,walk2), Right(idle,walk1,walk2)
-- Uses magenta reference colors for palette swapping

local W = 32
local H = 32
local FRAMES = 12

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

local function drawBody(img, dir, pose, isFemale)
  clearImg(img)

  -- dir: 0=down, 1=up, 2=left, 3=right
  -- pose: 0=idle, 1=walk1, 2=walk2

  local bodyW = 10
  local bodyX = math.floor((W - bodyW) / 2)
  local headW = 10
  local headX = math.floor((W - headW) / 2)

  -- Leg offset for walk animation
  local legShift = 0
  if pose == 1 then legShift = 1 end
  if pose == 2 then legShift = -1 end

  -- Arm swing for walk
  local armSwing = 0
  if pose == 1 then armSwing = -1 end
  if pose == 2 then armSwing = 1 end

  -- === HEAD ===
  rect(img, headX + 1, 4, headW - 2, 1, SKIN) -- top
  rect(img, headX, 5, headW, 8, SKIN)          -- main
  rect(img, headX + 1, 13, headW - 2, 1, SKIN) -- chin

  -- Head shadow (sides)
  if dir == 0 or dir == 1 then
    -- front/back: shadow on sides
    rect(img, headX, 5, 1, 8, SKIN_SHADOW)
    rect(img, headX + headW - 1, 5, 1, 8, SKIN_SHADOW)
  elseif dir == 2 then
    -- facing left: shadow on right side
    rect(img, headX + headW - 2, 5, 2, 8, SKIN_SHADOW)
  elseif dir == 3 then
    -- facing right: shadow on left side
    rect(img, headX, 5, 2, 8, SKIN_SHADOW)
  end

  -- Head highlight
  rect(img, headX + 2, 5, 2, 1, SKIN_HIGHLIGHT)

  -- === EYES (only for down and side views) ===
  if dir == 0 then
    -- Down (facing camera)
    px(img, headX + 2, 8, EYE)
    px(img, headX + 3, 8, EYE)
    px(img, headX + headW - 4, 8, EYE)
    px(img, headX + headW - 3, 8, EYE)
  elseif dir == 2 then
    -- Left
    px(img, headX + 1, 8, EYE)
    px(img, headX + 2, 8, EYE)
  elseif dir == 3 then
    -- Right
    px(img, headX + headW - 3, 8, EYE)
    px(img, headX + headW - 2, 8, EYE)
  end
  -- Up (dir==1): no eyes visible (back of head)

  -- === TORSO ===
  rect(img, bodyX, 14, bodyW, 10, SKIN)
  -- Shadow on torso
  rect(img, bodyX, 14, 1, 10, SKIN_SHADOW)
  rect(img, bodyX + bodyW - 1, 14, 1, 10, SKIN_SHADOW)

  -- === ARMS ===
  local armW = 2
  local leftArmY = 14 + armSwing
  local rightArmY = 14 - armSwing
  rect(img, bodyX - armW, leftArmY, armW, 8, SKIN)
  rect(img, bodyX + bodyW, rightArmY, armW, 8, SKIN)
  -- Arm shadow
  px(img, bodyX - armW, leftArmY, SKIN_SHADOW)
  px(img, bodyX + bodyW + armW - 1, rightArmY, SKIN_SHADOW)

  -- === FEMALE CHEST DETAIL + BRA ===
  if isFemale then
    if dir == 0 then
      -- Breast shading (front view only)
      rect(img, bodyX + 1, 17, 3, 1, SKIN_SHADOW)
      rect(img, bodyX + bodyW - 4, 17, 3, 1, SKIN_SHADOW)
      -- Bra / bandeau (covers chest)
      rect(img, bodyX, 16, bodyW, 2, UNDERWEAR)
    elseif dir == 2 or dir == 3 then
      -- Side view bra band
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

  -- Walk: shift legs
  if dir == 0 or dir == 1 then
    -- Front/back: legs shift left/right
    rect(img, leftLegX + legShift, 24, legW, 6, SKIN)
    rect(img, rightLegX - legShift, 24, legW, 6, SKIN)
  elseif dir == 2 or dir == 3 then
    -- Side: legs shift up/down for stepping effect
    rect(img, leftLegX, 24 - legShift, legW, 6, SKIN)
    rect(img, rightLegX, 24 + legShift, legW, 6, SKIN)
  end

  -- Leg shadow
  px(img, leftLegX + legShift, 24, SKIN_SHADOW)
  px(img, rightLegX - legShift, 24, SKIN_SHADOW)
end

local function createBodySprite(filename, isFemale)
  local spr = Sprite{ width = W, height = H, colorMode = ColorMode.RGB }
  -- Add 11 more frames (starts with 1)
  for i = 2, FRAMES do
    spr:newEmptyFrame()
  end

  local directions = { 0, 1, 2, 3 }
  local poses = { 0, 1, 2 }

  for _, dir in ipairs(directions) do
    for _, pose in ipairs(poses) do
      local frameIdx = dir * 3 + pose + 1
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      local img = cel.image
      drawBody(img, dir, pose, isFemale)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  spr:saveAs(app.fs.joinPath(outputDir, filename))
  print("Created " .. filename)
end

createBodySprite("body-male.aseprite", false)
createBodySprite("body-female.aseprite", true)
