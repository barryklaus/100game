# 100 and 100next

The owner has requested automatic GitHub pushes and live publishing for each completed 100next iteration.

- Work labeled **100next** belongs on branch `100next` and at `https://100next.pages.dev/`.
- Preserve `main`, tag `stable-2026-10-02`, and the stable Worker `100game`. Do not merge 100next into main or deploy the stable Worker unless the owner explicitly asks.
- 100next starts with the existing Observatory assets. The Midnight Social Club assets are mockups; do not integrate them without a request.
- After implementing and verifying an authorized 100next update, commit the changes, push `100next`, publish its separate backend/frontend, and verify the live release. Do not ask the owner to press Push Origin.
- `pnpm publish:next` runs the tests, builds, pushes, and deploys using existing authentication. Run it only from a clean, committed 100next branch. GitHub Actions also publishes branch pushes when its Cloudflare secret is configured.
- `hosting/next/wrangler.jsonc` serves the frontend; `wrangler.next-rooms.jsonc` holds separate multiplayer rooms. Never use the root `wrangler.jsonc` for 100next releases.
- Keep credentials out of source, logs, and reports. If authentication requires a human verification step, request that specific step and continue independent work.
