# Finn and June traditional animation trial

AI-generated full-character drawings, created and reviewed for this project. Artistic sources and exact prompts are recorded in `scripts/assets/social-club/`. Finn's previous approved trial is preserved outside the runtime export; June follows the same forward-facing chair and hand standard.

- Logical cell: 512 × 512, with at least 128 transparent pixels on every side.
- Exported atlas: 2048 × 2304, eight columns of 256 × 256 cells, 68 Finn drawings and 67 June drawings.
- The renderer places each trimmed cell at (128,128) in its original logical canvas.
- One lossless common chair layer is used for ordinary poses. Combined tumble drawings include the moving chair instead.
- Shared two-card and one-card rest drawings connect actions without returning to the wrong hand count.
- Retained cards: image-left hand. Working/releasing/catching hand: image-right.
- Timing comes from the manifests; resting holds are longer than the moving drawings.
- The atlases use quality-94 WebP. The original generated sheets and padded PNGs remain in the local review output.

The JSON manifests contain clip timing, source layout, padding bounds, fixed-chair comparisons, and shared-frame proofs. All animation callbacks are canceled when a round changes. A missing image falls back to the portrait and cannot block scores.

June repair v2 corrects coordinated gazes and centers her upper body on the chair rather than aligning crossed feet. Chair tumble sheets preserve the common wide-chair proportions. Two-seat tables use the central two positions of a fixed four-chair layout. The versioned June atlas and portrait avoid stale cached artwork. Repair prompts and packing provenance: scripts/assets/social-club/june-repair-v2.json and june-repair-packing.py.
