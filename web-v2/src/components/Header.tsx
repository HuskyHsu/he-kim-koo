import React from 'react';
import { HelpCircle } from 'lucide-react';

interface HeaderProps {
  onOpenGuide: () => void;
}

export const Header: React.FC<HeaderProps> = ({ onOpenGuide }) => {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:h-16">
        {/* Brand Lockup */}
        <div
          className="flex min-w-0 items-center gap-1.5 sm:gap-2"
          title="Hé-Kim-Koo — Firefly in Taiwanese"
        >
          <img
            src="./he-kim-koo-mark.svg"
            alt="Hé-Kim-Koo logo"
            className="h-9 w-9 shrink-0 object-contain sm:h-10 sm:w-10"
          />
          <div className="flex min-w-0 flex-col justify-center">
            <h1 className="font-brand whitespace-nowrap text-[20px] leading-none font-semibold tracking-[-0.01em] text-[#122C64] sm:text-[22px]">
              Hé-Kim-Koo
            </h1>
            <span className="mt-1 whitespace-nowrap text-[9.5px] leading-none font-semibold uppercase tracking-[0.22em] text-slate-400">
              Garmin Route
            </span>
          </div>
        </div>

        {/* Right Action */}
        <div className="flex shrink-0 items-center">
          <button
            type="button"
            onClick={onOpenGuide}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-600/20 sm:h-9 sm:text-sm"
          >
            <HelpCircle className="h-4 w-4 text-slate-500" />
            <span className="hidden sm:inline">Setup Guide</span>
            <span className="sm:hidden">Guide</span>
          </button>
        </div>
      </div>
    </header>
  );
};
