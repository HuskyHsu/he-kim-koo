import React, { useRef, useState } from 'react';
import {
  CheckCircle2,
  ChevronDown,
  Compass,
  FileUp,
  Footprints,
  Sparkles,
  Type,
} from 'lucide-react';
import type { RouteData } from '../types/route';
import { formatDistance } from '../lib/gpx-engine';

interface StepImportProps {
  route: RouteData | null;
  error: string | null;
  onImportFile: (file: File) => void;
  onImportPolyline: (encoded: string) => void;
  onSelectSample: (sampleId: string) => void;
  onClearError: () => void;
}

export const StepImport: React.FC<StepImportProps> = ({
  route,
  error,
  onImportFile,
  onImportPolyline,
  onSelectSample,
  onClearError,
}) => {
  const [expanded, setExpanded] = useState(!route);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [polylineInput, setPolylineInput] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const showCompact = Boolean(route) && !expanded;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onClearError();
      onImportFile(file);
      setExpanded(false);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      onClearError();
      onImportFile(file);
      setExpanded(false);
    }
  };

  const handleLoadPolyline = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = polylineInput.trim();
    if (!trimmed) return;
    onClearError();
    onImportPolyline(trimmed);
    setPolylineInput('');
    setPasteOpen(false);
    setExpanded(false);
  };

  const handleSampleClick = (id: string) => {
    onClearError();
    onSelectSample(id);
    setExpanded(false);
  };

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-[#122C64]">
            1
          </span>
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">
            Import Route
          </h2>
        </div>

        {route && (
          <button
            type="button"
            onClick={() => setExpanded((v) => !v)}
            className="rounded-lg px-2.5 py-1 text-xs font-medium text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            {expanded ? 'Done' : 'Change'}
          </button>
        )}
      </div>

      {/* Error banner */}
      {error && (
        <div
          role="alert"
          className="mt-3 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
        >
          {error}
        </div>
      )}

      {/* Compact Loaded Summary */}
      {showCompact && route ? (
        <div className="mt-3.5 flex items-center justify-between gap-3 rounded-xl border border-slate-200/80 bg-slate-50/70 px-3.5 py-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-semibold text-slate-900">
                {route.name}
              </span>
              {route.isNoRoute ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-slate-200/80 px-2 py-0.5 text-[11px] font-medium text-slate-600">
                  Free Walk
                </span>
              ) : (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-emerald-200/70">
                  <CheckCircle2 className="h-3 w-3" />
                  Ready
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-500 tabular-nums">
              {route.isNoRoute
                ? 'Live breadcrumb trail without a preset course'
                : `${formatDistance(route.distanceMeters)} · ${route.simpPoints.length} pts${
                    route.origPoints.length > route.simpPoints.length
                      ? ` (from ${route.origPoints.length})`
                      : ''
                  }`}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 space-y-3.5">
          {/* Dropzone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className={`group flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-4 py-5 text-center transition-colors ${
              isDragging
                ? 'border-emerald-500 bg-emerald-50/60'
                : 'border-slate-300 bg-slate-50/60 hover:border-emerald-500/70 hover:bg-emerald-50/30'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".gpx,.xml,.txt"
              onChange={handleFileChange}
              className="hidden"
            />
            <div className="flex h-9 w-9 items-center justify-center rounded-full bg-white text-slate-500 shadow-xs ring-1 ring-slate-200/80 transition-colors group-hover:text-emerald-600">
              <FileUp className="h-4 w-4" />
            </div>
            <p className="mt-2.5 text-xs font-medium text-slate-800">
              Drop a <span className="font-semibold">.gpx</span> or{' '}
              <span className="font-semibold">.txt</span> file, or click to browse
            </p>
            <p className="mt-1 text-[11px] text-slate-400">
              Auto-optimized to 100–130 watch points with sharp corners preserved
            </p>
          </div>

          {/* Quick Sample Pills */}
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium text-slate-400">Quick start:</span>
            <button
              type="button"
              onClick={() => handleSampleClick('taipei-dino')}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-emerald-300 hover:bg-emerald-50/40 hover:text-emerald-800"
            >
              <Sparkles className="h-3.5 w-3.5 text-emerald-600" />
              <span>Try Taipei Dino</span>
            </button>
            <button
              type="button"
              onClick={() => handleSampleClick('no-route')}
              className="inline-flex min-h-[36px] items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50"
            >
              <Footprints className="h-3.5 w-3.5 text-slate-400" />
              <span>Free Walk</span>
            </button>
          </div>

          {/* Collapsible Paste Polyline */}
          <div className="border-t border-slate-100 pt-2.5">
            <button
              type="button"
              onClick={() => setPasteOpen((v) => !v)}
              aria-expanded={pasteOpen}
              className="flex min-h-[36px] w-full items-center justify-between rounded-lg px-1 py-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800"
            >
              <span className="flex items-center gap-1.5">
                <Type className="h-3.5 w-3.5 text-slate-400" />
                <span>Paste Polyline</span>
              </span>
              <ChevronDown
                className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                  pasteOpen ? 'rotate-180' : ''
                }`}
              />
            </button>

            {pasteOpen && (
              <form onSubmit={handleLoadPolyline} className="mt-2 space-y-2">
                <textarea
                  value={polylineInput}
                  onChange={(e) => setPolylineInput(e.target.value)}
                  rows={3}
                  placeholder="Paste an encoded Google Polyline string..."
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-600 focus:bg-white focus:outline-none"
                />
                <div className="flex justify-end">
                  <button
                    type="submit"
                    disabled={!polylineInput.trim()}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-[#122C64] px-3.5 text-xs font-medium text-white transition-colors hover:bg-[#0d214d] disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    <Compass className="h-3.5 w-3.5" />
                    <span>Load Polyline</span>
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
