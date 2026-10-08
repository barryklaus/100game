# 100next condition system

Match scores start at zero and persist between rounds. Survive +1; exact 100 +1 at most once per player per round; the immediately preceding card's player gets setup +1 when the next accepted card overflows; overflow −5. All round awards settle together after overflow. Dead seats receive no survival points or cards and are skipped in both directions and Choose Player targeting. Fewer than two living players ends the match; New match starts everyone at zero. The stable build retains its previous rules.

| Settled score | Artwork |
| --- | --- |
| 0 or above | Healthy |
| −1 to −5 | Bruises |
| −6 to −10 | Bruises and torn clothes |
| −11 to −15 | Extreme bruises, shredded upper clothes and bandages |
| −16 or below | Death, fullscreen cemetery, seat sits out |

Artwork switches after the current card flight, center-number update and overflow tumble have finished. Each of the 16 characters has three condition-specific whole-character action sets, with rest, throw, receive, blink, directional gaze, reactions and floor tumble. Generated authoring drawings are registered as complete figures to the same 2048-square runtime canvas; only empty alpha padding is trimmed from downloadable lossless WebP files. The rounded actual card back is composited behind painted fingers. Runtime uses complete sprites, never separate heads/limbs, and loads visible/current-action frames with a bounded cache.

Generation records: `scripts/assets/conditions/generation.json` and `actions-generation.json`. Authoring references: workspace `output/condition-production`. Export: bundled Python with Pillow, NumPy and OpenCV, `scripts/assets/conditions/export-conditions.py` followed by the cast IDs, then `audit-condition-eyes.py` and `finalize-conditions.py`. The head landmarks of each condition’s own master register every complete upright pose uniformly; no separate heads or limbs are used. Local blink/gaze edits preserve all non-eye pixels and the silhouette. Manifest and alignment checks: `public/assets/social-club/condition-animation-v1/manifest.json`. Interactive inspection: `/condition-preview/`.

Death animation uses a separate cemetery backdrop and blank gravestone, personalized text, a whole-character ghost, dust impact and receipt. Reduced motion shows the settled scene immediately. Signed-in online deaths are authored by the room server, idempotent per round; practice deaths are separately labeled player reports. Freedom remains reserved pending its finalized victory threshold.
