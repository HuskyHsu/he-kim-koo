import React, { useEffect } from 'react';
import { X, Upload, SlidersHorizontal, Smartphone, Watch } from 'lucide-react';

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
      className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:items-center sm:p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="setup-guide-title"
    >
      <div
        className="w-full max-w-lg rounded-t-2xl border border-slate-200 bg-white shadow-xl sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-100 px-6 py-4">
          <div>
            <h2 id="setup-guide-title" className="text-base font-semibold text-slate-900">
              How to Send Routes to Your Garmin Watch
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Works with the He-Kim-Koo Connect IQ DataField
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close setup guide"
            className="flex h-9 w-9 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Steps */}
        <div className="max-h-[75vh] space-y-5 overflow-y-auto px-6 py-5">
          <div className="flex gap-3.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <Upload className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                1. Import your GPX route
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Drop any <code className="rounded bg-slate-100 px-1 py-0.5 font-mono text-[11px]">.gpx</code> file
                from Strava, Garmin Connect, or Komoot. He-Kim-Koo automatically simplifies the
                track to 100–130 points while preserving sharp corners and route shape.
              </p>
            </div>
          </div>

          <div className="flex gap-3.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <SlidersHorizontal className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                2. Check direction &amp; watch zoom
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Verify your route on the street map. If you prefer running it backwards, switch to{' '}
                <strong className="font-medium text-slate-800">Reverse</strong> — the reversed order
                is baked directly into the generated Route Code.
              </p>
            </div>
          </div>

          <div className="flex gap-3.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <Smartphone className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                3. Paste into Garmin Connect IQ
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Tap <strong className="font-medium text-slate-800">Copy Garmin Route Code</strong>,
                then open the Garmin Connect IQ app on your phone:
              </p>
              <div className="mt-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                My Device → My Data Fields → He-Kim-Koo → Settings → Route String
              </div>
            </div>
          </div>

          <div className="flex gap-3.5">
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-emerald-50 text-emerald-700">
              <Watch className="h-4 w-4" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-slate-900">
                4. Save &amp; start your run
              </h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-600">
                Save the settings to sync over Bluetooth, then add the He-Kim-Koo DataField to a
                full-screen or split-screen layout in your Run or Walk activity.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex justify-end border-t border-slate-100 px-6 py-3.5">
          <button
            type="button"
            onClick={onClose}
            className="h-10 rounded-lg bg-[#122C64] px-5 text-sm font-medium text-white transition-colors hover:bg-[#0d214d]"
          >
            Got it
          </button>
        </div>
      </div>
    </div>
  );
};
