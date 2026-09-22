# Manrope

`manrope-latin-var.woff2` and `manrope-latin-ext-var.woff2` are subsets of Manrope, a variable font by
Mikhail Sharanda, weights 200 to 800.

- Source: https://github.com/googlefonts/manrope
- Licence: SIL Open Font Licence 1.1, the full text is in `OFL.txt` beside these files

`build.py` embeds both as base64 inside `dist/GlassPalette/user.css`, so the theme is one self-contained folder
and nothing is fetched at runtime. The OFL permits bundling and embedding like this; it also requires the licence
to travel with the font, which is what `OFL.txt` is doing here. Copy it along with the woff2 files if you ever
move them somewhere else.
