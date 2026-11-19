import React from 'react';
import { HelpCircle, Watch } from 'lucide-react';
import type { WatchProfile } from '../types/route';
import { WATCH_PROFILES } from '../data/watchProfiles';

interface HeaderProps {
  activeProfile: WatchProfile;
  onSelectProfile: (profileId: string) => void;
  onOpenGuide: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  activeProfile,
  onSelectProfile,
  onOpenGuide,
}) => {
  return (
    <header className="sticky top-0 z-30 border-b border-slate-200/80 bg-white/90 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-[1440px] items-center justify-between gap-3 px-4 sm:px-6 lg:h-16">
        {/* Brand */}
        <div className="flex min-w-0 items-center gap-3">
          <img
            src="./he-kim-koo-mark.svg"
            alt="He-Kim-Koo Firefly logo"
            className="h-10 w-10 shrink-0 object-contain sm:h-11 sm:w-11"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h1 className="truncate text-base font-semibold tracking-tight text-[#122C64] sm:text-lg">
                He-Kim-Koo
              </h1>
              <span className="hidden rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700 ring-1 ring-inset ring-emerald-600/15 sm:inline-block">
                Firefly
              </span>
            </div>
            <p className="hidden text-xs text-slate-500 md:block">
              Convert GPX tracks into Garmin watch route codes
            </p>
          </div>
        </div>

        {/* Right Controls */}
        <div className="flex shrink-0 items-center gap-2 sm:gap-3">
          {/* Watch Model Selector */}
          <div className="relative flex items-center">
            <Watch className="pointer-events-none absolute left-2.5 h-4 w-4 text-slate-400" />
            <select
              aria-label="Select Garmin watch model"
              value={activeProfile.id}
              onChange={(e) => onSelectProfile(e.target.value)}
              className="h-10 max-w-[155px] cursor-pointer appearance-none rounded-lg border border-slate-200 bg-slate-50 pl-8 pr-7 text-xs font-medium text-slate-700 transition-colors hover:border-slate-300 hover:bg-white focus:border-emerald-600 focus:bg-white focus:outline-none sm:h-9 sm:max-w-none sm:text-sm"
            >
              {WATCH_PROFILES.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name} · {p.screenSize}×{p.screenSize}
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

          {/* Setup Guide Trigger */}
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
