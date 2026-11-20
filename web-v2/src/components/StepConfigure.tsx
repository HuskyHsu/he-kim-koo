import React from 'react';
import { ArrowRight, ArrowLeftRight } from 'lucide-react';
import type { WatchSettings } from '../types/route';

interface StepConfigureProps {
  settings: WatchSettings;
  onChange: (patch: Partial<WatchSettings>) => void;
  disabled?: boolean;
}

export const StepConfigure: React.FC<StepConfigureProps> = ({
  settings,
  onChange,
  disabled = false,
}) => {
  return (
    <section className="rounded-2xl border border-slate-200/90 bg-white p-5 shadow-[0_1px_2px_rgba(15,23,42,0.04)]">
      {/* Step Header */}
      <div className="mb-3.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2.5">
          <span className="flex h-6 w-6 items-center justify-center rounded-full bg-slate-100 text-xs font-semibold text-[#122C64]">
            2
          </span>
          <h2 className="text-sm font-semibold tracking-tight text-slate-900">
            Route Direction
          </h2>
        </div>
        <span className="text-[11px] text-slate-400">Baked into Route Code</span>
      </div>

      {/* Direction Segmented Control */}
      <div
        className={`grid grid-cols-2 gap-1.5 rounded-xl border border-slate-200 bg-slate-50 p-1 ${
          disabled ? 'pointer-events-none opacity-50' : ''
        }`}
        role="radiogroup"
        aria-label="Route Direction"
      >
        <button
          type="button"
          role="radio"
          aria-checked={settings.routeDirection === 0}
          onClick={() => onChange({ routeDirection: 0 })}
          className={`flex min-h-[48px] flex-col items-center justify-center rounded-lg px-3 py-2 transition-all ${
            settings.routeDirection === 0
              ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200/80'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
            <ArrowRight className="h-3.5 w-3.5 text-emerald-600" />
            <span>Forward</span>
          </span>
          <span className="mt-0.5 text-[11px] text-slate-400">Start → End</span>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={settings.routeDirection === 1}
          onClick={() => onChange({ routeDirection: 1 })}
          className={`flex min-h-[48px] flex-col items-center justify-center rounded-lg px-3 py-2 transition-all ${
            settings.routeDirection === 1
              ? 'bg-white text-slate-900 shadow-xs ring-1 ring-slate-200/80'
              : 'text-slate-500 hover:text-slate-800'
          }`}
        >
          <span className="inline-flex items-center gap-1.5 text-xs font-semibold">
            <ArrowLeftRight className="h-3.5 w-3.5 text-emerald-600" />
            <span>Reverse</span>
          </span>
          <span className="mt-0.5 text-[11px] text-slate-400">End → Start</span>
        </button>
      </div>
    </section>
  );
};
