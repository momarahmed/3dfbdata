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
  id: number;
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

type Vehicle = {
  id: string;
  label: string;
  offsetM: number;
};

type LiveState = {
  vehicleId: string;
  label: string;
  lng: number;
  lat: number;
  headingDeg: number;
  status: "pending" | "moving" | "completed";
};

const BASE_SPEED_MPS = 15; // ≈ 54 km/h at speed multiplier = 1

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

/** Find the (lng, lat, headingDeg) at a given distance along the route. */
function sampleAtDistance(route: RoutePath, distM: number): { lng: number; lat: number; headingDeg: number } {
  if (route.coords.length === 0) {
    return { lng: 0, lat: 0, headingDeg: 0 };
  }
  if (route.coords.length === 1 || route.totalM === 0) {
    return { lng: route.coords[0].lng, lat: route.coords[0].lat, headingDeg: 0 };
  }
  const clamped = Math.max(0, Math.min(route.totalM, distM));
  let i = 1;
  while (i < route.cumulativeM.length && route.cumulativeM[i] < clamped) i++;
  const prev = route.coords[i - 1];
  const next = route.coords[Math.min(i, route.coords.length - 1)];
  const segStart = route.cumulativeM[i - 1];
  const segEnd = route.cumulativeM[Math.min(i, route.cumulativeM.length - 1)];
  const segDur = Math.max(1e-6, segEnd - segStart);
  const t = Math.min(1, Math.max(0, (clamped - segStart) / segDur));
  return {
    lng: prev.lng + (next.lng - prev.lng) * t,
    lat: prev.lat + (next.lat - prev.lat) * t,
    headingDeg: bearingDeg(prev, next),
  };
}

export default function SimulationPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const mapRef = useRef<SimulationMapHandle>(null);

  const [layers, setLayers] = useState<FeatureLayerSummary[]>([]);
  const [selectedPointLayerId, setSelectedPointLayerId] = useState<number | "">("");
  const [selectedRouteLayerId, setSelectedRouteLayerId] = useState<number | "">("");
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
  const simMRef = useRef(0); // current distance (m) advanced along the route
  const lastTickRef = useRef<number | null>(null);
  const speedRef = useRef(1);
  const loopRef = useRef(true);
  const rafRef = useRef<number | null>(null);
  const routeRef = useRef<RoutePath | null>(null);
  const vehiclesRef = useRef<Vehicle[]>([]);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

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

  const pointLayers = useMemo(
    () => layers.filter((l) => matchesGeomSet(POINT_GEOMS, l.geometry_type)),
    [layers]
  );
  const lineLayers = useMemo(
    () => layers.filter((l) => matchesGeomSet(LINE_GEOMS, l.geometry_type)),
    [layers]
  );

  /**
   * Render the selected route + point layers on the map **as soon as the user
   * picks them**, so the Simulation page behaves like the Map tool. Start/Pause
   * then animates those same markers along the route.
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
          setError("Selected route layer has no usable LineString geometry");
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

  useEffect(() => {
    let cancelled = false;
    async function draw() {
      if (selectedPointLayerId === "") {
        vehiclesRef.current = [];
        setLive({});
        await mapRef.current?.setVehicles([]);
        return;
      }
      try {
        const fc = await apiFetch<FeatureCollection>(
          `/api/feature-layers/${selectedPointLayerId}/geojson?limit=10000`
        );
        if (cancelled) return;
        const pointFeatures = fc.features.filter((f) => matchesGeomSet(POINT_GEOMS, f.geometry?.type));
        if (pointFeatures.length === 0) {
          setError("Selected control layer has no point features");
          await mapRef.current?.setVehicles([]);
          return;
        }

        const route = routeRef.current;
        const specs = pointFeatures.map((f, idx) => {
          const props = f.properties ?? {};
          const label =
            (props.name as string) ||
            (props.title as string) ||
            (props.label as string) ||
            `F${f.id ?? idx}`;
          const palette = PALETTE[idx % PALETTE.length];
          const g = f.geometry;
          let start = { lng: 0, lat: 0 };
          const gt = (g?.type ?? "").toUpperCase();
          if (gt === "POINT") {
            const [lng, lat] = g!.coordinates as [number, number];
            start = { lng, lat };
          } else if (gt === "MULTIPOINT") {
            const [lng, lat] = (g!.coordinates as Array<[number, number]>)[0] ?? [0, 0];
            start = { lng, lat };
          }
          return {
            id: String(f.id ?? idx),
            label,
            color: palette.color,
            offsetM: route ? (route.totalM * idx) / pointFeatures.length : 0,
            start,
          };
        });

        vehiclesRef.current = specs.map((s) => ({
          id: s.id,
          label: s.label,
          offsetM: s.offsetM,
        }));

        await mapRef.current?.setVehicles(
          specs.map((s) => ({
            vehicleId: s.id,
            color: s.color,
            label: s.label,
            start: s.start,
          }))
        );
        await mapRef.current?.recenterOnTracks();
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : "Failed to render points");
      }
    }
    if (!playingRef.current && !pausedRef.current) void draw();
    return () => { cancelled = true; };
  }, [selectedPointLayerId, selectedRouteLayerId]);

  const stopAnimation = () => {
    playingRef.current = false;
    pausedRef.current = false;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTickRef.current = null;
  };

  const resetClock = () => {
    simMRef.current = 0;
    lastTickRef.current = null;
    setSeekPct(0);
  };

  const applyFrame = useCallback(() => {
    const route = routeRef.current;
    const vehicles = vehiclesRef.current;
    if (!route || vehicles.length === 0) return;

    const totalM = Math.max(1, route.totalM);
    setSeekPct(Math.min(1, simMRef.current / totalM));

    const updates: Record<string, LiveState> = {};
    for (const v of vehicles) {
      let dist = v.offsetM + simMRef.current;
      let status: LiveState["status"] = "moving";
      if (loopRef.current) {
        dist = ((dist % totalM) + totalM) % totalM;
      } else if (dist >= totalM) {
        dist = totalM;
        status = "completed";
      }
      const s = sampleAtDistance(route, dist);
      updates[v.id] = {
        vehicleId: v.id,
        label: v.label,
        lng: s.lng,
        lat: s.lat,
        headingDeg: s.headingDeg,
        status,
      };
      mapRef.current?.updateVehicle({
        vehicleId: v.id,
        lng: s.lng,
        lat: s.lat,
        headingDeg: s.headingDeg,
        speedKmh: BASE_SPEED_MPS * speedRef.current * 3.6,
        visible: true,
      });
    }
    setLive(updates);
  }, []);

  const step = useCallback(() => {
    rafRef.current = null;
    if (!playingRef.current || pausedRef.current) return;
    const route = routeRef.current;
    if (!route) return;

    const now = performance.now();
    const dt = lastTickRef.current == null ? 0 : now - lastTickRef.current;
    lastTickRef.current = now;

    const advanceM = BASE_SPEED_MPS * speedRef.current * (dt / 1000);
    simMRef.current += advanceM;

    if (!loopRef.current && simMRef.current >= route.totalM) {
      simMRef.current = route.totalM;
      applyFrame();
      playingRef.current = false;
      lastTickRef.current = null;
      setSim((s) => (s ? { ...s, status: "completed" } : s));
      return;
    }

    applyFrame();
    rafRef.current = requestAnimationFrame(step);
  }, [applyFrame]);

  const handleStart = async () => {
    if (selectedPointLayerId === "" || selectedRouteLayerId === "") {
      setError("Pick both a control (points) layer and a route (line) layer");
      return;
    }
    const route = routeRef.current;
    const vehicles = vehiclesRef.current;
    if (!route || vehicles.length === 0) {
      setError("Layers haven't finished rendering yet. Wait a moment and retry.");
      return;
    }

    setError(null);
    setStarting(true);
    try {
      // Re-seed each vehicle at its staggered offset along the current route so
      // the animation starts from a predictable, evenly-distributed fleet layout.
      const specs: SimVehicleSpec[] = vehicles.map((v, idx) => {
        const palette = PALETTE[idx % PALETTE.length];
        const pos = sampleAtDistance(route, v.offsetM);
        return {
          vehicleId: v.id,
          color: palette.color,
          start: { lng: pos.lng, lat: pos.lat },
          label: v.label,
        };
      });
      await mapRef.current?.setVehicles(specs);

      const created = await apiFetch<{ data: SimulationRecord }>("/api/simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_ids: vehicles.map((v) => v.id),
          route_id: `feature-layer:${selectedRouteLayerId}`,
          speed_multiplier: speed,
          loop,
        }),
      });
      setSim(created.data);

      resetClock();
      playingRef.current = true;
      pausedRef.current = false;
      rafRef.current = requestAnimationFrame(step);
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
    rafRef.current = requestAnimationFrame(step);
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
    if (!routeRef.current) return;
    resetClock();
    applyFrame();
    playingRef.current = true;
    pausedRef.current = false;
    lastTickRef.current = null;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
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
    const pct = Math.max(0, Math.min(1, (Array.isArray(value) ? value[0] : value) / 100));
    const route = routeRef.current;
    if (!route) return;
    simMRef.current = route.totalM * pct;
    setSeekPct(pct);
    lastTickRef.current = null;
    applyFrame();
    if (playingRef.current && !pausedRef.current && rafRef.current == null) {
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

  const handlePointLayerChange = (e: SelectChangeEvent<number | "">) => {
    const v = e.target.value;
    setSelectedPointLayerId(v === "" ? "" : Number(v));
  };
  const handleRouteLayerChange = (e: SelectChangeEvent<number | "">) => {
    const v = e.target.value;
    setSelectedRouteLayerId(v === "" ? "" : Number(v));
  };

  useEffect(() => () => stopAnimation(), []);

  const timelineLabel = useMemo(() => {
    const route = routeRef.current;
    if (!route) return null;
    const km = route.totalM / 1000;
    return `${km.toFixed(2)} km @ ${speed.toFixed(1)}x`;
  }, [speed, seekPct, sim]);

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
        <Stack direction="row" justifyContent="space-between" alignItems="center">
          <Typography variant="h6">Real-time simulation</Typography>
          <Button size="small" startIcon={<RefreshCw size={14} />} onClick={loadLayers} disabled={loadingLayers}>
            Reload
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Pick a <b>point feature layer</b> as the control (each feature becomes a vehicle) and a <b>line feature layer</b>
          &nbsp;as the route. Points are staggered evenly along the route and animated with
          <code> requestAnimationFrame</code>.
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

        <FormControl size="small" fullWidth disabled={loadingLayers || isRunning || isPaused}>
          <InputLabel id="sim-route-layer-label">Route layer (lines)</InputLabel>
          <Select
            labelId="sim-route-layer-label"
            label="Route layer (lines)"
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

        {(selectedPointLayer || selectedLineLayer) && (
          <Stack direction="row" spacing={1} flexWrap="wrap">
            {selectedPointLayer && (
              <Chip
                size="small"
                label={`${selectedPointLayer.name} — ${selectedPointLayer.feature_count} pts`}
                color="primary"
                variant="outlined"
              />
            )}
            {selectedLineLayer && (
              <Chip
                size="small"
                label={`${selectedLineLayer.name} — ${selectedLineLayer.feature_count} lines`}
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
              starting || isRunning || isPaused || selectedPointLayerId === "" || selectedRouteLayerId === ""
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
          <Stack direction="row" alignItems="center" spacing={1}>
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
            disabled={!routeRef.current}
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
              .map((s, idx) => {
                const palette = PALETTE[idx % PALETTE.length];
                return (
                  <Stack
                    key={s.vehicleId}
                    direction="row"
                    spacing={1}
                    alignItems="center"
                    sx={{ fontSize: 12 }}
                  >
                    <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: palette.hex }} />
                    <Typography variant="caption" sx={{ minWidth: 80 }} noWrap>
                      {s.label}
                    </Typography>
                    <Typography variant="caption" color="text.secondary">
                      {s.headingDeg.toFixed(0)}° · {s.status}
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
