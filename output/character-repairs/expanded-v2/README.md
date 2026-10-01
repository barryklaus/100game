# Expanded character artwork

All 16 character sprite sheets, 144 expressions and throw poses in total.

The 15 remaining sheets were repaired with the built-in image generation tool. Mira's approved repair is included. Each transparent PNG restores missing hair, shoulders, sleeves and upper arms while preserving the character's identity and the nine existing actions.

Open index.html to review the set. Exact final prompts and source provenance for each character are saved in manifest.json. For characters 1, 3 and 4 an initial repair was followed by the final framing refinement. Mira's two-pass prompt record is in ../mira-expanded-preview-prompt.txt.

## Integration status

These lossless artwork sources are now integrated into the game as aligned WebP atlases. The preparation script finds actual transparent gutters, aligns heads, excludes invisible alpha export noise and exports pose-specific throw/draw anchors. The lower-body tabletop mask is preserved. Run `python3 scripts/assets/prepare-expanded-characters.py` to reproduce the runtime assets.
