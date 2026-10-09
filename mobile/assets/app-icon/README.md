# App icons

`mobile/app.json` uses `icon.png` for iOS and legacy Android launchers, and
`adaptive-foreground.png` over `adaptive-background.png` for Android adaptive
launchers. All images are 1024 × 1024. The iOS icon and adaptive background have
no alpha channel; the adaptive foreground has transparent padding for launcher
masks.

The SVG files are editable source artwork, using the knight and moon from
`src/components/logo.tsx` and the light-theme `brand`, `brand-lip`, `on-brand`
and `gold` colors from `web/src/styles/tokens.css`. The native launcher supplies
the outer icon shape. The standalone icon retains the brand's bottom ledge;
the adaptive icon uses a full green background and keeps its artwork within
the central safe area.

When changing the mark or brand tokens, update these sources and rasterize them
to the matching PNG filenames. Export at 1024 × 1024 and remove the alpha
channel from `icon.png` and `adaptive-background.png`.

Icon changes require a new native build and installation. Expo Go or a
JavaScript update cannot replace an installed standalone app's launcher icon.
