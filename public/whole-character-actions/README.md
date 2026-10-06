# Whole character throw and receive review

Review: https://100next.pages.dev/whole-character-actions/

June, Edgar, Otis, Roxie, Vince, Paloma and Bianca each have six throw poses
and six receive poses. Finn's approved sequence is also available in the
same selector. This review does not replace the main game animations.

## Artwork and exports

- Built-in imagegen created 42 complete two-pose paintings from each
  character's master and Finn's approved action choreography. Later poses
  also reference that character's newly drawn starting pair.
- Each export is a complete character drawing, including head and neck.
  Playback does not assemble separate limbs or enlarge the character.
- Pair drawings share one scale. Feet register to a common anchor in a
  2048 × 2048 transparent canvas. The 84 new frames have at least 464 px
  clear padding on every side.
- Lossless WebP files preserve the exported pixels. Rounded original card
  backs replace the entire registration drawing, with fingers restored
  above the artwork. Corner radius matches the game's 5.5% width mask.
- Timing follows Finn's approved review. The throw releases at 215 ms;
  the receive catches at 640 ms. The separate flying card stops at catch.
- Only the selected character's drawings are decoded. Playback pauses
  while the page is hidden.

Prompts and artwork provenance: `artwork-notes.json`.
Export checks: `assets/card-audit.json`.
Authoring scripts: `scripts/assets/social-club/build-whole-eight-actions.py`
and `render-whole-eight-review.py`.

Original paintings, full padded PNG sheets (3072 px cells), contact
sheets and GIF previews are retained locally in
`Cards/output/whole-eight-actions/`. Only the lossless frames and review
page are published; the much larger authoring sheets are kept locally.
