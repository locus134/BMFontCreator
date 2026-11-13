# BMFont Creator Implementation Plan

> **For agentic workers:** Execute inline using executing-plans; tests first for processing behavior.

**Goal:** Deliver a working macOS bitmap font editor, with portable source for other desktop platforms.

**Architecture:** Shared TypeScript font/packing/layout modules; main-process Sharp image and file services; isolated React renderer and narrow preload bridge.

**Tech Stack:** Electron, React, TypeScript, esbuild, Sharp, Vitest, Playwright, electron-builder.

**Spec:** `docs/superpowers/archive/specs/2026-11-13-bmfont-creator-design.md`

## Constraints and review focus

Single-page, no glyph rotation, no source-file writes. Preserve sample metrics. Prioritize literal digits over codepoint syntax. Validate project data and filesystem paths. Bound image decoding. Confirm trimming does not move text, transparent glyphs still advance, duplicate mappings block export, malformed imports retain the current document, and paired exports never silently overwrite.

## Tasks

1. [x] Core model and mapping (`src/core/types.ts`, `mapping.ts`, `validation.ts`, `tests/core.test.ts`). Write tests for literal/encoded/invalid filenames and duplicate mappings; run to observe missing modules; implement and rerun.
2. [x] Atlas and descriptors (`src/core/packing.ts`, `bmfont.ts`, `layout.ts`, `tests/core.test.ts`). Tests assert deterministic non-overlap, overflow, trimming offsets, exact sample metrics, final-newline text and escaped XML; implement and rerun.
3. [x] Image/file services (`src/main/images.ts`, `files.ts`, `tests/files.test.ts`). Tests use actual generated PNGs, supplied sample, portable round-trip, bad/missing pages, resource bounds and export pixel checks; implement and rerun.
4. [x] Desktop editor (`src/main/main.ts`, `preload.ts`, `src/renderer/*`, `scripts/build.mjs`). Implement native dialog actions, unsaved guards, metrics, atlas and text views, keyboard shortcuts and validation. Run `npm run typecheck` and `npm run build`.
5. [x] Integration and delivery (`scripts/e2e.mjs`, `README.md`, packaging). Run `npm test`, coverage, typecheck, build, Electron UI workflow and screenshot review. Build app/DMG, launch packaged app, inspect dependency audit and perform a separate security/correctness review. Archive only these plan/spec files after completion.

## Progress

- Workspace initially contains only sample files and is not a Git repository; work in the requested directory without initializing history or moving the sample.
- Use ordinary available JavaScript execution tools with filtered output because context-mode tools are not exposed in this session.

## Verified delivery (2026-11-13)

- All five tasks complete. Node 24.22.3; Electron 45.3.1; Vitest 4.1.12.
- Typecheck and production build passed. 46 tests passed; statements 90.02%, branches 80.47%, functions 94.31%, lines 96.65%; 80% thresholds enforced.
- Source and packaged Electron workflows passed: sample, original metrics, offsets, preview, undo/redo, save/reopen, cancel-discard, directory import, Unicode edits, trim, Text/XML exports, minimum window and fit zoom.
- Real PNG pixels compared against source sample; injected descriptor commit failure restored both original output files.
- Fresh review found production Reload data loss, unsafe descriptor basename and orientation/image mismatch. Each reproduced RED, corrected, then GREEN with the complete suite and packaged workflow.
- Additional regressions cover new-import tie determinism, non-regular export targets and channel-packed input rejection.
- Declined review areas resolved: project undo/redo is verified through toolbar while native Edit menu keeps system text behavior; ordinary rollback failure is fault-tested; Windows/Linux and actual Cocos2d-x runtime are explicitly outside current verification.
- Dependency audit: 0 vulnerabilities including development dependencies after tested tool updates and narrow glob/minimatch overrides.
- macOS arm64 APP, DMG and ZIP produced; hdiutil verified DMG checksums. Local development build, unsigned and not notarized.
