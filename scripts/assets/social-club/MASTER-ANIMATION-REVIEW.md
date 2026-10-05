# Master artwork animation review, v1

The owner approved direct pixel-preserving editing on 5 October 2026.
This preview is separate from the game. The native master-art quality hold
stays enabled until the larger animations pass visual review.

## Completed core batch

All eight approved chair-free 2048-square masters have nine complete frames:
rest, half blink, blink, intermediate/full left, intermediate/full right,
and intermediate/full downward gaze. They form five short reaction clips.
Every frame is derived directly from its master; no frame-to-frame generation.
Only the calibrated eye regions may change. Automated comparisons confirm
every protected RGBA pixel, the full original alpha channel, and lossless
WebP visible pixels match. These checks establish preservation, not artistic
perfection; the preview is for judging the actual expressions and timing.

## Finn movement trial

Card prepare/release frames composite only the working card/hand region.
Head rows before y=770 and lower-body rows after y=1110 match the master.
The reverse sequence illustrates pickup grip, without a flying game card.

The tumble is explicitly a larger-pose trial. It reuses the original head
painting at physical scale 1, with a local open-mouth edit. New midfall/floor
body drawings are generated donors, calibrated by the master's eye distance.
They are not claimed to be untouched master pixels. Finn falls chair-free,
finishing low on his back with his feet up. Pose transitions and anatomy still
require review before this or the other seven full movement sets are enabled.

## Fixed production layout

Local sources: `../output/100next-master-branch-v1/` (relative to repository).
Traditional PNG sheets: `padded-sheets/` in that folder. Each cell is exactly
3072 square, containing the unchanged native 2048 frame at offset (512,512).
All pose cells keep one hip anchor (1536,1622). No individual fitting, zoom,
or body resizing. Solid-pixel clearance is at least 768px per cell.
The accompanying JSON records cell positions and measured clearance.

The review page loads complete lossless 2048 frames for the selected clip;
the large authoring sheets are not browser textures. The sprite is one
flattened character image at runtime, with no separately rendered limbs.

## Provenance and repeatable steps

`build-master-reactions.py` creates protected core frames and checks.
`build-finn-master-actions.py` composites localized card gestures.
`build-finn-master-tumble.py` prepares the clearly labeled tumble trial.
`export-master-animation-review.py` publishes review frames and padded sheets.
These authoring scripts require the approved master PNGs and donor files
preserved in the local output folder. They are not part of deployment builds.

Built-in imagegen supplied pose donors; the owner-approved Pillow/Numpy edits
preserved and composited the master pixels. Full generation prompts are saved
in `generation.json` and `tumble-generation.json` in the output folder and in
`public/assets/social-club/master-branch-review-v1/`.
