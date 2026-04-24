"use client";
/* eslint-disable @typescript-eslint/no-explicit-any -- ArcGIS JS API uses untyped object shapes for layers, graphics, and symbols */

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
// Static imports keep Graphic/Extent in this module’s chunk. Lazy-loading
// `@arcgis/core/Graphic` as a separate split chunk is prone to “Loading chunk
// … Graphic_js failed” in dev (HMR) and on slow networks.
import Graphic from "@arcgis/core/Graphic";
import Extent from "@arcgis/core/geometry/Extent";

export type SimVehicleState = {
  vehicleId: string;
  lng: number;
  lat: number;
  headingDeg: number;
  speedKmh: number;
  visible: boolean;
};

export type SimVehicleTrack = {
  vehicleId: string;
  color: [number, number, number];
  points: Array<{ lng: number; lat: number }>;
};

export type SimRouteSpec = {
  routeId: string;
  color: [number, number, number];
  coords: Array<{ lng: number; lat: number }>;
};

export type SimVehicleSpec = {
  vehicleId: string;
  color: [number, number, number];
  start: { lng: number; lat: number };
  label?: string;
};

/** Toggles for PostGIS feature layers drawn under the sim route/vehicles. */
export type SimMapOverlayItem = {
  id: string;
  name: string;
  url: string;
  visible: boolean;
  geometry_type: string | null;
  color: [number, number, number];
};

export type SimulationMapHandle = {
  /** Legacy per-vehicle track API (one polyline per track). */
  setTracks: (tracks: SimVehicleTrack[]) => Promise<void>;
  /** Draw the shared route polyline once. Replaces any previous route. */
  setRoute: (route: SimRouteSpec) => Promise<void>;
  /** Create markers for each vehicle at its starting coordinate. */
  setVehicles: (vehicles: SimVehicleSpec[]) => Promise<void>;
  updateVehicle: (state: SimVehicleState) => void;
  clearVehicles: () => void;
  /** Recenter to either the current tracks or the current route. */
  recenterOnTracks: () => Promise<void>;
  /** Fit the view to an arbitrary WGS84 point set (e.g. all streamed samples). */
  recenterToCoordinates: (coords: Array<{ lng: number; lat: number }>) => Promise<void>;
  /** Add/remove PostGIS feature layers (GeoJSON). Hidden items are not kept in the map. */
  syncMapOverlays: (items: SimMapOverlayItem[]) => Promise<void>;
};

type Props = { className?: string };

const ARcgisAssetsBase = "https://cdn.jsdelivr.net/npm/@arcgis/core@5.0.18/assets";

function rendererForGeometryType(
  geometryType: string | null,
  color: [number, number, number]
): { type: "simple"; symbol: object } {
  const g = (geometryType || "").toUpperCase();
  const isPoint = g.includes("POINT");
  const isLine = g.includes("LINE");
  const [r, g0, b] = color;
  if (isPoint) {
    return {
      type: "simple" as const,
      symbol: {
        type: "simple-marker" as const,
        color: [r, g0, b, 0.9],
        size: 6,
        outline: { color: [15, 23, 42, 0.9], width: 1 },
      },
    };
  }
  if (isLine) {
    return {
      type: "simple" as const,
      symbol: {
        type: "simple-line" as const,
        color: [r, g0, b, 0.9],
        width: 2.5,
      },
    };
  }
  return {
    type: "simple" as const,
    symbol: {
      type: "simple-fill" as const,
      color: [r, g0, b, 0.28],
      outline: { color: [r, g0, b, 0.95], width: 2 },
    },
  };
}

const sameColor = (a: [number, number, number], b: [number, number, number]) =>
  a[0] === b[0] && a[1] === b[1] && a[2] === b[2];

export const SimulationMapClient = forwardRef<SimulationMapHandle, Props>(function SimulationMapClient(
  _props,
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<any>(null);
  const routesLayerRef = useRef<any>(null);
  const vehiclesLayerRef = useRef<any>(null);
  const catalogGroupRef = useRef<any>(null);
  const overlayLayersRef = useRef<
    Map<
      string,
      { layer: any; lastUrl: string; color: [number, number, number]; geometryType: string | null }
    >
  >(new Map());
  const tracksRef = useRef<SimVehicleTrack[]>([]);
  const routeCoordsRef = useRef<Array<{ lng: number; lat: number }>>([]);
  const vehicleGraphicsRef = useRef<Map<string, any>>(new Map());
  const initPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    initPromiseRef.current = (async () => {
      const esriConfig = (await import("@arcgis/core/config.js")).default;
      esriConfig.assetsPath = ARcgisAssetsBase;
      if (process.env.NEXT_PUBLIC_ARCGIS_API_KEY) {
        esriConfig.apiKey = process.env.NEXT_PUBLIC_ARCGIS_API_KEY;
      }

      const [
        { default: Map },
        { default: MapView },
        { default: GraphicsLayer },
        { default: GroupLayer },
      ] = await Promise.all([
        import("@arcgis/core/Map.js"),
        import("@arcgis/core/views/MapView.js"),
        import("@arcgis/core/layers/GraphicsLayer.js"),
        import("@arcgis/core/layers/GroupLayer.js"),
      ]);

      const catalogGroup = new GroupLayer({
        id: "postgis-feature-layers",
        title: "PostGIS feature layers",
        visibilityMode: "independent" as any,
        listMode: "show" as any,
      });
      catalogGroupRef.current = catalogGroup;
      const routesLayer = new GraphicsLayer({ id: "sim-routes", title: "Simulated routes" });
      const vehiclesLayer = new GraphicsLayer({ id: "sim-vehicles", title: "Vehicles" });

      const map = new Map({
        basemap: "streets-navigation-vector",
        layers: [catalogGroup, routesLayer, vehiclesLayer],
      });

      const view = new MapView({
        container: containerRef.current!,
        map,
        center: [46.6753, 24.7136],
        zoom: 13,
      });

      await view.when();

      viewRef.current = view;
      routesLayerRef.current = routesLayer;
      vehiclesLayerRef.current = vehiclesLayer;
    })();

    return () => {
      const v = viewRef.current;
      if (v) {
        try { v.destroy(); } catch { /* noop */ }
      }
      for (const [, o] of overlayLayersRef.current) {
        try {
          o.layer.destroy();
        } catch {
          /* noop */
        }
      }
      overlayLayersRef.current.clear();
      catalogGroupRef.current = null;

      viewRef.current = null;
      routesLayerRef.current = null;
      vehiclesLayerRef.current = null;
      vehicleGraphicsRef.current.clear();
      tracksRef.current = [];
      routeCoordsRef.current = [];
    };
  }, []);

  useImperativeHandle(
    ref,
    (): SimulationMapHandle => ({
      async setRoute(route) {
        await initPromiseRef.current;
        const routes = routesLayerRef.current;
        if (!routes) return;
        routes.removeAll();
        if (route.coords.length > 1) {
          routes.add(
            new Graphic({
              geometry: {
                type: "polyline",
                paths: [route.coords.map((p) => [p.lng, p.lat])],
                spatialReference: { wkid: 4326 },
              } as any,
              symbol: {
                type: "simple-line",
                color: [...route.color, 0.95],
                width: 4,
              } as any,
              attributes: { route_id: route.routeId, kind: "route" },
            })
          );
        }
        routeCoordsRef.current = route.coords;
      },
      async setVehicles(vehicles) {
        await initPromiseRef.current;
        const vehiclesLayer = vehiclesLayerRef.current;
        if (!vehiclesLayer) return;
        vehiclesLayer.removeAll();
        vehicleGraphicsRef.current.clear();

        for (const v of vehicles) {
          const marker = new Graphic({
            geometry: {
              type: "point",
              longitude: v.start.lng,
              latitude: v.start.lat,
              spatialReference: { wkid: 4326 },
            } as any,
            symbol: {
              type: "simple-marker",
              style: "triangle",
              color: [...v.color, 1],
              size: 14,
              outline: { color: [15, 23, 42, 1], width: 1.5 },
              angle: 0,
            } as any,
            attributes: {
              vehicle_id: v.vehicleId,
              label: v.label ?? v.vehicleId,
              kind: "vehicle",
              speed_kmh: 0,
              heading_deg: 0,
            },
            popupTemplate: {
              title: v.label ?? `Vehicle ${v.vehicleId}`,
              content: [
                {
                  type: "fields",
                  fieldInfos: [
                    { fieldName: "speed_kmh", label: "Speed (km/h)" },
                    { fieldName: "heading_deg", label: "Heading (°)" },
                    { fieldName: "vehicle_id", label: "ID" },
                  ],
                },
              ],
            } as any,
          });
          vehiclesLayer.add(marker);
          vehicleGraphicsRef.current.set(v.vehicleId, marker);
        }
      },
      async setTracks(tracks) {
        await initPromiseRef.current;
        const view = viewRef.current;
        const routes = routesLayerRef.current;
        const vehicles = vehiclesLayerRef.current;
        if (!view || !routes || !vehicles) return;

        routes.removeAll();
        vehicles.removeAll();
        vehicleGraphicsRef.current.clear();

        for (const track of tracks) {
          if (track.points.length > 1) {
            routes.add(
              new Graphic({
                geometry: {
                  type: "polyline",
                  paths: [track.points.map((p) => [p.lng, p.lat])],
                  spatialReference: { wkid: 4326 },
                } as any,
                symbol: {
                  type: "simple-line",
                  color: [...track.color, 0.9],
                  width: 3,
                } as any,
                attributes: { vehicle_id: track.vehicleId, kind: "route" },
              })
            );
          }

          const marker = new Graphic({
            geometry: {
              type: "point",
              longitude: track.points[0]?.lng ?? 0,
              latitude: track.points[0]?.lat ?? 0,
              spatialReference: { wkid: 4326 },
            } as any,
            symbol: {
              type: "simple-marker",
              style: "triangle",
              color: [...track.color, 1],
              size: 14,
              outline: { color: [15, 23, 42, 1], width: 1.5 },
              angle: 0,
            } as any,
            attributes: {
              vehicle_id: track.vehicleId,
              kind: "vehicle",
              speed_kmh: 0,
              heading_deg: 0,
              timestamp: null,
            },
            popupTemplate: {
              title: `Vehicle ${track.vehicleId}`,
              content: [
                {
                  type: "fields",
                  fieldInfos: [
                    { fieldName: "speed_kmh", label: "Speed (km/h)" },
                    { fieldName: "heading_deg", label: "Heading (°)" },
                    { fieldName: "timestamp", label: "Timestamp" },
                  ],
                },
              ],
            } as any,
          });
          vehicles.add(marker);
          vehicleGraphicsRef.current.set(track.vehicleId, marker);
        }

        tracksRef.current = tracks;
      },
      updateVehicle(state) {
        const marker = vehicleGraphicsRef.current.get(state.vehicleId);
        if (!marker) return;
        marker.visible = state.visible;
        if (!state.visible) return;
        marker.geometry = {
          type: "point",
          longitude: state.lng,
          latitude: state.lat,
          spatialReference: { wkid: 4326 },
        } as any;
        const symbol = marker.symbol?.clone?.();
        if (symbol) {
          symbol.angle = state.headingDeg;
          marker.symbol = symbol;
        }
        marker.attributes = {
          ...marker.attributes,
          speed_kmh: Math.round(state.speedKmh * 10) / 10,
          heading_deg: Math.round(state.headingDeg * 10) / 10,
        };
      },
      clearVehicles() {
        const routes = routesLayerRef.current;
        const vehicles = vehiclesLayerRef.current;
        routes?.removeAll();
        vehicles?.removeAll();
        vehicleGraphicsRef.current.clear();
        tracksRef.current = [];
        routeCoordsRef.current = [];
      },
      async recenterOnTracks() {
        await initPromiseRef.current;
        const view = viewRef.current;
        if (!view) return;

        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
        const consume = (p: { lng: number; lat: number }) => {
          if (p.lng < minLng) minLng = p.lng;
          if (p.lat < minLat) minLat = p.lat;
          if (p.lng > maxLng) maxLng = p.lng;
          if (p.lat > maxLat) maxLat = p.lat;
        };
        for (const t of tracksRef.current) {
          for (const p of t.points) consume(p);
        }
        for (const p of routeCoordsRef.current) consume(p);
        if (!isFinite(minLng)) return;
        const extent = new Extent({
          xmin: minLng,
          ymin: minLat,
          xmax: maxLng,
          ymax: maxLat,
          spatialReference: { wkid: 4326 } as any,
        });
        try {
          await view.goTo(extent.expand(1.4));
        } catch { /* ignore cancel */ }
      },
      async recenterToCoordinates(coords) {
        await initPromiseRef.current;
        const view = viewRef.current;
        if (!view || coords.length === 0) return;
        let minLng = Infinity, minLat = Infinity, maxLng = -Infinity, maxLat = -Infinity;
        for (const p of coords) {
          if (p.lng < minLng) minLng = p.lng;
          if (p.lat < minLat) minLat = p.lat;
          if (p.lng > maxLng) maxLng = p.lng;
          if (p.lat > maxLat) maxLat = p.lat;
        }
        if (minLng === maxLng) {
          const pad = 0.01;
          minLng -= pad;
          maxLng += pad;
        }
        if (minLat === maxLat) {
          const pad = 0.01;
          minLat -= pad;
          maxLat += pad;
        }
        const extent = new Extent({
          xmin: minLng,
          ymin: minLat,
          xmax: maxLng,
          ymax: maxLat,
          spatialReference: { wkid: 4326 } as any,
        });
        try {
          await view.goTo(extent.expand(1.4));
        } catch { /* ignore cancel */ }
      },
      async syncMapOverlays(items) {
        await initPromiseRef.current;
        const g = catalogGroupRef.current;
        if (!g) return;

        const { default: GeoJSONLayer } = await import("@arcgis/core/layers/GeoJSONLayer.js");

        const wantVisible = items.filter((i) => i.visible);
        const wantIds = new Set(wantVisible.map((i) => i.id));

        for (const [id, entry] of [...overlayLayersRef.current.entries()]) {
          if (!wantIds.has(id)) {
            try {
              g.layers.remove(entry.layer);
            } catch {
              /* noop */
            }
            try {
              entry.layer.destroy();
            } catch {
              /* noop */
            }
            overlayLayersRef.current.delete(id);
          }
        }

        for (const it of wantVisible) {
          const prev = overlayLayersRef.current.get(it.id);
          if (
            prev
            && prev.lastUrl === it.url
            && sameColor(prev.color, it.color)
            && (prev.geometryType ?? null) === (it.geometry_type ?? null)
          ) {
            continue;
          }
          if (prev) {
            try {
              g.layers.remove(prev.layer);
            } catch {
              /* noop */
            }
            try {
              prev.layer.destroy();
            } catch {
              /* noop */
            }
            overlayLayersRef.current.delete(it.id);
          }
          const lyr = new GeoJSONLayer({
            id: `fl-overlay-${it.id}`,
            url: it.url,
            title: it.name,
            copyright: "PostGIS",
            renderer: rendererForGeometryType(it.geometry_type, it.color) as any,
            popupTemplate: {
              title: it.name,
              content: "{*}",
            } as any,
          });
          g.layers.add(lyr);
          overlayLayersRef.current.set(it.id, {
            layer: lyr,
            lastUrl: it.url,
            color: it.color,
            geometryType: it.geometry_type,
          });
        }
      },
    }),
    []
  );

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
});
