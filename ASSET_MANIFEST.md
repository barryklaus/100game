# Asset manifest

The authoritative card artwork is the user supplied `CARD DESIGN/FINAL/HIGH-RESOLUTION` set. All 52 fronts and the back are used. Source PNG files remain unchanged outside the repository. The game uses quality-94 WebP copies at their supplied approximately 1063–1064 × 1478–1480 dimensions. Rounded corners are cut by 3D geometry and CSS at display time, so no artwork is cropped or painted over in the files.

## Final card texture mapping

| Game card | Source artwork |
| --- | --- |
| Ace | `*-1.png` |
| 2–6 | Matching numbered artwork |
| 7 | `*-7-Choose-Player.png` |
| 8 | `*-8-Reverse.png` |
| 9 | `*-9-Zero.png` |
| 10 | `*-10-Minus10.png` |
| Jack | `*-10A.png` |
| Queen | `*-10B.png` |
| King | `*-10C.png` |
| Card back | `BACK/CARD-BACK.png` |

All four suits map into `public/assets/cards/{suit}-{rank}.webp`. Source `*-1.png` maps to game rank A; `*-10A.png`, `*-10B.png`, and `*-10C.png` map to game ranks J, Q, and K respectively. The source files remain unchanged.

The source artwork stays unchanged. At display time each front gets a thick suit-colored frame, top-left and rotated bottom-right rank indices, and a printed instruction band for ranks 7–10. The 3D surface and thin paper edge share one rounded card outline; a shader ring follows the border only. All card fronts use saturated holographic metal, with deeper spectral color and sharper glints on ranks 7–10. Reflected glints respond to card movement and tilt, with no automatic animation. The HTML fallback uses matching clipped CSS border effects. The alternate 10 artworks used by Jack, Queen, and King display as normal 10s (+10). Rank 10 itself is MINUS TEN (−10), not a normal 10.

## Supplied card sounds

All eight recordings in `CARD DESIGN/FINAL/SOUND EFFECTS` are copied unchanged to `public/assets/sfx/`. `SOUND-CARD-TAKE.mp3` plays for pickup and drawing from the pile; the three `SOUND-CARD-DEAL*.wav` files alternate as cards reach the hand; the two `SOUND-CARD-FLICK*.wav` files alternate for played flicks; and the two `SOUND-CARD-PLACED*.wav` files alternate when cards land on the discard pile. They load after a user gesture, and the existing procedural sound remains a fallback if a recording cannot be decoded.

## Scene artwork

| File | Type | Dimensions | Intended usage |
| --- | --- | --- | --- |
| `public/assets/scene/tavern.webp` | WebP | 1400 × 636 | Setup screen ambience derived from the original card sheet. |
| `public/assets/scene/fantasy-table.jpg` | JPEG | 1536 × 1024 | Legacy illustrated fallback when the 3D world is unavailable. |

The legacy fallback background was generated with the built-in imagegen tool using the user-supplied `GAME and UI.png` as a visual reference. Prompt direction: “Recreate the cozy fantasy tavern at night, with a large empty oval blue marble and gold game table, warm lanterns, moonlit town, and fantasy characters around the table. Keep central and lower table space clear for live UI. No words, numbers, logos, badges, cards, buttons, menus, or watermark.” The active room, table, chairs, cards, well, energy channel, props, lighting, city layers, and effects are rendered as interactive 3D geometry.

## Procedural materials and numeral font

`WorldMaterials.ts` creates wood grain, woven cloth, worn brass, and stone texture maps in code. No supplied illustration is edited in its source file. `totalFont.json` contains only numerals and punctuation from Three.js's Gentilis Bold typeface, used for the extruded center total. The card corner indices and special titles use Google's Luckiest Guy font, bundled with its Apache 2.0 license in `public/assets/fonts/` so they remain available offline. Its upstream license is retained in `public/assets/fonts/`.

The local supplied `holo/Holo-1.png` was previously inspected as a spectral-reflection reference. No third-party Pokémon artwork or card textures were copied. The new foil is original shader code confined to the printed card border.

## Original avatar portraits

Sixteen separate original character portraits were generated with the built-in imagegen tool, then resized to 512 × 512 JPEG at quality 82 for the site. They are distinct from the supplied card faces. Shared prompt direction: “One original square chest-up character avatar for 100; expressive face, clear silhouette, vibrant hand-painted anime fantasy card illustration, energetic ink outlines, painterly highlights, saturated color, warm tavern light, soft motif background; no card frame, suit, rank, lettering, or watermark.” Each prompt used the following distinct subject:

| File | Character | Subject prompt |
| --- | --- | --- |
| `public/assets/avatars/avatar-01.jpg` | Ember Scout | Tousled black hair, brass goggles, red scarf, ember motif. |
| `public/assets/avatars/avatar-02.jpg` | Tide Scholar | Dark skin, teal braids, pearl earrings, blue water robes. |
| `public/assets/avatars/avatar-03.jpg` | Grove Guardian | Older man, leafy beard, moss cloak, botanical motifs. |
| `public/assets/avatars/avatar-04.jpg` | Sun Knight | Golden curls, sunburst armor, amber cape. |
| `public/assets/avatars/avatar-05.jpg` | Storm Pilot | Silver undercut, violet scarf, lightning goggles. |
| `public/assets/avatars/avatar-06.jpg` | Coral Bard | Freckles, seafoam curls, coral jewelry, lute strap. |
| `public/assets/avatars/avatar-07.jpg` | Mushroom Alchemist | Round glasses, mushroom hat, green coat. |
| `public/assets/avatars/avatar-08.jpg` | Desert Ranger | Brown skin, dark braid, amber cloak, sun compass. |
| `public/assets/avatars/avatar-09.jpg` | Moon Seer | Elderly woman, indigo-silver hair, crescent eyepiece. |
| `public/assets/avatars/avatar-10.jpg` | River Courier | Auburn curls, blue messenger satchel, ripple pins. |
| `public/assets/avatars/avatar-11.jpg` | Thorn Duelist | Dark skin, short emerald hair, thorned collar. |
| `public/assets/avatars/avatar-12.jpg` | Forge Captain | Older woman, copper skin, short white hair, forged pauldron. |
| `public/assets/avatars/avatar-13.jpg` | Cloud Mechanic | Lavender bob, brass goggles, sky-blue tool belt. |
| `public/assets/avatars/avatar-14.jpg` | Marsh Mystic | Black man, violet cloak, teal beads, firefly lantern. |
| `public/assets/avatars/avatar-15.jpg` | Wildwood Archer | Freckles, red hair, leaf-green hood, woodland markings. |
| `public/assets/avatars/avatar-16.jpg` | Dawn Dancer | South Asian woman, dark waves, saffron ribbons, gold jewelry. |
