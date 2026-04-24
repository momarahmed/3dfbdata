"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Chip,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  LinearProgress,
  MenuItem,
  Paper,
  Select,
  type SelectChangeEvent,
  Slider,
  Stack,
  Switch,
  Typography,
} from "@mui/material";
import {
  Gauge,
  Pause,
  Play,
  RefreshCw,
  RotateCcw,
  Square,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";
import type {
  SimulationMapHandle,
  SimVehicleSpec,
} from "@/components/SimulationMapClient";

const SimulationMap = dynamic(
  () => import("@/components/SimulationMapClient").then((m) => m.SimulationMapClient),
  { ssr: false, loading: () => <LinearProgress /> }
);

type FeatureLayerSummary = {
  id: string;
  name: string;
  slug: string;
  status: string;
  geometry_type: string | null;
  feature_count: number;
  bbox: [number, number, number, number] | null;
};

type GeoFeature = {
  type: "Feature";
  id: number | string;
  geometry: {
    type: string;
    coordinates: unknown;
  };
  properties: Record<string, unknown>;
};

type FeatureCollection = {
  type: "FeatureCollection";
  features: GeoFeature[];
  layer?: FeatureLayerSummary;
};

type SimulationRecord = {
  simulation_id: string;
  status: "pending" | "running" | "paused" | "stopped" | "completed" | "failed";
  vehicle_ids: string[];
  route_id: string | null;
  speed_multiplier: number;
  loop: boolean;
};

type PaletteEntry = { color: [number, number, number]; hex: string };

const PALETTE: PaletteEntry[] = [
  { color: [239, 68, 68], hex: "#ef4444" },
  { color: [59, 130, 246], hex: "#3b82f6" },
  { color: [16, 185, 129], hex: "#10b981" },
  { color: [234, 179, 8], hex: "#eab308" },
  { color: [168, 85, 247], hex: "#a855f7" },
];

// `FeatureLayer.geometry_type` is stored uppercase (POINT, LINESTRING,
// MULTILINESTRING, …) while GeoJSON geometry types are PascalCase
// (Point, LineString, …). Compare case-insensitively so both work.
const POINT_GEOMS = new Set(["POINT", "MULTIPOINT"]);
const LINE_GEOMS = new Set(["LINESTRING", "MULTILINESTRING"]);
const matchesGeomSet = (set: Set<string>, raw: string | null | undefined): boolean =>
  set.has((raw ?? "").trim().toUpperCase());

type LatLng = { lng: number; lat: number };

type RoutePath = {
  coords: LatLng[];
  cumulativeM: number[];
  totalM: number;
};

type FieldDef = { name: string; type: string | null };

/** One logical vehicle: all point features with the same group field value, time-ordered. */
type StreamVehicle = {
  id: string;
  label: string;
  color: [number, number, number];
  stream: LatLng[];
};

type StreamsPayload = { vehicles: StreamVehicle[]; maxIndex: number };

type LiveState = {
  vehicleId: string;
  label: string;
  lng: number;
  lat: number;
  headingDeg: number;
  status: "pending" | "moving" | "completed";
  pointIndex: number;
  colorRgb: [number, number, number];
};

/** How fast the simulator advances through point indices (at 1x speed). */
const BASE_STREAM_PPS = 2.5;

function haversineM(a: LatLng, b: LatLng): number {
  const R = 6371000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

function bearingDeg(a: LatLng, b: LatLng): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const toDeg = (r: number) => (r * 180) / Math.PI;
  const phi1 = toRad(a.lat);
  const phi2 = toRad(b.lat);
  const lambda = toRad(b.lng - a.lng);
  const y = Math.sin(lambda) * Math.cos(phi2);
  const x =
    Math.cos(phi1) * Math.sin(phi2) - Math.sin(phi1) * Math.cos(phi2) * Math.cos(lambda);
  return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function extractLine(feature: GeoFeature | undefined): LatLng[] {
  if (!feature) return [];
  const g = feature.geometry;
  if (!g) return [];
  const t = (g.type ?? "").toUpperCase();
  if (t === "LINESTRING") {
    const arr = g.coordinates as Array<[number, number]>;
    return arr.map(([lng, lat]) => ({ lng, lat }));
  }
  if (t === "MULTILINESTRING") {
    const arr = g.coordinates as Array<Array<[number, number]>>;
    if (arr.length === 0) return [];
    return arr[0].map(([lng, lat]) => ({ lng, lat }));
  }
  return [];
}

function buildRoutePath(coords: LatLng[]): RoutePath {
  const cumulative: number[] = new Array(coords.length).fill(0);
  let total = 0;
  for (let i = 1; i < coords.length; i++) {
    total += haversineM(coords[i - 1], coords[i]);
    cumulative[i] = total;
  }
  return { coords, cumulativeM: cumulative, totalM: total };
}

function collectCoordsFromFeature(f: GeoFeature): LatLng[] {
  const g = f.geometry;
  if (!g) return [];
  const t = (g.type ?? "").toUpperCase();
  if (t === "POINT") {
    const [lng, lat] = g.coordinates as [number, number];
    return [{ lng, lat }];
  }
  if (t === "MULTIPOINT") {
    return (g.coordinates as Array<[number, number]>).map(([lng, lat]) => ({ lng, lat }));
  }
  return [];
}

function sortKeyFromProps(props: Record<string, unknown>, featureId: number | string): number {
  const keys = [
    "time",
    "Time",
    "timestamp",
    "point_time",
    "POINT_TI",
    "t",
    "seq",
    "sequence",
    "order",
    "FID",
    "fid",
  ];
  for (const k of keys) {
    if (props[k] == null) continue;
    const v = props[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = parseFloat(v);
      if (!Number.isNaN(n) && v.trim() !== "") return n;
      const d = Date.parse(v);
      if (!Number.isNaN(d)) return d;
    }
  }
  const n = parseFloat(String(featureId));
  return Number.isNaN(n) ? 0 : n;
}

function buildGroupedPointStreams(
  features: GeoFeature[],
  groupByField: string
): StreamsPayload {
  type E = { t: number; tie: number; p: LatLng };
  const m = new Map<string, E[]>();
  let tie = 0;
  for (const f of features) {
    if (!matchesGeomSet(POINT_GEOMS, f.geometry?.type)) continue;
    const props = f.properties ?? {};
    const raw = (props as Record<string, unknown>)[groupByField];
    const gk = raw == null || String(raw).trim() === "" ? "__unassigned" : String(raw);
    const t0 = sortKeyFromProps(props, f.id);
    for (const p of collectCoordsFromFeature(f)) {
      if (!m.has(gk)) m.set(gk, []);
      m.get(gk)!.push({ t: t0, tie: tie++, p });
    }
  }
  const vehicles: StreamVehicle[] = [];
  let vIdx = 0;
  let maxIndex = 0;
  for (const [key, evs] of m) {
    evs.sort((a, b) => (a.t !== b.t ? a.t - b.t : a.tie - b.tie));
    const stream = evs.map((e) => e.p);
    if (stream.length === 0) continue;
    const c = PALETTE[vIdx % PALETTE.length]!;
    vIdx += 1;
    vehicles.push({
      id: key,
      label: key,
      color: c.color,
      stream,
    });
    maxIndex = Math.max(maxIndex, stream.length - 1);
  }
  return { vehicles, maxIndex: Math.max(0, maxIndex) };
}

export default function SimulationPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const mapRef = useRef<SimulationMapHandle>(null);

  const [layers, setLayers] = useState<FeatureLayerSummary[]>([]);
  const [selectedPointLayerId, setSelectedPointLayerId] = useState<string | "">("");
  const [selectedRouteLayerId, setSelectedRouteLayerId] = useState<string | "">("");
  const [groupByField, setGroupByField] = useState<string | "">("");
  const [pointLayerFields, setPointLayerFields] = useState<FieldDef[]>([]);
  const [loadingPointFields, setLoadingPointFields] = useState(false);
  const [streamInfo, setStreamInfo] = useState<{ cars: number; samples: number; maxIndex: number } | null>(null);
  const [sim, setSim] = useState<SimulationRecord | null>(null);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(true);
  const [seekPct, setSeekPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingLayers, setLoadingLayers] = useState(true);
  const [starting, setStarting] = useState(false);
  const [live, setLive] = useState<Record<string, LiveState>>({});

  const playingRef = useRef(false);
  const pausedRef = useRef(false);
  /** Current position in the shared point stream timeline (0 … maxIndex). */
  const streamTRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const speedRef = useRef(1);
  const loopRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const routeRef = useRef<RoutePath | null>(null);
  const streamsDataRef = useRef<StreamsPayload | null>(null);

  // Use stable primitives only — `router` from useRouter() can get a new reference
  // every render in some Next.js versions and re-fire this effect indefinitely.
  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading]); // eslint-disable-line react-hooks/exhaustive-deps -- router intentionally omitted

  useEffect(() => { speedRef.current = speed; }, [speed]);
  useEffect(() => { loopRef.current = loop; }, [loop]);

  const loadLayers = useCallback(async () => {
    setLoadingLayers(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: FeatureLayerSummary[] }>("/api/feature-layers");
      // Match the Map page: only surface layers that finished importing.
      const ready = (res.data ?? []).filter((l) => (l.status ?? "").toUpperCase() === "READY");
      setLayers(ready);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load feature layers");
    } finally {
      setLoadingLayers(false);
    }
  }, []);

  useEffect(() => {
    if (user) void loadLayers();
  }, [user, loadLayers]);

  useEffect(() => {
    if (!selectedPointLayerId) {
      setGroupByField((g) => (g === "" ? g : ""));
      setPointLayerFields((f) => (f.length === 0 ? f : []));
      streamsDataRef.current = null;
      setStreamInfo((s) => (s === null ? s : null));
      return;
    }
    // New point layer: reset grouping + streams, then load column names.
    setGroupByField("");
    streamsDataRef.current = null;
    setStreamInfo(null);
    let cancelled = false;
    void (async () => {
      setLoadingPointFields(true);
      try {
        const res = await apiFetch<{
          fields: FieldDef[];
        }>(`/api/routing-tasks/layers/${selectedPointLayerId}/fields`);
        if (cancelled) return;
        setPointLayerFields(res.fields ?? []);
      } catch {
        if (!cancelled) setPointLayerFields([]);
      } finally {
        if (!cancelled) setLoadingPointFields(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedPointLayerId]);

  const pointLayers = useMemo(
    () => layers.filter((l) => matchesGeomSet(POINT_GEOMS, l.geometry_type)),
    [layers]
  );
  const lineLayers = useMemo(
    () => layers.filter((l) => matchesGeomSet(LINE_GEOMS, l.geometry_type)),
    [layers]
  );

  // Drop stale layer UUIDs after reloads. While layers are still loading, the
  // list is empty — do not clear a valid selection (that was causing a
  // setState ↔ effect loop with the fields / stream effects).
  useEffect(() => {
    if (loadingLayers) return;
    if (selectedPointLayerId && !pointLayers.some((l) => l.id === selectedPointLayerId)) {
      setSelectedPointLayerId("");
    }
  }, [loadingLayers, pointLayers, selectedPointLayerId]);
  useEffect(() => {
    if (loadingLayers) return;
    if (selectedRouteLayerId && !lineLayers.some((l) => l.id === selectedRouteLayerId)) {
      setSelectedRouteLayerId("");
    }
  }, [loadingLayers, lineLayers, selectedRouteLayerId]);

  /**
   * Route line only: background context. Car positions always come from the
   * grouped point stream, not the polyline geometry.
   */
  useEffect(() => {
    let cancelled = false;
    async function draw() {
      if (selectedRouteLayerId === "") {
        routeRef.current = null;
        await mapRef.current?.setRoute({
          routeId: "none",
          color: [59, 130, 246],
          coords: [],
        });
        return;
      }
      try {
        const fc = await apiFetch<FeatureCollection>(
          `/api/feature-layers/${selectedRouteLayerId}/geojson?limit=10000`
        );
        if (cancelled) return;
        const lineFeature = fc.features.find((f) => matchesGeomSet(LINE_GEOMS, f.geometry?.type));
        const coords = extractLine(lineFeature);
        if (coords.length < 2) {
          setError("Selected route layer has no usable line geometry (LineString / MultiLineString)");
          return;
        }
        const route = buildRoutePath(coords);
        routeRef.current = route;
        await mapRef.current?.setRoute({
          routeId: `feature-layer:${selectedRouteLayerId}`,
          color: [59, 130, 246],
          coords: route.coords,
        });
        await mapRef.current?.recenterOnTracks();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to render route");
      }
    }
    if (!playingRef.current && !pausedRef.current) void draw();
    return () => { cancelled = true; };
  }, [selectedRouteLayerId]);

  /**
   * Build grouped, time-ordered streams from the point layer. The map only
   * shows the route line; vehicle graphics appear when you press Start.
   */
  useEffect(() => {
    let cancelled = false;
    async function build() {
      if (selectedPointLayerId === "" || groupByField === "") {
        streamsDataRef.current = null;
        setStreamInfo(null);
        setLive({});
        if (!playingRef.current && !pausedRef.current) await mapRef.current?.setVehicles([]);
        return;
      }
      try {
        const fc = await apiFetch<FeatureCollection>(
          `/api/feature-layers/${selectedPointLayerId}/geojson?limit=10000`
        );
        if (cancelled) return;
        const pl = buildGroupedPointStreams(fc.features, groupByField);
        if (pl.vehicles.length === 0) {
          setError("No vehicles after grouping — check the group field and geometry.");
          streamsDataRef.current = null;
          setStreamInfo(null);
          if (!playingRef.current && !pausedRef.current) await mapRef.current?.setVehicles([]);
          return;
        }
        setError(null);
        const samples = pl.vehicles.reduce((n, v) => n + v.stream.length, 0);
        streamsDataRef.current = pl;
        setStreamInfo({
          cars: pl.vehicles.length,
          samples,
          maxIndex: pl.maxIndex,
        });
        if (!playingRef.current && !pausedRef.current) {
          await mapRef.current?.setVehicles([]);
          const flat = pl.vehicles.flatMap((v) => v.stream);
          if (selectedRouteLayerId) await mapRef.current?.recenterOnTracks();
          else if (flat.length) await mapRef.current?.recenterToCoordinates(flat);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Failed to load point features");
        }
        streamsDataRef.current = null;
        setStreamInfo(null);
      }
    }
    if (!playingRef.current && !pausedRef.current) void build();
    return () => { cancelled = true; };
  }, [selectedPointLayerId, groupByField, selectedRouteLayerId]);

  const stopAnimation = () => {
    playingRef.current = false;
    pausedRef.current = false;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTickRef.current = null;
  };

  const resetClock = () => {
    streamTRef.current = 0;
    lastTickRef.current = null;
    setSeekPct(0);
  };

  const applyFrame = useCallback(() => {
    const pl = streamsDataRef.current;
    if (!pl || pl.vehicles.length === 0) return;

    const maxI = pl.maxIndex;
    const t = streamTRef.current;
    setSeekPct(maxI <= 0 ? 0 : Math.min(1, t / maxI));

    const updates: Record<string, LiveState> = {};
    for (const v of pl.vehicles) {
      const L = v.stream.length;
      if (L === 0) continue;
      const i = Math.min(L - 1, Math.max(0, Math.floor(t)));
      const p = v.stream[i]!;
      const pN = v.stream[Math.min(L - 1, i + 1)]!;
      const heading = L > 1 && i < L - 1 ? bearingDeg(p, pN) : 0;
      const atEnd = maxI > 0 && t >= maxI;
      const status: LiveState["status"] = atEnd ? "completed" : "moving";
      updates[v.id] = {
        vehicleId: v.id,
        label: v.label,
        lng: p.lng,
        lat: p.lat,
        headingDeg: heading,
        status: maxI === 0 ? "moving" : status,
        pointIndex: i,
        colorRgb: v.color,
      };
      mapRef.current?.updateVehicle({
        vehicleId: v.id,
        lng: p.lng,
        lat: p.lat,
        headingDeg: heading,
        speedKmh: BASE_STREAM_PPS * speedRef.current * 3.6,
        visible: true,
      });
    }
    setLive(updates);
  }, []);

  const step = useCallback(() => {
    rafRef.current = null;
    if (!playingRef.current || pausedRef.current) return;
    const pl = streamsDataRef.current;
    if (!pl) return;
    const maxI = pl.maxIndex;

    if (maxI <= 0) {
      applyFrame();
      return;
    }

    const now = performance.now();
    const dt = lastTickRef.current == null ? 0 : now - lastTickRef.current;
    lastTickRef.current = now;

    streamTRef.current += (dt / 1000) * BASE_STREAM_PPS * speedRef.current;

    if (!loopRef.current && streamTRef.current > maxI) {
      streamTRef.current = maxI;
      applyFrame();
      playingRef.current = false;
      lastTickRef.current = null;
      setSim((s) => (s ? { ...s, status: "completed" } : s));
      return;
    }
    if (loopRef.current && streamTRef.current > maxI) {
      const span = maxI + 1;
      streamTRef.current = ((streamTRef.current % span) + span) % span;
    }

    applyFrame();
    rafRef.current = requestAnimationFrame(step);
  }, [applyFrame]);

  const handleStart = async () => {
    if (selectedPointLayerId === "" || groupByField === "") {
      setError("Select a point layer and a field to group vehicles (cars).");
      return;
    }
    const pl = streamsDataRef.current;
    if (!pl || pl.vehicles.length === 0) {
      setError("No grouped streams to play — check the point layer, group field, and wait for data to load.");
      return;
    }

    setError(null);
    setStarting(true);
    try {
      const specs: SimVehicleSpec[] = pl.vehicles.map((v) => {
        const p0 = v.stream[0]!;
        return {
          vehicleId: v.id,
          color: v.color,
          start: { lng: p0.lng, lat: p0.lat },
          label: v.label,
        };
      });
      await mapRef.current?.setVehicles(specs);

      const created = await apiFetch<{ data: SimulationRecord }>("/api/simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_ids: pl.vehicles.map((v) => v.id),
          route_id: selectedRouteLayerId
            ? `feature-layer:${selectedRouteLayerId}`
            : "none",
          speed_multiplier: speed,
          loop,
        }),
      });
      setSim(created.data);

      resetClock();
      applyFrame();
      playingRef.current = true;
      pausedRef.current = false;
      if (pl.maxIndex > 0) {
        rafRef.current = requestAnimationFrame(step);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to start simulation");
    } finally {
      setStarting(false);
    }
  };

  const callLifecycle = async (path: string) => {
    if (!sim) return null;
    return apiFetch<{ data: SimulationRecord }>(`/api/simulations/${sim.simulation_id}/${path}`, {
      method: "POST",
    });
  };

  const handlePause = async () => {
    if (!sim || !playingRef.current) return;
    pausedRef.current = true;
    lastTickRef.current = null;
    if (rafRef.current != null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    try {
      const res = await callLifecycle("pause");
      if (res?.data) setSim(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Pause failed");
    }
  };

  const handleResume = async () => {
    if (!sim) return;
    pausedRef.current = false;
    if (!playingRef.current) playingRef.current = true;
    lastTickRef.current = null;
    const m = streamsDataRef.current?.maxIndex ?? 0;
    if (m > 0) {
      rafRef.current = requestAnimationFrame(step);
    }
    try {
      const res = await callLifecycle("resume");
      if (res?.data) setSim(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Resume failed");
    }
  };

  const handleStop = async () => {
    stopAnimation();
    if (sim) {
      try {
        const res = await callLifecycle("stop");
        if (res?.data) setSim(res.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Stop failed");
      }
    }
  };

  const handleReset = async () => {
    if (!streamsDataRef.current) return;
    resetClock();
    applyFrame();
    playingRef.current = true;
    pausedRef.current = false;
    lastTickRef.current = null;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    if ((streamsDataRef.current?.maxIndex ?? 0) > 0) {
      rafRef.current = requestAnimationFrame(step);
    }
    if (sim) {
      try {
        const res = await callLifecycle("reset");
        if (res?.data) setSim(res.data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Reset failed");
      }
    }
  };

  const handleSeek = (_: Event, value: number | number[]) => {
    const pl = streamsDataRef.current;
    if (!pl) return;
    const maxI = pl.maxIndex;
    if (maxI <= 0) {
      setSeekPct(0);
      streamTRef.current = 0;
      lastTickRef.current = null;
      applyFrame();
      return;
    }
    const pct = Math.max(0, Math.min(1, (Array.isArray(value) ? value[0] : value) / 100));
    streamTRef.current = maxI * pct;
    setSeekPct(pct);
    lastTickRef.current = null;
    applyFrame();
    if (
      playingRef.current &&
      !pausedRef.current &&
      rafRef.current == null &&
      (pl.maxIndex ?? 0) > 0
    ) {
      rafRef.current = requestAnimationFrame(step);
    }
  };

  const handleSpeedChange = (_: Event, value: number | number[]) => {
    const v = Array.isArray(value) ? value[0] : value;
    const clamped = Math.max(0.1, Math.min(10, v));
    setSpeed(clamped);
    if (sim) {
      apiFetch(`/api/simulations/${sim.simulation_id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ speed_multiplier: clamped }),
      }).catch(() => undefined);
    }
  };

  const handlePointLayerChange = (e: SelectChangeEvent<string | "">) => {
    setSelectedPointLayerId(e.target.value);
  };
  const handleRouteLayerChange = (e: SelectChangeEvent<string | "">) => {
    setSelectedRouteLayerId(e.target.value);
  };
  const handleGroupByFieldChange = (e: SelectChangeEvent<string | "">) => {
    setGroupByField(e.target.value);
  };

  useEffect(() => () => stopAnimation(), []);

  const timelineLabel = useMemo(() => {
    if (!streamInfo) return null;
    if (streamInfo.maxIndex <= 0) {
      return `1 sample/vehicle | ${streamInfo.cars} cars @ ${speed.toFixed(1)}x`;
    }
    return `${streamInfo.cars} cars | ${streamInfo.samples} samples | ${streamInfo.maxIndex + 1} steps @ ${speed.toFixed(1)}x`;
  }, [streamInfo, speed]);

  if (authLoading || !user) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
      </Box>
    );
  }

  const isRunning = !!sim && playingRef.current && !pausedRef.current && sim.status === "running";
  const isPaused = !!sim && (sim.status === "paused" || (playingRef.current && pausedRef.current));
  const canControl = !!sim && sim.status !== "stopped";
  const selectedPointLayer = pointLayers.find((l) => l.id === selectedPointLayerId);
  const selectedLineLayer = lineLayers.find((l) => l.id === selectedRouteLayerId);

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "360px 1fr" },
        gap: 2,
        height: "calc(100vh - 120px)",
        minHeight: 560,
      }}
    >
      <Paper
        elevation={1}
        sx={{
          p: 2,
          display: "flex",
          flexDirection: "column",
          gap: 1.5,
          overflow: "auto",
          border: (t) => `1px solid ${t.palette.divider}`,
          bgcolor: "background.paper",
        }}
      >
        <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center" }}>
          <Typography variant="h6">Real-time simulation</Typography>
          <Button size="small" startIcon={<RefreshCw size={14} />} onClick={loadLayers} disabled={loadingLayers}>
            Reload
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Choose a <b>point layer</b> and a <b>field to group by</b> (for example a vehicle or trip id). The map shows
          the <b>route polyline</b> only. Each group is one &quot;car&quot;; during playback, <b>one point per car</b> is
          shown at a time, advancing in time order through that group&apos;s points (streaming simulation).
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}

        <Divider />

        <FormControl size="small" fullWidth disabled={loadingLayers || isRunning || isPaused}>
          <InputLabel id="sim-point-layer-label">Control layer (points)</InputLabel>
          <Select
            labelId="sim-point-layer-label"
            label="Control layer (points)"
            value={selectedPointLayerId}
            onChange={handlePointLayerChange}
          >
            <MenuItem value="">
              <em>— Select a point layer —</em>
            </MenuItem>
            {pointLayers.map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.name} · <span style={{ opacity: 0.7, marginLeft: 4 }}>{l.feature_count} pts</span>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {pointLayers.length === 0 && !loadingLayers && (
          <Typography variant="caption" color="text.secondary">
            No point feature layers in PostGIS yet. Upload one from <b>Upload shapefiles</b>.
          </Typography>
        )}

        <FormControl
          size="small"
          fullWidth
          disabled={loadingLayers || isRunning || isPaused || !selectedPointLayerId || loadingPointFields}
        >
          <InputLabel id="sim-groupby-label">Group by (field)</InputLabel>
          <Select
            labelId="sim-groupby-label"
            label="Group by (field)"
            value={groupByField}
            onChange={handleGroupByFieldChange}
          >
            <MenuItem value="">
              <em>— Select column —</em>
            </MenuItem>
            {pointLayerFields.map((f) => (
              <MenuItem key={f.name} value={f.name}>
                {f.name}
                {f.type != null && f.type !== "" ? ` (${String(f.type)})` : ""}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {!!selectedPointLayerId && !loadingPointFields && pointLayerFields.length === 0 && (
          <Typography variant="caption" color="text.secondary">
            No field list returned — the layer may have empty attributes, or the schema is still being written.
          </Typography>
        )}

        <FormControl size="small" fullWidth disabled={loadingLayers || isRunning || isPaused}>
          <InputLabel id="sim-route-layer-label">Route layer (lines) — optional</InputLabel>
          <Select
            labelId="sim-route-layer-label"
            label="Route layer (lines) — optional"
            value={selectedRouteLayerId}
            onChange={handleRouteLayerChange}
          >
            <MenuItem value="">
              <em>— Select a line layer —</em>
            </MenuItem>
            {lineLayers.map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.name} · <span style={{ opacity: 0.7, marginLeft: 4 }}>{l.feature_count} lines</span>
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        {lineLayers.length === 0 && !loadingLayers && (
          <Typography variant="caption" color="text.secondary">
            No line feature layers in PostGIS yet. Upload one from <b>Upload shapefiles</b>.
          </Typography>
        )}

        {(selectedPointLayer || selectedLineLayer || groupByField) && (
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
            {selectedPointLayer && (
              <Chip
                size="small"
                label={`${selectedPointLayer.name} — ${selectedPointLayer.feature_count} features`}
                color="primary"
                variant="outlined"
              />
            )}
            {groupByField && (
              <Chip size="small" label={`group: ${groupByField}`} variant="outlined" />
            )}
            {streamInfo && (
              <Chip
                size="small"
                label={`${streamInfo.cars} cars | ${streamInfo.samples} points`}
                variant="outlined"
              />
            )}
            {selectedLineLayer && (
              <Chip
                size="small"
                label={`route: ${selectedLineLayer.name}`}
                color="secondary"
                variant="outlined"
              />
            )}
          </Stack>
        )}

        <Divider />

        <Typography variant="subtitle2">Controls</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={<Play size={16} />}
            onClick={handleStart}
            disabled={
              starting ||
              isRunning ||
              isPaused ||
              selectedPointLayerId === "" ||
              groupByField === "" ||
              !streamInfo?.cars
            }
          >
            Start
          </Button>
          <Button
            variant="outlined"
            startIcon={<Pause size={16} />}
            onClick={handlePause}
            disabled={!isRunning}
          >
            Pause
          </Button>
          <Button
            variant="outlined"
            startIcon={<Play size={16} />}
            onClick={handleResume}
            disabled={!isPaused}
          >
            Resume
          </Button>
        </Stack>
        <Stack direction="row" spacing={1}>
          <Button
            variant="outlined"
            color="warning"
            startIcon={<Square size={16} />}
            onClick={handleStop}
            disabled={!canControl}
          >
            Stop
          </Button>
          <Button
            variant="outlined"
            startIcon={<RotateCcw size={16} />}
            onClick={handleReset}
            disabled={!sim}
          >
            Reset
          </Button>
          <FormControlLabel
            control={
              <Switch size="small" checked={loop} onChange={(_, v) => setLoop(v)} />
            }
            label="Loop"
          />
        </Stack>

        <Stack spacing={0.5}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Gauge size={14} />
            <Typography variant="caption" color="text.secondary">
              Speed: {speed.toFixed(1)}x
            </Typography>
          </Stack>
          <Slider
            size="small"
            min={0.1}
            max={10}
            step={0.1}
            value={speed}
            onChange={handleSpeedChange}
            marks={[
              { value: 0.5, label: "0.5x" },
              { value: 1, label: "1x" },
              { value: 5, label: "5x" },
              { value: 10, label: "10x" },
            ]}
          />
        </Stack>

        <Stack spacing={0.5}>
          <Typography variant="caption" color="text.secondary">
            Seek {timelineLabel ? `(${timelineLabel})` : ""}
          </Typography>
          <Slider
            size="small"
            min={0}
            max={100}
            step={0.1}
            value={seekPct * 100}
            onChange={handleSeek}
            disabled={!streamInfo || streamInfo.maxIndex <= 0}
          />
        </Stack>

        <Divider />

        <Typography variant="subtitle2">Status</Typography>
        {sim ? (
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              Simulation <code>{sim.simulation_id.slice(0, 8)}…</code> — <b>{sim.status}</b>
            </Typography>
            {Object.values(live)
              .slice(0, 20)
              .map((s) => {
                const [r, g, b] = s.colorRgb;
                return (
                  <Stack
                    key={s.vehicleId}
                    direction="row"
                    spacing={1}
                    sx={{ alignItems: "center", fontSize: 12 }}
                  >
                    <Box
                      sx={{
                        width: 10,
                        height: 10,
                        borderRadius: "50%",
                        bgcolor: `rgb(${r},${g},${b})`,
                      }}
                    />
                    <Typography variant="caption" sx={{ minWidth: 80 }} noWrap>
                      {s.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      #{s.pointIndex} · {s.headingDeg.toFixed(0)}° · {s.status}
                    </Typography>
                  </Stack>
                );
              })}
            {Object.keys(live).length > 20 && (
              <Typography variant="caption" color="text.secondary">
                …and {Object.keys(live).length - 20} more
              </Typography>
            )}
          </Stack>
        ) : (
          <Typography variant="caption" color="text.secondary">
            No active simulation. Choose the two layers above and press Start.
          </Typography>
        )}
      </Paper>

      <Paper
        elevation={1}
        sx={{
          position: "relative",
          overflow: "hidden",
          border: (t) => `1px solid ${t.palette.divider}`,
        }}
      >
        <SimulationMap ref={mapRef} />
      </Paper>
    </Box>
  );
}
