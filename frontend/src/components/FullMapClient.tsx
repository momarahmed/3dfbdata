"use client";

import { Box, Typography } from "@mui/material";
import { useCallback, useEffect, useImperativeHandle, useRef, useState, forwardRef } from "react";
import { apiFetch, getApiBase, getToken } from "@/lib/api";
import { addBasemapToggleToView } from "@/lib/arcgisBasemapToggle";

export type UserLayer = {
  id: string;
  name: string;
  geojson_url: string;
  geometry_type?: string | null;
};

export type ExternalLayer = {
  id: string;
  name: string;
  url: string;
  type: "FeatureLayer" | "MapImageLayer" | "TileLayer" | "VectorTileLayer" | "WMS";
};

export type FullMapHandle = {
  startCreateDestination: () => void;
  startEditDestination: (id: string) => void;
  deleteDestination: (id: string) => Promise<void>;
  refreshDestinations: () => Promise<void>;
  startCreateDistanation: () => void;
  startEditDistanation: (id: string) => void;
  deleteDistanation: (id: string) => Promise<void>;
  refreshDistanations: () => Promise<void>;
  setLayerVisible: (layerKey: string, visible: boolean) => void;
  zoomToLayer: (layerKey: string) => void;
};

type Props = {
  userLayers: UserLayer[];
  externalLayers: ExternalLayer[];
  selectedUserIds: string[];
  selectedExternalIds: string[];
  destinationsVisible: boolean;
  distanationsVisible: boolean;
  onEditDestination: (feature: { id: string; name: string; lng: number; lat: number }) => void;
  onEditDistanation: (feature: { id: string; dist_name: string; lng: number; lat: number }) => void;
  onStatus?: (msg: string | null) => void;
};

const assetsBase = "https://cdn.jsdelivr.net/npm/@arcgis/core@5.0.18/assets";

const palette = [
  [34, 211, 238],
  [244, 114, 182],
  [250, 204, 21],
  [129, 140, 248],
  [74, 222, 128],
  [248, 113, 113],
];

function isValidWgs84Extent(extent: __esri.Extent): boolean {
  const { xmin, ymin, xmax, ymax } = extent;
  if (![xmin, ymin, xmax, ymax].every((v) => Number.isFinite(v))) return false;
  if (xmin > xmax || ymin > ymax) return false;
  // GeoJSON layers here are in EPSG:4326. Reject obviously projected/invalid ranges.
  if (xmin < -180 || xmax > 180 || ymin < -90 || ymax > 90) return false;
  return true;
}

export const FullMapClient = forwardRef<FullMapHandle, Props>(function FullMapClient(
  {
    userLayers,
    externalLayers,
    selectedUserIds,
    selectedExternalIds,
    destinationsVisible,
    distanationsVisible,
    onEditDestination,
    onEditDistanation,
    onStatus,
  },
  ref
) {
  const container = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  const modulesRef = useRef<{
    Graphic: typeof import("@arcgis/core/Graphic").default;
    GraphicsLayer: typeof import("@arcgis/core/layers/GraphicsLayer").default;
    GeoJSONLayer: typeof import("@arcgis/core/layers/GeoJSONLayer").default;
    FeatureLayer: typeof import("@arcgis/core/layers/FeatureLayer").default;
    MapImageLayer: typeof import("@arcgis/core/layers/MapImageLayer").default;
    TileLayer: typeof import("@arcgis/core/layers/TileLayer").default;
    VectorTileLayer: typeof import("@arcgis/core/layers/VectorTileLayer").default;
  } | null>(null);

  const viewRef = useRef<import("@arcgis/core/views/MapView").default | null>(null);
  const destinationsLayerRef = useRef<import("@arcgis/core/layers/GraphicsLayer").default | null>(null);
  const distanationsLayerRef = useRef<import("@arcgis/core/layers/GraphicsLayer").default | null>(null);
  const sketchRef = useRef<import("@arcgis/core/widgets/Sketch").default | null>(null);
  const sketchDistanationsRef = useRef<import("@arcgis/core/widgets/Sketch").default | null>(null);
  const userLayerMap = useRef<Map<string, import("@arcgis/core/layers/Layer").default>>(new Map());
  const externalLayerMap = useRef<Map<string, import("@arcgis/core/layers/Layer").default>>(new Map());
  const awaitingCreateDestinationRef = useRef(false);
  const awaitingCreateDistanationRef = useRef(false);

  const apiBase = getApiBase();

  const refreshDestinations = useCallback(async () => {
    const layer = destinationsLayerRef.current;
    const mods = modulesRef.current;
    if (!layer || !mods) return;
    try {
      const res = await fetch(`${apiBase}/api/destinations/geojson`);
      const fc = await res.json();
      layer.removeAll();
      for (const f of fc.features ?? []) {
        const [lng, lat] = f.geometry?.coordinates ?? [];
        if (typeof lng !== "number" || typeof lat !== "number") continue;
        const g = new mods.Graphic({
          geometry: { type: "point", longitude: lng, latitude: lat } as __esri.GeometryProperties,
          symbol: {
            type: "simple-marker",
            color: [34, 197, 94, 0.9],
            size: 12,
            outline: { color: [15, 23, 42, 0.9], width: 1.5 },
          } as __esri.SymbolProperties,
          attributes: {
            id: f.id ?? f.properties?.id,
            name: f.properties?.name ?? "",
            __kind: "destination",
          },
          popupTemplate: {
            title: "Destination · {name}",
            content: "ID: {id}",
          } as __esri.PopupTemplateProperties,
        });
        layer.add(g);
      }
    } catch (e) {
      onStatus?.(`Failed to load destinations: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [apiBase, onStatus]);

  const refreshDistanations = useCallback(async () => {
    const layer = distanationsLayerRef.current;
    const mods = modulesRef.current;
    if (!layer || !mods) return;
    try {
      const res = await fetch(`${apiBase}/api/distanations/geojson`);
      const fc = await res.json();
      layer.removeAll();
      for (const f of fc.features ?? []) {
        const [lng, lat] = f.geometry?.coordinates ?? [];
        if (typeof lng !== "number" || typeof lat !== "number") continue;
        const props = f.properties ?? {};
        const g = new mods.Graphic({
          geometry: { type: "point", longitude: lng, latitude: lat } as __esri.GeometryProperties,
          symbol: {
            type: "simple-marker",
            color: [168, 85, 247, 0.95],
            size: 12,
            outline: { color: [15, 23, 42, 0.9], width: 1.5 },
          } as __esri.SymbolProperties,
          attributes: {
            id: f.id ?? props.id,
            dist_name: props.dist_name ?? "",
            __kind: "distanation",
          },
          popupTemplate: {
            title: "Distanation · {dist_name}",
            content: "ID: {id}",
          } as __esri.PopupTemplateProperties,
        });
        layer.add(g);
      }
    } catch (e) {
      onStatus?.(`Failed to load distanations: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [apiBase, onStatus]);

  useEffect(() => {
    let destroyed = false;
    let removeBasemapToggle: (() => void) | null = null;

    (async () => {
      try {
        const esriConfig = (await import("@arcgis/core/config.js")).default;
        const Map = (await import("@arcgis/core/Map.js")).default;
        const MapView = (await import("@arcgis/core/views/MapView.js")).default;
        const Graphic = (await import("@arcgis/core/Graphic.js")).default;
        const GraphicsLayer = (await import("@arcgis/core/layers/GraphicsLayer.js")).default;
        const GeoJSONLayer = (await import("@arcgis/core/layers/GeoJSONLayer.js")).default;
        const FeatureLayer = (await import("@arcgis/core/layers/FeatureLayer.js")).default;
        const MapImageLayer = (await import("@arcgis/core/layers/MapImageLayer.js")).default;
        const TileLayer = (await import("@arcgis/core/layers/TileLayer.js")).default;
        const VectorTileLayer = (await import("@arcgis/core/layers/VectorTileLayer.js")).default;
        const LayerList = (await import("@arcgis/core/widgets/LayerList.js")).default;
        const Home = (await import("@arcgis/core/widgets/Home.js")).default;
        const Expand = (await import("@arcgis/core/widgets/Expand.js")).default;

        esriConfig.assetsPath = assetsBase;
        if (process.env.NEXT_PUBLIC_ARCGIS_API_KEY) {
          esriConfig.apiKey = process.env.NEXT_PUBLIC_ARCGIS_API_KEY;
        }

        modulesRef.current = {
          Graphic,
          GraphicsLayer,
          GeoJSONLayer,
          FeatureLayer,
          MapImageLayer,
          TileLayer,
          VectorTileLayer,
        };

        const destinations = new GraphicsLayer({ title: "Destinations (editable)" });
        destinationsLayerRef.current = destinations;
        const distanations = new GraphicsLayer({ title: "Distanations (EPSG:4326 · editable)" });
        distanationsLayerRef.current = distanations;

        const basemapPrimary = process.env.NEXT_PUBLIC_ARCGIS_API_KEY
          ? "streets-navigation-vector"
          : "gray-vector";
        const map = new Map({
          basemap: basemapPrimary,
          layers: [destinations, distanations],
        });

        if (destroyed || !container.current) return;
        const view = new MapView({
          container: container.current,
          map,
          center: [46.685, 24.717],
          zoom: 12,
        });
        viewRef.current = view;

        try {
          const Sketch = (await import("@arcgis/core/widgets/Sketch.js")).default;
          const sketch = new Sketch({
            view,
            layer: destinations,
            creationMode: "single",
            availableCreateTools: ["point"],
            visibleElements: {
              createTools: { point: true, polyline: false, polygon: false, rectangle: false, circle: false },
              selectionTools: { "lasso-selection": false, "rectangle-selection": true },
              settingsMenu: false,
            },
          });
          sketchRef.current = sketch;

          sketch.on("create", async (event) => {
            if (event.state !== "complete" || !event.graphic) return;
            if (!awaitingCreateDestinationRef.current) return;
            awaitingCreateDestinationRef.current = false;

            const g = event.graphic.geometry as __esri.Point;
            const lng = g.longitude;
            const lat = g.latitude;
            const name = window.prompt("Name for this destination?", `Destination ${Date.now().toString(36)}`);
            destinations.remove(event.graphic);

            if (!name || !name.trim()) {
              onStatus?.("Create cancelled.");
              return;
            }
            try {
              const token = getToken();
              const res = await fetch(`${apiBase}/api/destinations`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ name: name.trim(), lng, lat }),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              onStatus?.(`Created "${name.trim()}".`);
              await refreshDestinations();
            } catch (e) {
              onStatus?.(`Create failed: ${e instanceof Error ? e.message : String(e)}`);
            }
          });

          sketch.on("update", async (event) => {
            if (event.state !== "complete") return;
            for (const graphic of event.graphics) {
              if (graphic.attributes?.__kind !== "destination") continue;
              const g = graphic.geometry as __esri.Point;
              const lng = g.longitude;
              const lat = g.latitude;
              const id = graphic.attributes.id as string;
              if (!id) continue;
              try {
                const token = getToken();
                await fetch(`${apiBase}/api/destinations/${id}`, {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                  body: JSON.stringify({ lng, lat }),
                });
                onStatus?.(`Moved "${graphic.attributes.name}" to ${lng.toFixed(5)}, ${lat.toFixed(5)}.`);
              } catch (e) {
                onStatus?.(`Move failed: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
            await refreshDestinations();
          });

          sketch.on("delete", async (event) => {
            for (const graphic of event.graphics) {
              if (graphic.attributes?.__kind !== "destination") continue;
              const id = graphic.attributes.id as string;
              if (!id) continue;
              try {
                await apiFetch(`/api/destinations/${id}`, { method: "DELETE" });
                onStatus?.(`Deleted "${graphic.attributes.name}".`);
              } catch (e) {
                onStatus?.(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
            await refreshDestinations();
          });

          view.ui.add(
            new Expand({ view, content: sketch, group: "top-left", expandTooltip: "Sketch · Destinations" }),
            "top-left"
          );

          const sketchDist = new Sketch({
            view,
            layer: distanations,
            creationMode: "single",
            availableCreateTools: ["point"],
            visibleElements: {
              createTools: { point: true, polyline: false, polygon: false, rectangle: false, circle: false },
              selectionTools: { "lasso-selection": false, "rectangle-selection": true },
              settingsMenu: false,
            },
          });
          sketchDistanationsRef.current = sketchDist;

          sketchDist.on("create", async (event) => {
            if (event.state !== "complete" || !event.graphic) return;
            if (!awaitingCreateDistanationRef.current) return;
            awaitingCreateDistanationRef.current = false;

            const g = event.graphic.geometry as __esri.Point;
            const lng = g.longitude;
            const lat = g.latitude;
            const distName = window.prompt("dist_name for this point?", `Distanation ${Date.now().toString(36)}`);
            distanations.remove(event.graphic);

            if (!distName || !distName.trim()) {
              onStatus?.("Distanation create cancelled.");
              return;
            }
            try {
              const token = getToken();
              const res = await fetch(`${apiBase}/api/distanations`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  Accept: "application/json",
                  ...(token ? { Authorization: `Bearer ${token}` } : {}),
                },
                body: JSON.stringify({ dist_name: distName.trim(), lng, lat }),
              });
              if (!res.ok) throw new Error(`HTTP ${res.status}`);
              onStatus?.(`Saved distanation "${distName.trim()}" (EPSG:4326).`);
              await refreshDistanations();
            } catch (e) {
              onStatus?.(`Distanation create failed: ${e instanceof Error ? e.message : String(e)}`);
            }
          });

          sketchDist.on("update", async (event) => {
            if (event.state !== "complete") return;
            for (const graphic of event.graphics) {
              if (graphic.attributes?.__kind !== "distanation") continue;
              const pt = graphic.geometry as __esri.Point;
              const lng = pt.longitude;
              const lat = pt.latitude;
              const id = graphic.attributes.id as string;
              if (!id) continue;
              try {
                const token = getToken();
                await fetch(`${apiBase}/api/distanations/${id}`, {
                  method: "PATCH",
                  headers: {
                    "Content-Type": "application/json",
                    Accept: "application/json",
                    ...(token ? { Authorization: `Bearer ${token}` } : {}),
                  },
                  body: JSON.stringify({ lng, lat }),
                });
                onStatus?.(`Moved distanation "${graphic.attributes.dist_name}" to ${lng.toFixed(5)}, ${lat.toFixed(5)}.`);
              } catch (e) {
                onStatus?.(`Distanation move failed: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
            await refreshDistanations();
          });

          sketchDist.on("delete", async (event) => {
            for (const graphic of event.graphics) {
              if (graphic.attributes?.__kind !== "distanation") continue;
              const id = graphic.attributes.id as string;
              if (!id) continue;
              try {
                await apiFetch(`/api/distanations/${id}`, { method: "DELETE" });
                onStatus?.(`Deleted distanation "${graphic.attributes.dist_name}".`);
              } catch (e) {
                onStatus?.(`Distanation delete failed: ${e instanceof Error ? e.message : String(e)}`);
              }
            }
            await refreshDistanations();
          });

          view.ui.add(
            new Expand({
              view,
              content: sketchDist,
              group: "top-left",
              expandTooltip: "Sketch · Distanations (WGS84)",
            }),
            "top-left"
          );
        } catch (e) {
          onStatus?.(
            `Sketch tools unavailable (chunk failed to load). Map still works: ${
              e instanceof Error ? e.message : String(e)
            }`
          );
        }

        view.on("click", async (event) => {
          const hit = await view.hitTest(event);
          for (const r of hit.results) {
            if (r.type !== "graphic") continue;
            const gr = (r as __esri.GraphicHit).graphic;
            const kind = gr.attributes?.__kind;
            if (kind === "distanation") {
              const a = gr.attributes as { id: string; dist_name: string };
              const geom = gr.geometry as __esri.Point;
              onEditDistanation({ id: a.id, dist_name: a.dist_name, lng: geom.longitude, lat: geom.latitude });
              return;
            }
            if (kind === "destination") {
              const a = gr.attributes as { id: string; name: string };
              const geom = gr.geometry as __esri.Point;
              onEditDestination({ id: a.id, name: a.name, lng: geom.longitude, lat: geom.latitude });
              return;
            }
          }
        });

        view.ui.add(new Home({ view }), "top-left");
        view.ui.add(
          new Expand({ view, content: new LayerList({ view }), group: "top-right", expandTooltip: "Layers" }),
          "top-right"
        );
        const bt = addBasemapToggleToView(view, basemapPrimary, "hybrid", "bottom-right");
        removeBasemapToggle = () => bt.remove();

        await refreshDestinations();
        await refreshDistanations();
      } catch (e) {
        if (!destroyed) setErr(e instanceof Error ? e.message : "Map failed to load");
      }
    })();

    return () => {
      destroyed = true;
      removeBasemapToggle?.();
      removeBasemapToggle = null;
      viewRef.current?.destroy();
      viewRef.current = null;
      modulesRef.current = null;
      sketchDistanationsRef.current = null;
      distanationsLayerRef.current = null;
      userLayerMap.current.clear();
      externalLayerMap.current.clear();
    };
  }, [apiBase, onEditDestination, onEditDistanation, onStatus, refreshDestinations, refreshDistanations]);

  // Keep user (PostGIS) layers in sync with selection
  useEffect(() => {
    const view = viewRef.current;
    const mods = modulesRef.current;
    if (!view || !mods) return;
    const map = view.map;
    const wanted = new Set(selectedUserIds);

    for (const [id, layer] of userLayerMap.current) {
      if (!wanted.has(id)) {
        map.remove(layer);
        userLayerMap.current.delete(id);
      }
    }

    userLayers
      .filter((l) => wanted.has(l.id) && !userLayerMap.current.has(l.id))
      .forEach((l, idx) => {
        const [r, g, b] = palette[idx % palette.length];
        const gtype = (l.geometry_type || "").toUpperCase();
        const isPoint = gtype.includes("POINT");
        const isLine = gtype.includes("LINE");
        const renderer = isPoint
          ? {
              type: "simple" as const,
              symbol: {
                type: "simple-marker" as const,
                color: [r, g, b, 0.9],
                size: 8,
                outline: { color: [15, 23, 42, 0.9], width: 1 },
              },
            }
          : isLine
            ? {
                type: "simple" as const,
                symbol: { type: "simple-line" as const, color: [r, g, b, 0.9], width: 2.5 },
              }
            : {
                type: "simple" as const,
                symbol: {
                  type: "simple-fill" as const,
                  color: [r, g, b, 0.28],
                  outline: { color: [r, g, b, 0.95], width: 2 },
                },
              };
        const nameLc = l.name.trim().toLowerCase();
        const heavyPointLayer =
          isPoint &&
          (/^bpoints?$/i.test(l.name.trim()) ||
            nameLc.includes("graphnode") ||
            nameLc.includes("graph node") ||
            nameLc.includes("graph_nodes") ||
            nameLc.includes("routepoint") ||
            nameLc.includes("route_points") ||
            nameLc.includes("route points"));
        const url = heavyPointLayer
          ? `${l.geojson_url}${l.geojson_url.includes("?") ? "&" : "?"}limit=5000`
          : l.geojson_url;
        const layer = new mods.GeoJSONLayer({
          url,
          title: `PostGIS · ${l.name}`,
          renderer,
          popupTemplate: { title: l.name, content: "{*}" },
        });
        userLayerMap.current.set(l.id, layer);
        map.add(layer);

        // Make freshly enabled PostGIS layers visible immediately (especially point layers).
        // Without this, users may think "layer not rendering" when the map is simply off extent.
        void (async () => {
          try {
            await layer.when();
            const extent = await layer.queryExtent();
            if (extent?.extent) {
              if (isValidWgs84Extent(extent.extent)) {
                await view.goTo(extent.extent.expand(isPoint ? 3 : 1.25));
              } else {
                onStatus?.(
                  `Loaded ${l.name}, but skipped auto-zoom because extent looks invalid for WGS84.`
                );
              }
            }
            const count = await layer.queryFeatureCount();
            onStatus?.(`Loaded ${l.name}: ${count} feature${count === 1 ? "" : "s"}.`);
          } catch (e) {
            onStatus?.(`Failed to load ${l.name}: ${e instanceof Error ? e.message : String(e)}`);
          }
        })();
      });
  }, [userLayers, selectedUserIds, onStatus]);

  // Keep external services in sync
  useEffect(() => {
    const view = viewRef.current;
    const mods = modulesRef.current;
    if (!view || !mods) return;
    const map = view.map;
    const wanted = new Set(selectedExternalIds);

    for (const [id, layer] of externalLayerMap.current) {
      if (!wanted.has(id)) {
        map.remove(layer);
        externalLayerMap.current.delete(id);
      }
    }

    externalLayers
      .filter((l) => wanted.has(l.id) && !externalLayerMap.current.has(l.id))
      .forEach((l) => {
        let layer: import("@arcgis/core/layers/Layer").default | null = null;
        try {
          switch (l.type) {
            case "FeatureLayer":
              layer = new mods.FeatureLayer({
                url: l.url,
                title: l.name,
                useViewTime: false,
              });
              break;
            case "MapImageLayer":
              layer = new mods.MapImageLayer({ url: l.url, title: l.name });
              break;
            case "TileLayer":
              layer = new mods.TileLayer({ url: l.url, title: l.name });
              break;
            case "VectorTileLayer":
              layer = new mods.VectorTileLayer({ url: l.url, title: l.name });
              break;
            case "WMS":
              // Lazy-load WMS so map startup doesn't depend on this optional chunk.
              void import("@arcgis/core/layers/WMSLayer.js")
                .then((m) => {
                  const wmsLayer = new m.default({ url: l.url, title: l.name });
                  externalLayerMap.current.set(l.id, wmsLayer);
                  map.add(wmsLayer);
                })
                .catch((e) => {
                  onStatus?.(`Failed to add ${l.name}: ${e instanceof Error ? e.message : String(e)}`);
                });
              return;
          }
        } catch (e) {
          onStatus?.(`Failed to add ${l.name}: ${e instanceof Error ? e.message : String(e)}`);
        }
        if (layer) {
          externalLayerMap.current.set(l.id, layer);
          map.add(layer);
        }
      });
  }, [externalLayers, selectedExternalIds, onStatus]);

  // Destinations visibility
  useEffect(() => {
    if (destinationsLayerRef.current) {
      destinationsLayerRef.current.visible = destinationsVisible;
    }
  }, [destinationsVisible]);

  useEffect(() => {
    if (distanationsLayerRef.current) {
      distanationsLayerRef.current.visible = distanationsVisible;
    }
  }, [distanationsVisible]);

  useImperativeHandle(
    ref,
    () => ({
      startCreateDestination: () => {
        const sketch = sketchRef.current;
        if (!sketch) return;
        awaitingCreateDestinationRef.current = true;
        sketch.create("point");
        onStatus?.("Click anywhere on the map to drop a destination.");
      },
      startEditDestination: (id: string) => {
        const layer = destinationsLayerRef.current;
        const sketch = sketchRef.current;
        if (!layer || !sketch) return;
        const graphic = layer.graphics.find((g) => g.attributes?.id === id);
        if (graphic) {
          sketch.update([graphic], { tool: "move" });
        }
      },
      deleteDestination: async (id: string) => {
        try {
          await apiFetch(`/api/destinations/${id}`, { method: "DELETE" });
          onStatus?.("Destination deleted.");
          await refreshDestinations();
        } catch (e) {
          onStatus?.(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
      refreshDestinations,
      startCreateDistanation: () => {
        const sketch = sketchDistanationsRef.current;
        if (!sketch) return;
        awaitingCreateDistanationRef.current = true;
        sketch.create("point");
        onStatus?.("Click the map to add a distanation (stored as EPSG:4326 / WGS84).");
      },
      startEditDistanation: (id: string) => {
        const layer = distanationsLayerRef.current;
        const sketch = sketchDistanationsRef.current;
        if (!layer || !sketch) return;
        const graphic = layer.graphics.find((g) => g.attributes?.id === id);
        if (graphic) {
          sketch.update([graphic], { tool: "move" });
        }
      },
      deleteDistanation: async (id: string) => {
        try {
          await apiFetch(`/api/distanations/${id}`, { method: "DELETE" });
          onStatus?.("Distanation deleted.");
          await refreshDistanations();
        } catch (e) {
          onStatus?.(`Delete failed: ${e instanceof Error ? e.message : String(e)}`);
        }
      },
      refreshDistanations,
      setLayerVisible: (layerKey: string, visible: boolean) => {
        const layer = userLayerMap.current.get(layerKey) ?? externalLayerMap.current.get(layerKey);
        if (layer) layer.visible = visible;
      },
      zoomToLayer: (layerKey: string) => {
        const view = viewRef.current;
        const layer = userLayerMap.current.get(layerKey) ?? externalLayerMap.current.get(layerKey);
        if (!view || !layer) return;
        const ext = (layer as unknown as { fullExtent?: __esri.Extent }).fullExtent;
        if (ext) void view.goTo(ext.expand(1.2));
      },
    }),
    [refreshDestinations, refreshDistanations, onStatus]
  );

  if (err) {
    return (
      <Box sx={{ p: 2, border: "1px solid", borderColor: "error.main", borderRadius: 2 }}>
        <Typography color="error">Map error: {err}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ position: "relative", width: "100%", height: "100%" }}>
      <div ref={container} style={{ width: "100%", height: "100%" }} />
    </Box>
  );
});
