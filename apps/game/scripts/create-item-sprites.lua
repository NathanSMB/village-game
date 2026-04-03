-- Create 16x16 item sprites for ground/inventory display
-- 6 items in a horizontal strip: small-rock, berry, tunic, pants, boots, branch
-- Run: aseprite -b --script-param script-path="$(pwd)/scripts/create-item-sprites.lua" --script scripts/create-item-sprites.lua

local W = 16
local H = 16
local TOTAL_FRAMES = 6

local scriptPath = app.params["script-path"] or "."
local outputDir = app.fs.joinPath(app.fs.filePath(scriptPath), "..", "assets", "ground")

local spr = Sprite{ width = W, height = H, colorMode = ColorMode.RGB }

for i = 2, TOTAL_FRAMES do
  spr:newEmptyFrame()
end

local CLEAR = Color{ r = 0, g = 0, b = 0, a = 0 }

-- Helpers
local function px(img, x, y, c)
  if x >= 0 and x < W and y >= 0 and y < H then
    img:drawPixel(x, y, c)
  end
end

local function clearImg(img)
  for y = 0, H - 1 do
    for x = 0, W - 1 do
      img:drawPixel(x, y, CLEAR)
    end
  end
end

local function rect(img, x, y, w, h, c)
  for dy = 0, h - 1 do
    for dx = 0, w - 1 do
      px(img, x + dx, y + dy, c)
    end
  end
end

-- ============================================================
-- Frame 0: Small Rock
-- ============================================================
local function drawSmallRock(img)
  clearImg(img)
  local ROCK = Color{ r = 130, g = 125, b = 115, a = 255 }
  local ROCK_D = Color{ r = 95, g = 90, b = 82, a = 255 }
  local ROCK_L = Color{ r = 165, g = 160, b = 150, a = 255 }
  local ROCK_H = Color{ r = 190, g = 185, b = 175, a = 255 }
  local SHADOW = Color{ r = 50, g = 50, b = 45, a = 100 }

  -- Shadow (under stone)
  rect(img, 4, 11, 9, 1, SHADOW)
  rect(img, 5, 12, 7, 1, SHADOW)

  -- Main stone shape (irregular oval) - raised 1px
  rect(img, 5, 6, 7, 5, ROCK)
  rect(img, 4, 7, 9, 3, ROCK)
  rect(img, 6, 5, 5, 1, ROCK)
  rect(img, 6, 11, 5, 1, ROCK)

  -- Dark bottom/right edges
  rect(img, 4, 9, 9, 1, ROCK_D)
  rect(img, 5, 10, 7, 1, ROCK_D)
  rect(img, 6, 11, 5, 1, ROCK_D)
  rect(img, 12, 7, 1, 3, ROCK_D)

  -- Highlight upper-left
  px(img, 6, 5, ROCK_L)
  px(img, 7, 5, ROCK_L)
  px(img, 5, 6, ROCK_L)
  px(img, 6, 6, ROCK_H)
  px(img, 7, 6, ROCK_L)
  px(img, 5, 7, ROCK_L)
end

-- ============================================================
-- Frame 1: Berry (red, matching bush berry colors)
-- ============================================================
local function drawBerry(img)
  clearImg(img)
  local BERRY = Color{ r = 200, g = 40, b = 50, a = 255 }
  local BERRY_HI = Color{ r = 230, g = 80, b = 80, a = 255 }
  local BERRY_DK = Color{ r = 150, g = 25, b = 35, a = 255 }
  local STEM = Color{ r = 60, g = 100, b = 40, a = 255 }
  local STEM_DK = Color{ r = 40, g = 75, b = 28, a = 255 }
  local SHADOW = Color{ r = 50, g = 20, b = 25, a = 80 }

  -- Shadow
  rect(img, 5, 14, 6, 1, SHADOW)

  -- Stem
  px(img, 8, 4, STEM)
  px(img, 7, 5, STEM)
  px(img, 8, 5, STEM_DK)

  -- Berry body (round)
  rect(img, 6, 7, 5, 5, BERRY)
  rect(img, 5, 8, 7, 3, BERRY)
  rect(img, 7, 6, 3, 1, BERRY)
  rect(img, 7, 12, 3, 1, BERRY)

  -- Dark bottom
  rect(img, 5, 10, 7, 1, BERRY_DK)
  rect(img, 6, 11, 5, 1, BERRY_DK)
  rect(img, 7, 12, 3, 1, BERRY_DK)

  -- Highlight
  px(img, 6, 7, BERRY_HI)
  px(img, 7, 7, BERRY_HI)
  px(img, 6, 8, BERRY_HI)
  -- Specular highlight
  px(img, 7, 7, Color{ r = 250, g = 200, b = 200, a = 255 })
end

-- ============================================================
-- Frame 2: Tunic (simple cloth icon)
-- ============================================================
local function drawTunic(img)
  clearImg(img)
  local CLOTH = Color{ r = 100, g = 140, b = 90, a = 255 }
  local CLOTH_D = Color{ r = 70, g = 105, b = 62, a = 255 }
  local CLOTH_L = Color{ r = 130, g = 170, b = 115, a = 255 }

  -- Main body
  rect(img, 5, 6, 6, 7, CLOTH)
  -- Sleeves
  rect(img, 3, 6, 2, 4, CLOTH)
  rect(img, 11, 6, 2, 4, CLOTH)
  -- Collar
  rect(img, 6, 5, 4, 1, CLOTH_L)
  px(img, 7, 5, CLOTH_D)
  px(img, 8, 5, CLOTH_D)
  -- Bottom hem
  rect(img, 5, 12, 6, 1, CLOTH_D)
  -- Sleeve cuffs
  px(img, 3, 9, CLOTH_D)
  px(img, 4, 9, CLOTH_D)
  px(img, 11, 9, CLOTH_D)
  px(img, 12, 9, CLOTH_D)
  -- Left shadow
  rect(img, 5, 7, 1, 5, CLOTH_D)
  -- Right highlight
  px(img, 10, 7, CLOTH_L)
  px(img, 10, 8, CLOTH_L)
end

-- ============================================================
-- Frame 3: Pants (simple pants icon)
-- ============================================================
local function drawPants(img)
  clearImg(img)
  local CLOTH = Color{ r = 80, g = 90, b = 130, a = 255 }
  local CLOTH_D = Color{ r = 55, g = 62, b = 95, a = 255 }
  local CLOTH_L = Color{ r = 105, g = 115, b = 160, a = 255 }

  -- Waistband
  rect(img, 4, 4, 8, 2, CLOTH_L)
  rect(img, 4, 4, 8, 1, CLOTH_L)
  -- Belt detail
  rect(img, 5, 4, 6, 1, Color{ r = 120, g = 85, b = 50, a = 255 })

  -- Main body (hip area)
  rect(img, 4, 6, 8, 3, CLOTH)

  -- Left leg
  rect(img, 4, 9, 3, 5, CLOTH)
  rect(img, 4, 13, 3, 1, CLOTH_D)
  rect(img, 4, 9, 1, 5, CLOTH_D)

  -- Right leg
  rect(img, 9, 9, 3, 5, CLOTH)
  rect(img, 9, 13, 3, 1, CLOTH_D)
  px(img, 11, 9, CLOTH_L)
  px(img, 11, 10, CLOTH_L)

  -- Gap between legs (shadow)
  rect(img, 7, 9, 2, 3, CLOTH_D)
end

-- ============================================================
-- Frame 4: Boots (simple boots icon)
-- ============================================================
local function drawBoots(img)
  clearImg(img)
  local LEATHER = Color{ r = 110, g = 75, b = 45, a = 255 }
  local LEATHER_D = Color{ r = 80, g = 52, b = 30, a = 255 }
  local LEATHER_L = Color{ r = 140, g = 100, b = 65, a = 255 }
  local SOLE = Color{ r = 50, g = 40, b = 30, a = 255 }

  -- Left boot
  -- Shaft
  rect(img, 2, 5, 4, 5, LEATHER)
  rect(img, 2, 5, 1, 5, LEATHER_D)
  px(img, 5, 5, LEATHER_L)
  px(img, 5, 6, LEATHER_L)
  -- Foot
  rect(img, 1, 10, 6, 2, LEATHER)
  rect(img, 1, 10, 6, 1, LEATHER_D)
  -- Sole
  rect(img, 1, 12, 6, 1, SOLE)
  -- Toe cap
  px(img, 1, 10, LEATHER_L)
  px(img, 1, 11, LEATHER_L)

  -- Right boot
  -- Shaft
  rect(img, 10, 5, 4, 5, LEATHER)
  rect(img, 10, 5, 1, 5, LEATHER_D)
  px(img, 13, 5, LEATHER_L)
  px(img, 13, 6, LEATHER_L)
  -- Foot
  rect(img, 9, 10, 6, 2, LEATHER)
  rect(img, 9, 10, 6, 1, LEATHER_D)
  -- Sole
  rect(img, 9, 12, 6, 1, SOLE)
  -- Toe cap
  px(img, 14, 10, LEATHER_L)
  px(img, 14, 11, LEATHER_L)
end

-- ============================================================
-- Frame 5: Branch (wooden stick)
-- ============================================================
local function drawBranch(img)
  clearImg(img)
  local WOOD = Color{ r = 110, g = 75, b = 42, a = 255 }
  local WOOD_D = Color{ r = 80, g = 52, b = 28, a = 255 }
  local WOOD_L = Color{ r = 140, g = 100, b = 60, a = 255 }
  local SHADOW = Color{ r = 45, g = 35, b = 25, a = 80 }

  -- Shadow
  rect(img, 3, 13, 11, 1, SHADOW)

  -- Main branch (diagonal stick going from bottom-left to upper-right)
  -- Using individual pixels to draw the diagonal
  px(img, 2, 12, WOOD_D)
  px(img, 3, 11, WOOD)
  px(img, 3, 12, WOOD_D)
  px(img, 4, 10, WOOD)
  px(img, 4, 11, WOOD)
  px(img, 5, 9, WOOD)
  px(img, 5, 10, WOOD_L)
  px(img, 6, 8, WOOD)
  px(img, 6, 9, WOOD)
  px(img, 7, 7, WOOD)
  px(img, 7, 8, WOOD_L)
  px(img, 8, 6, WOOD)
  px(img, 8, 7, WOOD)
  px(img, 9, 5, WOOD)
  px(img, 9, 6, WOOD_L)
  px(img, 10, 4, WOOD)
  px(img, 10, 5, WOOD)
  px(img, 11, 3, WOOD_L)
  px(img, 11, 4, WOOD)
  px(img, 12, 3, WOOD_D)

  -- Small fork at the top
  px(img, 12, 2, WOOD)
  px(img, 13, 2, WOOD_L)
  px(img, 11, 2, WOOD_D)
  px(img, 10, 3, WOOD)

  -- Small nub on the side
  px(img, 5, 8, WOOD_D)
  px(img, 8, 8, WOOD_D)
end

-- Generate frames
local drawFuncs = { drawSmallRock, drawBerry, drawTunic, drawPants, drawBoots, drawBranch }

for i, drawFunc in ipairs(drawFuncs) do
  app.activeFrame = spr.frames[i]
  local cel = spr:newCel(spr.layers[1], i)
  drawFunc(cel.image)
  spr.frames[i].duration = 1.0
end

spr:saveAs(app.fs.joinPath(outputDir, "items.aseprite"))
print("Created items.aseprite with " .. TOTAL_FRAMES .. " frames (16x16)")
