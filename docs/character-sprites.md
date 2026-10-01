# Cartoon character sprites and player ring

All 16 existing character identities now have nine cartoon bust frames each (144 poses). The original portraits remain in setup and as loading fallbacks.

## Runtime behavior

- Four characters are visible at rest. With five to eight players, swipe or drag across the character band, use the arrows, or select a numbered seat marker. Seat IDs and game order remain unchanged.
- The ring focuses on the active player before their throw. Navigation pauses during a throw and replacement draw so their hand stays in place.
- Reactions follow the **displayed** total: calm/thinking below 70, nervous at 70–89, panicked for the active player at 90–100, and shocked on overflow. Special-card actors briefly look relieved.
- Throwing uses a 110 ms wind-up, release as the real 3D card leaves, and recovery until the replacement reaches the hand. The sprite holds card backs only, preserving other players' hand privacy.
- The table is a wide oblong tilted forward. Characters sit behind its far rim in both layouts; their lower bodies are clipped against the projected tabletop edge, including while browsing the ring. The draw/discard piles and their landing poses share the table tilt.
- Both piles sit across the table's local center line. The total stands on the projected center point and renders in front of the characters. Its size is reduced by about 17%; captions and event messages no longer shift its base. The inner effect rings inherit the tabletop's oval stretch and forward tilt, keeping them concentric with the engraving.
- Reduced motion skips rotation and throw poses. Failed sprite loads retain the original portrait.

## Asset format and performance

Each transparent WebP is 1254 × 1254, with a 3 × 3 grid of 418 × 418 cells. Frames use row-major order, as recorded in `public/assets/characters/manifest.json`.

| Frame | Pose |
| --- | --- |
| 0 | Calm, holding two cards |
| 1 | Thinking, holding two cards |
| 2 | Nervous, holding two cards |
| 3 | Panicked, holding two cards |
| 4 | Smug / relieved, holding two cards |
| 5 | Shocked, holding two cards |
| 6 | Wind-up, one card raised, one retained |
| 7 | Release, throwing hand empty, one card retained |
| 8 | Recovery, throwing hand empty, one card retained |

Atlases decode when their seats enter view and are cached. Sprite frames change on gameplay events, with no idle animation loop. Only ring movement runs a short 260 ms animation loop. Two transparent pixels inside each cell prevent neighboring-frame sampling at fractional CSS sizes. WebP quality is 90; alpha is preserved. The existing high-resolution card textures are untouched.

To repack an original generated PNG:

```sh
python3 scripts/assets/pack-character-sheet.py source.png public/assets/characters/avatar-01.webp
```

The manifest records each generated source filename. Original PNGs are retained in Codex's generated-images library; the game uses the checked-in WebP assets.

## Generation prompt

The built-in image generation tool used each original portrait as the identity reference, the approved first character sheet as the style reference, and the existing 100 card back as the held-card reference. The requested 1536-square target produced 1254-square PNGs.

Exact common prompt for characters 2–16:

```text
Use case: stylized-concept. Generate ONE production transparent character sprite atlas for browser game 100. IMAGE 1 is this character's ORIGINAL IDENTITY reference: preserve their HUMAN species, gender, age, skin tone, hair, accessories and costume exactly recognizable. IMAGE 2 is the APPROVED sprite atlas for style, exact 3x3 cell arrangement, chest-to-head scale, aligned framing and throw poses ONLY; do not copy its man or red costume. IMAGE 3 is actual existing ornate 100 card back for cards held in each pose.
Create square true transparent PNG with EXACT 3 columns by 3 rows, nine equal square cells, no background/grid/labels/halo/scenery. Polished expressive CARTOON human illustration matching image2. Same character in all9cells. Same head position, scale, chest baseline and costume each cell, chest-to-head including hands, cell safety margin 5%, body stays inside its owncell, cannot overlapneighborcells. Center in everycell with hands lowchest. Use SAME frontal three-quarter orientation throughout and strong readable facial expressions.
Exact row-major frames: row1col1 CALM holding exactly2 small100back cards; row1col2 THINKING furrowedbrow studying2cards; row1col3 NERVOUS worriedlips raisedeyebrows holding2cards. Row2col1 PANICKED wideeyes mouthagape holding2cards; row2col2 SMUG confident slysmile holding2cards; row2col3 SHOCKED surprise openmouth holding2cards. Row3col1 THROW WIND-UP anatomicalright hand (viewer'sleft) lifts1card beside shoulder, left hand retains1card; row3col2 RELEASE rightarm extends forward/down viewer-left palmopen EMPTY hand throwing toward table, left hand keeps1card; row3col3 RECOVER rightemptyhand returnschest, left retains1card. No airbornecards in sheet as game renderscard separately. Exactly9sprites3x3 nootherposes, no duplicationofanother character. Transparent alpha edges crisp. Target 1536x1536.
```

The first sheet established the same frame layout using the Ember Scout portrait, the previously approved cartoon mockup, and the card back.

## Verification

Rules, online projections/privacy, hosted CPU timing, card presentation, gestures, gyro, suspense timing, and ring order tests run through `pnpm test`. The ring model covers two through eight seats in desktop and portrait layouts. Browser checks cover four-player desktop/mobile presentation, eight-player swiping, arrows, distant seat markers, white target glow, and local play/draw transitions. The actual controller lifecycle checks in `scripts/test-player-ring.html` cover decoded sprites, stable hand anchors during flight, waiting for draws, canceled throws, danger reactions, and stable DOM identities. Open that page through the development server to run it.

The Cloudflare production build passes. Preview screenshots are in `docs/previews/`. A successful build does not establish an FPS guarantee on every phone; a two-device live multiplayer session has not been verified for this update.
