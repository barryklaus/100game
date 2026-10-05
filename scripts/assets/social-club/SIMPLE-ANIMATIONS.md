# Midnight Social Club animation assets

Generated with the built-in image generator, using the eight approved chair-free master drawings. Finn uses the corrected v2 master. This version has no chairs in ordinary poses or tumbles.

## Drawings

Each character has 31 whole-character drawings:

- The approved master rest pose.
- 12 reaction drawings: calm, blink, focus, left look, right look, confident, smug, nervous, panic, shock, relief, defeat.
- 9 card-action drawings covering a small forward wrist throw and pickup.
- 9 backward-tumble drawings ending flat and low on the floor, feet raised above the torso.

The retained hand is on image-left; the working hand is on image-right. The game supplies the flying card, so no airborne card is painted into the frames. Release is at 320 ms; catch is at 340 ms.

## Packing and previews

All logical frames are 512 × 512 with at least 128 clear pixels on each side. One physical upright-body height is matched across each character's reaction, action, and tumble sheets. A shared floor baseline remains fixed. Wide falling poses determine the safe scale for the entire character, avoiding an independent resize when the fall starts.

`pack-simple-eight.py` crops existing alpha, scales uniformly, adds padding, and exports atlases and timed GIFs. It does not draw anatomy or remove painted backgrounds. Runtime atlases are lossless WebP with manifests in `public/assets/social-club/simple-v1/`. Each atlas contains the central 256 × 256 content region; the manifest describes how to restore the full padded frame.

The sources, padded PNG sheets, individual frames, and GIFs are saved in the workspace's sibling `output/100next-simple-animation-v1/` directory. Exact generation prompts and reference paths are in `simple-eight-generation-v1.json`.

Open `/animation-preview/index.html` for all eight characters, selectable clips, one-shot replay, padding inspection, and optional table occlusion. The preview redraws only when a frame changes and stops when the selected motion finishes. These are animation assets and a review gallery; the main game still uses its approved master cast until the new animation set is integrated.
