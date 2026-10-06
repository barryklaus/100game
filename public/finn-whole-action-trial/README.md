# Finn whole-character action trial

Review-only throw and receive artwork. This preview does not replace the game's current character animations.

- Six complete redrawn poses for each action, including head and neck; no separate anatomical layers or chairs.
- Built-in imagegen produced six two-pose paintings. Exact prompts are in `assets/prompts.json`.
- Full exported frames are 2048 × 2048 lossless WebP, with at least 400 pixels of clear space on every side.
- Whole paintings are registered to a consistent seated height and planted-foot anchor. Playback has no zoom or size animation.
- Every held card uses the original `public/assets/cards/full/back.png`, perspective mapped under the original fingertips. The detailed artwork is filtered before reducing it to hand-card size to prevent aliasing.
- The old cartoon card silhouette and gold frame are removed before insertion. The new source uses the same corner radius as the game: width × 0.055. Held cards, piles and flights all use this rounded shape. The preview revision prevents cached older frames from reappearing.
- Throw release and receiving catch are matched to the separate card flight. The table hides the waist in the default preview; full padding can also be inspected.

Authoring: `scripts/assets/social-club/build-finn-whole-trial.py` and `finn-whole-card-maps.json`. Original generated pairs and full PNG atlases are retained locally under `../output/finn-whole-action-trial/` relative to the repository. Authoring dependencies are Pillow, Numpy and OpenCV; these are not runtime dependencies.
