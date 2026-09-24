# Demo recorder

Records the clip at the top of the README from the Vite example, so it can be
re-taken whenever the overlay changes instead of going stale.

```bash
nvm use
pnpm --filter @maple-kit/example-vite dev   # with TYPESAFE_API_KEY in examples/vite-app/.env
pnpm demo:record                            # writes docs/assets/demo.gif and demo.mp4
```

- `record.ts` drives Chromium through the flow and keeps every frame the
  DevTools screencast paints, with its timestamp. Playwright's own video is
  lossy, and a GIF made from it carries the artefacts.
- `encode.sh` holds each frame for as long as it was on screen, writes the MP4,
  and builds the GIF from one palette. `DEMO_GIF_WIDTH` and `DEMO_GIF_FPS`
  override its 1280 px and 20 fps. Needs `ffmpeg`.
- The recorder waits for the assist scores before it publishes, so the clip
  shows them however long the classifier takes. Without a key the composer
  scores offline with the keyword classifier instead.
- The example's store is in memory, so a second take would begin with the
  first take's comment on the page. The recorder refuses: restart the dev
  server between takes.
