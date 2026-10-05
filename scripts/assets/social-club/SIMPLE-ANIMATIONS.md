# Midnight Social Club animation assets

Generated with the built-in image generator, using the eight approved chair-free master drawings. Finn uses the corrected v2 master. This version has no chairs in ordinary poses or tumbles.

## Drawings

Each character has 31 whole-character drawings:

- A shared animated rest pose, calibrated against the approved master.
- 12 reaction drawings: calm, blink, focus, left look, right look, confident, smug, nervous, panic, shock, relief, defeat.
- 9 card-action drawings covering a small forward wrist throw and pickup.
- 9 backward-tumble drawings ending flat and low on the floor, feet raised above the torso.

The retained hand is on image-left; the working hand is on image-right. The game supplies the flying card, so no airborne card is painted into the frames. Release is at 320 ms; catch is at 340 ms.

## Packing and previews

All logical frames are 512 × 512 with at least 128 clear pixels on each side. The repaired v2 pack measures the upright skull as the physical scale reference, rather than fitting moving silhouettes by their height. All sheets inherit one fixed unit. Feet anchor ordinary drawings so an extended hand cannot recenter the whole body. The animated neutral drawing is shared by rest and reaction clips; the one-card rest is shared by throw and tumble entry. Every clip renders at the same constant size. Wide falling poses determine the safe scale once for the entire character.

`pack-simple-eight.py` crops existing alpha, scales uniformly, adds padding, and exports atlases and timed GIFs. It does not draw anatomy or remove painted backgrounds. Runtime atlases are lossless WebP with manifests in `public/assets/social-club/simple-v2/`. Each atlas contains the central 256 × 256 content region; the manifest describes how to restore the full padded frame.

The sources, padded PNG sheets, individual frames, and GIFs are saved in the workspace's sibling `output/100next-simple-animation-v2/` directory. Exact generation prompts and reference paths are in `simple-eight-generation-v1.json`.

Open `/animation-preview/index.html` for all eight characters, selectable clips, one-shot replay, padding inspection, and optional table occlusion. The preview redraws only when a frame changes and stops when the selected motion finishes. The chair-free v2 set was integrated into gameplay, then paused after full-size visual feedback revealed low resolution and remaining anatomy drift. See the live quality hold below. The original Observatory cast remains available through the character selector.

## Scale repair

Version 2 includes targeted head-size corrections to the affected complete drawings using the built-in image tool. The original v1 sources remain preserved. `simple-eight-scale-repair-v2.json` records every correction prompt and selected source file. No separated limb or head animation parts are used. The older in-chat Finn trial is replaced with this chair-free set, with one-shot playback so the final floor pose does not instantly jump into an upright pose.

## Live quality hold

The v2 gallery remains an animation prototype. At full game size the 256px atlas cells lose detail, and independently drawn poses still change anatomy. After the owner's quality feedback, live 100next uses the original approved chair-free masters exported as pixel-preserving lossless 2048px WebP in `masters-native-v1`. Character pose swaps and the shrinking tumble fallback are paused; card flights, room backgrounds, the player ring, overflow spotlight and score flow remain active. New animation drawings must be reviewed at actual desktop/mobile size against the same master before replacing this quality hold. `export-native-masters.py` reproduces the export and verifies visible pixels and alpha against the original PNGs.


The quality hold above describes the superseded v2 prototype. The approved
master-derived v2 set now replaces it in 100next gameplay; see
MASTER-ANIMATION-REVIEW.md for the new native artwork and validation.
