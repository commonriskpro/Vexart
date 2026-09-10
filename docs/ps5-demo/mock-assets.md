# PS5 mock artwork provenance

These artwork-only assets were prepared on 2026-09-09 and copied into
`examples/ps5/assets/mock/`. Generated scenes remain under the
`image_gen` provenance described below. `ghost-lockup.png` is a direct crop and
foreground mask from the approved screenshot, kept under the 2048 px maximum
edge for GPU use. The approved visual reference used for the hero and lockup is:
`docs/ps5-demo/references/approved-home-control-center.png` (1672 × 941).

## Deliverables

| Asset | Dimensions | Origin and intended use |
| --- | ---: | --- |
| `ghost-samurai-sunset-clean.png` | 1672 × 941 RGB | Strict inpainting/removal edit of the approved screenshot: UI was removed and the Ghost samurai landscape was reconstructed. It preserves the visible character/right-side pose, sunset, castle, valley, and pampas composition as closely as the generator could; it is **not pixel-identical** to the source because UI-obscured regions had to be regenerated. |
| `activity-horseback-sunset.png` | 463 × 184 RGB | Direct extraction from the approved screenshot bounds `(x=103, y=580, width=471, height=192)`. Lower-third white title/text and card chrome were removed with a white-threshold mask plus 7×7 dilation, then inpainted; a 4 px interior crop produced the final artwork. The original horseback/sunset scene is retained; it is not AI-generated. |
| `trophies-silver-gold-bronze-dark.png` | 455 × 184 RGB | Direct extraction from the approved screenshot bounds `(x=590, y=580, width=463, height=192)`. Lower-third title, boxes, trophy icons, counts, and progress/card chrome were removed with a white-threshold mask plus 7×7 dilation, then inpainted; a 4 px interior crop produced the final artwork. The original trophy scene is retained; it is not AI-generated. |
| `news-mountain-island.png` | 457 × 184 RGB | Direct extraction from the approved screenshot bounds `(x=1070, y=580, width=465, height=192)`. Lower-third white title/text and card chrome were removed with a white-threshold mask plus 7×7 dilation, then inpainted; a 4 px interior crop produced the final artwork. The original island scene is retained; it is not AI-generated. |
| `avatar-samurai.png` | 1254 × 1254 RGB | Optional generated samurai portrait for the profile avatar; centered and suitable for a circular UI crop. It is not a reconstruction of the tiny screenshot avatar. |
| `directors-cut-brush.png` | 2172 × 724 RGBA | Generated transparent warm-gold dry-brush strip only; no lettering is embedded, so `DIRECTOR'S CUT` should remain separately rendered by the UI. Alpha is preserved. |
| `ghost-lockup.png` | 412 × 146 RGBA | Direct extraction from `docs/ps5-demo/references/approved-home-control-center.png`, source crop `(x=108, y=302, width=412, height=146)`. A luma/saturation mask was applied in separate title/subtitle/ribbon bands, preserving the source RGB and antialiased edges while producing true alpha; one isolated 8-pixel hero speck was removed. The resulting lockup keeps the exact visible `GHOST` glyphs, red two-chevron O, `OF TSUSHIMA`, and `DIRECTOR’S CUT` brush ribbon from the approved mock. No image-generation output or post-resize was used for this final asset. |

The samurai hero image, three card artworks, and logo lockup are deliverables
made by editing/extracting from the approved mock directly. The optional avatar
is a generated portrait intended to match the reference's composition, palette,
and mood rather than claim source artwork or pixel-level reproduction.
Historical AI-generated card variants are retained only in
`/tmp/ps5-card-art-ai` as backup; they are not the project-bound deliverables.
Other image-generation output remains under `$CODEX_HOME/generated_images/` as
provenance.
