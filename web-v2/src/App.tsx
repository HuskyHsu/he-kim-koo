import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { FileUp, Map as MapIcon, Watch } from 'lucide-react';
import {
  DEFAULT_SIM_DEBUG,
  DEFAULT_WATCH_SETTINGS,
  type RouteData,
  type SimDebugOptions,
  type WatchSettings,
} from './types/route';
import { DEFAULT_WATCH_PROFILE, getWatchProfileById } from './data/watchProfiles';
import { SAMPLE_ROUTES } from './data/sampleRoutes';
import {
  calcTotalDistanceMeters,
  decodeGooglePolyline,
  encodeGooglePolyline,
  getOrderedPoints,
  parseGpx,
  smartSimplifyRoute,
} from './lib/gpx-engine';
import { Header } from './components/Header';
import { StepImport } from './components/StepImport';
import { StepConfigure } from './components/StepConfigure';
import { StepExport } from './components/StepExport';
import { RouteMapView } from './components/RouteMapView';
import { WatchPreviewPanel } from './components/WatchPreviewPanel';
import { SetupGuideModal } from './components/SetupGuideModal';
import { MobileStickyBar } from './components/MobileStickyBar';

function buildRouteFromSample(sampleId: string, maxPoints: number): RouteData {
  const sample = SAMPLE_ROUTES.find((s) => s.id === sampleId) ?? SAMPLE_ROUTES[0];
  if (sample.isNoRoute || !sample.gpx) {
    return {
      id: `sample-${sample.id}`,
      name: sample.name,
      source: 'none',
      isNoRoute: true,
      origPoints: [],
      simpPoints: [],
      distanceMeters: 0,
    };
  }
  const origPoints = parseGpx(sample.gpx);
  const simpPoints = smartSimplifyRoute(origPoints, 100, maxPoints);
  return {
    id: `sample-${sample.id}`,
    name: sample.name,
    source: 'sample',
    origPoints,
    simpPoints,
    distanceMeters: calcTotalDistanceMeters(origPoints),
  };
}

export function App() {
  const [activeProfileId, setActiveProfileId] = useState<string>(DEFAULT_WATCH_PROFILE.id);
  const activeProfile = useMemo(
    () => getWatchProfileById(activeProfileId),
    [activeProfileId],
  );

  const [route, setRoute] = useState<RouteData>(() =>
    buildRouteFromSample('taipei-dino', DEFAULT_WATCH_PROFILE.maxPoints),
  );
  const [settings, setSettings] = useState<WatchSettings>(DEFAULT_WATCH_SETTINGS);
  const [simDebug, setSimDebug] = useState<SimDebugOptions>(DEFAULT_SIM_DEBUG);
  const [activeTab, setActiveTab] = useState<'map' | 'watch'>('map');
  const [guideOpen, setGuideOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const [windowDragging, setWindowDragging] = useState(false);
  const copyTimerRef = useRef<number | null>(null);
  const dragCounterRef = useRef(0);

  // Ordered points (Forward or Reverse) — single source of truth for Route Code & Watch Preview
  const orderedSimpPoints = useMemo(() => {
    if (!route || route.isNoRoute || route.simpPoints.length === 0) return [];
    return getOrderedPoints(route.simpPoints, settings.routeDirection);
  }, [route, settings.routeDirection]);

  const routeCode = useMemo(() => {
    if (orderedSimpPoints.length === 0) return '';
    return encodeGooglePolyline(orderedSimpPoints);
  }, [orderedSimpPoints]);

  const handleSelectProfile = useCallback((profileId: string) => {
    const next = getWatchProfileById(profileId);
    setActiveProfileId(next.id);
    setSimDebug((prev) => ({
      ...prev,
      layoutHeight: next.layouts[0]?.height ?? next.screenSize,
    }));
  }, []);

  const handleUpdateSettings = useCallback((patch: Partial<WatchSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleUpdateDebug = useCallback((patch: Partial<SimDebugOptions>) => {
    setSimDebug((prev) => ({ ...prev, ...patch }));
  }, []);

  const handleSelectSample = useCallback(
    (sampleId: string) => {
      setImportError(null);
      setRoute(buildRouteFromSample(sampleId, activeProfile.maxPoints));
    },
    [activeProfile.maxPoints],
  );

  const handleImportPolyline = useCallback(
    (encoded: string) => {
      try {
        const decoded = decodeGooglePolyline(encoded.trim());
        if (decoded.length < 2) {
          setImportError('Could not decode a valid route from that polyline string.');
          return;
        }
        const simpPoints =
          decoded.length > activeProfile.maxPoints
            ? smartSimplifyRoute(decoded, 100, activeProfile.maxPoints)
            : decoded;
        setImportError(null);
        setRoute({
          id: `polyline-${Date.now()}`,
          name: 'Pasted Polyline',
          source: 'polyline',
          origPoints: decoded,
          simpPoints,
          distanceMeters: calcTotalDistanceMeters(decoded),
        });
      } catch {
        setImportError('Invalid polyline string. Please check the text and try again.');
      }
    },
    [activeProfile.maxPoints],
  );

  const handleImportFile = useCallback(
    (file: File) => {
      const reader = new FileReader();
      reader.onload = () => {
        const text = typeof reader.result === 'string' ? reader.result : '';
        const trimmed = text.trim();
        if (!trimmed) {
          setImportError('The selected file is empty.');
          return;
        }

        const baseName = file.name.replace(/\.(gpx|xml|txt)$/i, '') || 'Imported Route';
        const looksLikeGpx = /<(?:gpx|trkpt|rtept)\b/i.test(trimmed);

        if (looksLikeGpx) {
          const origPoints = parseGpx(trimmed);
          if (origPoints.length < 2) {
            setImportError('No track points found in this GPX file.');
            return;
          }
          const simpPoints = smartSimplifyRoute(origPoints, 100, activeProfile.maxPoints);
          setImportError(null);
          setRoute({
            id: `gpx-${Date.now()}`,
            name: baseName,
            source: 'gpx',
            origPoints,
            simpPoints,
            distanceMeters: calcTotalDistanceMeters(origPoints),
          });
        } else {
          const decoded = decodeGooglePolyline(trimmed);
          if (decoded.length < 2) {
            setImportError(
              'Unsupported file format. Please drop a .gpx file or an encoded polyline .txt file.',
            );
            return;
          }
          const simpPoints =
            decoded.length > activeProfile.maxPoints
              ? smartSimplifyRoute(decoded, 100, activeProfile.maxPoints)
              : decoded;
          setImportError(null);
          setRoute({
            id: `txt-${Date.now()}`,
            name: baseName,
            source: 'polyline',
            origPoints: decoded,
            simpPoints,
            distanceMeters: calcTotalDistanceMeters(decoded),
          });
        }
      };
      reader.onerror = () => {
        setImportError('Failed to read the file. Please try again.');
      };
      reader.readAsText(file);
    },
    [activeProfile.maxPoints],
  );

  const handleCopyRouteCode = useCallback(async () => {
    if (!routeCode) return;
    try {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        await navigator.clipboard.writeText(routeCode);
      } else {
        const ta = document.createElement('textarea');
        ta.value = routeCode;
        ta.style.position = 'fixed';
        ta.style.opacity = '0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      setCopied(true);
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
      copyTimerRef.current = window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setImportError('Could not copy automatically. Open "View raw code" to copy manually.');
    }
  }, [routeCode]);

  // Full-window drag & drop support
  useEffect(() => {
    const onDragEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
      dragCounterRef.current += 1;
      setWindowDragging(true);
    };
    const onDragOver = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      e.preventDefault();
    };
    const onDragLeave = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes('Files')) return;
      dragCounterRef.current = Math.max(0, dragCounterRef.current - 1);
      if (dragCounterRef.current === 0) setWindowDragging(false);
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounterRef.current = 0;
      setWindowDragging(false);
      const file = e.dataTransfer?.files?.[0];
      if (file) handleImportFile(file);
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleImportFile]);

  useEffect(() => {
    return () => {
      if (copyTimerRef.current) window.clearTimeout(copyTimerRef.current);
    };
  }, []);

  return (
    <div className="min-h-screen bg-[#F8FAFC] text-slate-900 lg:flex lg:h-dvh lg:flex-col lg:overflow-hidden">
      <Header
        activeProfile={activeProfile}
        onSelectProfile={handleSelectProfile}
        onOpenGuide={() => setGuideOpen(true)}
      />

      {/* Main Workbench:
          Mobile (<1024px): Step 1 -> Visual Stage -> Step 2 -> Step 3 (single page scroll)
          Desktop (>=1024px): Independent scrollable Left 400px column | Fixed-height Right Visual Stage */}
      <main className="mx-auto w-full max-w-[1440px] px-4 pt-4 pb-24 sm:px-6 sm:pt-5 lg:flex lg:min-h-0 lg:flex-1 lg:overflow-hidden lg:py-5">
        <div className="flex w-full flex-col gap-4 lg:min-h-0 lg:flex-row lg:gap-6">
          {/* Left Column (contents on mobile so Visual Stage slots between Step 1 & Step 2;
              clean independent scroll container on desktop — fits without scrollbar in default state) */}
          <div className="subtle-scroll contents lg:flex lg:w-[400px] lg:shrink-0 lg:flex-col lg:gap-4 lg:overflow-y-auto lg:pr-1 lg:pb-2">
            {/* Step 1 */}
            <div className="order-1 shrink-0">
              <StepImport
                route={route}
                error={importError}
                onImportFile={handleImportFile}
                onImportPolyline={handleImportPolyline}
                onSelectSample={handleSelectSample}
                onClearError={() => setImportError(null)}
              />
            </div>

            {/* Step 2 */}
            <div className="order-3 shrink-0">
              <StepConfigure
                settings={settings}
                onChange={handleUpdateSettings}
                disabled={route.isNoRoute}
              />
            </div>

            {/* Step 3 */}
            <div className="order-4 shrink-0">
              <StepExport
                routeCode={routeCode}
                isNoRoute={route.isNoRoute}
                pointCount={orderedSimpPoints.length}
                direction={settings.routeDirection}
                onCopy={handleCopyRouteCode}
                copied={copied}
              />
            </div>
          </div>

          {/* Right Visual Stage (fixed height & position on desktop, never scrolls with left column) */}
          <section
            aria-label="Route visualization"
            className="order-2 flex flex-col overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-[0_1px_2px_rgba(15,23,42,0.04)] lg:h-full lg:min-h-0 lg:min-w-0 lg:flex-1"
          >
            {/* Segmented Tab Switcher */}
            <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 bg-white px-4 py-2.5">
              <div
                className="inline-flex rounded-xl border border-slate-200 bg-slate-50 p-1"
                role="tablist"
                aria-label="Preview mode"
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'map'}
                  onClick={() => setActiveTab('map')}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all sm:text-sm ${
                    activeTab === 'map'
                      ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/80'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <MapIcon className="h-4 w-4 text-emerald-600" />
                  <span>Route Map</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={activeTab === 'watch'}
                  onClick={() => setActiveTab('watch')}
                  className={`inline-flex min-h-[36px] items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold transition-all sm:text-sm ${
                    activeTab === 'watch'
                      ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200/80'
                      : 'text-slate-500 hover:text-slate-800'
                  }`}
                >
                  <Watch className="h-4 w-4 text-[#122C64]" />
                  <span>Watch Preview</span>
                </button>
              </div>

              <div className="hidden text-xs text-slate-400 sm:block">
                {activeTab === 'map'
                  ? 'Inspect simplified track on real streets'
                  : `${activeProfile.name} simulator`}
              </div>
            </div>

            {/* Stage Canvas */}
            <div
              className={`relative flex-1 ${
                activeTab === 'map'
                  ? 'h-[340px] sm:h-[420px] lg:h-auto lg:min-h-0'
                  : 'min-h-[420px] lg:h-auto lg:min-h-0 lg:overflow-y-auto'
              }`}
            >
              {activeTab === 'map' ? (
                <RouteMapView route={route} direction={settings.routeDirection} />
              ) : (
                <WatchPreviewPanel
                  activeProfile={activeProfile}
                  onSelectProfile={handleSelectProfile}
                  orderedPoints={orderedSimpPoints}
                  isNoRoute={route.isNoRoute}
                  settings={settings}
                  onChangeSettings={handleUpdateSettings}
                  debug={simDebug}
                  onChangeDebug={handleUpdateDebug}
                />
              )}
            </div>
          </section>
        </div>
      </main>

      <MobileStickyBar
        activeTab={activeTab}
        onChangeTab={setActiveTab}
        onCopy={handleCopyRouteCode}
        copied={copied}
        hasRouteCode={routeCode.length > 0}
      />

      <SetupGuideModal open={guideOpen} onClose={() => setGuideOpen(false)} />

      {/* Full-Window Drag & Drop Overlay */}
      {windowDragging && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-slate-900/35 p-6 backdrop-blur-[2px]">
          <div className="flex max-w-sm flex-col items-center rounded-2xl border-2 border-dashed border-emerald-500 bg-white px-8 py-7 text-center shadow-xl">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50 text-emerald-600">
              <FileUp className="h-6 w-6" />
            </div>
            <p className="mt-3 text-base font-semibold text-slate-900">
              Drop your GPX file to load
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Supports .gpx tracks and .txt encoded polylines
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
