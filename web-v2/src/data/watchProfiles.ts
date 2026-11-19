import type { WatchProfile } from '../types/route';

export const WATCH_PROFILES: WatchProfile[] = [
  {
    id: 'venu2plus',
    name: 'Garmin Venu 2 Plus',
    series: 'Venu',
    status: 'active',
    screenSize: 416,
    shape: 'round',
    displayType: 'AMOLED',
    maxPoints: 130,
    layouts: [
      { label: 'Full Screen (416px)', height: 416 },
      { label: 'Split Half (208px)', height: 208 },
      { label: 'Split 1/3 (140px)', height: 140 },
    ],
  },
  {
    id: 'fr265',
    name: 'Forerunner 265',
    series: 'Forerunner',
    status: 'preview',
    screenSize: 416,
    shape: 'round',
    displayType: 'AMOLED',
    maxPoints: 130,
    layouts: [
      { label: 'Full Screen (416px)', height: 416 },
      { label: 'Split Half (208px)', height: 208 },
      { label: 'Split 1/3 (140px)', height: 140 },
    ],
  },
  {
    id: 'fr965',
    name: 'Forerunner 965',
    series: 'Forerunner',
    status: 'preview',
    screenSize: 454,
    shape: 'round',
    displayType: 'AMOLED',
    maxPoints: 130,
    layouts: [
      { label: 'Full Screen (454px)', height: 454 },
      { label: 'Split Half (227px)', height: 227 },
      { label: 'Split 1/3 (152px)', height: 152 },
    ],
  },
  {
    id: 'fenix7',
    name: 'Fenix 7',
    series: 'Fenix',
    status: 'preview',
    screenSize: 260,
    shape: 'round',
    displayType: 'MIP',
    maxPoints: 130,
    layouts: [
      { label: 'Full Screen (260px)', height: 260 },
      { label: 'Split Half (130px)', height: 130 },
      { label: 'Split 1/3 (88px)', height: 88 },
    ],
  },
];

export const DEFAULT_WATCH_PROFILE: WatchProfile = WATCH_PROFILES[0];

export function getWatchProfileById(id: string): WatchProfile {
  return WATCH_PROFILES.find((p) => p.id === id) ?? DEFAULT_WATCH_PROFILE;
}
