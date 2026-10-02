# Celestial Observatory — approved desktop and mobile concept

Applied 2026-10-02. The room is a static painted asset behind the existing interactive Three.js table. No extra room geometry, postprocessing pass, idle particles, or animation loop was added. High fidelity remains the default 60 FPS target.

## Artwork

Generated with the built-in imagegen tool, using the approved desktop/mobile mockups as references. The original generated PNGs are preserved beside this file. Runtime WebP versions are in `public/assets/scene/celestial-v1/` (desktop 456 KB, mobile 387 KB); the responsive picture loads the matching orientation. Card and character assets remain the existing assets.

## Generation prompts

### Desktop room

Use case: precise-object-edit. Asset type: clean painted environment background plate for the existing 100 browser card game. Input image1 is the approved Celestial Observatory game mockup and exact room art direction. Extract/reconstruct ONLY THE ROOM in a high quality landscape16:9 image. Remove the entire table, all four characters, every card, all UI text/icons/numbers/buttons/labels; fill those areas with a believable continuation of the same room. Keep the beautiful arched dark walnut windows, moonlit blue sky, floating island castles, full moon, gold brass trim, warm amber side lamps, left armillary sphere and right brass telescope. A quiet open floor and dark wood lower room are visible toward bottom. Viewer is seated looking slightly downward from the card table position. Keep horizon and architecture suitable for placing real character busts along upper-middle and a real3D oval table over bottom two thirds: room details low contrast in center lower area, brighter moon and warm lamps near upper left/right. Warm dramatic light plus cool blue moonlight; sumptuous painterly fantasy game illustration matching the approved mockup. Do NOT bake any table or furniture across foreground, no people, no heads, no cards, no numbers, no logo, no words, no UI, no outlines or placement markers. This asset will sit behind real game actors and table. Retain original background identity/composition as closely as possible. Full image edge to edge, landscape16:9, detailed crisp clean artwork.

### Portrait room

Use case: precise-object-edit. Asset type: portrait9:16 painted environment background plate for mobile 100 card game. The input is the APPROVED mobile game concept. Reconstruct ONLY its Celestial Observatory ROOM, without the table, all characters, cards, numbers, texts, HUD, buttons or other UI. Keep tall elegant arched walnut windows, blue moonlight, full moon with distant floating island castles, warm amber side lamps, brass armillary sphere at upper left, telescope at lower side, dark wood trim. Continue the lower area with dark polished stone floor and a subtle constellation carpet where the game will overlay its REAL3D table. Room for game: architecture in upper half, quiet dark lower half. Match input's painterly fantasy artwork, rich warm walnut/amber and cool midnight blue, restrained contrast in center so existing characters remain clear. Keep beautiful vertically composed windows and visible moon as in approved mockup. Full edge-to-edge portrait9:16 asset, no device frame. No people, no card game objects, no table, no numbers, no words, no UI, no borders/placement guides.

## Integration

- Navy woven felt, procedural walnut grain, brass constellation art, visible rim thickness.
- Deck rests directly on felt: no cradle, rails, platform, or deck outline. Existing paper edges and contact shadow remain.
- Physical piles, throw/draw handoffs, surface impact flow, heat colors, foil, gyro, character reactions and player navigation retain their existing mechanics.
- Smaller total below the character names; hand cards have safe margins on both layouts.
- Original PNGs are source assets; WebP conversion only changes runtime encoding, not composition.
