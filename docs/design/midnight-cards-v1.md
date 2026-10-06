# Midnight Social Club production deck

Approved for integration on October 6, 2026. Production is complete for 100next only.

## Artwork and production

- 44 individual, full-bleed cartoon illustrations across fire, water, leaf and sun.
- Number cards 1–6 show countable everyday objects. Positive tens show ten objects; the three +10 ranks J/Q/K share their suit's ten-object illustration.
- Specials use a player selector, persistent opposing arrows, a shield with a clear 0, and a subtraction dispenser. Zero replaces the ambiguous pause/11 concept symbol.
- Built-in imagegen produced all illustrations. Exact prompts and source paths are retained in `public/card-redesign/generation-log/` and `production-prompts.json`.
- `scripts/assets/export-midnight-cards.py` exports 1064 × 1486 rectangular PNG originals and lossless WebP textures. It resamples only; borders and typography are not baked into the source art.
- The game's renderer applies traditional rounded masks, rich suit frames, Luckiest Guy corner indices and inverted bottom-right indices. Instructions appear only on specials. Suit holography responds to movement inside the illustration, leaving the printed border and instructions untouched. Special cards have stronger reflections; still cards show their clean artwork.
- The gallery at `/card-redesign/` uses the same card renderer as the game, with suit filters and links to full-bleed originals.

## Rules preserved

The deck remains 52 cards: four suits, each with A/1 through 6, four special ranks and three positive-ten ranks. Positive 10 and the −10 special remain distinct.

| Rank | Corner index | Instruction |
| --- | --- | --- |
| 7 | CHOOSE | Choose who plays next. |
| 8 | REVERSE | Reverse the turn order. |
| 9 | ZERO | Keep the total unchanged. |
| 10 | −10 | Subtract 10 from the total. |

The stable 100 build retains its existing assets. Runtime card asset routing uses the 100next build mode. The production asset check verifies all 52 mappings, 44 exports, PNG dimensions, lossless WebP encoding, mobile/desktop label parity and the distinction between positive tens and −10.
