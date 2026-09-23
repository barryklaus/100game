# Asset manifest

The authoritative card artwork is the user supplied `CARD DESIGN/FINAL` set. Source PNG files remain unchanged outside the repository. The game uses WebP versions at the original approximate 510–511 × 710–711 dimensions, preserving transparency and aspect ratio.

## Final card texture mapping

| Game card | Source artwork |
| --- | --- |
| Ace | `*-1.png` |
| 2–6 | Matching numbered artwork |
| 7 | `*-7-ChoosePlayer.png` |
| 8 | `*-8-Reverse.png` |
| 9 | `*-9-Zero.png` |
| 10 | `*-10-Minus10.png` |
| Jack | `*-10A.png` |
| Queen | `*-10B.png` |
| King | `*-10C.png` |
| Card back | `CARD BACK/Card-Back.png` |

All four suits map into `public/assets/cards/{suit}-{rank}.webp`. The Fire source files use the `Card-Sun` filename prefix inside the `FIRE` folder. The Sun choose-player source is named `Card-Sun-9-ChoosePlayer.png`; it fills the otherwise missing rank 7 slot. These source naming inconsistencies are mapped without changing the originals.

All cards show their original printed artwork with no added frame or foil overlay. The thin 3D paper edge follows the source alpha silhouette instead of filling its transparent corners. The alternate 10 artworks used by Jack, Queen, and King display as normal 10s (+10). Rank 10 itself is MINUS TEN (−10), not a normal 10.

## Scene artwork

| File | Type | Dimensions | Intended usage |
| --- | --- | --- | --- |
| `public/assets/scene/tavern.webp` | WebP | 1400 × 636 | Setup screen ambience derived from the original card sheet. |
| `public/assets/scene/fantasy-table.jpg` | JPEG | 1536 × 1024 | Legacy illustrated fallback when the 3D world is unavailable. |

The legacy fallback background was generated with the built-in imagegen tool using the user-supplied `GAME and UI.png` as a visual reference. Prompt direction: “Recreate the cozy fantasy tavern at night, with a large empty oval blue marble and gold game table, warm lanterns, moonlit town, and fantasy characters around the table. Keep central and lower table space clear for live UI. No words, numbers, logos, badges, cards, buttons, menus, or watermark.” The active room, table, chairs, cards, well, energy channel, props, lighting, city layers, and effects are rendered as interactive 3D geometry.

## Procedural materials and numeral font

`WorldMaterials.ts` creates wood grain, woven cloth, worn brass, and stone texture maps in code. No supplied illustration is painted over or regenerated. `totalFont.json` contains only numerals and punctuation from Three.js's Gentilis Bold typeface, used for the extruded center total. Its upstream license is retained in `public/assets/fonts/`.

The local supplied `holo/Holo-1.png` was previously inspected as a spectral-reflection reference. No third-party Pokémon artwork or card textures were copied. The experimental foil shader has since been removed at the user's request.

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
