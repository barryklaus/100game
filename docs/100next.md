# 100next

The development version lives at **https://100next.pages.dev/** on branch `100next`.
The preserved Observatory game remains at **https://100game.100game.workers.dev/** on `main`, with baseline tag `stable-2026-10-02`.

100next uses the same initial game and assets, a Cloudflare Pages frontend, and a separate `100next-rooms` Worker with its own GameRoom storage. Room links, browser settings, and saved room tokens are separate because the games have different origins. Rooms cannot be shared between versions.

## Publishing

After an update, verify it, commit the changes and push branch `100next`. GitHub automatically runs the `Publish 100next` workflow, publishes the separate room Worker and Pages frontend, then verifies the deployed commit and multiplayer service. The owner does not need to press Push Origin for agent-managed updates.

The `Publish 100next` GitHub workflow is configured and verified as of October 3, 2026. Its encrypted repository secret `CLOUDFLARE_API_TOKEN` has Cloudflare Pages Edit and Workers Scripts Edit access for the owner's account. Store this only in GitHub Actions secrets; never commit it. The account ID is public configuration. The workflow cannot publish other branches. Publishing runs on GitHub and does not require this Mac to stay online.

`pnpm publish:next` is a direct publishing fallback. It checks the branch and clean checkout, runs tests, builds, pushes GitHub, deploys and verifies the live game using existing authentication. The normal workflow is preferred to avoid deploying the same update twice. Neither path deploys the stable Worker.

`/release.json` identifies the deployed commit. Check it after publishing, then verify local play and online room creation, joining, and WebSocket connection.

## Local preview

Run `pnpm build:next`. Start `pnpm exec wrangler dev --config wrangler.next-rooms.jsonc` in one terminal and `pnpm exec wrangler pages dev ../../dist-next --cwd hosting/next` in another. The Pages frontend proxies room requests to the local GameRoom Worker.

## Preserving the original

The stable branch and Worker configuration are unchanged. Future 100next work stays on its own branch and deployment. The new cartoon theme remains a design exploration until requested.
