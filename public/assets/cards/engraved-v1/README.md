# Engraved deck v1

Approved engraved card faces for 100next Alpha 0.1.5.

- 52 physical cards, 44 unique full-bleed illustrations across Fire, Water, Leaf and Sun.
- A is printed as 1. J/Q/K remain distinct ordinary +10 cards and share the `k` face.
- 7 is CHOOSE, 8 REVERSE, 9 ZERO, and rank 10 DEDUCT (subtract 10).
- ZERO leaves the total unchanged. All rules, shuffling and physical card counts are preserved.
- Uniform 1064 × 1486 lossless WebP prints include the approved labels and rule ribbons. Runtime rendering only masks the outside rounded silhouette.
- Only the 16 special faces use motion-responsive foil. Precomputed half-size masks restrict the DOM effect to suit-colored engraved details. The 3D shader samples the same print for its suit mask. Numbers, black ink and ivory are not covered by a rainbow laminate.
- Normal faces and the unchanged existing card back have no added foil layer. No parallax assets are selected, including for older saved preferences.

Art created using the built-in imagegen tool. Local native PNG masters, generation prompts and review sheets are retained in `output/engraved-deck-v1/`. `scripts/assets/export-engraved-cards.py` exports these approved assets without generative changes.

`manifest.json` records each face's identity and delivery hash. The release checks cover all 52 card mappings, lossless encoding, rule labels, hand/pile/flight aspect ratio, stationary and reduced-motion foil behavior, and preservation of the stable game's asset selection.
