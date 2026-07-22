# Noto Sans KR invite subset

- Upstream: Google Fonts `ofl/notosanskr/NotoSansKR[wght].ttf`
- Source repository: <https://github.com/google/fonts/tree/00e726a90e0b9698971c37b88c35ef958965448b/ofl/notosanskr>
- Pinned upstream commit: `00e726a90e0b9698971c37b88c35ef958965448b`
- Upstream font version: `2.262`
- License: SIL Open Font License 1.1 (`OFL.txt`)
- Subsetter: fonttools `4.59.0`
- Source SHA-256: `194018e6b2b293a7964f037b25c0249ce1418bc9ab3c971060a03aa57861e252`
- Static instance: weight `900`
- Subset SHA-256: `686b8c75de265ca1d0a487851dd802419319d06ff808a0e6684cce2b7df8c380`
- License SHA-256: `1c05c68c34f9708415aada51f17e1b0092d2cea709bf4a94cd38114f9e73d7d9`

The subset retains printable ASCII (`U+0020-007E`) and every modern Hangul
syllable (`U+AC00-D7A3`). This includes the boundary test string
`가힣AZaz09` and all Korean invitation copy that can be rendered by the OG
route.

Deterministic subset command (run from the repository root after downloading
the pinned source to `/tmp/NotoSansKR-wght.ttf`):

```sh
fonttools varLib.instancer /tmp/NotoSansKR-wght.ttf wght=900 \
  --output /tmp/NotoSansKR-Black.ttf

pyftsubset /tmp/NotoSansKR-Black.ttf \
  --output-file='app/i/[publicId]/assets/NotoSansKR-InviteSubset.ttf' \
  --unicodes='U+0020-007E,U+AC00-D7A3' \
  --layout-features='*' \
  --glyph-names \
  --symbol-cmap \
  --legacy-cmap \
  --notdef-glyph \
  --notdef-outline \
  --recommended-glyphs \
  --name-IDs='*' \
  --name-legacy \
  --name-languages='*'
```
