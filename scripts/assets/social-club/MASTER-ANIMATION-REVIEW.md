# Master artwork animation review, v1

## Gameplay blink correction, 5 October 2026

The old idle trigger attempted one blink on the active player after 4.5 seconds,
then required another game sync to rearm. A gesture at that moment could skip
the blink entirely. Visible characters now own independent staggered timers,
repeating every 3–5.5 seconds during a quiet human turn. Busy card gestures take
priority; offscreen seats, overflow, reduced motion and hidden tabs skip blinks.
No continuous render loop is introduced.

`export-master-blinks.py` adds complete native lossless frames for the current
focused, nervous, panicked, amused, smug, frustrated, defeated and one-card
release poses. It copies only the already-approved local eyelids and checks
that all other RGBA pixels and the complete alpha remain exact. Mouth, card
count, body size and pose survive each 200ms eye closure. Runtime checks cover
repeated blinks without sync calls, independent timing, pose/card preservation,
hidden/offscreen behavior, cancellation during image decode and reduced motion.

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

## Complete master-derived set, v2

After the owner's approval to finish and publish, all eight characters have
34 complete native 2048-square drawings and 17 review clips. Gameplay uses
14 clips: rest/blink, directional glances and choices, study, danger,
startle, celebration, defeat, throw, pickup, tumble and return.
The repeated clip aliases are convenience mappings, not extra artwork.

Eyes and mouth are local pixel edits of each original master. The head
outline, hairstyle, outfit, silhouette and alpha remain exact in those
reactions. Card gestures composite a calibrated working hand/card area;
the original head and lower body remain protected. Large falling bodies
are new drawings calibrated to the master; their heads reuse the actual
master painting at physical scale 1. These are complete flattened frames,
without separate runtime limbs or head parts. No chairs appear.

Visual checks caught collar/hair regions being mistaken for eyes. Explicit
landmarks correct June and Bianca; hand-side corrections keep one retained
card in image-left and an empty image-right working hand in falling poses.
The final floor poses lie low on the back with feet up. Every native pose
keeps at least 256 solid-pixel clearance on all four sides. The 3072-square
authoring cells add another 512 pixels uniformly: minimum clearance 768.
There is no per-pose silhouette fitting or canvas zoom.

Gameplay preserves the existing table, character scale, waist occlusion,
background, rules, multiplayer, and flying-card layers. Release was originally at
320ms; the card-handoff correction below supersedes that timing and the drawn replacement is restored only at actual arrival.
Turn glances follow the active player's visible left/right position.
Overflow spotlight plays the culprit's fall, retains the floor pose,
and then opens scores. Round reset cancels stale decodes and timers.
Reduced motion completes without running the movement sequence.

Runtime assets in `master-animation-v2` omit transparent margins only;
the visible source pixels are never resampled and use lossless WebP.
Their measured rectangle is restored inside the fixed native canvas.
Only visible seats load reactions. A bounded 24-image preload cache and
frame-boundary timers replace a continual sprite redraw loop. The full
2048 review frames remain in `master-branch-review-v2`.

Local sources and uniformly padded PNG sheets:
`../output/100next-master-branch-v2/`. The full donor-generation prompts
and paths are recorded in generation-plan.json and generation-results.json.
Repeatable builders: build-master-emotions-v2.py, master-pose-tools.py,
build-master-movements-v2.py, export-master-animation-v2.py and
export-master-runtime-v2.py. Cropped exports verify every visible pixel
against the original full frame.

Validation: complete-frame visual inspection; mobile/desktop game play;
all eight release/catch sequences, stable rerenders, left/right choices,
held tumble landing, delayed-decode cancellation, reduced motion and
asset bounds covered by test-master-animation.mjs. Native pixel guards
verify preservation; they do not claim generated falling anatomy is
pixel-identical to the original seated body.

## Card handoff correction, 6 October 2026

Prepared throws and receiving grips now remain held through turn renders,
idle blink clocks and delayed flights. Release removes the painted working
card synchronously with flight start. Catch adds it synchronously with actual
flight arrival; neither callback waits for an image-decoding promise.
Calibrated release/catch anchors match the working card in the original art.
The legacy rescue timer is canceled once a real draw flight is requested.

Throw preparation is 200ms, followed by 190ms of follow-through. Receiving
reaches the empty grip in 140ms, holds it through flight, then gathers the
caught card in 180ms. All eight native masters gain matching empty-grip and
empty-release drawings. export-card-handoffs.py restores only the masked card
area from approved one-card artwork and preserves actual fingers, silhouette,
head and all pixels outside that area. Lossless runtime crops and full native
review frames are exported together. Larger mesh/flow motion trials distorted
clothing and were rejected; they are not shipped.

Validation covers all eight synchronous handoffs, held poses through delayed
flights, cancellation and existing staggered blinks. The full game test suite
and production build pass; real desktop and portrait CPU gameplay show no
browser errors. This corrects timing and pose continuity; it is not a newly
redrawn fluid animation set.
