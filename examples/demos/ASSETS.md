# Demo asset provenance

## Approved visual references

The three `references/*.png` images were generated in this Codex conversation,
then selected by the user as implementation targets. They are design references,
not runtime captures. They are never loaded by the application components.

## Generated raster assets

Created with the built-in image generation tool on 2026-09-12, with the approved
mock attached to each generation. These are AI-generated editorial photographs
and artwork, not stock-photo downloads.

| Asset | Role | Source design |
| --- | --- | --- |
| `assets/studio/dunes.png` | Hero image and matching thumbnail | Studio |
| `assets/studio/coast.png` | Coast thumbnail and preview | Studio |
| `assets/studio/peaks.png` | Mountain thumbnail and preview | Studio |
| `assets/studio/forest.png` | Forest thumbnail and preview | Studio |
| `assets/studio/canyon.png` | Canyon thumbnail and preview | Studio |
| `assets/studio/dusk.png` | Sunset thumbnail and preview | Studio |
| `assets/effects/ribbons.png` | Unfiltered backing artwork | Effects Playground |

Prompts requested individual assets matching the exact compositions, focal
points, palette and texture of the corresponding mock, with all UI, labels and
frames removed. The ribbons prompt additionally removed the glass/blur so those
effects are implemented live. Raster details can differ from the original
generated mock; these are regenerated assets, not pixel-identical extractions.

## Icons

Official [Phosphor Icons core SVG assets](https://github.com/phosphor-icons/core),
regular weight, retrieved on 2026-09-12. Source path:
`assets/regular/<name>.svg`. The paths were not redrawn; `currentColor` was set to
the app palette and the SVG was rasterized to transparent 64 × 64 PNG for Vexart.
Four tones: white `#eeeeee`, muted `#a3a3a3`, amber `#efbc65`, ink `#171717`.

The upstream MIT license is preserved in `assets/icons/LICENSE`.

## Fonts

Native system font lookup: Helvetica Neue for UI and Menlo for code/metadata.
No font was installed or copied, and no user font configuration was changed.
Glyph rendering/fallback can vary on systems without these families.
