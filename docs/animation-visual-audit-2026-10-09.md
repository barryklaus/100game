# Animation visual audit — 9 October 2026

Scope: all 16 Midnight Social Club characters, healthy and Conditions 1–3.
The Death scene and the character's floor landing were included in playback checks.

## Findings and repairs

- Reviewed 448 key poses across 64 character/condition sets, plus all twelve approved throw/receive drawings for each of the original eight characters.
- Rebuilt or retained 304 pose-specific closed-eye drawings. Blinks use their own complete open pose, an 80 ms closed drawing, and the same open pose again. Incomplete half-eye drawings are excluded from automatic blink playback.
- Fixed overlapping eye repair regions that restored a strip of the original iris, and registered held-pose eyelids to the actual head position. Glasses retain their rims.
- Removed duplicate white eye contours from downward looks and their study/glance transitions.
- Applied uniform whole-drawing corrections to 83 measured action/fall pose groups; corrected sixteen remaining display-scale differences without further image resampling. Two additional mid-fall groups (Roxie C2 and Bianca C1) were corrected after visual review corroborated their eleven feature matches.
- Measured all 48 healthy-to-injured transitions. Twenty-two condition sets needed a constant whole-character scale/position adjustment, including Bianca's shrinking head and Leon's growing head. The same adjustment applies to every drawing and its card anchors.
- Original-cast throws start from the actual resting drawing; catches return to it. Falls start from the approved one-card pose. Recovery excludes old, unrelated release drawings.
- Card handoff anchors follow pose corrections and whole-condition registration.
- Added pause, previous/next drawing, frame readout, and one-card blink inspection to the condition review page.

## Verification

- Independently decoded and compared all 304 blink pairs. Alpha and every pixel outside the eye regions are identical to the matching open pose.
- Re-measured the 83 repaired pose drawings and checked the resulting display scale where feature matching remained reliable.
- Regression coverage checks the native image dimensions against crop metadata, uniform display transforms, matching blink transforms, card anchors, gaze expression retention, delayed card flights, reduced motion, cancelled animations, background timer throttling, and final floor landings.
- `pnpm test`, `pnpm test:next`, and `pnpm build:next` passed before publishing.

This repair preserves the existing complete character drawings. It does not constitute a fresh anatomy redraw: separately authored poses still contain drawing differences. Low-confidence feature matches were not blindly scaled.

## Offline asset tools

The Python tools in `scripts/assets/animation-quality/` use Pillow, NumPy and OpenCV. `review-all.py` is a one-time migration from the preserved pre-audit snapshot; it refuses to overwrite a finished v2 release. Its originals, contact sheets, and staging files are stored outside `public/` in `../output/animation-audit-2026-10-09-round2/`.

The final sequence was whole-pose registration, overlap-safe eyelid repair, whole-condition registration, residual display registration, study/glance repair, decoded-pixel verification, and runtime regression checks. Keep manifests and their TypeScript mirrors together. Do not rerun only an early migration stage against a finished release.

Public evidence: `public/assets/social-club/animation-visual-audit-v2.json`. Detailed local comparisons and decoded checks are retained in the output folder. No reference grids or source backups are downloaded by the game.
