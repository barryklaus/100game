# Celestial table atlas

Approved astronomical table mockup implemented in `src/render/ObservatoryTable.ts`.

- Twelve original vector zodiac glyphs in an outer astrolabe band.
- Eight planetary glyphs, constellation chains, star junctions and calibration ticks.
- Solar compass at the center and twelve moon phases along the near rim.
- All artwork shares one 2048px canvas texture, so the added detail creates no additional scene objects or draw calls.
- Resting line color is attenuated 32%, with minimal steady emission. A brighter inward wave and orbit highlight follow the existing card-impact timing.
- The existing center-arrival callback, total update, audio, reduced-motion behavior and game rules are unchanged.
- The print stays on the felt beneath the piles; existing inlaid rings remain below the first card edge.

Verified in desktop and phone portrait; the browser preview reported 16.7ms frame time in High quality. This measurement is specific to the test machine, not a guarantee for every device.
