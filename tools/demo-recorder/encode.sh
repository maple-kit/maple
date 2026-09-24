#!/usr/bin/env bash
# Turns the frames record.ts wrote into the README's GIF and the full MP4.
# Usage: encode.sh <frames dir> <out dir>. Needs ffmpeg on PATH.
set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
frames="$(cd "${1:-$here/.frames}" && pwd)"
out="$(cd "${2:-$here/../../docs/assets}" && pwd)"
width="${DEMO_GIF_WIDTH:-1280}"
fps="${DEMO_GIF_FPS:-20}"

cd "$frames"

ffmpeg -loglevel error -y -f concat -safe 0 -i frames.txt \
  -vf "fps=30,scale=1440:-2:flags=lanczos,format=yuv420p" \
  -c:v libx264 -crf 20 -preset slow -movflags +faststart "$out/demo.mp4"

# One palette for the whole clip, weighted to what changes between frames, so
# the page's flat surfaces do not band and the moving parts keep their colour.
ffmpeg -loglevel error -y -i "$out/demo.mp4" -filter_complex \
  "fps=$fps,scale=$width:-1:flags=lanczos,split[a][b];[a]palettegen=stats_mode=diff:max_colors=256[p];[b][p]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" \
  "$out/demo.gif"

ls -lh "$out/demo.mp4" "$out/demo.gif"
