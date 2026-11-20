import React, { useEffect } from 'react';
import { X, Upload, ArrowLeftRight, Smartphone, Watch } from 'lucide-react';

interface SetupGuideModalProps {
  open: boolean;
  onClose: () => void;
}

export const SetupGuideModal: React.FC<SetupGuideModalProps> = ({ open, onClose }) => {
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-[2px] sm:p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-guide-title"
    >
      <div
        className="flex max-h-[82dvh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
          <div className="min-w-0">
            <h2 id="setup-guide-title" className="text-[15px] font-semibold text-slate-900">
              Send Routes to Your Watch
            </h2>
            <p className="mt-0.5 text-xs text-slate-400">
              Hé-Kim-Koo Connect IQ DataField
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close setup guide"
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Steps */}
        <div className="subtle-scroll flex-1 space-y-4 overflow-y-auto px-5 py-4">
          <div className="flex gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <Upload className="h-3.5 w-3.5" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-slate-900">
                1. Import a GPX file
              </h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Drop any <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px] text-slate-700">.gpx</code> track. It is automatically simplified to 100–130 points while keeping sharp corners intact.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <ArrowLeftRight className="h-3.5 w-3.5" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-slate-900">
                2. Check route &amp; direction
              </h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Inspect the route on the map and switch to{' '}
                <span className="font-medium text-slate-700">Reverse</span> if you prefer running backwards.
              </p>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <Smartphone className="h-3.5 w-3.5" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="text-[13px] font-semibold text-slate-900">
                3. Paste into Garmin Connect IQ
              </h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Copy the Route Code, then open Garmin Connect IQ:
              </p>
              <div className="mt-2 rounded-lg border border-slate-200/80 bg-slate-50 px-3 py-2 text-[11px] leading-relaxed font-medium text-slate-700">
                My Device → My Data Fields → He-Kim-Koo → Settings → Route String
              </div>
            </div>
          </div>

          <div className="flex gap-3">
            <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <Watch className="h-3.5 w-3.5" />
            </div>
            <div>
              <h3 className="text-[13px] font-semibold text-slate-900">
                4. Save &amp; run
              </h3>
              <p className="mt-0.5 text-xs leading-relaxed text-slate-500">
                Save to sync over Bluetooth, then launch your Run or Walk activity with the DataField enabled.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="shrink-0 border-t border-slate-100 px-5 py-3">
          <button
            type="button"
            onClick={onClose}
            className="h-10 w-full rounded-xl bg-[#122C64] text-sm font-medium text-white transition-colors hover:bg-[#0d214d] sm:ml-auto sm:block sm:w-auto sm:px-5"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
