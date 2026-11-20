import React, { useState } from 'react';
import { Check, ChevronDown, Code2, Copy } from 'lucide-react';

interface StepExportProps {
  routeCode: string;
  isNoRoute?: boolean;
  pointCount: number;
  direction: 0 | 1;
  onCopy: () => void;
  copied: boolean;
}

export const StepExport: React.FC<StepExportProps> = ({
  routeCode,
  isNoRoute = false,
  pointCount,
  direction,
  onCopy,
  copied,
}) => {
  const [showRaw, setShowRaw] = useState(false);
  const hasCode = !isNoRoute && routeCode.length > 0;

  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {/* Step Header */}
      <div className="mb-4 flex items-center justify-between">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-[#122C64]">
            3
          </span>
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">
            Send to Watch
          </h2>
        </div>
        {hasCode && (
          <span className="text-[11px] font-medium text-slate-400 tabular-nums">
            {routeCode.length} chars · {direction === 1 ? 'Reversed' : 'Forward'}
          </span>
        )}
      </div>

      {/* Primary Copy CTA (desktop only; mobile uses the fixed bottom MobileStickyBar) */}
      <button
        type="button"
        onClick={onCopy}
        disabled={!hasCode}
        className={`hidden h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all lg:flex ${
          copied
            ? 'bg-emerald-700 text-white shadow-xs'
            : hasCode
              ? 'bg-emerald-600 text-white shadow-xs hover:bg-emerald-700 active:scale-[0.99]'
              : 'cursor-not-allowed bg-slate-100 text-slate-400'
        }`}
      >
        {copied ? (
          <>
            <Check className="h-4 w-4" />
            <span>Copied to Clipboard!</span>
          </>
        ) : (
          <>
            <Copy className="h-4 w-4" />
            <span>
              {isNoRoute ? 'No Route Code Needed (Free Walk)' : 'Copy Garmin Route Code'}
            </span>
          </>
        )}
      </button>

      {/* Concise 1-line Garmin Connect hint */}
      <p className="text-left text-xs text-slate-500 lg:mt-3 lg:text-center">
        {isNoRoute ? (
          <>Leave <span className="font-medium text-slate-700">Route String</span> empty in Garmin Connect for Free Walk mode.</>
        ) : (
          <>Garmin Connect → He-Kim-Koo → Settings → Route String</>
        )}
      </p>

      {/* Collapsible Raw Code Drawer */}
      {hasCode && (
        <div className="mt-3.5 border-t border-slate-100 pt-2.5">
          <button
            type="button"
            onClick={() => setShowRaw((v) => !v)}
            aria-expanded={showRaw}
            className="flex min-h-[36px] w-full items-center justify-between rounded-lg px-1 py-1 text-xs font-medium text-slate-500 transition-colors hover:text-slate-800"
          >
            <span className="flex items-center gap-1.5">
              <Code2 className="h-3.5 w-3.5 text-slate-400" />
              <span>View raw code ({pointCount} pts)</span>
            </span>
            <ChevronDown
              className={`h-4 w-4 text-slate-400 transition-transform duration-200 ${
                showRaw ? 'rotate-180' : ''
              }`}
            />
          </button>

          {showRaw && (
            <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <pre className="max-h-28 overflow-y-auto break-all whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-600 select-all">
                {routeCode}
              </pre>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
