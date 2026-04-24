"use client";

import { Box, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";

type LayerRef = {
  id: string;
  name: string;
  geojson_url: string;
  geometry_type?: string | null;
};

type Props = {
  layers: LayerRef[];
  height?: number | string;
};

const assetsBase = "https://cdn.jsdelivr.net/npm/@arcgis/core@5.0.18/assets";

const colors = [
  [34, 211, 238], // cyan
  [244, 114, 182], // pink
  [250, 204, 21], // yellow
  [129, 140, 248], // indigo
  [74, 222, 128], // emerald
  [248, 113, 113], // red
];

export function FeatureLayerMapClient({ layers, height = 480 }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let destroyed = false;
    let view: import("@arcgis/core/views/MapView").default | undefined;

    (async () => {
      try {
        const esriConfig = (await import("@arcgis/core/config.js")).default;
        const Map = (await import("@arcgis/core/Map.js")).default;
        const MapView = (await import("@arcgis/core/views/MapView.js")).default;
        const GeoJSONLayer = (await import("@arcgis/core/layers/GeoJSONLayer.js")).default;
        const LayerList = (await import("@arcgis/core/widgets/LayerList.js")).default;
        const Legend = (await import("@arcgis/core/widgets/Legend.js")).default;
        const Home = (await import("@arcgis/core/widgets/Home.js")).default;
        const Expand = (await import("@arcgis/core/widgets/Expand.js")).default;

        esriConfig.assetsPath = assetsBase;
        if (process.env.NEXT_PUBLIC_ARCGIS_API_KEY) {
          esriConfig.apiKey = process.env.NEXT_PUBLIC_ARCGIS_API_KEY;
        }

        const mapLayers: import("@arcgis/core/layers/Layer").default[] = [];

        layers.forEach((l, idx) => {
          const [r, g, b] = colors[idx % colors.length];
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
                  symbol: {
                    type: "simple-line" as const,
                    color: [r, g, b, 0.9],
                    width: 2.5,
                  },
                }
              : {
                  type: "simple" as const,
                  symbol: {
                    type: "simple-fill" as const,
                    color: [r, g, b, 0.28],
                    outline: { color: [r, g, b, 0.95], width: 2 },
                  },
                };

          mapLayers.push(
            new GeoJSONLayer({
              url: l.geojson_url,
              title: l.name,
              copyright: "Uploaded shapefile",
              renderer,
              popupTemplate: {
                title: l.name,
                content: "{*}",
              },
            })
          );
        });

        const map = new Map({
          basemap: process.env.NEXT_PUBLIC_ARCGIS_API_KEY ? "streets-navigation-vector" : "gray-vector",
          layers: mapLayers,
        });

        if (destroyed || !container.current) return;

        view = new MapView({
          container: container.current,
          map,
          center: [46.685, 24.717],
          zoom: 12,
        });

        const layerList = new LayerList({ view });
        view.ui.add(
          new Expand({ view, content: layerList, expanded: true, group: "top-right", expandTooltip: "Layers" }),
          "top-right"
        );
        view.ui.add(
          new Expand({ view, content: new Legend({ view }), group: "top-right", expandTooltip: "Legend" }),
          "top-right"
        );
        view.ui.add(new Home({ view }), "top-left");

        await Promise.all(
          mapLayers.map(async (lyr) => {
            try {
              await lyr.when();
            } catch {
              /* ignore */
            }
          })
        );

        try {
          let combined: __esri.Extent | null = null;
          mapLayers.forEach((lyr) => {
            const ext = (lyr as unknown as { fullExtent?: __esri.Extent }).fullExtent ?? null;
            if (ext) {
              combined = combined ? combined.union(ext) : ext.clone();
            }
          });
          if (combined && view) {
            await view.goTo((combined as __esri.Extent).expand(1.2));
          }
        } catch {
          /* ignore */
        }
      } catch (e) {
        if (!destroyed) setErr(e instanceof Error ? e.message : "Map failed to load");
      }
    })();

    return () => {
      destroyed = true;
      view?.destroy();
    };
  }, [layers]);

  if (err) {
    return (
      <Box sx={{ p: 2, border: "1px solid", borderColor: "error.main", borderRadius: 2 }}>
        <Typography color="error">Map error: {err}</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ height, borderRadius: 2, overflow: "hidden", border: "1px solid rgba(255,255,255,0.08)" }}>
      <div ref={container} style={{ width: "100%", height: "100%" }} />
    </Box>
  );
}
