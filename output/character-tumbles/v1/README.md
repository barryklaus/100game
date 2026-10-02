# Backward tumble character artwork

Sixteen existing characters, nine backward fall poses each. These are separate transparent sheets generated from the approved expanded character artwork. The original character assets remain the identity and style references, including their face, age, hair, accessories, costume and ornate held card backs.

Open `index.html` through the local development server to play the poses behind the actual game table. Select a character, scrub the nine poses, or press **Play backward tumble**. `gallery.html` shows all sixteen sheets. The preview dims the supporting characters and highlights the tumbler.

## Files

- `avatar-NN-tumble-source.png`: lossless generated artwork.
- `avatar-NN-tumble.webp`: aligned 1254 × 1254 transparent sheets, 3 × 3 cells of 418 pixels, with 18-pixel sampling gutters.
- `manifest.json`: exact generation prompt for every character, the existing reference path, generated source provenance, frame order and packed format.
- `preview.ts` and `preview.css`: standalone artwork preview on the game's actual 3D table; these are outside the production entry point.

The built-in image generation tool produced every source sheet. Packing preserves complete cutouts, uses one scale per character and aligns them at the bottom of each cell. The source's actual row/column gaps are detected; where horizontal bounds overlap, disconnected silhouettes are separated intact instead of being cropped at a nominal column edge. Every output pose is contained within its sampling gutter.

Frame order: startled → lean back → lose balance → cards loose → recline → knees rise → tumble → boots up → fallen. The real tabletop supplies the lower-body occlusion; the artwork includes no baked-in table or chair. Boots and lower-body details follow each character's costume.

Regenerate the packed sheets with:

```sh
python3 scripts/assets/pack-tumble-sheets.py
```

These assets are prepared for the overflow sequence. Gameplay integration, automatic slider focus and delayed score-panel presentation have not been applied to the live game in this artwork step.
