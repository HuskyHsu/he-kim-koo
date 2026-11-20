import React from 'react';
import { Check, Copy } from 'lucide-react';

interface MobileStickyBarProps {
  onCopy: () => void;
  copied: boolean;
  hasRouteCode: boolean;
}

export const MobileStickyBar: React.FC<MobileStickyBarProps> = ({
  onCopy,
  copied,
  hasRouteCode,
}) => {
  return (
    <div className="fixed inset-x-0 bottom-0 z-30 border-t border-slate-200/90 bg-white/92 backdrop-blur-md lg:hidden">
      <div className="mx-auto flex max-w-2xl items-center px-4 pt-2.5 pb-[max(0.625rem,env(safe-area-inset-bottom))]">
        {/* Primary Full-Width Copy CTA */}
        <button
          type="button"
          onClick={onCopy}
          disabled={!hasRouteCode}
          className={`inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-semibold transition-all ${
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
              <span>Copy Garmin Route Code</span>
            </>
          )}
        </button>
      </div>
    </div>
  );
};
