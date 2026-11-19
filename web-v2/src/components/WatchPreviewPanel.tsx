import React, { useEffect, useRef, useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  Pause,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Watch,
  Wrench,
} from 'lucide-react';
import type {
  LatLon,
  SimDebugOptions,
  WatchProfile,
  WatchSettings,
} from '../types/route';
import { WATCH_PROFILES } from '../data/watchProfiles';
import { formatDistance } from '../lib/gpx-engine';
import { WatchSimulatorEngine } from '../lib/watch-renderer';

interface WatchPreviewPanelProps {
  activeProfile: WatchProfile;
  onSelectProfile: (profileId: string) => void;
  orderedPoints: LatLon[];
  isNoRoute?: boolean;
  settings: WatchSettings;
  onChangeSettings: (patch: Partial<WatchSettings>) => void;
  debug: SimDebugOptions;
  onChangeDebug: (patch: Partial<SimDebugOptions>) => void;
}

const SPEED_OPTIONS: Array<1 | 5 | 10> = [1, 5, 10];
const RANGE_PRESETS = [150, 175, 300] as const;
const DIST_TO_START_PRESETS = [
  { label: '0m', value: 0 },
  { label: '450m', value: 450 },
  { label: '3km', value: 3000 },
] as const;

interface DisplayToggleItem {
  key: keyof Pick<
    WatchSettings,
    | 'showDirection'
    | 'dimCompletedPath'
    | 'showCornerAnchors'
    | 'showTurnCue'
    | 'showProgress'
    | 'enableVibration'
  >;
  label: string;
  hint: string;
}

const DISPLAY_TOGGLES: DisplayToggleItem[] = [
  {
    key: 'showDirection',
    label: 'Show Direction Chevrons',
    hint: 'Draw directional arrows along the track',
  },
  {
    key: 'dimCompletedPath',
    label: 'Dim Completed Path',
    hint: 'Fade already-run segments behind you',
  },
  {
    key: 'showCornerAnchors',
    label: 'Corner Anchor Dots',
    hint: 'Highlight sharp turns (>42°) along the route',
  },
  {
    key: 'showTurnCue',
    label: 'Upcoming Turn Cue',
    hint: 'Display next turn direction at top of watch',
  },
  {
    key: 'showProgress',
    label: 'Remaining & Progress %',
    hint: 'Show remaining distance and completion %',
  },
  {
    key: 'enableVibration',
    label: 'Haptic Vibration Alerts',
    hint: 'Vibrate on off-course drift or key turns',
  },
];

export const WatchPreviewPanel: React.FC<WatchPreviewPanelProps> = ({
  activeProfile,
  onSelectProfile,
  orderedPoints,
  isNoRoute = false,
  settings,
  onChangeSettings,
  debug,
  onChangeDebug,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const engineRef = useRef<WatchSimulatorEngine | null>(null);
  const [displayOpen, setDisplayOpen] = useState(false);
  const [debugOpen, setDebugOpen] = useState(false);
  const [simState, setSimState] = useState({
    isPlaying: false,
    progressRatio: 0,
    traveledMeters: 0,
    totalMeters: 0,
    isOffCourse: false,
  });

  // Initialize WatchSimulatorEngine once on mount
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const engine = new WatchSimulatorEngine(canvas, activeProfile);
    engineRef.current = engine;

    engine.onUpdate((state) => {
      setSimState(state);
    });

    engine.setSettings(settings);
    engine.setDebug(debug);
    engine.setRoute(orderedPoints, isNoRoute);

    return () => {
      engine.destroy();
      engineRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync watch profile
  useEffect(() => {
    engineRef.current?.setProfile(activeProfile);
  }, [activeProfile]);

  // Sync ordered route points
  useEffect(() => {
    engineRef.current?.setRoute(orderedPoints, isNoRoute);
  }, [orderedPoints, isNoRoute]);

  // Sync watch settings
  useEffect(() => {
    engineRef.current?.setSettings(settings);
  }, [settings]);

  // Sync simulator debug options
  useEffect(() => {
    engineRef.current?.setDebug(debug);
  }, [debug]);

  const handleTogglePlay = () => {
    const engine = engineRef.current;
    if (!engine) return;
    if (simState.isPlaying) {
      engine.pause();
    } else {
      engine.play();
    }
  };

  const handleReset = () => {
    engineRef.current?.reset();
  };

  const handleScrub = (e: React.ChangeEvent<HTMLInputElement>) => {
    const ratio = Number(e.target.value) / 1000;
    engineRef.current?.setProgressRatio(ratio);
  };

  const isMip = activeProfile.displayType === 'MIP';

  return (
    <div className="subtle-scroll flex h-full flex-col justify-between overflow-y-auto bg-slate-50/70 p-4 sm:p-6">
      {/* Top Bar: Watch Model Selector + Spec Badge */}
      <div className="flex flex-wrap items-center justify-between gap-2.5">
        <div className="relative flex items-center">
          <Watch className="pointer-events-none absolute left-2.5 h-4 w-4 text-slate-400" />
          <select
            aria-label="Preview watch model"
            value={activeProfile.id}
            onChange={(e) => onSelectProfile(e.target.value)}
            className="h-9 cursor-pointer appearance-none rounded-lg border border-slate-200 bg-white pl-8 pr-7 text-xs font-medium text-slate-800 shadow-2xs transition-colors hover:border-slate-300 focus:border-emerald-600 focus:outline-none"
          >
            {WATCH_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
                {p.status === 'preview' ? ' (Preview)' : ''}
              </option>
            ))}
          </select>
          <svg
            className="pointer-events-none absolute right-2 h-3.5 w-3.5 text-slate-400"
            viewBox="0 0 16 16"
            fill="none"
            aria-hidden="true"
          >
            <path
              d="M4 6l4 4 4-4"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="rounded-full border border-slate-200 bg-white px-2.5 py-1 font-mono text-[11px] font-medium text-slate-600 tabular-nums">
            {activeProfile.screenSize}×{activeProfile.screenSize} · {activeProfile.displayType}
          </span>
          {activeProfile.status === 'preview' && (
            <span className="rounded-full bg-amber-50 px-2 py-1 text-[11px] font-medium text-amber-700 ring-1 ring-amber-200/80">
              Preview
            </span>
          )}
        </div>
      </div>

      {/* Center: Minimalist Watch Bezel + Canvas */}
      <div className="my-5 flex flex-col items-center justify-center">
        <div className="relative flex items-center justify-center">
          {/* Subtle hardware side buttons */}
          <div
            aria-hidden="true"
            className="absolute -right-2 top-[26%] h-9 w-2 rounded-r-md bg-slate-700 shadow-xs"
          />
          <div
            aria-hidden="true"
            className="absolute -right-2 bottom-[26%] h-9 w-2 rounded-r-md bg-slate-700 shadow-xs"
          />

          {/* Outer Bezel */}
          <div
            className={`relative rounded-full p-3.5 shadow-[0_14px_34px_rgba(15,23,42,0.16)] ring-1 ${
              isMip
                ? 'bg-gradient-to-b from-slate-700 to-slate-800 ring-slate-600/80'
                : 'bg-gradient-to-b from-slate-800 to-slate-950 ring-slate-700/80'
            }`}
          >
            {/* Inner subtle metallic rim */}
            <div className="rounded-full bg-black p-1.5 ring-1 ring-white/10">
              <canvas
                ref={canvasRef}
                width={activeProfile.screenSize}
                height={activeProfile.screenSize}
                className="block h-[240px] w-[240px] rounded-full sm:h-[300px] sm:w-[300px] lg:h-[330px] lg:w-[330px]"
              />
            </div>
          </div>
        </div>

        {/* Off-course status pill */}
        {simState.isOffCourse && (
          <div className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-medium text-red-700 ring-1 ring-red-200">
            <AlertTriangle className="h-3.5 w-3.5" />
            <span>Off-Course Alert Active</span>
          </div>
        )}
      </div>

      {/* Bottom Controls: Playback + Scrubber + Collapsible Debug Tools */}
      <div className="mx-auto w-full max-w-md space-y-3">
        {/* Playback & Timeline Scrubber */}
        <div className="rounded-xl border border-slate-200/90 bg-white p-3 shadow-2xs">
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleTogglePlay}
              aria-label={simState.isPlaying ? 'Pause simulation' : 'Play simulation'}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#122C64] text-white transition-colors hover:bg-[#0d214d]"
            >
              {simState.isPlaying ? (
                <Pause className="h-4 w-4" />
              ) : (
                <Play className="h-4 w-4 translate-x-[1px]" />
              )}
            </button>

            <button
              type="button"
              onClick={handleReset}
              aria-label="Reset simulation"
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 bg-slate-50 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
            >
              <RotateCcw className="h-4 w-4" />
            </button>

            <div className="min-w-0 flex-1">
              <input
                type="range"
                aria-label="Simulation timeline"
                min={0}
                max={1000}
                step={1}
                value={Math.round(simState.progressRatio * 1000)}
                onChange={handleScrub}
                className="h-2 w-full cursor-pointer accent-emerald-600"
              />
              <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500 tabular-nums">
                <span>{formatDistance(simState.traveledMeters)}</span>
                <span>
                  {simState.totalMeters > 0
                    ? `${Math.round(simState.progressRatio * 100)}% · ${formatDistance(simState.totalMeters)}`
                    : 'Free Walk'}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Collapsible Watch Display Settings (Preview Only) */}
        <div className="rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 shadow-2xs">
          <button
            type="button"
            onClick={() => setDisplayOpen((v) => !v)}
            aria-expanded={displayOpen}
            className="flex min-h-[36px] w-full items-center justify-between text-xs font-medium text-slate-600 transition-colors hover:text-slate-900"
          >
            <span className="flex items-center gap-2">
              <SlidersHorizontal className="h-3.5 w-3.5 text-slate-400" />
              <span>Watch Display Settings</span>
              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-500">
                {settings.mapRange}m
              </span>
            </span>
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                displayOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {displayOpen && (
            <div className="mt-2.5 space-y-3.5 border-t border-slate-100 pt-3 pb-1.5">
              <p className="text-[11px] text-slate-400">
                Preview of Garmin Connect display options — does not affect the Route Code.
              </p>

              {/* Watch Map Range */}
              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <label
                    htmlFor="watch-map-range"
                    className="text-[11px] font-medium text-slate-600"
                  >
                    Watch Map Range
                  </label>
                  <div className="flex items-center gap-1.5">
                    {RANGE_PRESETS.map((preset) => (
                      <button
                        key={preset}
                        type="button"
                        onClick={() => onChangeSettings({ mapRange: preset })}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition-colors ${
                          settings.mapRange === preset
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {preset}m
                      </button>
                    ))}
                    <span className="ml-1 font-mono text-[11px] font-semibold text-slate-800 tabular-nums">
                      {settings.mapRange}m
                    </span>
                  </div>
                </div>
                <input
                  id="watch-map-range"
                  type="range"
                  min={50}
                  max={1000}
                  step={25}
                  value={settings.mapRange}
                  onChange={(e) => onChangeSettings({ mapRange: Number(e.target.value) })}
                  className="h-1.5 w-full cursor-pointer accent-emerald-600"
                />
              </div>

              {/* 6 Watch Display Toggles */}
              <div className="space-y-2 border-t border-slate-100 pt-2.5">
                {DISPLAY_TOGGLES.map((item) => {
                  const checked = settings[item.key];
                  return (
                    <label
                      key={item.key}
                      className="flex min-h-[36px] cursor-pointer items-center justify-between gap-3 rounded-lg px-1 py-0.5 transition-colors hover:bg-slate-50"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-medium text-slate-800">{item.label}</div>
                        <div className="text-[11px] text-slate-400">{item.hint}</div>
                      </div>
                      <button
                        type="button"
                        role="switch"
                        aria-checked={checked}
                        onClick={() => onChangeSettings({ [item.key]: !checked })}
                        className={`relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors ${
                          checked ? 'bg-emerald-600' : 'bg-slate-200'
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow-xs transition-transform ${
                            checked ? 'translate-x-4.5' : 'translate-x-1'
                          }`}
                        />
                      </button>
                    </label>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Collapsible Simulator Debug Tools */}
        <div className="rounded-xl border border-slate-200/90 bg-white px-3.5 py-2 shadow-2xs">
          <button
            type="button"
            onClick={() => setDebugOpen((v) => !v)}
            aria-expanded={debugOpen}
            className="flex min-h-[36px] w-full items-center justify-between text-xs font-medium text-slate-600 transition-colors hover:text-slate-900"
          >
            <span className="flex items-center gap-2">
              <Wrench className="h-3.5 w-3.5 text-slate-400" />
              <span>Simulator Debug Tools</span>
            </span>
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                debugOpen ? 'rotate-180' : ''
              }`}
            />
          </button>

          {debugOpen && (
            <div className="mt-2.5 space-y-3.5 border-t border-slate-100 pt-3 pb-1.5">
              {/* Speed & DataField Layout Row */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1.5 block text-[11px] font-medium text-slate-600">
                    Playback Speed
                  </label>
                  <div className="grid grid-cols-3 gap-1 rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                    {SPEED_OPTIONS.map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => onChangeDebug({ speed: spd })}
                        className={`rounded-md py-1.5 text-xs font-medium tabular-nums transition-colors ${
                          debug.speed === spd
                            ? 'bg-white text-slate-900 shadow-2xs ring-1 ring-slate-200'
                            : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="sim-layout-select"
                    className="mb-1.5 block text-[11px] font-medium text-slate-600"
                  >
                    DataField Layout
                  </label>
                  <select
                    id="sim-layout-select"
                    value={debug.layoutHeight}
                    onChange={(e) => onChangeDebug({ layoutHeight: Number(e.target.value) })}
                    className="h-[34px] w-full rounded-lg border border-slate-200 bg-slate-50 px-2.5 text-xs font-medium text-slate-700 focus:border-emerald-600 focus:bg-white focus:outline-none"
                  >
                    {activeProfile.layouts.map((layout) => (
                      <option key={layout.height} value={layout.height}>
                        {layout.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Heading Trim */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label
                    htmlFor="sim-heading-trim"
                    className="text-[11px] font-medium text-slate-600"
                  >
                    Heading Trim
                  </label>
                  <span className="font-mono text-[11px] font-medium text-slate-700 tabular-nums">
                    {debug.headingOffsetDeg}°
                  </span>
                </div>
                <input
                  id="sim-heading-trim"
                  type="range"
                  min={0}
                  max={360}
                  step={5}
                  value={debug.headingOffsetDeg}
                  onChange={(e) => onChangeDebug({ headingOffsetDeg: Number(e.target.value) })}
                  className="h-1.5 w-full cursor-pointer accent-emerald-600"
                />
              </div>

              {/* Distance to Start */}
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label
                    htmlFor="sim-dist-start"
                    className="text-[11px] font-medium text-slate-600"
                  >
                    Distance to Start
                  </label>
                  <div className="flex items-center gap-1.5">
                    {DIST_TO_START_PRESETS.map((preset) => (
                      <button
                        key={preset.value}
                        type="button"
                        onClick={() => onChangeDebug({ distanceToStartMeters: preset.value })}
                        className={`rounded px-1.5 py-0.5 text-[10px] font-medium tabular-nums transition-colors ${
                          debug.distanceToStartMeters === preset.value
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                        }`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
                <input
                  id="sim-dist-start"
                  type="range"
                  min={0}
                  max={3000}
                  step={50}
                  value={debug.distanceToStartMeters}
                  onChange={(e) =>
                    onChangeDebug({ distanceToStartMeters: Number(e.target.value) })
                  }
                  className="h-1.5 w-full cursor-pointer accent-emerald-600"
                />
              </div>

              {/* Off-Course (+45m) Toggle */}
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[11px] font-medium text-slate-600">
                  Simulate Off-Course Drift
                </span>
                <button
                  type="button"
                  onClick={() =>
                    onChangeDebug({ deviateMeters: debug.deviateMeters > 0 ? 0 : 45 })
                  }
                  className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-medium transition-colors ${
                    debug.deviateMeters > 0
                      ? 'bg-red-600 text-white hover:bg-red-700'
                      : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <AlertTriangle className="h-3.5 w-3.5" />
                  <span>{debug.deviateMeters > 0 ? 'Off-Course (+45m) ON' : 'Off-Course (+45m)'}</span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
