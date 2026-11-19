import React from 'react';
import { Check, Copy, Map as MapIcon, Watch } from 'lucide-react';

interface MobileStickyBarProps {
  activeTab: 'map' | 'watch';
  onChangeTab: (tab: 'map' | 'watch') => void;
  onCopy: () => void;
  copied: boolean;
  hasRouteCode: boolean;
}

export const MobileStickyBar: React.FC<MobileStickyBarProps> = ({
  activeTab,
  onChangeTab,
  onCopy,
  copied,
  hasRouteCode,
}) => {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/90 bg-white/92 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-2xl items-center gap-2.5 px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        {/* Quick Map / Watch toggle */}
        <button
          type="button"
          onClick={() => onChangeTab(activeTab === 'map' ? 'watch' : 'map')}
          className="inline-flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-slate-50 px-3.5 text-sm font-medium text-slate-700 transition-colors active:bg-slate-100"
          aria-label={activeTab === 'map' ? 'Switch to Watch Preview' : 'Switch to Route Map'}
        >
          {activeTab === 'map' ? (
            <>
              <Watch className="h-4 w-4 text-slate-600" />
              <span>Watch</span>
            </>
          ) : (
            <>
              <MapIcon className="h-4 w-4 text-slate-600" />
              <span>Map</span>
            </>
          )}
        </button>

        {/* Primary Copy CTA */}
        <button
          type="button"
          onClick={onCopy}
          disabled={!hasRouteCode}
          className={`inline-flex h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all ${
            copied
              ? 'bg-emerald-700 text-white'
              : hasRouteCode
                ? 'bg-emerald-600 text-white active:bg-emerald-700'
                : 'cursor-not-allowed bg-slate-100 text-slate-400'
          }`}
        >
          {copied ? (
            <>
              <Check className="h-4 w-4" />
              <span>Copied Route Code!</span>
            </>
          ) : (
            <>
              <Copy className="h-4 w-4" />
              <span>Copy Route Code</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
