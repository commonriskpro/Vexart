# Mock control-center icon provenance

The filled control-center glyphs in `examples/ps5/assets/icons/mock/` are
unmodified vector paths from the official Phosphor Icons repository's `fill`
set. They are kept local so the PS5 mock does not replace the shared regular
icon assets used by the rest of the demo.

| Local asset | Upstream source |
| --- | --- |
| `house-fill.svg` | [`phosphor-icons/core/assets/fill/house-fill.svg`](https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/house-fill.svg) |
| `stack-fill.svg` | [`phosphor-icons/core/assets/fill/stack-fill.svg`](https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/stack-fill.svg) |
| `bell-fill.svg` | [`phosphor-icons/core/assets/fill/bell-fill.svg`](https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/bell-fill.svg) |
| `users-three-fill.svg` | [`phosphor-icons/core/assets/fill/users-three-fill.svg`](https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/users-three-fill.svg) |
| `music-notes-fill.svg` | [`phosphor-icons/core/assets/fill/music-notes-fill.svg`](https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/music-notes-fill.svg) |
| `speaker-high-fill.svg` | [`phosphor-icons/core/assets/fill/speaker-high-fill.svg`](https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/speaker-high-fill.svg) |
| `microphone-fill.svg` | [`phosphor-icons/core/assets/fill/microphone-fill.svg`](https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/microphone-fill.svg) |
| `game-controller-fill.svg` | [`phosphor-icons/core/assets/fill/game-controller-fill.svg`](https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/game-controller-fill.svg) |
| `folders-fill.svg` | [`phosphor-icons/core/assets/fill/folders-fill.svg`](https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/folders-fill.svg) |
| `gear-fill.svg` | [`phosphor-icons/core/assets/fill/gear-fill.svg`](https://raw.githubusercontent.com/phosphor-icons/core/main/assets/fill/gear-fill.svg) |
| `store-bag-reference.png` | Crop of the approved mock at `x=76,y=131,w=44,h=54` (artwork only, background made transparent) |
| `library-grid-controller-reference.png` | Crop of the approved mock at `x=863,y=136,w=38,h=38` (artwork only, background made transparent) |

The four `trophy-*.svg` files reuse the existing upstream trophy path with a
per-tier paint color; no new vector geometry is drawn.

The two `*-reference.png` files are tightly cropped artwork-only extractions
from `references/approved-home-control-center.png`; their surrounding card
background is removed so labels and panel colors remain live UI.

The upstream `currentColor` paint value is normalized to `#ffffff` because
these SVGs are rendered as image assets rather than inline SVG nodes. No paths
were hand-drawn or raster-edited.
