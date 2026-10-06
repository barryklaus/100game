# Midnight Social Club card redesign — first concepts

Review: `/card-redesign/`. Selected concept artwork and exact built-in imagegen prompts are stored in `public/card-redesign/`.

## Visual direction

- Bold ink outlines, flat cartoon color and simple cel shading, matching the new lounge and cast.
- Deep fire red, water blue, leaf green and sun gold frames, with each suit's engraved motifs.
- Number cards use clearly countable everyday objects. The first board explores four chilies, four icebergs, four potted plants and four cake slices.
- Only special cards carry instructions. Their persistent symbols are a selector, opposing arrows, a pause and subtraction.

## Production layout

These boards establish illustration and color direction. Final individual card exports must use one 63:88 rounded rectangle, matched padding and corner indices. The concept board's layout is not the production atlas. In particular, the wide special headings need to become top-left indices with inverted bottom-right indices in the final card template.

Use the existing Luckiest Guy font for exact indices. Keep the rounded mask, interaction-driven suit foil and separate artwork/frame areas in the card renderer. Do not bake moving foil or glare into the illustrations. Preserve full-resolution source artwork and export each final face individually.

## Rules and full deck

Keep the current 52-card deck: four suits, each with numeric A/1 through 6, four special ranks and three positive-ten cards (J/Q/K). Positive 10 cards and the −10 special are distinct. Artwork quantities on number cards must match their displayed values.

Special copy stays synchronized with `src/game/cardFace.ts`:

| Action | Instruction |
| --- | --- |
| CHOOSE PLAYER | Choose who plays next. |
| REVERSE | Reverse the turn order. |
| ZERO | Keep the total unchanged. |
| −10 | Subtract 10 from the total. |

The first review contains four numeric and four special concepts. The remaining deck artwork, final card template and playable asset integration are subsequent production work.
