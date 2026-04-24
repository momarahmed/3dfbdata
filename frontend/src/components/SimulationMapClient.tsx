"use client";

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
};

type Props = { className?: string };

export const SimulationMapClient = forwardRef<SimulationMapHandle, Props>(function SimulationMapClient(
  _props,
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<any>(null);
  const routesLayerRef = useRef<any>(null);
  const vehiclesLayerRef = useRef<any>(null);
  const tracksRef = useRef<SimVehicleTrack[]>([]);
  const routeCoordsRef = useRef<Array<{ lng: number; lat: number }>>([]);
  const vehicleGraphicsRef = useRef<Map<string, any>>(new Map());
  const initPromiseRef = useRef<Promise<void> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    initPromiseRef.current = (async () => {
      const [{ default: Map }, { default: MapView }, { default: GraphicsLayer }] = await Promise.all([
        import("@arcgis/core/Map.js"),
        import("@arcgis/core/views/MapView.js"),
        import("@arcgis/core/layers/GraphicsLayer.js"),
      ]);

      const routesLayer = new GraphicsLayer({ id: "sim-routes", title: "Simulated routes" });
      const vehiclesLayer = new GraphicsLayer({ id: "sim-vehicles", title: "Vehicles" });

      const map = new Map({
        basemap: "streets-navigation-vector",
        layers: [routesLayer, vehiclesLayer],
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
    }),
    []
  );

  return <div ref={containerRef} style={{ position: "absolute", inset: 0 }} />;
});
