-- Create 52-frame main-hand tool sprites for: hammer, hatchet, pickaxe, spear
-- These overlay on the character composite, drawn at the hand position for each frame.
-- 52 frames: 12 standard (4 dirs x 3 poses) + 8 pick (4 dirs x 2 poses)
--          + 16 drink (empty) + 16 pickup (empty)
-- Tools use fixed colors (no palette swap reference colors needed).

local W = 64
local H = 64
local FRAMES = 88
local OFFSET = 16 -- center the 32x32 character area within the 64x64 canvas

local scriptPath = app.params["script-path"] or "."
local baseDir = app.fs.joinPath(app.fs.filePath(scriptPath), "..", "assets", "characters", "equipment", "mainhand")

local CLEAR = Color{ r = 0, g = 0, b = 0, a = 0 }

-- Tool colors
local WOOD = Color{ r = 110, g = 75, b = 42, a = 255 }
local WOOD_D = Color{ r = 80, g = 52, b = 28, a = 255 }
local WOOD_L = Color{ r = 140, g = 100, b = 60, a = 255 }
local STONE = Color{ r = 130, g = 125, b = 115, a = 255 }
local STONE_D = Color{ r = 95, g = 90, b = 82, a = 255 }
local STONE_L = Color{ r = 165, g = 160, b = 150, a = 255 }
-- Binding wrap where stone meets wood
local BIND = Color{ r = 160, g = 140, b = 100, a = 255 }

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

-- Body geometry (must match create-body.lua)
local bodyW = 10
local bodyX = math.floor((W - bodyW) / 2) -- 11
local armW = 2

-- ============================================================
-- Hand position calculations (matching create-body.lua exactly)
-- ============================================================

local function getStandardHandPos(dir, pose)
  local armSwing = 0
  if pose == 1 then armSwing = -1 end
  if pose == 2 then armSwing = 1 end

  if dir == 0 then
    -- Down-facing: right hand, bottom of arm
    local rightArmY = 14 - armSwing
    return bodyX + bodyW, rightArmY + 8, "down"
  elseif dir == 1 then
    -- Up-facing: right hand (from behind)
    local rightArmY = 14 - armSwing
    return bodyX + bodyW, rightArmY + 8, "up"
  elseif dir == 2 then
    -- Left-facing: left hand, mid-arm
    local leftArmY = 14 + armSwing
    return bodyX - armW, leftArmY + 4, "left"
  elseif dir == 3 then
    -- Right-facing: right hand, mid-arm
    local rightArmY = 14 - armSwing
    return bodyX + bodyW + armW, rightArmY + 4, "right"
  end
  return 0, 0, "down"
end

local function getPickHandPos(dir, pickPose)
  local reach = (pickPose == 0)

  if dir == 0 then
    local extra = reach and 4 or 2
    return bodyX + bodyW, 14 + 8 + extra, "down"
  elseif dir == 1 then
    local extra = reach and 4 or 2
    return bodyX + bodyW, 14 - extra, "up_reach"
  elseif dir == 2 then
    local len = reach and 6 or 4
    return bodyX - len, 16, "left"
  elseif dir == 3 then
    local len = reach and 6 or 4
    return bodyX + bodyW + len, 16, "right"
  end
  return 0, 0, "down"
end

-- ============================================================
-- Tool drawing functions — BIGGER, more visible
-- Handles are 2px wide, heads are 4-6px across
-- ============================================================

-- HAMMER: 2px wide handle (5px) + 5×3 stone head
local function drawHammer(img, hx, hy, orient)
  if orient == "down" then
    -- Handle hangs down from hand
    rect(img, hx, hy, 2, 5, WOOD)
    px(img, hx, hy, WOOD_L)
    px(img, hx + 1, hy, WOOD_L)
    px(img, hx + 1, hy + 4, WOOD_D)
    -- Binding
    rect(img, hx - 1, hy + 4, 4, 1, BIND)
    -- Stone head (5 wide × 3 tall)
    rect(img, hx - 1, hy + 5, 5, 3, STONE)
    rect(img, hx - 1, hy + 5, 5, 1, STONE_L)
    rect(img, hx - 1, hy + 7, 5, 1, STONE_D)
    px(img, hx - 1, hy + 6, STONE_D)
    px(img, hx + 3, hy + 6, STONE_D)

  elseif orient == "up" then
    -- Behind body: show handle bottom + partial head peeking
    rect(img, hx, hy, 2, 4, WOOD)
    px(img, hx, hy, WOOD_L)
    px(img, hx + 1, hy + 3, WOOD_D)
    -- Small head peek
    rect(img, hx - 1, hy + 4, 4, 2, STONE)
    px(img, hx - 1, hy + 5, STONE_D)

  elseif orient == "up_reach" then
    -- Reaching upward: tool points up
    rect(img, hx, hy - 4, 2, 5, WOOD)
    px(img, hx, hy - 4, WOOD_L)
    px(img, hx + 1, hy, WOOD_D)
    rect(img, hx - 1, hy - 5, 4, 1, BIND)
    rect(img, hx - 1, hy - 8, 5, 3, STONE)
    rect(img, hx - 1, hy - 8, 5, 1, STONE_L)
    rect(img, hx - 1, hy - 6, 5, 1, STONE_D)

  elseif orient == "left" then
    -- Handle extends left horizontally
    rect(img, hx - 4, hy, 5, 2, WOOD)
    px(img, hx, hy, WOOD_L)
    px(img, hx, hy + 1, WOOD_L)
    px(img, hx - 4, hy + 1, WOOD_D)
    -- Binding
    rect(img, hx - 5, hy - 1, 1, 4, BIND)
    -- Head (3 wide × 5 tall, vertical)
    rect(img, hx - 8, hy - 1, 3, 5, STONE)
    rect(img, hx - 8, hy - 1, 1, 5, STONE_L)
    rect(img, hx - 6, hy - 1, 1, 5, STONE_D)
    px(img, hx - 7, hy - 1, STONE_L)
    px(img, hx - 7, hy + 3, STONE_D)

  elseif orient == "right" then
    -- Handle extends right horizontally
    rect(img, hx, hy, 5, 2, WOOD)
    px(img, hx, hy, WOOD_L)
    px(img, hx, hy + 1, WOOD_L)
    px(img, hx + 4, hy + 1, WOOD_D)
    -- Binding
    rect(img, hx + 5, hy - 1, 1, 4, BIND)
    -- Head (3 wide × 5 tall, vertical)
    rect(img, hx + 6, hy - 1, 3, 5, STONE)
    rect(img, hx + 6, hy - 1, 1, 5, STONE_L)
    rect(img, hx + 8, hy - 1, 1, 5, STONE_D)
    px(img, hx + 7, hy - 1, STONE_L)
    px(img, hx + 7, hy + 3, STONE_D)
  end
end

-- HATCHET: 2px wide handle (5px) + angled stone blade (3×4)
local function drawHatchet(img, hx, hy, orient)
  if orient == "down" then
    -- Handle hangs down
    rect(img, hx, hy, 2, 5, WOOD)
    px(img, hx, hy, WOOD_L)
    px(img, hx + 1, hy, WOOD_L)
    px(img, hx + 1, hy + 4, WOOD_D)
    -- Binding
    rect(img, hx - 1, hy + 4, 4, 1, BIND)
    -- Stone blade (right side, wedge shape)
    rect(img, hx + 2, hy + 3, 2, 4, STONE)
    px(img, hx + 4, hy + 4, STONE)
    px(img, hx + 4, hy + 5, STONE)
    px(img, hx + 2, hy + 3, STONE_L)
    px(img, hx + 3, hy + 3, STONE_L)
    rect(img, hx + 2, hy + 6, 3, 1, STONE_D)
    -- Back side
    px(img, hx - 1, hy + 4, STONE)
    px(img, hx - 1, hy + 5, STONE_D)

  elseif orient == "up" then
    rect(img, hx, hy, 2, 3, WOOD)
    px(img, hx, hy, WOOD_L)
    px(img, hx + 1, hy + 2, WOOD_D)
    px(img, hx + 2, hy + 1, STONE)
    px(img, hx + 2, hy + 2, STONE_D)

  elseif orient == "up_reach" then
    rect(img, hx, hy - 4, 2, 5, WOOD)
    px(img, hx, hy - 4, WOOD_L)
    px(img, hx + 1, hy, WOOD_D)
    rect(img, hx - 1, hy - 5, 4, 1, BIND)
    -- Blade flipped up
    rect(img, hx + 2, hy - 7, 2, 4, STONE)
    px(img, hx + 4, hy - 6, STONE)
    px(img, hx + 4, hy - 5, STONE)
    px(img, hx + 2, hy - 7, STONE_L)
    px(img, hx + 3, hy - 7, STONE_L)
    rect(img, hx + 2, hy - 4, 3, 1, STONE_D)

  elseif orient == "left" then
    -- Handle horizontal left
    rect(img, hx - 4, hy, 5, 2, WOOD)
    px(img, hx, hy, WOOD_L)
    px(img, hx - 4, hy + 1, WOOD_D)
    rect(img, hx - 5, hy - 1, 1, 4, BIND)
    -- Blade (below, extending left)
    rect(img, hx - 7, hy + 2, 3, 2, STONE)
    px(img, hx - 8, hy + 2, STONE_L)
    px(img, hx - 8, hy + 4, STONE)
    px(img, hx - 7, hy + 4, STONE_D)
    rect(img, hx - 7, hy + 1, 2, 1, STONE_L)
    -- Back
    px(img, hx - 6, hy - 1, STONE)
    px(img, hx - 5, hy - 1, STONE_D)

  elseif orient == "right" then
    -- Handle horizontal right
    rect(img, hx, hy, 5, 2, WOOD)
    px(img, hx, hy, WOOD_L)
    px(img, hx + 4, hy + 1, WOOD_D)
    rect(img, hx + 5, hy - 1, 1, 4, BIND)
    -- Blade (below, extending right)
    rect(img, hx + 5, hy + 2, 3, 2, STONE)
    px(img, hx + 5, hy + 2, STONE_L)
    px(img, hx + 7, hy + 4, STONE)
    px(img, hx + 6, hy + 4, STONE_D)
    rect(img, hx + 6, hy + 1, 2, 1, STONE_L)
    -- Back
    px(img, hx + 5, hy - 1, STONE)
    px(img, hx + 6, hy - 1, STONE_D)
  end
end

-- PICKAXE: 2px wide handle (5px) + wide pointed stone head (7×3)
local function drawPickaxe(img, hx, hy, orient)
  if orient == "down" then
    -- Handle hangs down
    rect(img, hx, hy, 2, 5, WOOD)
    px(img, hx, hy, WOOD_L)
    px(img, hx + 1, hy, WOOD_L)
    px(img, hx + 1, hy + 4, WOOD_D)
    -- Binding
    rect(img, hx - 1, hy + 4, 4, 1, BIND)
    -- Stone head (wide, pointed tips)
    rect(img, hx - 2, hy + 5, 7, 2, STONE)
    rect(img, hx - 2, hy + 5, 7, 1, STONE_L)
    rect(img, hx - 2, hy + 6, 7, 1, STONE_D)
    -- Pointed tips
    px(img, hx - 3, hy + 5, STONE_L)
    px(img, hx - 3, hy + 6, STONE)
    px(img, hx + 5, hy + 5, STONE)
    px(img, hx + 5, hy + 6, STONE_D)
    -- Extra point pixels
    px(img, hx - 4, hy + 6, STONE)
    px(img, hx + 6, hy + 6, STONE_D)

  elseif orient == "up" then
    rect(img, hx, hy, 2, 3, WOOD)
    px(img, hx, hy, WOOD_L)
    px(img, hx + 1, hy + 2, WOOD_D)
    -- Small head peek
    rect(img, hx - 1, hy + 3, 5, 1, STONE)
    px(img, hx - 2, hy + 3, STONE_L)
    px(img, hx + 3, hy + 3, STONE_D)

  elseif orient == "up_reach" then
    rect(img, hx, hy - 4, 2, 5, WOOD)
    px(img, hx, hy - 4, WOOD_L)
    px(img, hx + 1, hy, WOOD_D)
    rect(img, hx - 1, hy - 5, 4, 1, BIND)
    -- Head flipped up
    rect(img, hx - 2, hy - 7, 7, 2, STONE)
    rect(img, hx - 2, hy - 7, 7, 1, STONE_L)
    rect(img, hx - 2, hy - 6, 7, 1, STONE_D)
    px(img, hx - 3, hy - 7, STONE_L)
    px(img, hx - 3, hy - 6, STONE)
    px(img, hx + 5, hy - 7, STONE)
    px(img, hx + 5, hy - 6, STONE_D)

  elseif orient == "left" then
    -- Handle horizontal left
    rect(img, hx - 4, hy, 5, 2, WOOD)
    px(img, hx, hy, WOOD_L)
    px(img, hx - 4, hy + 1, WOOD_D)
    rect(img, hx - 5, hy - 1, 1, 4, BIND)
    -- Head vertical with pointed tips (2 wide × 7 tall)
    rect(img, hx - 7, hy - 2, 2, 7, STONE)
    rect(img, hx - 7, hy - 2, 1, 7, STONE_L)
    rect(img, hx - 6, hy - 2, 1, 7, STONE_D)
    -- Pointed tips top & bottom
    px(img, hx - 7, hy - 3, STONE_L)
    px(img, hx - 6, hy - 3, STONE)
    px(img, hx - 7, hy + 5, STONE)
    px(img, hx - 6, hy + 5, STONE_D)

  elseif orient == "right" then
    -- Handle horizontal right
    rect(img, hx, hy, 5, 2, WOOD)
    px(img, hx, hy, WOOD_L)
    px(img, hx + 4, hy + 1, WOOD_D)
    rect(img, hx + 5, hy - 1, 1, 4, BIND)
    -- Head vertical with pointed tips
    rect(img, hx + 6, hy - 2, 2, 7, STONE)
    rect(img, hx + 6, hy - 2, 1, 7, STONE_L)
    rect(img, hx + 7, hy - 2, 1, 7, STONE_D)
    px(img, hx + 6, hy - 3, STONE_L)
    px(img, hx + 7, hy - 3, STONE)
    px(img, hx + 6, hy + 5, STONE)
    px(img, hx + 7, hy + 5, STONE_D)
  end
end

-- SPEAR: ALWAYS HELD UPRIGHT — tall shaft (2px wide, 14px) + stone tip (3px)
-- Regardless of facing direction, the spear extends vertically upward from the hand.
local function drawSpear(img, hx, hy, orient)
  -- For "up" (behind body), show the shaft above the body only
  if orient == "up" then
    -- Shaft visible from hand upward (same as down, character faces away)
    -- Show shorter portion since most is behind the body
    rect(img, hx, hy - 6, 2, 7, WOOD)
    px(img, hx, hy - 6, WOOD_L)
    px(img, hx + 1, hy, WOOD_D)
    -- Binding
    rect(img, hx - 1, hy - 7, 4, 1, BIND)
    -- Tip above
    rect(img, hx, hy - 10, 2, 3, STONE)
    px(img, hx, hy - 10, STONE_L)
    px(img, hx + 1, hy - 10, STONE_L)
    px(img, hx + 1, hy - 8, STONE_D)
    -- Point
    px(img, hx, hy - 11, STONE_L)
    px(img, hx + 1, hy - 11, STONE)
    return
  end

  if orient == "up_reach" then
    -- During up-reach pick, tool follows arm — draw upward
    rect(img, hx, hy - 10, 2, 11, WOOD)
    px(img, hx, hy - 10, WOOD_L)
    px(img, hx + 1, hy, WOOD_D)
    rect(img, hx - 1, hy - 11, 4, 1, BIND)
    -- Tip
    rect(img, hx, hy - 14, 2, 3, STONE)
    px(img, hx, hy - 14, STONE_L)
    px(img, hx + 1, hy - 12, STONE_D)
    px(img, hx, hy - 15, STONE_L)
    px(img, hx + 1, hy - 15, STONE)
    return
  end

  -- Forward-pointing orientations for thrust attacks
  if orient == "fwd_down" then
    -- Spear points downward from hand
    rect(img, hx, hy, 2, 14, WOOD)
    px(img, hx, hy, WOOD_L)
    px(img, hx + 1, hy, WOOD_L)
    px(img, hx + 1, hy + 13, WOOD_D)
    rect(img, hx - 1, hy + 13, 4, 1, BIND)
    rect(img, hx, hy + 14, 2, 3, STONE)
    px(img, hx, hy + 14, STONE_L)
    px(img, hx + 1, hy + 16, STONE_D)
    px(img, hx, hy + 17, STONE_L)
    px(img, hx + 1, hy + 17, STONE)
    -- Short butt above hand
    rect(img, hx, hy - 2, 2, 2, WOOD_D)
    return
  end

  if orient == "fwd_up" then
    -- Spear points upward from hand
    rect(img, hx, hy - 13, 2, 14, WOOD)
    px(img, hx, hy - 13, WOOD_L)
    px(img, hx + 1, hy - 13, WOOD_L)
    px(img, hx + 1, hy, WOOD_D)
    rect(img, hx - 1, hy - 14, 4, 1, BIND)
    rect(img, hx, hy - 17, 2, 3, STONE)
    px(img, hx, hy - 17, STONE_L)
    px(img, hx + 1, hy - 17, STONE_L)
    px(img, hx + 1, hy - 15, STONE_D)
    px(img, hx, hy - 18, STONE_L)
    px(img, hx + 1, hy - 18, STONE)
    rect(img, hx, hy + 1, 2, 2, WOOD_D)
    return
  end

  if orient == "fwd_left" then
    -- Spear points left from hand (horizontal)
    rect(img, hx - 13, hy, 14, 2, WOOD)
    px(img, hx, hy, WOOD_L)
    px(img, hx, hy + 1, WOOD_L)
    px(img, hx - 13, hy + 1, WOOD_D)
    rect(img, hx - 14, hy - 1, 1, 4, BIND)
    rect(img, hx - 17, hy, 3, 2, STONE)
    px(img, hx - 17, hy, STONE_L)
    px(img, hx - 15, hy + 1, STONE_D)
    px(img, hx - 18, hy, STONE_L)
    px(img, hx - 18, hy + 1, STONE)
    -- Short butt behind hand
    rect(img, hx + 1, hy, 2, 2, WOOD_D)
    return
  end

  if orient == "fwd_right" then
    -- Spear points right from hand (horizontal)
    rect(img, hx, hy, 14, 2, WOOD)
    px(img, hx, hy, WOOD_L)
    px(img, hx, hy + 1, WOOD_L)
    px(img, hx + 13, hy + 1, WOOD_D)
    rect(img, hx + 14, hy - 1, 1, 4, BIND)
    rect(img, hx + 15, hy, 3, 2, STONE)
    px(img, hx + 15, hy, STONE_L)
    px(img, hx + 17, hy + 1, STONE_D)
    px(img, hx + 18, hy, STONE_L)
    px(img, hx + 18, hy + 1, STONE)
    -- Short butt behind hand
    rect(img, hx - 2, hy, 2, 2, WOOD_D)
    return
  end

  -- All other orientations: spear held upright from hand
  -- The grip is at handY, shaft extends upward
  local shaftLen = 14

  -- Shaft upward from hand
  rect(img, hx, hy - shaftLen + 1, 2, shaftLen, WOOD)
  px(img, hx, hy - shaftLen + 1, WOOD_L)
  px(img, hx + 1, hy - shaftLen + 1, WOOD_L)
  px(img, hx + 1, hy, WOOD_D)
  -- Short bit below hand (butt of spear)
  rect(img, hx, hy + 1, 2, 2, WOOD_D)

  -- Binding where stone meets wood
  rect(img, hx - 1, hy - shaftLen, 4, 1, BIND)

  -- Stone tip (3px tall + point)
  local tipY = hy - shaftLen - 3
  rect(img, hx, tipY, 2, 3, STONE)
  px(img, hx, tipY, STONE_L)
  px(img, hx + 1, tipY, STONE_L)
  px(img, hx + 1, tipY + 2, STONE_D)
  -- Sharp point at top
  px(img, hx, tipY - 1, STONE_L)
  px(img, hx + 1, tipY - 1, STONE)
end

-- Swing attack hand positions (matching drawSwingArms in create-body.lua)
local function getSwingHandPos(dir, swingPose)
  if dir == 0 or dir == 1 then
    if swingPose == 0 then
      -- Wind-up: right hand raised high
      return bodyX + bodyW, 7, "up_reach"
    elseif swingPose == 1 then
      -- Mid-swing: right hand extended right
      return bodyX + bodyW + 7, 16, "right"
    elseif swingPose == 2 then
      -- Follow-through: right hand low
      return bodyX + bodyW, 23, "down"
    end
  elseif dir == 2 then
    if swingPose == 0 then
      return bodyX - armW, 7, "up_reach"
    elseif swingPose == 1 then
      return bodyX - 7, 16, "left"
    elseif swingPose == 2 then
      return bodyX - armW, 23, "down"
    end
  elseif dir == 3 then
    if swingPose == 0 then
      return bodyX + bodyW, 7, "up_reach"
    elseif swingPose == 1 then
      return bodyX + bodyW + 7, 16, "right"
    elseif swingPose == 2 then
      return bodyX + bodyW, 23, "down"
    end
  end
  return 0, 0, "down"
end

-- Thrust attack hand positions (matching drawThrustArms in create-body.lua)
-- Uses "fwd_*" orientations so the spear points FORWARD instead of upright
local function getThrustHandPos(dir, thrustPose)
  if dir == 0 then
    if thrustPose == 0 then
      return bodyX + bodyW, 19, "fwd_down"
    elseif thrustPose == 1 then
      return bodyX + bodyW, 27, "fwd_down"
    elseif thrustPose == 2 then
      return bodyX + bodyW, 23, "fwd_down"
    end
  elseif dir == 1 then
    if thrustPose == 0 then
      return bodyX + bodyW, 19, "fwd_up"
    elseif thrustPose == 1 then
      return bodyX + bodyW, 4, "fwd_up"
    elseif thrustPose == 2 then
      return bodyX + bodyW, 10, "fwd_up"
    end
  elseif dir == 2 then
    if thrustPose == 0 then
      return bodyX - 2, 16, "fwd_left"
    elseif thrustPose == 1 then
      return bodyX - 10, 16, "fwd_left"
    elseif thrustPose == 2 then
      return bodyX - 5, 16, "fwd_left"
    end
  elseif dir == 3 then
    if thrustPose == 0 then
      return bodyX + bodyW + 2, 16, "fwd_right"
    elseif thrustPose == 1 then
      return bodyX + bodyW + 10, 16, "fwd_right"
    elseif thrustPose == 2 then
      return bodyX + bodyW + 5, 16, "fwd_right"
    end
  end
  return 0, 0, "fwd_down"
end

-- ============================================================
-- Bow — curved limb with string, orient determines direction
-- ============================================================

local BOW_WOOD = Color{ r = 140, g = 95, b = 50, a = 255 }
local BOW_WOOD_D = Color{ r = 100, g = 65, b = 32, a = 255 }
local BOW_WOOD_L = Color{ r = 175, g = 125, b = 70, a = 255 }
local BOW_STRING = Color{ r = 200, g = 190, b = 170, a = 255 }
local BOW_STRING_D = Color{ r = 160, g = 150, b = 130, a = 255 }

-- Helper to draw the bow upright at a hand position.
-- stringDir: -1 means string is to the LEFT of wood, +1 means string is to the RIGHT.
-- This controls which side the string faces so it always points toward the player.
local function drawBowUpright(img, hx, hy, stringDir, bowLen)
  bowLen = bowLen or 12
  local woodOff = -stringDir  -- wood on opposite side of string
  local strOff = stringDir

  -- Curved wood limb
  rect(img, hx + woodOff, hy - bowLen + 3, 1, bowLen, BOW_WOOD)
  px(img, hx + woodOff * 2, hy - bowLen + 4, BOW_WOOD)
  px(img, hx + woodOff * 2, hy + 2, BOW_WOOD)
  px(img, hx + woodOff, hy - bowLen + 3, BOW_WOOD_L)
  px(img, hx + woodOff, hy + 2, BOW_WOOD_D)
  -- Grip wrap
  px(img, hx + woodOff, hy, BIND)
  px(img, hx + woodOff, hy - 1, BIND)
  -- String (straight line)
  rect(img, hx + strOff, hy - bowLen + 3, 1, bowLen, BOW_STRING)
  px(img, hx + strOff, hy - bowLen + 3, BOW_STRING_D)
end

local function drawBow(img, hx, hy, orient)
  -- Bow held vertically in hand for ALL poses — never rotates.
  -- String always faces TOWARD the player's body.

  if orient == "up" then
    -- Behind body: just show tips of bow above, string toward body (right side)
    rect(img, hx + 1, hy - 8, 1, 5, BOW_WOOD)
    px(img, hx + 1, hy - 8, BOW_WOOD_L)
    rect(img, hx - 1, hy - 8, 1, 5, BOW_STRING)
    return
  end

  if orient == "up_reach" then
    rect(img, hx + 1, hy - 10, 1, 8, BOW_WOOD)
    px(img, hx + 1, hy - 10, BOW_WOOD_L)
    rect(img, hx - 1, hy - 10, 1, 8, BOW_STRING)
    return
  end

  -- For "down" and "right": hand is on the right side of body.
  -- String should be to the LEFT of the wood (toward body center).
  if orient == "down" or orient == "right"
     or orient == "shoot_down" or orient == "shoot_right" then
    drawBowUpright(img, hx, hy, -1)
    return
  end

  -- For "left": hand is on the left side of body.
  -- String should be to the RIGHT of the wood (toward body center).
  if orient == "left"
     or orient == "shoot_left" then
    drawBowUpright(img, hx, hy, 1)
    return
  end

  -- shoot_up / default: string to the left (toward body center)
  if orient == "shoot_up" then
    drawBowUpright(img, hx, hy, -1)
    return
  end

  -- Fallback: string on left
  drawBowUpright(img, hx, hy, -1)
end

-- Shoot attack hand positions (bow-draw animation, matching drawShootArms in create-body.lua)
local function getShootHandPos(dir, shootPose)
  if dir == 0 then
    -- Down: left arm holds bow forward
    if shootPose == 0 then
      return bodyX - armW, 21, "shoot_down"
    elseif shootPose == 1 then
      return bodyX - armW, 23, "shoot_down"
    elseif shootPose == 2 then
      return bodyX - armW, 21, "shoot_down"
    end
  elseif dir == 1 then
    -- Up: right arm holds bow forward (from behind)
    if shootPose == 0 then
      return bodyX + bodyW, 19, "shoot_up"
    elseif shootPose == 1 then
      return bodyX + bodyW, 14, "shoot_up"
    elseif shootPose == 2 then
      return bodyX + bodyW, 19, "shoot_up"
    end
  elseif dir == 2 then
    -- Left: left arm extends left with bow
    if shootPose == 0 then
      return bodyX - 6, 16, "shoot_left"
    elseif shootPose == 1 then
      return bodyX - 8, 16, "shoot_left"
    elseif shootPose == 2 then
      return bodyX - 6, 16, "shoot_left"
    end
  elseif dir == 3 then
    -- Right: right arm extends right with bow
    if shootPose == 0 then
      return bodyX + bodyW + 6, 16, "shoot_right"
    elseif shootPose == 1 then
      return bodyX + bodyW + 8, 16, "shoot_right"
    elseif shootPose == 2 then
      return bodyX + bodyW + 6, 16, "shoot_right"
    end
  end
  return 0, 0, "shoot_down"
end

-- ============================================================
-- Sprite generation
-- ============================================================

local tools = {
  { name = "hammer",  draw = drawHammer },
  { name = "hatchet", draw = drawHatchet },
  { name = "pickaxe", draw = drawPickaxe },
  { name = "spear",   draw = drawSpear },
  { name = "bow",     draw = drawBow },
}

for _, tool in ipairs(tools) do
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
      clearImg(cel.image)
      local hx, hy, orient = getStandardHandPos(dir, pose)
      tool.draw(cel.image, hx, hy + OFFSET, orient)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  -- Pick frames (8): 4 directions x 2 pick poses
  for dir = 0, 3 do
    for pickPose = 0, 1 do
      local frameIdx = 13 + dir * 2 + pickPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      clearImg(cel.image)
      local hx, hy, orient = getPickHandPos(dir, pickPose)
      tool.draw(cel.image, hx, hy + OFFSET, orient)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  -- Drink frames (16): empty — hands busy cupping water
  for dir = 0, 3 do
    for drinkPose = 0, 3 do
      local frameIdx = 21 + dir * 4 + drinkPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      clearImg(cel.image)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  -- Pickup-item frames (16): empty — hands busy grabbing
  for dir = 0, 3 do
    for pickupPose = 0, 3 do
      local frameIdx = 37 + dir * 4 + pickupPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      clearImg(cel.image)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  -- Swing attack frames (12): 4 directions x 3 swing poses
  for dir = 0, 3 do
    for swingPose = 0, 2 do
      local frameIdx = 53 + dir * 3 + swingPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      clearImg(cel.image)
      local hx, hy, orient = getSwingHandPos(dir, swingPose)
      tool.draw(cel.image, hx, hy + OFFSET, orient)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  -- Thrust attack frames (12): 4 directions x 3 thrust poses
  for dir = 0, 3 do
    for thrustPose = 0, 2 do
      local frameIdx = 65 + dir * 3 + thrustPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      clearImg(cel.image)
      local hx, hy, orient = getThrustHandPos(dir, thrustPose)
      tool.draw(cel.image, hx, hy + OFFSET, orient)
      spr.frames[frameIdx].duration = 0.2
    end
  end

  -- Shoot (bow) attack frames (12): 4 directions x 3 shoot poses
  -- Only the bow actually draws here; other weapons leave these empty
  for dir = 0, 3 do
    for shootPose = 0, 2 do
      local frameIdx = 77 + dir * 3 + shootPose
      app.activeFrame = spr.frames[frameIdx]
      local cel = spr:newCel(spr.layers[1], frameIdx)
      clearImg(cel.image)
      if tool.name == "bow" then
        local hx, hy, orient = getShootHandPos(dir, shootPose)
        tool.draw(cel.image, hx, hy + OFFSET, orient)
      end
      spr.frames[frameIdx].duration = 0.2
    end
  end

  spr:saveAs(app.fs.joinPath(baseDir, tool.name .. ".aseprite"))
  print("Created mainhand/" .. tool.name .. ".aseprite")
end
