#!/bin/bash
set -e
shopt -s globstar

ASEPRITE="$HOME/.local/share/Steam/steamapps/common/Aseprite/aseprite"
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ASSETS_DIR="$SCRIPT_DIR/../assets"
SPRITES_DIR="$SCRIPT_DIR/../src/sprites"

if [ ! -f "$ASEPRITE" ]; then
  echo "Error: Aseprite not found at $ASEPRITE"
  exit 1
fi

# Ground textures
mkdir -p "$SPRITES_DIR/ground"

echo "Exporting ground/grass..."
"$ASEPRITE" -b "$ASSETS_DIR/ground/grass.aseprite" \
  --sheet "$SPRITES_DIR/ground/grass.png" \
  --sheet-type horizontal \
  --data "$SPRITES_DIR/ground/grass.json" \
  --format json-array \
  --list-tags

echo "Exporting ground/berry-bush..."
"$ASEPRITE" -b "$ASSETS_DIR/ground/berry-bush.aseprite" \
  --sheet "$SPRITES_DIR/ground/berry-bush.png" \
  --sheet-type horizontal

echo "Exporting ground/water..."
"$ASEPRITE" -b "$ASSETS_DIR/ground/water.aseprite" \
  --sheet "$SPRITES_DIR/ground/water.png" \
  --sheet-type horizontal \
  --data "$SPRITES_DIR/ground/water.json" \
  --format json-array \
  --list-tags

# Character layers
for file in "$ASSETS_DIR"/characters/**/*.aseprite; do
  relative="${file#"$ASSETS_DIR"/}"
  name="${relative%.aseprite}"
  outdir="$SPRITES_DIR/$(dirname "$name")"
  mkdir -p "$outdir"
  echo "Exporting $name..."
  "$ASEPRITE" -b "$file" \
    --sheet "$SPRITES_DIR/$name.png" \
    --sheet-type horizontal > /dev/null
done

echo "Done. Sprites exported to src/sprites/"
