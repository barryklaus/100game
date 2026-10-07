# New Midnight cast — 7 October 2026

The new eight are Vera, Tess, Nadia, Dottie, Malik, Hugo, Jasper and Leon:
four women and four men. The original eight remain selectable, making sixteen
characters available. Gameplay retains at most four visible characters and
the existing eight-seat table rotation.

## Complete traditional frames

Throw, receive and tumble use complete generated character drawings. A single
uniform registration applies to the entire upright action drawing; no master
head or legs are transplanted onto its torso. Each displayed frame is one
flattened image. The game has no separate head, limb or body animation layers.
There are no chairs. Backward tumbles end on the floor with feet raised.

Facial expressions and directional eyes are authored as complete frames from
the approved master artwork, using the owner's approved pixel-preserving
editing method. The face is never a separately rendered game object. Normal
poses share one fixed 2048-square padded canvas. Authoring sheet cells are
3072 square, with the native frame at (512,512), without individual fitting.

Each character has blink, left/right glances, study, tension, shock,
celebration, defeat, throw, receive, tumble and return clips, plus expression
blink variants. Clip aliases reuse drawings. Forward throws are generic enough
for different table seats; reactions look toward the active player's position.

The actual rounded `assets/cards/back.webp` artwork is baked behind the
original fingers. Release changes two painted cards to one in the same task
that starts the flying card. A waiting palm remains held until the actual draw
flight arrives, when the catch changes back to two. Nadia's generated receive
grip swapped working hands, so her complete open-palm and prepared drawings
are reused for a consistent catch. No body parts are combined for that repair.

## Export and review

`build-expanded-cast.py` builds the seven following Vera, whose existing
`build-vera-animation.py` already uses complete registered action drawings.
The approved master PNGs, full imagegen outputs, generation prompts, calibrated
landmarks, padded frames and authoring sheets are preserved locally in:

- `../output/100next-new-eight-masters-v1/`
- `../output/100next-cast-expansion-animation-v1/`
- `../output/100next-vera-animation-v1/`

Generation uses built-in imagegen, followed by registration, actual card-back
compositing and lossless exports. No external image service is used.
`expanded-cast-calibration.json` records landmarks and whole-pose aliases.

Runtime images omit fully transparent margins only. The measured rectangle
is restored within the fixed 2048 canvas, retaining the visible native pixels
with lossless WebP. The existing bounded preload cache, visible-seat loading,
frame-boundary timers and reduced-motion behavior remain in use.

`/new-cast-animation/` lets reviewers choose all eight characters, replay clips,
step through individual drawings and inspect the complete padded frame.
`/?characters=new-eight&play=1` starts a test table with the new eight.
`export-expanded-cast-sample.py` exports fixed-camera reels from the exact
completed game frames. These are animation rehearsals, not game recordings.

`test-expanded-cast.mjs` covers release/catch synchronization, delayed flights,
expression blinking, retained floor poses, cancellation during decoding,
reduced motion, correct card counts, padding, placeholder removal and assets.
Visual review additionally checks anatomy, expression lines, hand continuity,
desktop/mobile framing and complete fall poses; automated checks alone do not
establish artistic perfection.
