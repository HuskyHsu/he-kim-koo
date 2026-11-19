# He-Kim-Koo Web Workstation Redesign Plan (`web-v2/` — React + TypeScript + Tailwind CSS + MapLibre GL)

## Goal Description

Build a brand-new, clean, English-only 3-step web application in a **separate `web-v2/` directory**, leaving the existing `web/` directory **100% untouched** for side-by-side comparison and zero regression risk.

Tailored for real Garmin runners creating GPS breadcrumb art:
- **Simple 3-Step Flow**: `1. Import Route` ➔ `2. Inspect & Adjust` ➔ `3. Copy to Watch`.
- **Modern GIS Map Overview (Default View)**: Powered by **MapLibre GL JS** with real-world basemap tiles, smooth pan/zoom, fit-to-route, and GeoJSON layers showing the raw GPX vs. simplified track, Start/End markers, and route direction on real streets.
- **Extensible Multi-Watch Simulator (Secondary Tab)**: Preserves the exact 1:1 Garmin Venu 2 Plus AMOLED renderer while introducing a **Watch Model Selector** backed by a data-driven `WatchProfile` registry, making it effortless to support additional Garmin watches (e.g., Forerunner, Fenix) in the future.
- **Mobile-First RWD**: Ergonomic single-column mobile layout with 44px+ touch targets, safe-area sticky Copy CTA, and seamless switching between Map and Watch views.
- **Custom Brand Identity**: Uses `he-kim-koo.svg` as the Header brand logo and browser favicon.

---

## Finalized UX & Design Decisions

1. **Language**: English only.
2. **Default Right-Stage View**: `Route Map` (MapLibre GL JS), with a clean segmented toggle to `Watch Preview`.
3. **Direction (`Forward` / `Reverse`)**: Switching to `Reverse` **bakes the reversed point order directly into the copied Route Code** so runners only need to paste `Route String` into Garmin Connect without changing extra watch settings.
4. **Watch Model Selector**: Data-driven `WatchProfile` registry with:
   - `Garmin Venu 2 Plus` (`416×416 AMOLED`, Active, `130 pts`, layouts `416 / 208 / 140`)
   - `Forerunner 265` (`416×416 AMOLED`, Preview, `130 pts`)
   - `Forerunner 965` (`454×454 AMOLED`, Preview, `130 pts`)
   - `Fenix 7` (`260×260 MIP`, Preview, `130 pts`)
5. **GIS Basemap Styles**: `Clean Light` (Carto Positron) + `Street` (OpenStreetMap).
6. **GPX Simplification**: 100% automatic (`100–130 pts` smart corner-preserving RDP with `>42°` anchors and `cleanCornerKnots`) — zero extra knobs.
7. **Separate Directory**: All new code lives in `web-v2/`; existing `web/` and existing tests remain untouched.

---

## UX & Layout Architecture

### Desktop (`>= 1024px`): Focused 2-Column Workbench
- **Top Header**: Minimal bar — custom `he-kim-koo.svg` brand logo + `He-Kim-Koo` title, active **Watch Model Selector** dropdown (default: `Venu 2 Plus · 416×416`), and `? Setup Guide` modal trigger.
- **Left Column (`400px`) — 3-Step Action Flow**:
  1. **Step 1 · Import Route**: Drag-and-drop `.gpx` / `.txt` zone, `Try Taipei Dino` & `No Route` quick pills, and `Paste Polyline` input. Once loaded, collapses into a clean summary card (`Taipei Dino • 3.8 km • 112 pts • Ready for Watch ✓`) with a `Change File` button.
  2. **Step 2 · Adjust & Configure**:
     - **Direction**: `[ Forward (Start ➔ End) | Reverse (End ➔ Start) ]` (bakes reversed order into copied Route Code).
     - **Watch Map Range**: Clean slider (`50m – 1000m`, default `175m`) with quick presets (`150m`, `175m`, `300m`).
     - **Collapsible `Advanced Watch Settings`**: The remaining 6 Garmin DataField toggles (`Show Direction Chevrons`, `Dim Completed Path`, `Corner Anchor Dots`, `Upcoming Turn Cue`, `Remaining & Progress %`, `Haptic Vibration Alerts`).
  3. **Step 3 · Send to Watch**: Prominent **`Copy Garmin Route Code`** primary button with instant `Copied!` state, concise 1-line Garmin Connect hint, and expandable `View raw code` drawer.
- **Right Stage (`flex-1`) — Visual Preview**:
  - Top segmented switcher: **`[ Route Map (Default) | Watch Preview ]`**
  - **Route Map (`RouteMapView.tsx`)**: Full-height MapLibre GL JS canvas with Carto Positron (Clean Light) & OpenStreetMap basemap toggle, Fit-to-Route button, GeoJSON layers (Raw GPX in subtle slate, Simplified track in emerald/green, Start green dot, End red dot, directional arrows), and an unobtrusive floating legend.
  - **Watch Preview (`WatchPreviewPanel.tsx`)**:
    - Watch Model Selector dropdown synced with active `WatchProfile`.
    - Centered watch housing + live canvas, Play/Pause/Reset + timeline scrubber.
    - Collapsible `Simulator Debug Tools` drawer (Heading Trim, Distance to Start + presets, Off-Course +45m test, Speed `1x/5x/10x`, DataField Layout selector).

### Mobile (`< 1024px`): Best-in-Class RWD Flow
1. **Compact Header**: Brand logo + title + `? Guide` button.
2. **Step 1 · Import**: Touch-friendly file picker + `Taipei Dino` sample pill; collapses cleanly to a 1-line route pill once loaded.
3. **Interactive Visual Card (`h-[340px] sm:h-[400px]`)**: Segmented `[ Route Map | Watch Preview ]` tab bar right above the canvas, with `cooperativeGestures` / explicit zoom controls on mobile so page scrolling never conflicts with map panning.
4. **Step 2 · Configure**: Full-width segmented Direction toggle, Map Range slider, and collapsed Advanced Settings.
5. **Sticky Bottom Action Bar**: Fixed to the bottom with `pb-[env(safe-area-inset-bottom)]` and backdrop blur, keeping **`Copy Garmin Route Code`** always one thumb-tap away.

---

## Shared TypeScript Contracts (`web-v2/src/types/route.ts`)

```ts
export interface LatLon {
  lat: number;
  lon: number;
}

export interface WatchLayoutOption {
  label: string;
  height: number;
}

export interface WatchProfile {
  id: string;
  name: string;
  series: string;
  status: 'active' | 'preview';
  screenSize: number; // e.g., 416, 454, 260
  shape: 'round';
  displayType: 'AMOLED' | 'MIP';
  maxPoints: number; // e.g., 130
  layouts: WatchLayoutOption[];
}

export interface WatchSettings {
  routeDirection: 0 | 1; // 0 = Forward, 1 = Reverse
  mapRange: number; // 50..1000
  showDirection: boolean;
  dimCompletedPath: boolean;
  showCornerAnchors: boolean;
  showTurnCue: boolean;
  showProgress: boolean;
  enableVibration: boolean;
}

export interface SimDebugOptions {
  speed: 1 | 5 | 10;
  headingOffsetDeg: number; // 0..360
  distanceToStartMeters: number; // 0..3000
  deviateMeters: number; // 0 or 45
  layoutHeight: number; // from active profile.layouts
}

export interface RouteData {
  id: string;
  name: string;
  source: 'sample' | 'gpx' | 'polyline' | 'none';
  isNoRoute?: boolean;
  origPoints: LatLon[];
  simpPoints: LatLon[];
  distanceMeters: number;
}
```

---

## Proposed Files

### 1. Project Scaffolding (`web-v2/`)
- `web-v2/package.json` (`react`, `react-dom`, `maplibre-gl`, `lucide-react`, `vite`, `@vitejs/plugin-react`, `typescript`, `tailwindcss`, `@tailwindcss/vite`, `vitest`)
- `web-v2/vite.config.ts`
- `web-v2/tsconfig.json`
- `web-v2/index.html` & `web-v2/public/he-kim-koo.svg`
- `web-v2/src/index.css` & `web-v2/src/main.tsx`

### 2. Core Engines, Watch Profiles & Data
- `web-v2/src/types/route.ts`
- `web-v2/src/data/watchProfiles.ts`
- `web-v2/src/data/sampleRoutes.ts`
- `web-v2/src/lib/gpx-engine.ts`
- `web-v2/src/lib/gpx-engine.test.ts`
- `web-v2/src/lib/watch-renderer.ts`

### 3. React UI Components (`web-v2/src/components/`)
- `web-v2/src/App.tsx`
- `web-v2/src/components/Header.tsx`
- `web-v2/src/components/StepImport.tsx`
- `web-v2/src/components/StepConfigure.tsx`
- `web-v2/src/components/StepExport.tsx`
- `web-v2/src/components/RouteMapView.tsx`
- `web-v2/src/components/WatchPreviewPanel.tsx`
- `web-v2/src/components/SetupGuideModal.tsx`
- `web-v2/src/components/MobileStickyBar.tsx`

### 4. Makefile & CI Additions (Non-Breaking)
- `Makefile`: add `make web-v2` (keep `make web` untouched)
- `.github/workflows/ci.yml`: add `web-v2-build-and-test` job (keep `web-and-config-tests` untouched)

---

## Verification Plan

```bash
# Existing tests (must remain 100% passing)
node --test tests/*.test.mjs

# New web-v2 typecheck, unit tests, and production bundle
cd web-v2 && npm ci && npx tsc --noEmit && npm test && npm run build
```
