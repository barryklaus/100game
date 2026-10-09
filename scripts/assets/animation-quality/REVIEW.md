# Character animation quality pass — 9 October 2026

Scope: all 16 live characters in healthy state and conditions 1–3: 64 sets.
Contact sheets reviewed eye closure, preparation, release, receiving grip,
catch, settling, midfall and floor poses on a fixed 2048 × 2048 canvas.

## Findings and repairs

- Original cast returned to a superseded one-card drawing after an approved
  whole-character throw. Idle now retains the actual final throw drawing, with
  its own matching blink. Preparation and receiving grips stay held until the
  moving game card really departs or arrives.
- New cast's release blink reused the receiving torso. Eyelids now change only
  inside the calibrated eye regions of the current pose; hands and torso remain
  identical. Authored closed eyes behind glasses retain the original rims.
- Earlier contour masks ended at a tight rectangle, leaving eye-outline
  fragments and hard cuts. Healthy reconstructed lids use a padded eye contour
  and skin colours sampled around that same eye. Injury sets retain their own
  authored bruise-coloured eyelids. No mouths, card backs, alpha,
  hairstyles, clothing or limbs are redrawn by the blink pass.
- Rest gaze pupils are bounded inside the sclera. Tension glances use new
  preflattened complete drawings with their own expression, so a turn change
  cannot briefly substitute a calm mouth and face.
- Second cast tumble artwork enlarged heads by up to approximately 42%.
  SIFT landmarks measure each whole drawing against its master. A single uniform
  correction applies to the entire drawing around its existing head position.
  The complete pose remains intact. No separate heads or limbs exist at runtime.
- Second cast falls now have recoil, descent and landing beats consistent with
  the original cast and injury variants. There is no continuous idle scaling.
- A throttled browser timer could finish a clip without painting its landing.
  Completion explicitly paints the terminal pose. Partial preparation and
  reduced-motion preparation retain the correct two-card drawing.
- Condition changes no longer issue a second independent frame request which
  could overwrite a newer expression. Dead-seat loads are generation guarded.
- During authoring, new cropped blink images briefly used old display bounds,
  enlarging the entire body in the local preview. Images and bounds are now
  synchronized; the authoring tool stages files before replacing a completed
  batch, and tests reject any WebP dimensions that differ from display bounds.

## Verification

`animation-quality-checks.json` records native pixel/alpha protection for each
eye edit, and measured scale/inlier counts for the 24 second-cast falling poses.
The offline `refine.py` authoring tool retains original assets outside public/,
exports complete lossless WebP drawings, and asserts 100-pixel canvas padding.

`scripts/test-animation-quality.mjs` exercises all 64 live sets: tension glances,
release, held one-card idle, blink, receive/catch, fall, delayed browser timers,
reduced motion, cancellation, crop bounds and actual WebP file dimensions.
Existing gesture, character,
condition, multiplayer and account gates remain part of publishing.

The condition review page now includes healthy characters, expression choices,
repeating clips and a face close-up. Original full-body pose drawings remain
artistic illustrations; this pass corrects measurable scale and playback errors
without claiming to re-author every anatomical detail.
