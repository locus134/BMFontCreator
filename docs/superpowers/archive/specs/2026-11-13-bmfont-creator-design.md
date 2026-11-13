# BMFont Creator

## Intent and delivery

Create a local desktop editor that converts a directory of character images into a bitmap font for Cocos2d-x. Deliver and verify a macOS Apple Silicon application. Electron + React + TypeScript preserves Windows/Linux portability; those platforms are not claimed as tested.

## Format decisions

- AngelCode BMFont text descriptor and unpremultiplied RGBA PNG, one page, no rotation or channel packing. Also offer XML descriptors for compatible engines.
- Preserve Unicode code points, integer metrics, original colors/alpha, and pixel sizes. Layout and export share the same model.
- Cocos2d-x v3 parser asserts one page and recognizes line prefixes; emit canonical field order and final newline.
- Sample is `bonusGold.fnt` + a 520×250 PNG, 13 glyphs, 73×90 rectangles. Its 32-pixel line height and 26-pixel base are independent of image size and must not be silently corrected when imported.

## Import and character mapping

Select a directory using the native dialog. Read PNG/JPG/JPEG/WebP files in that directory, non-recursively. Ignore unrelated files and report decoding failures. Normalize macOS decomposed filenames to NFC.

Single-character stems have priority (`0.png` maps to U+0030). Explicit encodings: `U+4E2D`, `uni4E2D`, `0x4E2D`, `char_65` (decimal). Named aliases cover space and filesystem-reserved punctuation. Ambiguous names stay visible for manual mapping. Duplicate and unmapped included glyphs block export. Users may exclude glyphs. New imports replace the current project only after protecting unsaved work.

Import existing text BMFont files, including the supplied sample, extracting original glyph rectangles and retaining metrics. Save portable `.bmfont` projects with embedded PNG images, settings, mappings and preview text.

## Editor

Chinese UI, restrained warm-white desktop workspace, dark atlas canvas, blue primary actions. Left: searchable glyph library. Center: atlas/text preview tabs with zoom, checkerboard and bounds/baseline guides. Right: selected glyph mapping and offsets/advance; global line height, baseline, font size, spacing, padding, maximum texture size, power-of-two and trim switches. Top bar: import, open/save project and export. Keyboard shortcuts follow macOS conventions.

Offer a sample action on the empty screen and a synthetic space glyph. Display missing preview characters and export validation messages. Preview draws bitmap glyphs rather than substituting a system font.

## Packing and export

Deterministic MaxRects packing without rotation. Choose the smallest fitting power-of-two rectangular atlas up to the selected limit, or tightly crop a successful packing when power-of-two is disabled. Reserve transparent padding around each glyph. Optional alpha trimming adds crop offsets to exported offsets and leaves advance unchanged. Fully transparent glyphs retain advance and occupy no atlas space when trimmed.

Single-page overflow blocks export. Export uses a native save dialog and writes matching `.fnt` + `.png` names; overwrite decisions are explicit and the pair is staged before replacement. Projects and import never alter source images.

## Boundaries

Main process owns native dialogs and image decoding/files. Renderer has no Node access; preload exposes named operations, validates incoming data and never exposes arbitrary IPC or filesystem methods. Restrict navigation, permissions and new windows. Only local assets; no account, network API or telemetry.

Bound resource usage: file/project size, decoded pixels, glyph count, metrics, texture dimensions. Invalid input produces actionable errors without losing the current document.

## Verification

Tests first for mapping, duplicates, transparent trimming, deterministic non-overlapping packing, overflow, metrics, text/XML serialization, sample import, portable project round-trip and real exported pixels. Typecheck and production build. Electron UI test covers sample loading, glyph editing, preview, project save/reopen and real PNG/FNT export. Inspect a screenshot. Build and smoke-test the packaged macOS app.

## Sources

- https://angelcode.com/products/bmfont/doc/file_format.html
- https://docs.cocos2d-x.org/cocos2d-x/v3/en/ui_components/labels.html
- https://github.com/cocos2d/cocos2d-x/blob/v3/cocos/2d/CCFontFNT.cpp
- https://www.electronjs.org/docs/latest/tutorial/security
