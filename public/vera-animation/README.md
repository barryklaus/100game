# Vera animation trial

Vera is the first animated addition to the original eight Midnight characters.
Play the four-player trial at `/?characters=vera-trial&play=1` or inspect complete
drawings at `/vera-animation/index.html`.

Built-in imagegen edited the approved master into whole action and tumble poses.
The native master is 1254 square; each complete frame shares a 2048 square padded
canvas. Runtime WebP crops are lossless and retain their original canvas bounds.
Upright drawings are registered against the master hair so independently
generated changes in framing do not enlarge the character. Ordinary facial
reactions preserve the master body. Blinks are local eye edits.

Blank card registrations are replaced with the actual rounded card-back artwork,
with the original fingers composited in front. Separate airborne cards follow the
runtime release/catch anchors. One-card waiting poses remain until the real
handoff; the floor drawing remains after the tumble.

`assets/prompts.json` records generation prompts, corrections and selected sources.
`assets/manifest.json` records clips, registration, padding and card checks.
The authoring scripts export complete frames and uniformly padded sheets in
`output/100next-vera-animation-v1` outside the repository. The runtime renders
complete drawings, with no separate limbs or chair.

`sample.gif` is a fixed-camera rehearsal using the exported game drawings and clip
timings. It displays the floor landing without table occlusion.
