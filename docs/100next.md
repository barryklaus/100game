# 100next

The development version lives at **https://100next.pages.dev/** on branch `100next`.
The preserved Observatory game remains at **https://100game.100game.workers.dev/** on `main`, with baseline tag `stable-2026-10-02`.

100next uses the same initial game and assets, a Cloudflare Pages frontend, and a separate `100next-rooms` Worker with its own GameRoom storage. Room links, browser settings, and saved room tokens are separate because the games have different origins. Rooms cannot be shared between versions.

## Publishing

After an update, commit the changes and run `pnpm publish:next`. It verifies the branch and clean checkout, runs the existing checks plus the 100next routing checks, builds the game, pushes GitHub, then publishes the room Worker and Pages frontend. It never deploys the stable Worker.

The `Publish 100next` GitHub workflow performs the same checks and deployment after a push to `100next`. It needs the repository secret `CLOUDFLARE_API_TOKEN`, with Cloudflare Pages Edit and Workers Scripts Edit access for the owner's account. Store this only in GitHub Actions secrets; never commit it. The account ID is public configuration. The workflow cannot publish other branches.

`/release.json` identifies the deployed commit. Check it after publishing, then verify local play and online room creation, joining, and WebSocket connection.

## Local preview

Run `pnpm build:next`. Start `pnpm exec wrangler dev --config wrangler.next-rooms.jsonc` in one terminal and `pnpm exec wrangler pages dev ../../dist-next --cwd hosting/next` in another. The Pages frontend proxies room requests to the local GameRoom Worker.

## Preserving the original

The stable branch and Worker configuration are unchanged. Future 100next work stays on its own branch and deployment. The new cartoon theme remains a design exploration until requested.
