-- Create equipment sprites: tunic, pants, boots
-- 76 frames each: 12 standard (4 dirs x 3 poses) + 8 pick (4 dirs x 2 pick poses)
--                + 16 drink (4 dirs x 4 drink poses)
--                + 16 pickup-item (4 dirs x 4 pickup poses)
--                + 12 swing attack (4 dirs x 3 poses)
--                + 12 thrust attack (4 dirs x 3 poses)
-- Uses cyan reference colors for palette swapping

local W = 32
local H = 32
local FRAMES = 76

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

-- Normal sleeves that swing with walk
local function drawNormalSleeves(img, pose)
  local armSwing = 0
  if pose == 1 then armSwing = -1 end
  if pose == 2 then armSwing = 1 end

  local leftArmY = 14 + armSwing
  local rightArmY = 14 - armSwing
  rect(img, bodyX - armW, leftArmY, armW, 4, CLOTH)
  rect(img, bodyX + bodyW, rightArmY, armW, 4, CLOTH)
  px(img, bodyX - armW, leftArmY, CLOTH_SHADOW)
  px(img, bodyX + bodyW + armW - 1, rightArmY, CLOTH_SHADOW)
end

-- Sleeves for pick animation (follow the reaching arm)
local function drawPickSleeves(img, dir, pickPose)
  local reach = (pickPose == 0)

  if dir == 0 then
    -- Down: left sleeve normal, right sleeve extends down
    rect(img, bodyX - armW, 14, armW, 4, CLOTH)
    px(img, bodyX - armW, 14, CLOTH_SHADOW)
    local extra = reach and 2 or 1
    rect(img, bodyX + bodyW, 14, armW, 4 + extra, CLOTH)
    px(img, bodyX + bodyW + armW - 1, 14, CLOTH_SHADOW)

  elseif dir == 1 then
    -- Up: left sleeve normal, right sleeve extends up
    rect(img, bodyX - armW, 14, armW, 4, CLOTH)
    px(img, bodyX - armW, 14, CLOTH_SHADOW)
    local extra = reach and 2 or 1
    rect(img, bodyX + bodyW, 14 - extra, armW, 4 + extra, CLOTH)
    px(img, bodyX + bodyW + armW - 1, 14 - extra, CLOTH_SHADOW)

  elseif dir == 2 then
    -- Left: left sleeve horizontal, right sleeve normal
    local len = reach and 3 or 2
    rect(img, bodyX - len, 16, len, armW, CLOTH)
    px(img, bodyX - len, 16, CLOTH_SHADOW)
    rect(img, bodyX + bodyW, 14, armW, 4, CLOTH)
    px(img, bodyX + bodyW + armW - 1, 14, CLOTH_SHADOW)

  elseif dir == 3 then
    -- Right: left sleeve normal, right sleeve horizontal
    rect(img, bodyX - armW, 14, armW, 4, CLOTH)
    px(img, bodyX - armW, 14, CLOTH_SHADOW)
    local len = reach and 3 or 2
    rect(img, bodyX + bodyW, 16, len, armW, CLOTH)
    px(img, bodyX + bodyW + len - 1, 16, CLOTH_SHADOW)
  end
end

-- Sleeves for drink animation (follow the kneeling arm positions)
local function drawDrinkSleeves(img, dir, drinkPose, dropY)
  local armTopY = 14 + dropY

  if drinkPose <= 1 then
    -- Arms at sides: short sleeves
    rect(img, bodyX - armW, armTopY, armW, 4, CLOTH)
    rect(img, bodyX + bodyW, armTopY, armW, 4, CLOTH)
    px(img, bodyX - armW, armTopY, CLOTH_SHADOW)
    px(img, bodyX + bodyW + armW - 1, armTopY, CLOTH_SHADOW)

  elseif drinkPose == 2 then
    -- Reach toward water
    if dir == 0 then
      rect(img, bodyX - armW, armTopY, armW, 4, CLOTH)
      px(img, bodyX - armW, armTopY, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, armTopY, armW, 5, CLOTH)
      px(img, bodyX + bodyW + armW - 1, armTopY, CLOTH_SHADOW)
    elseif dir == 1 then
      rect(img, bodyX - armW, armTopY, armW, 4, CLOTH)
      px(img, bodyX - armW, armTopY, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, armTopY - 2, armW, 5, CLOTH)
      px(img, bodyX + bodyW + armW - 1, armTopY - 2, CLOTH_SHADOW)
    elseif dir == 2 then
      local len = 4
      rect(img, bodyX - len, armTopY + 2, len, armW, CLOTH)
      px(img, bodyX - len, armTopY + 2, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, armTopY, armW, 4, CLOTH)
      px(img, bodyX + bodyW + armW - 1, armTopY, CLOTH_SHADOW)
    elseif dir == 3 then
      rect(img, bodyX - armW, armTopY, armW, 4, CLOTH)
      px(img, bodyX - armW, armTopY, CLOTH_SHADOW)
      local len = 4
      rect(img, bodyX + bodyW, armTopY + 2, len, armW, CLOTH)
      px(img, bodyX + bodyW + len - 1, armTopY + 2, CLOTH_SHADOW)
    end

  elseif drinkPose == 3 then
    -- Drink: hands near mouth — small sleeve patches
    if dir == 0 then
      rect(img, bodyX, armTopY, 3, armW, CLOTH)
      rect(img, bodyX + bodyW - 3, armTopY, 3, armW, CLOTH)
    elseif dir == 1 then
      rect(img, bodyX - armW, armTopY, armW, 3, CLOTH)
      rect(img, bodyX + bodyW, armTopY, armW, 3, CLOTH)
    elseif dir == 2 then
      rect(img, bodyX - 2, armTopY - 1, 3, armW, CLOTH)
      rect(img, bodyX + bodyW, armTopY, armW, 3, CLOTH)
    elseif dir == 3 then
      rect(img, bodyX - armW, armTopY, armW, 3, CLOTH)
      rect(img, bodyX + bodyW - 1, armTopY - 1, 3, armW, CLOTH)
    end
  end
end

local function drawTunic(img, dir, pose, skipSleeves)
  clearImg(img)

  -- Main torso area
  rect(img, bodyX, 14, bodyW, 9, CLOTH)
  rect(img, bodyX, 14, 1, 9, CLOTH_SHADOW)
  rect(img, bodyX + bodyW - 1, 14, 1, 9, CLOTH_SHADOW)
  rect(img, bodyX + 2, 14, bodyW - 4, 1, CLOTH_HIGHLIGHT)

  -- Sleeves
  if not skipSleeves then
    drawNormalSleeves(img, pose)
  end

  -- Collar detail (front view only)
  if dir == 0 then
    px(img, bodyX + 4, 14, CLOTH_SHADOW)
    px(img, bodyX + 5, 14, CLOTH_SHADOW)
  end
end

-- Draw tunic in kneeling position for drink animation
local function drawDrinkTunic(img, dir, drinkPose)
  clearImg(img)

  local dropAmounts = { 2, 5, 5, 5 }
  local dropY = dropAmounts[drinkPose + 1]
  local torsoH = (drinkPose >= 1) and 7 or 9

  -- Main torso area (shifted down)
  rect(img, bodyX, 14 + dropY, bodyW, torsoH, CLOTH)
  rect(img, bodyX, 14 + dropY, 1, torsoH, CLOTH_SHADOW)
  rect(img, bodyX + bodyW - 1, 14 + dropY, 1, torsoH, CLOTH_SHADOW)
  rect(img, bodyX + 2, 14 + dropY, bodyW - 4, 1, CLOTH_HIGHLIGHT)

  -- Collar detail
  if dir == 0 then
    px(img, bodyX + 4, 14 + dropY, CLOTH_SHADOW)
    px(img, bodyX + 5, 14 + dropY, CLOTH_SHADOW)
  end

  -- Sleeves for drink poses
  drawDrinkSleeves(img, dir, drinkPose, dropY)
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
    px(img, leftLegX + legShift, 24, CLOTH_SHADOW)
    px(img, rightLegX - legShift, 24, CLOTH_SHADOW)
  else
    rect(img, leftLegX, 24 - legShift, legW, 5, CLOTH)
    rect(img, rightLegX, 24 + legShift, legW, 5, CLOTH)
    px(img, leftLegX, 24 - legShift, CLOTH_SHADOW)
    px(img, rightLegX, 24 + legShift, CLOTH_SHADOW)
  end
end

-- Draw pants in kneeling position for drink animation
local function drawDrinkPants(img, dir, drinkPose)
  clearImg(img)

  local dropAmounts = { 2, 5, 5, 5 }
  local dropY = dropAmounts[drinkPose + 1]
  local torsoH = (drinkPose >= 1) and 8 or 10

  local legW = 3
  local legGap = 2
  local leftLegX = math.floor((W - legGap) / 2) - legW
  local rightLegX = math.floor((W - legGap) / 2) + legGap

  -- Waist area (shifted down)
  local waistY = 14 + dropY + torsoH - 2
  rect(img, bodyX, waistY, bodyW, 2, CLOTH)
  rect(img, bodyX, waistY, bodyW, 1, CLOTH_HIGHLIGHT)

  -- Kneeling legs
  local kneeY = 14 + dropY + torsoH
  if drinkPose == 0 then
    -- Begin kneel: shorter legs
    if dir == 0 or dir == 1 then
      rect(img, leftLegX, kneeY, legW, 3, CLOTH)
      rect(img, rightLegX, kneeY, legW, 3, CLOTH)
    else
      rect(img, leftLegX, kneeY, legW, 3, CLOTH)
      rect(img, rightLegX, kneeY, legW, 3, CLOTH)
    end
    px(img, leftLegX, kneeY, CLOTH_SHADOW)
    px(img, rightLegX, kneeY, CLOTH_SHADOW)
  else
    -- Full kneel: legs folded, wider
    if dir == 0 or dir == 1 then
      rect(img, leftLegX - 1, kneeY, legW + 2, 2, CLOTH)
      rect(img, rightLegX - 1, kneeY, legW + 2, 2, CLOTH)
      px(img, leftLegX - 1, kneeY + 1, CLOTH_SHADOW)
      px(img, rightLegX - 1, kneeY + 1, CLOTH_SHADOW)
    else
      rect(img, leftLegX, kneeY, legW + 1, 2, CLOTH)
      rect(img, rightLegX - 1, kneeY, legW + 1, 2, CLOTH)
      px(img, leftLegX, kneeY + 1, CLOTH_SHADOW)
      px(img, rightLegX - 1, kneeY + 1, CLOTH_SHADOW)
    end
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
    rect(img, leftLegX + legShift - 1, 29, legW + 2, 2, CLOTH)
    rect(img, rightLegX - legShift - 1, 29, legW + 2, 2, CLOTH)
    rect(img, leftLegX + legShift - 1, 30, legW + 2, 1, CLOTH_SHADOW)
    rect(img, rightLegX - legShift - 1, 30, legW + 2, 1, CLOTH_SHADOW)
    px(img, leftLegX + legShift, 29, CLOTH_HIGHLIGHT)
    px(img, rightLegX - legShift, 29, CLOTH_HIGHLIGHT)
  else
    rect(img, leftLegX - 1, 29 - legShift, legW + 2, 2, CLOTH)
    rect(img, rightLegX - 1, 29 + legShift, legW + 2, 2, CLOTH)
    rect(img, leftLegX - 1, 30 - legShift, legW + 2, 1, CLOTH_SHADOW)
    rect(img, rightLegX - 1, 30 + legShift, legW + 2, 1, CLOTH_SHADOW)
  end
end

-- Draw boots in kneeling position for drink animation
-- Boots are barely visible when kneeling — just the toe/knee area
local function drawDrinkBoots(img, dir, drinkPose)
  clearImg(img)

  local dropAmounts = { 2, 5, 5, 5 }
  local dropY = dropAmounts[drinkPose + 1]
  local torsoH = (drinkPose >= 1) and 8 or 10

  local legW = 3
  local legGap = 2
  local leftLegX = math.floor((W - legGap) / 2) - legW
  local rightLegX = math.floor((W - legGap) / 2) + legGap
  local kneeY = 14 + dropY + torsoH

  if drinkPose == 0 then
    -- Begin kneel: small boots at bottom of bent legs
    local bootY = kneeY + 3
    if dir == 0 or dir == 1 then
      rect(img, leftLegX - 1, bootY, legW + 2, 1, CLOTH)
      rect(img, rightLegX - 1, bootY, legW + 2, 1, CLOTH)
      px(img, leftLegX - 1, bootY, CLOTH_SHADOW)
      px(img, rightLegX - 1, bootY, CLOTH_SHADOW)
    else
      rect(img, leftLegX - 1, bootY, legW + 2, 1, CLOTH)
      rect(img, rightLegX - 1, bootY, legW + 2, 1, CLOTH)
    end
  else
    -- Full kneel: boots tucked under, tiny visible strip
    local bootY = kneeY + 2
    if dir == 0 or dir == 1 then
      rect(img, leftLegX - 1, bootY, legW + 2, 1, CLOTH)
      rect(img, rightLegX - 1, bootY, legW + 2, 1, CLOTH)
      px(img, leftLegX, bootY, CLOTH_SHADOW)
      px(img, rightLegX, bootY, CLOTH_SHADOW)
    else
      rect(img, leftLegX, bootY, legW + 1, 1, CLOTH)
      rect(img, rightLegX - 1, bootY, legW + 1, 1, CLOTH)
    end
  end
end

-- Sleeves for pickup-item animation (follow the bending arm positions)
local function drawPickupItemSleeves(img, dir, pickupPose, dropY)
  local armTopY = 14 + dropY

  if pickupPose == 0 then
    -- Arms at sides: normal short sleeves
    rect(img, bodyX - armW, armTopY, armW, 4, CLOTH)
    rect(img, bodyX + bodyW, armTopY, armW, 4, CLOTH)
    px(img, bodyX - armW, armTopY, CLOTH_SHADOW)
    px(img, bodyX + bodyW + armW - 1, armTopY, CLOTH_SHADOW)

  elseif pickupPose == 1 then
    -- Crouching: sleeves follow forward arms
    if dir == 0 or dir == 1 then
      rect(img, bodyX - armW, armTopY, armW, 4, CLOTH)
      px(img, bodyX - armW, armTopY, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, armTopY, armW, 5, CLOTH)
      px(img, bodyX + bodyW + armW - 1, armTopY, CLOTH_SHADOW)
    elseif dir == 2 then
      local len = 3
      rect(img, bodyX - len, armTopY + 2, len, armW, CLOTH)
      px(img, bodyX - len, armTopY + 2, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, armTopY, armW, 4, CLOTH)
      px(img, bodyX + bodyW + armW - 1, armTopY, CLOTH_SHADOW)
    elseif dir == 3 then
      rect(img, bodyX - armW, armTopY, armW, 4, CLOTH)
      px(img, bodyX - armW, armTopY, CLOTH_SHADOW)
      local len = 3
      rect(img, bodyX + bodyW, armTopY + 2, len, armW, CLOTH)
      px(img, bodyX + bodyW + len - 1, armTopY + 2, CLOTH_SHADOW)
    end

  elseif pickupPose == 2 then
    -- Reaching to ground: one sleeve follows arm down
    if dir == 0 then
      rect(img, bodyX - armW, armTopY, armW, 4, CLOTH)
      px(img, bodyX - armW, armTopY, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, armTopY, armW, 6, CLOTH)
      px(img, bodyX + bodyW + armW - 1, armTopY, CLOTH_SHADOW)
    elseif dir == 1 then
      rect(img, bodyX - armW, armTopY, armW, 4, CLOTH)
      px(img, bodyX - armW, armTopY, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, armTopY, armW, 6, CLOTH)
      px(img, bodyX + bodyW + armW - 1, armTopY, CLOTH_SHADOW)
    elseif dir == 2 then
      rect(img, bodyX - 4, armTopY + 4, 4, armW, CLOTH)
      px(img, bodyX - 4, armTopY + 4, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, armTopY, armW, 4, CLOTH)
      px(img, bodyX + bodyW + armW - 1, armTopY, CLOTH_SHADOW)
    elseif dir == 3 then
      rect(img, bodyX - armW, armTopY, armW, 4, CLOTH)
      px(img, bodyX - armW, armTopY, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, armTopY + 4, 4, armW, CLOTH)
      px(img, bodyX + bodyW + 3, armTopY + 4, CLOTH_SHADOW)
    end

  elseif pickupPose == 3 then
    -- Grab/rising: arm retracted
    if dir == 0 then
      rect(img, bodyX - armW, armTopY, armW, 4, CLOTH)
      rect(img, bodyX + bodyW, armTopY, armW, 4, CLOTH)
      px(img, bodyX - armW, armTopY, CLOTH_SHADOW)
      px(img, bodyX + bodyW + armW - 1, armTopY, CLOTH_SHADOW)
    elseif dir == 1 then
      rect(img, bodyX - armW, armTopY, armW, 4, CLOTH)
      rect(img, bodyX + bodyW, armTopY, armW, 4, CLOTH)
      px(img, bodyX - armW, armTopY, CLOTH_SHADOW)
      px(img, bodyX + bodyW + armW - 1, armTopY, CLOTH_SHADOW)
    elseif dir == 2 then
      rect(img, bodyX - 2, armTopY + 1, 2, armW, CLOTH)
      rect(img, bodyX + bodyW, armTopY, armW, 4, CLOTH)
      px(img, bodyX + bodyW + armW - 1, armTopY, CLOTH_SHADOW)
    elseif dir == 3 then
      rect(img, bodyX - armW, armTopY, armW, 4, CLOTH)
      px(img, bodyX - armW, armTopY, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, armTopY + 1, 2, armW, CLOTH)
    end
  end
end

-- Draw tunic in pickup-item position
local function drawPickupItemTunic(img, dir, pickupPose)
  clearImg(img)

  local dropAmounts = { 1, 3, 4, 2 }
  local dropY = dropAmounts[pickupPose + 1]
  local torsoH = 10
  if pickupPose == 1 or pickupPose == 2 then torsoH = 8 end
  if pickupPose == 3 then torsoH = 9 end

  -- Torso area minus 1 from bottom for tunic (doesn't cover underwear)
  local tunicH = torsoH - 1
  rect(img, bodyX, 14 + dropY, bodyW, tunicH, CLOTH)
  rect(img, bodyX, 14 + dropY, 1, tunicH, CLOTH_SHADOW)
  rect(img, bodyX + bodyW - 1, 14 + dropY, 1, tunicH, CLOTH_SHADOW)
  rect(img, bodyX + 2, 14 + dropY, bodyW - 4, 1, CLOTH_HIGHLIGHT)

  -- Collar detail
  if dir == 0 then
    px(img, bodyX + 4, 14 + dropY, CLOTH_SHADOW)
    px(img, bodyX + 5, 14 + dropY, CLOTH_SHADOW)
  end

  -- Sleeves for pickup poses
  drawPickupItemSleeves(img, dir, pickupPose, dropY)
end

-- Draw pants in pickup-item position
local function drawPickupItemPants(img, dir, pickupPose)
  clearImg(img)

  local dropAmounts = { 1, 3, 4, 2 }
  local dropY = dropAmounts[pickupPose + 1]
  local torsoH = 10
  if pickupPose == 1 or pickupPose == 2 then torsoH = 8 end
  if pickupPose == 3 then torsoH = 9 end

  local legW = 3
  local legGap = 2
  local leftLegX = math.floor((W - legGap) / 2) - legW
  local rightLegX = math.floor((W - legGap) / 2) + legGap

  -- Waist area
  local waistY = 14 + dropY + torsoH - 2
  rect(img, bodyX, waistY, bodyW, 2, CLOTH)
  rect(img, bodyX, waistY, bodyW, 1, CLOTH_HIGHLIGHT)

  local legY = 14 + dropY + torsoH

  if pickupPose == 0 or pickupPose == 3 then
    -- Standing/rising: normal pants legs
    if dir == 0 or dir == 1 then
      rect(img, leftLegX, legY, legW, 4, CLOTH)
      rect(img, rightLegX, legY, legW, 4, CLOTH)
    else
      rect(img, leftLegX, legY, legW, 4, CLOTH)
      rect(img, rightLegX, legY, legW, 4, CLOTH)
    end
    px(img, leftLegX, legY, CLOTH_SHADOW)
    px(img, rightLegX, legY, CLOTH_SHADOW)
  else
    -- Crouching: wider bent legs
    if dir == 0 or dir == 1 then
      rect(img, leftLegX - 1, legY, legW + 1, 3, CLOTH)
      rect(img, rightLegX, legY, legW + 1, 3, CLOTH)
      px(img, leftLegX - 1, legY + 2, CLOTH_SHADOW)
      px(img, rightLegX + legW, legY + 2, CLOTH_SHADOW)
    else
      rect(img, leftLegX, legY, legW + 1, 3, CLOTH)
      rect(img, rightLegX - 1, legY, legW + 1, 3, CLOTH)
      px(img, leftLegX, legY + 2, CLOTH_SHADOW)
      px(img, rightLegX - 1, legY + 2, CLOTH_SHADOW)
    end
  end
end

-- Draw boots in pickup-item position
local function drawPickupItemBoots(img, dir, pickupPose)
  clearImg(img)

  local dropAmounts = { 1, 3, 4, 2 }
  local dropY = dropAmounts[pickupPose + 1]
  local torsoH = 10
  if pickupPose == 1 or pickupPose == 2 then torsoH = 8 end
  if pickupPose == 3 then torsoH = 9 end

  local legW = 3
  local legGap = 2
  local leftLegX = math.floor((W - legGap) / 2) - legW
  local rightLegX = math.floor((W - legGap) / 2) + legGap
  local legY = 14 + dropY + torsoH

  if pickupPose == 0 or pickupPose == 3 then
    -- Standing: boots at bottom of legs
    local bootY = legY + 4
    if dir == 0 or dir == 1 then
      rect(img, leftLegX - 1, bootY, legW + 2, 2, CLOTH)
      rect(img, rightLegX - 1, bootY, legW + 2, 2, CLOTH)
      rect(img, leftLegX - 1, bootY + 1, legW + 2, 1, CLOTH_SHADOW)
      rect(img, rightLegX - 1, bootY + 1, legW + 2, 1, CLOTH_SHADOW)
      px(img, leftLegX, bootY, CLOTH_HIGHLIGHT)
      px(img, rightLegX, bootY, CLOTH_HIGHLIGHT)
    else
      rect(img, leftLegX - 1, bootY, legW + 2, 2, CLOTH)
      rect(img, rightLegX - 1, bootY, legW + 2, 2, CLOTH)
      rect(img, leftLegX - 1, bootY + 1, legW + 2, 1, CLOTH_SHADOW)
      rect(img, rightLegX - 1, bootY + 1, legW + 2, 1, CLOTH_SHADOW)
    end
  else
    -- Crouching: small boot visible under bent legs
    local bootY = legY + 3
    if dir == 0 or dir == 1 then
      rect(img, leftLegX - 1, bootY, legW + 2, 1, CLOTH)
      rect(img, rightLegX, bootY, legW + 2, 1, CLOTH)
      px(img, leftLegX - 1, bootY, CLOTH_SHADOW)
      px(img, rightLegX, bootY, CLOTH_SHADOW)
    else
      rect(img, leftLegX, bootY, legW + 1, 1, CLOTH)
      rect(img, rightLegX - 1, bootY, legW + 1, 1, CLOTH)
    end
  end
end

-- Swing attack sleeves (follow swing arm positions from create-body.lua)
local function drawSwingSleeves(img, dir, swingPose)
  if dir == 0 or dir == 1 then
    if swingPose == 0 then
      -- Wind-up: right sleeve raised
      rect(img, bodyX - armW, 14, armW, 4, CLOTH)
      px(img, bodyX - armW, 14, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, 7, armW, 4, CLOTH)
      px(img, bodyX + bodyW + armW - 1, 7, CLOTH_SHADOW)
    elseif swingPose == 1 then
      -- Mid-swing: right sleeve horizontal
      rect(img, bodyX - armW, 14, armW, 4, CLOTH)
      px(img, bodyX - armW, 14, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, 16, 4, armW, CLOTH)
      px(img, bodyX + bodyW + 3, 16, CLOTH_SHADOW)
    elseif swingPose == 2 then
      -- Follow-through: right sleeve low
      rect(img, bodyX - armW, 14, armW, 4, CLOTH)
      px(img, bodyX - armW, 14, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, 14, armW, 5, CLOTH)
      px(img, bodyX + bodyW + armW - 1, 14, CLOTH_SHADOW)
    end
  elseif dir == 2 then
    if swingPose == 0 then
      rect(img, bodyX - armW, 7, armW, 4, CLOTH)
      px(img, bodyX - armW, 7, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, 14, armW, 4, CLOTH)
      px(img, bodyX + bodyW + armW - 1, 14, CLOTH_SHADOW)
    elseif swingPose == 1 then
      rect(img, bodyX - 4, 16, 4, armW, CLOTH)
      px(img, bodyX - 4, 16, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, 14, armW, 4, CLOTH)
      px(img, bodyX + bodyW + armW - 1, 14, CLOTH_SHADOW)
    elseif swingPose == 2 then
      rect(img, bodyX - armW, 14, armW, 5, CLOTH)
      px(img, bodyX - armW, 14, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, 14, armW, 4, CLOTH)
      px(img, bodyX + bodyW + armW - 1, 14, CLOTH_SHADOW)
    end
  elseif dir == 3 then
    if swingPose == 0 then
      rect(img, bodyX - armW, 14, armW, 4, CLOTH)
      px(img, bodyX - armW, 14, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, 7, armW, 4, CLOTH)
      px(img, bodyX + bodyW + armW - 1, 7, CLOTH_SHADOW)
    elseif swingPose == 1 then
      rect(img, bodyX - armW, 14, armW, 4, CLOTH)
      px(img, bodyX - armW, 14, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, 16, 4, armW, CLOTH)
      px(img, bodyX + bodyW + 3, 16, CLOTH_SHADOW)
    elseif swingPose == 2 then
      rect(img, bodyX - armW, 14, armW, 4, CLOTH)
      px(img, bodyX - armW, 14, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, 14, armW, 5, CLOTH)
      px(img, bodyX + bodyW + armW - 1, 14, CLOTH_SHADOW)
    end
  end
end

-- Thrust attack sleeves (follow thrust arm positions from create-body.lua)
local function drawThrustSleeves(img, dir, thrustPose)
  if dir == 0 then
    if thrustPose == 0 then
      rect(img, bodyX - armW, 14, armW, 4, CLOTH)
      px(img, bodyX - armW, 14, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, 14, armW, 4, CLOTH)
      px(img, bodyX + bodyW + armW - 1, 14, CLOTH_SHADOW)
    elseif thrustPose == 1 then
      rect(img, bodyX - armW, 14, armW, 4, CLOTH)
      px(img, bodyX - armW, 14, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, 14, armW, 5, CLOTH)
      px(img, bodyX + bodyW + armW - 1, 14, CLOTH_SHADOW)
    elseif thrustPose == 2 then
      rect(img, bodyX - armW, 14, armW, 4, CLOTH)
      px(img, bodyX - armW, 14, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, 14, armW, 5, CLOTH)
      px(img, bodyX + bodyW + armW - 1, 14, CLOTH_SHADOW)
    end
  elseif dir == 1 then
    if thrustPose == 0 then
      rect(img, bodyX - armW, 14, armW, 4, CLOTH)
      rect(img, bodyX + bodyW, 14, armW, 4, CLOTH)
    elseif thrustPose == 1 then
      rect(img, bodyX - armW, 14, armW, 4, CLOTH)
      rect(img, bodyX + bodyW, 4, armW, 5, CLOTH)
      px(img, bodyX + bodyW + armW - 1, 4, CLOTH_SHADOW)
    elseif thrustPose == 2 then
      rect(img, bodyX - armW, 14, armW, 4, CLOTH)
      rect(img, bodyX + bodyW, 10, armW, 5, CLOTH)
    end
  elseif dir == 2 then
    if thrustPose == 0 then
      rect(img, bodyX - 2, 16, 2, armW, CLOTH)
      rect(img, bodyX + bodyW, 14, armW, 4, CLOTH)
    elseif thrustPose == 1 then
      rect(img, bodyX - 4, 16, 4, armW, CLOTH)
      px(img, bodyX - 4, 16, CLOTH_SHADOW)
      rect(img, bodyX + bodyW, 14, armW, 4, CLOTH)
    elseif thrustPose == 2 then
      rect(img, bodyX - 3, 16, 3, armW, CLOTH)
      rect(img, bodyX + bodyW, 14, armW, 4, CLOTH)
    end
  elseif dir == 3 then
    if thrustPose == 0 then
      rect(img, bodyX - armW, 14, armW, 4, CLOTH)
      rect(img, bodyX + bodyW, 16, 2, armW, CLOTH)
    elseif thrustPose == 1 then
      rect(img, bodyX - armW, 14, armW, 4, CLOTH)
      rect(img, bodyX + bodyW, 16, 4, armW, CLOTH)
      px(img, bodyX + bodyW + 3, 16, CLOTH_SHADOW)
    elseif thrustPose == 2 then
      rect(img, bodyX - armW, 14, armW, 4, CLOTH)
      rect(img, bodyX + bodyW, 16, 3, armW, CLOTH)
    end
  end
end

local function createSprite(filename, drawFunc, hasPickSleeves, drinkDrawFunc, pickupItemDrawFunc)
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
      drawFunc(cel.image, dir, pose)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  -- Pick frames (8): 4 directions x 2 pick poses
  for dir = 0, 3 do
    for pickPose = 0, 1 do
      local frameIdx = 13 + dir * 2 + pickPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      if hasPickSleeves then
        -- Tunic: draw body without sleeves, then add pick sleeves
        drawFunc(cel.image, dir, 0, true) -- skipSleeves=true
        drawPickSleeves(cel.image, dir, pickPose)
      else
        -- Pants/boots: pick = idle (pose=0)
        drawFunc(cel.image, dir, 0)
      end
      spr.frames[frameIdx].duration = 0.2
    end
  end

  -- Drink frames (16): 4 directions x 4 drink poses
  for dir = 0, 3 do
    for drinkPose = 0, 3 do
      local frameIdx = 21 + dir * 4 + drinkPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      drinkDrawFunc(cel.image, dir, drinkPose)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  -- Pickup-item frames (16): 4 directions x 4 pickup poses
  for dir = 0, 3 do
    for pickupPose = 0, 3 do
      local frameIdx = 37 + dir * 4 + pickupPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      pickupItemDrawFunc(cel.image, dir, pickupPose)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  -- Swing attack frames (12): 4 directions x 3 swing poses
  for dir = 0, 3 do
    for swingPose = 0, 2 do
      local frameIdx = 53 + dir * 3 + swingPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      if hasPickSleeves then
        drawFunc(cel.image, dir, 0, true) -- tunic body without sleeves
        drawSwingSleeves(cel.image, dir, swingPose)
      else
        drawFunc(cel.image, dir, 0) -- pants/boots idle
      end
      spr.frames[frameIdx].duration = 0.2
    end
  end

  -- Thrust attack frames (12): 4 directions x 3 thrust poses
  for dir = 0, 3 do
    for thrustPose = 0, 2 do
      local frameIdx = 65 + dir * 3 + thrustPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      if hasPickSleeves then
        drawFunc(cel.image, dir, 0, true) -- tunic body without sleeves
        drawThrustSleeves(cel.image, dir, thrustPose)
      else
        drawFunc(cel.image, dir, 0) -- pants/boots idle
      end
      spr.frames[frameIdx].duration = 0.2
    end
  end

  spr:saveAs(app.fs.joinPath(baseDir, filename))
  print("Created " .. filename)
end

createSprite("torso/tunic.aseprite", drawTunic, true, drawDrinkTunic, drawPickupItemTunic)
createSprite("legs/pants.aseprite", drawPants, false, drawDrinkPants, drawPickupItemPants)
createSprite("feet/boots.aseprite", drawBoots, false, drawDrinkBoots, drawPickupItemBoots)
