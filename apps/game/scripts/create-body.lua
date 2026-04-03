-- Create male and female body sprites with 52 frames each
-- Frames 1-12:  Down(idle,walk1,walk2), Up(...), Left(...), Right(...)
-- Frames 13-20: Down(reach,grab), Up(reach,grab), Left(reach,grab), Right(reach,grab)
-- Frames 21-36: Drink animation: 4 dirs x 4 poses (begin kneel, kneel, reach, drink)
-- Frames 37-52: Pickup-item animation: 4 dirs x 4 poses (begin bend, crouch, reach ground, grab)
-- Uses magenta reference colors for palette swapping

local W = 32
local H = 32
local FRAMES = 52

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

-- Draw drink arms for kneeling animation
-- drinkPose: 0=begin kneel (arms at sides), 1=kneel (arms at sides),
--            2=reach toward water, 3=drink (hands to mouth)
local function drawDrinkArms(img, dir, drinkPose, dropY)
  local armTopY = 14 + dropY

  if drinkPose <= 1 then
    -- Arms at sides, shortened (kneeling = arms don't hang as low)
    local armLen = 6
    rect(img, bodyX - armW, armTopY, armW, armLen, SKIN)
    rect(img, bodyX + bodyW, armTopY, armW, armLen, SKIN)
    px(img, bodyX - armW, armTopY, SKIN_SHADOW)
    px(img, bodyX + bodyW + armW - 1, armTopY, SKIN_SHADOW)

  elseif drinkPose == 2 then
    -- Reach toward water (direction-dependent)
    if dir == 0 then
      -- Down: both arms extend downward
      rect(img, bodyX - armW, armTopY, armW, 6, SKIN)
      px(img, bodyX - armW, armTopY, SKIN_SHADOW)
      rect(img, bodyX + bodyW, armTopY, armW, 10, SKIN)
      px(img, bodyX + bodyW + armW - 1, armTopY, SKIN_SHADOW)
      -- Hand highlights at tips
      px(img, bodyX + bodyW, armTopY + 9, SKIN_HIGHLIGHT)
      px(img, bodyX + bodyW + 1, armTopY + 9, SKIN_HIGHLIGHT)

    elseif dir == 1 then
      -- Up: both arms extend upward-forward
      rect(img, bodyX - armW, armTopY, armW, 6, SKIN)
      px(img, bodyX - armW, armTopY, SKIN_SHADOW)
      rect(img, bodyX + bodyW, armTopY - 4, armW, 10, SKIN)
      px(img, bodyX + bodyW + armW - 1, armTopY - 4, SKIN_SHADOW)
      px(img, bodyX + bodyW, armTopY - 4, SKIN_HIGHLIGHT)
      px(img, bodyX + bodyW + 1, armTopY - 4, SKIN_HIGHLIGHT)

    elseif dir == 2 then
      -- Left: both arms extend left
      rect(img, bodyX - 7, armTopY + 2, 7, armW, SKIN)
      px(img, bodyX - 7, armTopY + 2, SKIN_HIGHLIGHT)
      px(img, bodyX - 7, armTopY + 3, SKIN_SHADOW)
      -- Right arm at side
      rect(img, bodyX + bodyW, armTopY, armW, 6, SKIN)
      px(img, bodyX + bodyW + armW - 1, armTopY, SKIN_SHADOW)

    elseif dir == 3 then
      -- Right: both arms extend right
      rect(img, bodyX - armW, armTopY, armW, 6, SKIN)
      px(img, bodyX - armW, armTopY, SKIN_SHADOW)
      rect(img, bodyX + bodyW, armTopY + 2, 7, armW, SKIN)
      px(img, bodyX + bodyW + 6, armTopY + 2, SKIN_HIGHLIGHT)
      px(img, bodyX + bodyW + 6, armTopY + 3, SKIN_SHADOW)
    end

  elseif drinkPose == 3 then
    -- Drink: hands cupped near mouth
    if dir == 0 then
      -- Both arms up, hands near chin
      rect(img, bodyX - 1, armTopY, 3, armW, SKIN)
      rect(img, bodyX + bodyW - 2, armTopY, 3, armW, SKIN)
      -- Highlight on hands (wet/water)
      px(img, bodyX, armTopY, SKIN_HIGHLIGHT)
      px(img, bodyX + bodyW - 1, armTopY, SKIN_HIGHLIGHT)

    elseif dir == 1 then
      -- Arms up and forward (from behind, look like they're at face)
      rect(img, bodyX - armW, armTopY, armW, 4, SKIN)
      rect(img, bodyX + bodyW, armTopY, armW, 4, SKIN)
      px(img, bodyX - armW, armTopY, SKIN_HIGHLIGHT)
      px(img, bodyX + bodyW + 1, armTopY, SKIN_HIGHLIGHT)

    elseif dir == 2 then
      -- Left: arms bent toward face
      rect(img, bodyX - 3, armTopY - 1, 4, armW, SKIN)
      px(img, bodyX - 3, armTopY - 1, SKIN_HIGHLIGHT)
      rect(img, bodyX + bodyW, armTopY, armW, 4, SKIN)

    elseif dir == 3 then
      -- Right: arms bent toward face
      rect(img, bodyX - armW, armTopY, armW, 4, SKIN)
      rect(img, bodyX + bodyW - 1, armTopY - 1, 4, armW, SKIN)
      px(img, bodyX + bodyW + 2, armTopY - 1, SKIN_HIGHLIGHT)
    end
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

-- Draw the kneeling body for drink animation
-- drinkPose: 0=begin kneel, 1=kneel, 2=reach, 3=drink
local function drawDrinkBody(img, dir, drinkPose, isFemale)
  clearImg(img)

  -- Progressive drop amounts per pose
  local dropAmounts = { 2, 5, 5, 5 }
  local dropY = dropAmounts[drinkPose + 1]

  -- === HEAD (shifted down) ===
  rect(img, headX + 1, 4 + dropY, headW - 2, 1, SKIN)
  rect(img, headX, 5 + dropY, headW, 8, SKIN)
  rect(img, headX + 1, 13 + dropY, headW - 2, 1, SKIN)

  -- Head shadow
  if dir == 0 or dir == 1 then
    rect(img, headX, 5 + dropY, 1, 8, SKIN_SHADOW)
    rect(img, headX + headW - 1, 5 + dropY, 1, 8, SKIN_SHADOW)
  elseif dir == 2 then
    rect(img, headX + headW - 2, 5 + dropY, 2, 8, SKIN_SHADOW)
  elseif dir == 3 then
    rect(img, headX, 5 + dropY, 2, 8, SKIN_SHADOW)
  end
  rect(img, headX + 2, 5 + dropY, 2, 1, SKIN_HIGHLIGHT)

  -- === EYES ===
  if dir == 0 then
    px(img, headX + 2, 8 + dropY, EYE)
    px(img, headX + 3, 8 + dropY, EYE)
    px(img, headX + headW - 4, 8 + dropY, EYE)
    px(img, headX + headW - 3, 8 + dropY, EYE)
  elseif dir == 2 then
    px(img, headX + 1, 8 + dropY, EYE)
    px(img, headX + 2, 8 + dropY, EYE)
  elseif dir == 3 then
    px(img, headX + headW - 3, 8 + dropY, EYE)
    px(img, headX + headW - 2, 8 + dropY, EYE)
  end

  -- === TORSO (shifted down, slightly shorter for kneeling poses) ===
  local torsoH = (drinkPose >= 1) and 8 or 10
  rect(img, bodyX, 14 + dropY, bodyW, torsoH, SKIN)
  rect(img, bodyX, 14 + dropY, 1, torsoH, SKIN_SHADOW)
  rect(img, bodyX + bodyW - 1, 14 + dropY, 1, torsoH, SKIN_SHADOW)

  -- === FEMALE DETAIL ===
  if isFemale then
    if dir == 0 then
      rect(img, bodyX + 1, 17 + dropY, 3, 1, SKIN_SHADOW)
      rect(img, bodyX + bodyW - 4, 17 + dropY, 3, 1, SKIN_SHADOW)
      rect(img, bodyX, 16 + dropY, bodyW, 2, UNDERWEAR)
    elseif dir == 2 or dir == 3 then
      rect(img, bodyX, 16 + dropY, bodyW, 2, UNDERWEAR)
    end
  end

  -- === UNDERWEAR ===
  local uwY = 14 + dropY + torsoH - 2
  rect(img, bodyX, uwY, bodyW, 2, UNDERWEAR)

  -- === KNEELING LEGS ===
  local legW = 3
  local legGap = 2
  local leftLegX = math.floor((W - legGap) / 2) - legW
  local rightLegX = math.floor((W - legGap) / 2) + legGap
  local kneeY = 14 + dropY + torsoH

  if drinkPose == 0 then
    -- Begin kneel: legs bending, shorter than normal
    if dir == 0 or dir == 1 then
      rect(img, leftLegX, kneeY, legW, 4, SKIN)
      rect(img, rightLegX, kneeY, legW, 4, SKIN)
    else
      rect(img, leftLegX, kneeY, legW, 4, SKIN)
      rect(img, rightLegX, kneeY, legW, 4, SKIN)
    end
    px(img, leftLegX, kneeY, SKIN_SHADOW)
    px(img, rightLegX, kneeY, SKIN_SHADOW)
  else
    -- Full kneel: legs folded, wider and flatter (on knees)
    if dir == 0 or dir == 1 then
      -- Knees visible, spread wider, short
      rect(img, leftLegX - 1, kneeY, legW + 2, 3, SKIN)
      rect(img, rightLegX - 1, kneeY, legW + 2, 3, SKIN)
      px(img, leftLegX - 1, kneeY + 2, SKIN_SHADOW)
      px(img, rightLegX - 1, kneeY + 2, SKIN_SHADOW)
      px(img, leftLegX + legW, kneeY + 2, SKIN_SHADOW)
      px(img, rightLegX + legW, kneeY + 2, SKIN_SHADOW)
    else
      -- Side view: legs tucked under, visible as compact shape
      rect(img, leftLegX, kneeY, legW + 1, 3, SKIN)
      rect(img, rightLegX - 1, kneeY, legW + 1, 3, SKIN)
      px(img, leftLegX, kneeY + 2, SKIN_SHADOW)
      px(img, rightLegX - 1, kneeY + 2, SKIN_SHADOW)
    end
  end

  -- === ARMS ===
  drawDrinkArms(img, dir, drinkPose, dropY)
end

-- Draw pickup-item arms for bending-down animation
-- pickupPose: 0=begin bend (arms at sides), 1=crouch (arms forward),
--             2=reach to ground (one arm down), 3=grab/rise (arm retracted)
local function drawPickupItemArms(img, dir, pickupPose, dropY)
  local armTopY = 14 + dropY

  if pickupPose == 0 then
    -- Arms at sides, slight swing forward
    local armLen = 7
    rect(img, bodyX - armW, armTopY, armW, armLen, SKIN)
    rect(img, bodyX + bodyW, armTopY, armW, armLen, SKIN)
    px(img, bodyX - armW, armTopY, SKIN_SHADOW)
    px(img, bodyX + bodyW + armW - 1, armTopY, SKIN_SHADOW)

  elseif pickupPose == 1 then
    -- Crouching, arms hanging forward/down
    local armLen = 6
    if dir == 0 then
      rect(img, bodyX - armW, armTopY, armW, armLen, SKIN)
      rect(img, bodyX + bodyW, armTopY, armW, armLen + 2, SKIN)
      px(img, bodyX - armW, armTopY, SKIN_SHADOW)
      px(img, bodyX + bodyW + armW - 1, armTopY, SKIN_SHADOW)
    elseif dir == 1 then
      rect(img, bodyX - armW, armTopY, armW, armLen, SKIN)
      rect(img, bodyX + bodyW, armTopY, armW, armLen + 2, SKIN)
      px(img, bodyX - armW, armTopY, SKIN_SHADOW)
      px(img, bodyX + bodyW + armW - 1, armTopY, SKIN_SHADOW)
    elseif dir == 2 then
      -- Left-facing: left arm reaches forward-down
      rect(img, bodyX - 4, armTopY + 2, 4, armW, SKIN)
      px(img, bodyX - 4, armTopY + 2, SKIN_SHADOW)
      rect(img, bodyX + bodyW, armTopY, armW, armLen, SKIN)
      px(img, bodyX + bodyW + armW - 1, armTopY, SKIN_SHADOW)
    elseif dir == 3 then
      -- Right-facing: right arm reaches forward-down
      rect(img, bodyX - armW, armTopY, armW, armLen, SKIN)
      px(img, bodyX - armW, armTopY, SKIN_SHADOW)
      rect(img, bodyX + bodyW, armTopY + 2, 4, armW, SKIN)
      px(img, bodyX + bodyW + 3, armTopY + 2, SKIN_SHADOW)
    end

  elseif pickupPose == 2 then
    -- Reaching to ground (one arm fully extended down)
    if dir == 0 then
      rect(img, bodyX - armW, armTopY, armW, 6, SKIN)
      px(img, bodyX - armW, armTopY, SKIN_SHADOW)
      -- Right arm extends all the way down
      rect(img, bodyX + bodyW, armTopY, armW, 12, SKIN)
      px(img, bodyX + bodyW + armW - 1, armTopY, SKIN_SHADOW)
      px(img, bodyX + bodyW, armTopY + 11, SKIN_HIGHLIGHT)
      px(img, bodyX + bodyW + 1, armTopY + 11, SKIN_HIGHLIGHT)
    elseif dir == 1 then
      rect(img, bodyX - armW, armTopY, armW, 6, SKIN)
      px(img, bodyX - armW, armTopY, SKIN_SHADOW)
      rect(img, bodyX + bodyW, armTopY, armW, 12, SKIN)
      px(img, bodyX + bodyW + armW - 1, armTopY, SKIN_SHADOW)
      px(img, bodyX + bodyW, armTopY + 11, SKIN_HIGHLIGHT)
      px(img, bodyX + bodyW + 1, armTopY + 11, SKIN_HIGHLIGHT)
    elseif dir == 2 then
      -- Left-facing: left arm reaches far down-left
      rect(img, bodyX - 6, armTopY + 4, 6, armW, SKIN)
      px(img, bodyX - 6, armTopY + 4, SKIN_HIGHLIGHT)
      -- Arm goes down
      rect(img, bodyX - 6, armTopY + 4, armW, 5, SKIN)
      px(img, bodyX - 6, armTopY + 8, SKIN_HIGHLIGHT)
      rect(img, bodyX + bodyW, armTopY, armW, 6, SKIN)
      px(img, bodyX + bodyW + armW - 1, armTopY, SKIN_SHADOW)
    elseif dir == 3 then
      -- Right-facing: right arm reaches far down-right
      rect(img, bodyX - armW, armTopY, armW, 6, SKIN)
      px(img, bodyX - armW, armTopY, SKIN_SHADOW)
      rect(img, bodyX + bodyW, armTopY + 4, 6, armW, SKIN)
      px(img, bodyX + bodyW + 5, armTopY + 4, SKIN_HIGHLIGHT)
      rect(img, bodyX + bodyW + 4, armTopY + 4, armW, 5, SKIN)
      px(img, bodyX + bodyW + 4, armTopY + 8, SKIN_HIGHLIGHT)
    end

  elseif pickupPose == 3 then
    -- Grab/rising: arm retracted, holding item close
    if dir == 0 then
      rect(img, bodyX - armW, armTopY, armW, 6, SKIN)
      px(img, bodyX - armW, armTopY, SKIN_SHADOW)
      -- Right arm bent, holding item at waist
      rect(img, bodyX + bodyW, armTopY, armW, 5, SKIN)
      px(img, bodyX + bodyW + armW - 1, armTopY, SKIN_SHADOW)
      -- Hand visible near body
      px(img, bodyX + bodyW, armTopY + 4, SKIN_HIGHLIGHT)
      px(img, bodyX + bodyW + 1, armTopY + 4, SKIN_HIGHLIGHT)
    elseif dir == 1 then
      rect(img, bodyX - armW, armTopY, armW, 6, SKIN)
      rect(img, bodyX + bodyW, armTopY, armW, 5, SKIN)
      px(img, bodyX - armW, armTopY, SKIN_SHADOW)
      px(img, bodyX + bodyW + armW - 1, armTopY, SKIN_SHADOW)
    elseif dir == 2 then
      -- Arm pulled in
      rect(img, bodyX - 3, armTopY + 1, 3, armW, SKIN)
      px(img, bodyX - 3, armTopY + 1, SKIN_HIGHLIGHT)
      rect(img, bodyX + bodyW, armTopY, armW, 6, SKIN)
      px(img, bodyX + bodyW + armW - 1, armTopY, SKIN_SHADOW)
    elseif dir == 3 then
      rect(img, bodyX - armW, armTopY, armW, 6, SKIN)
      px(img, bodyX - armW, armTopY, SKIN_SHADOW)
      rect(img, bodyX + bodyW, armTopY + 1, 3, armW, SKIN)
      px(img, bodyX + bodyW + 2, armTopY + 1, SKIN_HIGHLIGHT)
    end
  end
end

-- Draw the body for pickup-item animation (bending down to pick something up)
-- pickupPose: 0=begin bend, 1=crouch, 2=reach ground, 3=grab/rise
local function drawPickupItemBody(img, dir, pickupPose, isFemale)
  clearImg(img)

  -- Progressive drop amounts per pose
  local dropAmounts = { 1, 3, 4, 2 }
  local dropY = dropAmounts[pickupPose + 1]

  -- === HEAD (shifted down) ===
  rect(img, headX + 1, 4 + dropY, headW - 2, 1, SKIN)
  rect(img, headX, 5 + dropY, headW, 8, SKIN)
  rect(img, headX + 1, 13 + dropY, headW - 2, 1, SKIN)

  -- Head shadow
  if dir == 0 or dir == 1 then
    rect(img, headX, 5 + dropY, 1, 8, SKIN_SHADOW)
    rect(img, headX + headW - 1, 5 + dropY, 1, 8, SKIN_SHADOW)
  elseif dir == 2 then
    rect(img, headX + headW - 2, 5 + dropY, 2, 8, SKIN_SHADOW)
  elseif dir == 3 then
    rect(img, headX, 5 + dropY, 2, 8, SKIN_SHADOW)
  end
  rect(img, headX + 2, 5 + dropY, 2, 1, SKIN_HIGHLIGHT)

  -- === EYES ===
  if dir == 0 then
    px(img, headX + 2, 8 + dropY, EYE)
    px(img, headX + 3, 8 + dropY, EYE)
    px(img, headX + headW - 4, 8 + dropY, EYE)
    px(img, headX + headW - 3, 8 + dropY, EYE)
  elseif dir == 2 then
    px(img, headX + 1, 8 + dropY, EYE)
    px(img, headX + 2, 8 + dropY, EYE)
  elseif dir == 3 then
    px(img, headX + headW - 3, 8 + dropY, EYE)
    px(img, headX + headW - 2, 8 + dropY, EYE)
  end

  -- === TORSO (shifted down, slightly compressed for crouching) ===
  local torsoH = 10
  if pickupPose == 1 or pickupPose == 2 then torsoH = 8 end
  if pickupPose == 3 then torsoH = 9 end

  rect(img, bodyX, 14 + dropY, bodyW, torsoH, SKIN)
  rect(img, bodyX, 14 + dropY, 1, torsoH, SKIN_SHADOW)
  rect(img, bodyX + bodyW - 1, 14 + dropY, 1, torsoH, SKIN_SHADOW)

  -- === FEMALE DETAIL ===
  if isFemale then
    if dir == 0 then
      rect(img, bodyX + 1, 17 + dropY, 3, 1, SKIN_SHADOW)
      rect(img, bodyX + bodyW - 4, 17 + dropY, 3, 1, SKIN_SHADOW)
      rect(img, bodyX, 16 + dropY, bodyW, 2, UNDERWEAR)
    elseif dir == 2 or dir == 3 then
      rect(img, bodyX, 16 + dropY, bodyW, 2, UNDERWEAR)
    end
  end

  -- === UNDERWEAR ===
  local uwY = 14 + dropY + torsoH - 2
  rect(img, bodyX, uwY, bodyW, 2, UNDERWEAR)

  -- === LEGS ===
  local legW = 3
  local legGap = 2
  local leftLegX = math.floor((W - legGap) / 2) - legW
  local rightLegX = math.floor((W - legGap) / 2) + legGap
  local legY = 14 + dropY + torsoH

  if pickupPose == 0 or pickupPose == 3 then
    -- Standing/rising: normal legs, slightly bent
    if dir == 0 or dir == 1 then
      rect(img, leftLegX, legY, legW, 5, SKIN)
      rect(img, rightLegX, legY, legW, 5, SKIN)
    else
      rect(img, leftLegX, legY, legW, 5, SKIN)
      rect(img, rightLegX, legY, legW, 5, SKIN)
    end
    px(img, leftLegX, legY, SKIN_SHADOW)
    px(img, rightLegX, legY, SKIN_SHADOW)
  else
    -- Crouching/reaching: bent legs, wider stance
    if dir == 0 or dir == 1 then
      rect(img, leftLegX - 1, legY, legW + 1, 4, SKIN)
      rect(img, rightLegX, legY, legW + 1, 4, SKIN)
      px(img, leftLegX - 1, legY + 3, SKIN_SHADOW)
      px(img, rightLegX + legW, legY + 3, SKIN_SHADOW)
    else
      rect(img, leftLegX, legY, legW + 1, 4, SKIN)
      rect(img, rightLegX - 1, legY, legW + 1, 4, SKIN)
      px(img, leftLegX, legY + 3, SKIN_SHADOW)
      px(img, rightLegX - 1, legY + 3, SKIN_SHADOW)
    end
  end

  -- === ARMS ===
  drawPickupItemArms(img, dir, pickupPose, dropY)
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

  -- Drink frames (16): 4 directions x 4 drink poses
  for dir = 0, 3 do
    for drinkPose = 0, 3 do
      local frameIdx = 21 + dir * 4 + drinkPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      drawDrinkBody(cel.image, dir, drinkPose, isFemale)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  -- Pickup-item frames (16): 4 directions x 4 pickup poses
  for dir = 0, 3 do
    for pickupPose = 0, 3 do
      local frameIdx = 37 + dir * 4 + pickupPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      drawPickupItemBody(cel.image, dir, pickupPose, isFemale)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  spr:saveAs(app.fs.joinPath(outputDir, filename))
  print("Created " .. filename)
end

createBodySprite("body-male.aseprite", false)
createBodySprite("body-female.aseprite", true)
