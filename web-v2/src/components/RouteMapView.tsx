import React, { useEffect, useRef, useState, useCallback } from 'react';
import maplibregl from 'maplibre-gl';
import { LocateFixed, Minus, Plus, Footprints } from 'lucide-react';
import type { RouteData } from '../types/route';
import { buildRouteGeoJson } from '../lib/gpx-engine';

interface RouteMapViewProps {
  route: RouteData | null;
  direction: 0 | 1;
}

type BasemapId = 'street' | 'voyager' | 'light';

function createBasemapStyle(
  initialBasemap: BasemapId,
  cartoApiKey?: string,
): maplibregl.StyleSpecification {
  const sources: maplibregl.StyleSpecification['sources'] = {
    osm: {
      type: 'raster',
      tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors',
    },
  };

  const layers: maplibregl.LayerSpecification[] = [
    {
      id: 'basemap-street-layer',
      type: 'raster',
      source: 'osm',
      minzoom: 0,
      maxzoom: 19,
      layout: {
        visibility: initialBasemap === 'street' ? 'visible' : 'none',
      },
    },
  ];

  if (cartoApiKey) {
    const encodedKey = encodeURIComponent(cartoApiKey);
    sources['carto-voyager'] = {
      type: 'raster',
      tiles: [
        `https://a.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png?key=${encodedKey}`,
        `https://b.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png?key=${encodedKey}`,
        `https://c.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}@2x.png?key=${encodedKey}`,
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    };

    sources['carto-light'] = {
      type: 'raster',
      tiles: [
        `https://a.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}@2x.png?key=${encodedKey}`,
        `https://b.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}@2x.png?key=${encodedKey}`,
        `https://c.basemaps.cartocdn.com/rastertiles/light_all/{z}/{x}/{y}@2x.png?key=${encodedKey}`,
      ],
      tileSize: 256,
      attribution: '&copy; OpenStreetMap contributors &copy; CARTO',
    };

    layers.push(
      {
        id: 'basemap-voyager-layer',
        type: 'raster',
        source: 'carto-voyager',
        minzoom: 0,
        maxzoom: 20,
        layout: {
          visibility: initialBasemap === 'voyager' ? 'visible' : 'none',
        },
      },
      {
        id: 'basemap-light-layer',
        type: 'raster',
        source: 'carto-light',
        minzoom: 0,
        maxzoom: 20,
        layout: {
          visibility: initialBasemap === 'light' ? 'visible' : 'none',
        },
      },
    );
  }

  return {
    version: 8,
    sources,
    layers,
  };
}

function createArrowImage(): { width: number; height: number; data: Uint8Array } {
  const size = 28;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, size, size);
    // Crisp white halo + emerald chevron pointing up (north = 0 deg)
    ctx.translate(size / 2, size / 2);
    ctx.beginPath();
    ctx.moveTo(0, -8);
    ctx.lineTo(7, 5);
    ctx.lineTo(0, 2);
    ctx.lineTo(-7, 5);
    ctx.closePath();
    ctx.fillStyle = '#059669';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.4;
    ctx.lineJoin = 'round';
    ctx.stroke();
    ctx.fill();
  }
  const imgData = ctx?.getImageData(0, 0, size, size);
  return {
    width: size,
    height: size,
    data: imgData ? new Uint8Array(imgData.data.buffer) : new Uint8Array(size * size * 4),
  };
}

export const RouteMapView: React.FC<RouteMapViewProps> = ({ route, direction }) => {
  const cartoApiKey = import.meta.env.VITE_CARTO_API_KEY?.trim() || undefined;
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<maplibregl.Map | null>(null);
  const lastFittedRouteIdRef = useRef<string | null>(null);
  const [basemap, setBasemap] = useState<BasemapId>('street');
  const [mapReady, setMapReady] = useState(false);

  const hasTrack = Boolean(route && !route.isNoRoute && route.simpPoints.length > 0);

  const fitToRoute = useCallback(
    (animate = true) => {
      const map = mapRef.current;
      if (!map || !route || route.isNoRoute || route.simpPoints.length === 0) return;

      const pts = route.origPoints.length > 0 ? route.origPoints : route.simpPoints;
      const bounds = new maplibregl.LngLatBounds();
      for (const p of pts) {
        bounds.extend([p.lon, p.lat]);
      }
      if (!bounds.isEmpty()) {
        map.fitBounds(bounds, {
          padding: { top: 56, right: 56, bottom: 56, left: 56 },
          maxZoom: 16.5,
          duration: animate ? 500 : 0,
        });
      }
    },
    [route],
  );

  // Sync GeoJSON sources & layers onto current map style
  const applyRouteLayers = useCallback(
    (map: maplibregl.Map) => {
      const orig = route && !route.isNoRoute ? route.origPoints : [];
      const simp = route && !route.isNoRoute ? route.simpPoints : [];
      const geo = buildRouteGeoJson(orig, simp, direction);

      if (!map.hasImage('route-arrow')) {
        map.addImage('route-arrow', createArrowImage(), { pixelRatio: 2 });
      }

      type GeoJsonData = Parameters<maplibregl.GeoJSONSource['setData']>[0];
      const upsertSource = (id: string, data: GeoJsonData) => {
        const existing = map.getSource(id) as maplibregl.GeoJSONSource | undefined;
        if (existing) {
          existing.setData(data);
        } else {
          map.addSource(id, { type: 'geojson', data });
        }
      };

      upsertSource('raw-track', geo.rawLine as unknown as GeoJsonData);
      upsertSource('simp-track', geo.simpLine as unknown as GeoJsonData);
      upsertSource('direction-arrows', geo.directionArrows as unknown as GeoJsonData);
      upsertSource('start-point', geo.startPoint as unknown as GeoJsonData);
      upsertSource('end-point', geo.endPoint as unknown as GeoJsonData);

      if (!map.getLayer('raw-track-layer')) {
        map.addLayer({
          id: 'raw-track-layer',
          type: 'line',
          source: 'raw-track',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#64748B',
            'line-width': 2,
            'line-dasharray': [2.5, 2.5],
            'line-opacity': 0.55,
          },
        });
      }

      if (!map.getLayer('simp-track-casing')) {
        map.addLayer({
          id: 'simp-track-casing',
          type: 'line',
          source: 'simp-track',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#FFFFFF',
            'line-width': 6.5,
            'line-opacity': 0.9,
          },
        });
      }

      if (!map.getLayer('simp-track-layer')) {
        map.addLayer({
          id: 'simp-track-layer',
          type: 'line',
          source: 'simp-track',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: {
            'line-color': '#059669',
            'line-width': 3.8,
            'line-opacity': 0.96,
          },
        });
      }

      if (!map.getLayer('direction-arrows-layer')) {
        map.addLayer({
          id: 'direction-arrows-layer',
          type: 'symbol',
          source: 'direction-arrows',
          layout: {
            'icon-image': 'route-arrow',
            'icon-size': 1,
            'icon-rotate': ['get', 'bearing'],
            'icon-rotation-alignment': 'map',
            'icon-allow-overlap': true,
            'icon-ignore-placement': true,
          },
        });
      }

      if (!map.getLayer('end-point-layer')) {
        map.addLayer({
          id: 'end-point-layer',
          type: 'circle',
          source: 'end-point',
          paint: {
            'circle-radius': 6.5,
            'circle-color': '#DC2626',
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 2.5,
          },
        });
      }

      if (!map.getLayer('start-point-layer')) {
        map.addLayer({
          id: 'start-point-layer',
          type: 'circle',
          source: 'start-point',
          paint: {
            'circle-radius': 7,
            'circle-color': '#059669',
            'circle-stroke-color': '#FFFFFF',
            'circle-stroke-width': 2.5,
          },
        });
      }
    },
    [route, direction],
  );

  // Initialize MapLibre once
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const isTouch =
      typeof window !== 'undefined' &&
      ('ontouchstart' in window || navigator.maxTouchPoints > 0);

    const map = new maplibregl.Map({
      container,
      style: createBasemapStyle('street', cartoApiKey),
      center: [121.535, 25.04],
      zoom: 13,
      cooperativeGestures: isTouch,
      attributionControl: { compact: true },
    });

    mapRef.current = map;

    map.on('load', () => {
      setMapReady(true);
    });

    const ro = new ResizeObserver(() => {
      map.resize();
    });
    ro.observe(container);

    return () => {
      ro.disconnect();
      map.remove();
      mapRef.current = null;
      lastFittedRouteIdRef.current = null;
      setMapReady(false);
    };
  }, []);

  // Toggle basemap layer visibility in place — preserves all route sources/layers with zero flicker
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    const layerMap: Record<BasemapId, string> = {
      street: 'basemap-street-layer',
      voyager: 'basemap-voyager-layer',
      light: 'basemap-light-layer',
    };

    for (const [id, layerId] of Object.entries(layerMap) as [BasemapId, string][]) {
      if (map.getLayer(layerId)) {
        map.setLayoutProperty(layerId, 'visibility', basemap === id ? 'visible' : 'none');
      }
    }
  }, [basemap, mapReady]);

  // Update route GeoJSON whenever route or direction changes
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapReady) return;

    applyRouteLayers(map);

    const currentRouteId = route && !route.isNoRoute ? route.id : null;
    if (currentRouteId && lastFittedRouteIdRef.current !== currentRouteId) {
      lastFittedRouteIdRef.current = currentRouteId;
      fitToRoute(false);
    }
  }, [route, direction, mapReady, applyRouteLayers, fitToRoute]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-100">
      <div ref={containerRef} className="h-full w-full" />

      {/* Top-Left: Basemap Switcher */}
      {cartoApiKey && (
        <div className="absolute top-3 left-3 z-10 inline-flex rounded-xl border border-slate-200/90 bg-white/95 p-1 shadow-xs backdrop-blur-xs">
          {(
            [
              { id: 'street', label: 'OSM' },
              { id: 'voyager', label: 'Voyager' },
              { id: 'light', label: 'Light' },
            ] as const
          ).map((option) => (
            <button
              key={option.id}
              type="button"
              onClick={() => setBasemap(option.id)}
              className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors ${
                basemap === option.id
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
              }`}
            >
              {option.label}
            </button>
          ))}
        </div>
      )}

      {/* Top-Right: Zoom & Fit Controls */}
      <div className="absolute top-3 right-3 z-10 flex flex-col gap-1.5">
        <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200/90 bg-white/95 shadow-xs backdrop-blur-xs">
          <button
            type="button"
            onClick={() => mapRef.current?.zoomIn({ duration: 200 })}
            aria-label="Zoom in"
            className="flex h-9 w-9 items-center justify-center text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Plus className="h-4 w-4" />
          </button>
          <div className="h-px bg-slate-200/80" />
          <button
            type="button"
            onClick={() => mapRef.current?.zoomOut({ duration: 200 })}
            aria-label="Zoom out"
            className="flex h-9 w-9 items-center justify-center text-slate-700 transition-colors hover:bg-slate-100"
          >
            <Minus className="h-4 w-4" />
          </button>
        </div>

        {hasTrack && (
          <button
            type="button"
            onClick={() => fitToRoute(true)}
            aria-label="Fit map to route"
            title="Fit to route"
            className="flex h-9 w-9 items-center justify-center rounded-xl border border-slate-200/90 bg-white/95 text-slate-700 shadow-xs backdrop-blur-xs transition-colors hover:bg-slate-100"
          >
            <LocateFixed className="h-4 w-4" />
          </button>
        )}
      </div>

      {/* Bottom-Left: Minimal Legend */}
      {hasTrack && (
        <div className="pointer-events-none absolute bottom-3 left-3 z-10 flex flex-wrap items-center gap-x-3.5 gap-y-1 rounded-xl border border-slate-200/80 bg-white/92 px-3 py-1.5 text-[11px] font-medium text-slate-600 shadow-xs backdrop-blur-xs">
          <span className="flex items-center gap-1.5">
            <span className="h-1 w-3.5 rounded-full bg-emerald-600" />
            Watch Route
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-0.5 w-3.5 border-t-2 border-dashed border-slate-400" />
            Raw GPX
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-white bg-emerald-600 ring-1 ring-slate-200" />
            Start
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full border-2 border-white bg-red-600 ring-1 ring-slate-200" />
            End
          </span>
        </div>
      )}

      {/* Empty State for Free Walk / No Route */}
      {!hasTrack && (
        <div className="absolute inset-0 z-20 flex items-center justify-center bg-slate-50/75 p-6 backdrop-blur-[1px]">
          <div className="max-w-xs rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
            <div className="mx-auto flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-slate-500">
              <Footprints className="h-5 w-5" />
            </div>
            <h3 className="mt-3 text-sm font-semibold text-slate-900">
              Free Walk Mode
            </h3>
            <p className="mt-1 text-xs leading-relaxed text-slate-500">
              No preset route is loaded. Your watch will record a live GPS breadcrumb trail as you
              move — switch to <span className="font-medium text-slate-700">Watch Preview</span> to
              test it.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};
