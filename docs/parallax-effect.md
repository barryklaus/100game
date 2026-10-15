# Parallax Effect — Alpha 0.1.4

Settings → **Parallax Effect** adds three visual layers to the hand:

1. Existing suit border, corner indices and special-card instructions.
2. A clean background with motion-responsive holographic glitter.
3. A transparent foreground object, moving opposite the background.

The deck remains **52 cards**. There are **44 unique artwork sets**: four suits
with eleven illustrations each. J, Q and K remain distinct +10 cards and share
the same artwork in each suit.

## Assets

- `public/assets/cards/midnight-v1/parallax-v1/manifest.json` inventories all sets.
- `<suit>-<rank>/background.webp` and `object.webp` are 1064 × 1486 lossless WebP.
- `flat/<suit>-<rank>.webp` composites the neutral pose for the pile and fallback.
- Object images have real transparency; artwork fills the game's rounded mask.
- The approved Sun 1 mockup supplied its two layers. The remaining 86 layers
  were edited from the existing card artwork with the built-in imagegen tool.
- `parallax-generation.json` records the prompts and original source convention.
- `scripts/assemble-parallax-assets.py` packages the generated source PNGs from
  the local preparation records in `output/parallax-work/`. These working files
  are not needed to build or run the game; the final assets are committed.

## Rendering and performance

- Off by default, saved on the device, and paused by Reduced motion.
- Optional layers load only for visible hand cards, including pass-device hands.
  The whole deck is not prefetched. A failed or pending layer keeps the flat print.
- Uses the existing coalesced pointer updates and calibrated phone-tilt loop.
  There is no new idle animation loop.
- Border and labels tilt together; background and foreground shift separately.
  Holo is confined to the background, below the object and printed information.
- A prepared foreground flight snapshots the held pose and settles its depth
  into the exact neutral pile composite. Three owned flight textures are disposed
  on cancellation or completion. The HTML fallback also settles its offsets.
- The original flat artwork remains available when the option is off. The stable
  100 build never selects the new artwork paths.

## Verification

- Full game and 100next suites, including 52-card conservation and online privacy.
- Dedicated parallax checks: 44 complete sets covering all 52 physical cards;
  native dimensions, lossless encoding and real alpha; bounded opposing offsets;
  atomic readiness, failed/stale loads, flight settling and texture disposal.
- Desktop and 414 × 896 portrait browser checks: persistent setting, V hand layout,
  drag/flick, completed discard landing, replacement-card cleanup, toggling during
  play, restored desktop meshes, and Reduced motion preference restoration.
- TypeScript and the production 100next build.

Portrait browser testing does not measure frame rate on a physical iPhone XS Max.
The default remains off to preserve the existing mobile performance budget.

## Held motion and shine correction — 0.1.3

The gesture now paints parallax and holographic motion in the same coalesced
update as the held card's tilt. The first movement starts the glitter; captured
mouse and touch movement does not depend on the pointer remaining above the
original slot. Tilt uses its full bounded range for clearly visible depth.
Released throws keep that final pose, while returned/canceled cards recenter.

The background reflects stronger metallic rainbow flakes through a small SVG
grain tile. Glitter remains behind the object, border, numbers and special-card
instructions. It fades when movement stops, without an idle animation loop.
The same treatment is used on the flat DOM hand when parallax is off.

Regression checks cover the first held movement, no separate foil RAF during
dragging, release continuity, canceled returns and Reduced motion. Local browser
replays exercise the actual gesture handlers with both mouse and touch pointers.

## Seamless throw handoff — 0.1.4

- Normalize relative and absolute card URLs so visible-hand warming and release
  consume the same prepared card. Keep at most two preparations, including with
  parallax off. Returning a held card keeps its preparation available.
- Prepare geometry, upload native textures and compile flight shaders while the
  hand is visible. Optional layers must be ready before a layered card is warmed.
- A compositor animation immediately carries a released card at its real pointer
  velocity if preparation is still pending. The flight snapshots that moving
  position and rotation before canceling the carry and hiding the hand card.
- Update concurrent flights together and paint their new positions in the same
  frame, paced at 60 Hz. Preserve exact discard fitting and the atomic pile handoff.
- Clear preparations on exits, outcomes, effect changes and context loss.

Local integration replay: prepared desktop handoff measured 21 ms; a portrait
touch throw with an artificial 160 ms preparation delay kept moving in all nine
sampled intervals and had a visible flight at handoff. These are browser fixture
measurements, not physical iPhone frame-rate claims. Regression tests cover the
carry, same-frame paint, batching, shader/texture preparation and bounded reuse.
