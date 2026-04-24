"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Checkbox,
  Chip,
  Divider,
  FormControlLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Paper,
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
  SimVehicleTrack,
} from "@/components/SimulationMapClient";

const SimulationMap = dynamic(
  () => import("@/components/SimulationMapClient").then((m) => m.SimulationMapClient),
  { ssr: false, loading: () => <LinearProgress /> }
);

type VehicleSummary = {
  vehicle_id: string;
  point_count: number;
  first_point_time: string | null;
  last_point_time: string | null;
  route_ids: string[];
};

type Point = {
  vehicle_id: string;
  route_id: string | null;
  point_time: string;
  speed_kmh: number | null;
  heading_deg: number | null;
  longitude: number;
  latitude: number;
};

type PointsResponse = {
  vehicle_id: string;
  count: number;
  points: Point[];
};

type SimulationRecord = {
  simulation_id: string;
  status: "pending" | "running" | "paused" | "stopped" | "completed" | "failed";
  vehicle_ids: string[];
  route_id: string | null;
  speed_multiplier: number;
  loop: boolean;
  started_at: string | null;
  paused_at: string | null;
  ended_at: string | null;
  last_point_time: string | null;
};

type PaletteEntry = { color: [number, number, number]; hex: string };

const PALETTE: PaletteEntry[] = [
  { color: [239, 68, 68], hex: "#ef4444" },
  { color: [59, 130, 246], hex: "#3b82f6" },
  { color: [16, 185, 129], hex: "#10b981" },
  { color: [234, 179, 8], hex: "#eab308" },
  { color: [168, 85, 247], hex: "#a855f7" },
];

type LiveState = {
  vehicleId: string;
  lng: number;
  lat: number;
  headingDeg: number;
  speedKmh: number;
  timestamp: string;
  status: "pending" | "moving" | "completed";
};

export default function SimulationPage() {
  const { user, loading: authLoading } = useAuth();
  const router = useRouter();
  const mapRef = useRef<SimulationMapHandle>(null);

  const [vehicles, setVehicles] = useState<VehicleSummary[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [points, setPoints] = useState<Record<string, Point[]>>({});
  const [sim, setSim] = useState<SimulationRecord | null>(null);
  const [speed, setSpeed] = useState(1);
  const [loop, setLoop] = useState(false);
  const [seekPct, setSeekPct] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [loadingVehicles, setLoadingVehicles] = useState(true);
  const [starting, setStarting] = useState(false);
  const [live, setLive] = useState<Record<string, LiveState>>({});

  const playingRef = useRef(false);
  const pausedRef = useRef(false);
  const simMsRef = useRef(0);
  const lastTickRef = useRef<number | null>(null);
  const speedRef = useRef(1);
  const loopRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const timelineRef = useRef<{
    startMs: number;
    endMs: number;
    tracks: Array<{
      vehicleId: string;
      offsets: number[];
      points: Point[];
    }>;
  } | null>(null);

  useEffect(() => {
    if (!authLoading && !user) router.replace("/login");
  }, [user, authLoading, router]);

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => {
    loopRef.current = loop;
  }, [loop]);

  const loadVehicles = useCallback(async () => {
    setLoadingVehicles(true);
    setError(null);
    try {
      const res = await apiFetch<{ data: VehicleSummary[] }>("/api/vehicles");
      setVehicles(res.data ?? []);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Failed to load vehicles";
      setError(msg);
    } finally {
      setLoadingVehicles(false);
    }
  }, []);

  useEffect(() => {
    if (user) void loadVehicles();
  }, [user, loadVehicles]);

  const toggleVehicle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const buildTracksFromPoints = useCallback(
    (vehicleIds: string[], pointsByVehicle: Record<string, Point[]>): SimVehicleTrack[] =>
      vehicleIds.map((vehicleId, index) => {
        const palette = PALETTE[index % PALETTE.length];
        const vpoints = pointsByVehicle[vehicleId] ?? [];
        return {
          vehicleId,
          color: palette.color,
          points: vpoints.map((p) => ({ lng: p.longitude, lat: p.latitude })),
        };
      }),
    []
  );

  const buildTimeline = useCallback(
    (vehicleIds: string[], pointsByVehicle: Record<string, Point[]>) => {
      let startMs = Infinity;
      let endMs = -Infinity;
      const perVehicle = vehicleIds.map((vehicleId) => {
        const vpoints = pointsByVehicle[vehicleId] ?? [];
        if (vpoints.length === 0) {
          return { vehicleId, offsets: [] as number[], points: vpoints };
        }
        const times = vpoints.map((p) => new Date(p.point_time).getTime());
        startMs = Math.min(startMs, times[0]);
        endMs = Math.max(endMs, times[times.length - 1]);
        return { vehicleId, offsets: times, points: vpoints };
      });
      if (!isFinite(startMs) || !isFinite(endMs)) {
        return null;
      }
      return {
        startMs,
        endMs,
        tracks: perVehicle.map((t) => ({
          ...t,
          offsets: t.offsets.map((x) => x - startMs),
        })),
      };
    },
    []
  );

  const stopAnimation = () => {
    playingRef.current = false;
    pausedRef.current = false;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = null;
    lastTickRef.current = null;
  };

  const resetClock = () => {
    simMsRef.current = 0;
    lastTickRef.current = null;
    setSeekPct(0);
  };

  const step = useCallback(() => {
    rafRef.current = null;
    if (!playingRef.current || pausedRef.current) return;
    const timeline = timelineRef.current;
    if (!timeline) return;

    const now = performance.now();
    const dt = lastTickRef.current == null ? 0 : now - lastTickRef.current;
    lastTickRef.current = now;

    const duration = timeline.endMs - timeline.startMs;
    simMsRef.current += dt * speedRef.current;

    let endReached = false;
    if (simMsRef.current >= duration) {
      if (loopRef.current) {
        simMsRef.current = simMsRef.current % Math.max(duration, 1);
      } else {
        simMsRef.current = duration;
        endReached = true;
      }
    }

    const pct = duration > 0 ? Math.min(1, simMsRef.current / duration) : 0;
    setSeekPct(pct);

    const updates: Record<string, LiveState> = {};
    for (const track of timeline.tracks) {
      if (track.points.length === 0) continue;
      const { offsets, points: ps } = track;
      const t = simMsRef.current;

      if (t < offsets[0]) {
        updates[track.vehicleId] = {
          vehicleId: track.vehicleId,
          lng: ps[0].longitude,
          lat: ps[0].latitude,
          headingDeg: ps[0].heading_deg ?? 0,
          speedKmh: 0,
          timestamp: ps[0].point_time,
          status: "pending",
        };
        mapRef.current?.updateVehicle({
          vehicleId: track.vehicleId,
          lng: ps[0].longitude,
          lat: ps[0].latitude,
          headingDeg: ps[0].heading_deg ?? 0,
          speedKmh: 0,
          visible: false,
        });
        continue;
      }

      let i = offsets.length - 1;
      for (let k = offsets.length - 1; k >= 0; k--) {
        if (offsets[k] <= t) { i = k; break; }
      }
      const last = i >= offsets.length - 1;
      const prev = ps[i];
      const next = last ? prev : ps[i + 1];
      const segStart = offsets[i];
      const segEnd = last ? segStart : offsets[i + 1];
      const segDur = Math.max(1, segEnd - segStart);
      const ratio = last ? 1 : Math.min(1, Math.max(0, (t - segStart) / segDur));

      const lng = prev.longitude + (next.longitude - prev.longitude) * ratio;
      const lat = prev.latitude + (next.latitude - prev.latitude) * ratio;
      const heading = prev.heading_deg ?? 0;
      const spd = prev.speed_kmh ?? 0;

      updates[track.vehicleId] = {
        vehicleId: track.vehicleId,
        lng,
        lat,
        headingDeg: heading,
        speedKmh: spd,
        timestamp: prev.point_time,
        status: last ? "completed" : "moving",
      };

      mapRef.current?.updateVehicle({
        vehicleId: track.vehicleId,
        lng,
        lat,
        headingDeg: heading,
        speedKmh: spd,
        visible: true,
      });
    }
    setLive(updates);

    if (endReached) {
      playingRef.current = false;
      lastTickRef.current = null;
      setSim((s) => (s ? { ...s, status: "completed" } : s));
      return;
    }
    rafRef.current = requestAnimationFrame(step);
  }, []);

  const handleStart = async () => {
    if (selected.size === 0) {
      setError("Select at least one vehicle");
      return;
    }
    setError(null);
    setStarting(true);
    try {
      const vehicleIds = Array.from(selected);
      const fetched: Record<string, Point[]> = {};
      await Promise.all(
        vehicleIds.map(async (id) => {
          const res = await apiFetch<PointsResponse>(
            `/api/vehicles/${encodeURIComponent(id)}/points?limit=20000`
          );
          fetched[id] = res.points ?? [];
        })
      );
      setPoints(fetched);

      const tracks = buildTracksFromPoints(vehicleIds, fetched);
      await mapRef.current?.setTracks(tracks);
      await mapRef.current?.recenterOnTracks();

      const timeline = buildTimeline(vehicleIds, fetched);
      timelineRef.current = timeline;
      if (!timeline) {
        setError("Selected vehicles have no points");
        setStarting(false);
        return;
      }

      const created = await apiFetch<{ data: SimulationRecord }>("/api/simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          vehicle_ids: vehicleIds,
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
      const msg = e instanceof Error ? e.message : "Failed to start simulation";
      setError(msg);
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
    if (!playingRef.current) {
      playingRef.current = true;
    }
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
    if (!sim || !timelineRef.current) return;
    resetClock();
    playingRef.current = true;
    pausedRef.current = false;
    lastTickRef.current = null;
    if (rafRef.current != null) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(step);
    try {
      const res = await callLifecycle("reset");
      if (res?.data) setSim(res.data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Reset failed");
    }
  };

  const handleSeek = (_: Event, value: number | number[]) => {
    const pct = Math.max(0, Math.min(1, (Array.isArray(value) ? value[0] : value) / 100));
    const timeline = timelineRef.current;
    if (!timeline) return;
    const duration = timeline.endMs - timeline.startMs;
    simMsRef.current = duration * pct;
    setSeekPct(pct);
    lastTickRef.current = null;
    if (playingRef.current && !pausedRef.current && rafRef.current == null) {
      rafRef.current = requestAnimationFrame(step);
    }
    if (sim) {
      const iso = new Date(timeline.startMs + simMsRef.current).toISOString();
      apiFetch(`/api/simulations/${sim.simulation_id}/seek`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ point_time: iso }),
      }).catch(() => undefined);
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

  useEffect(() => () => stopAnimation(), []);

  const timelineLabel = useMemo(() => {
    const timeline = timelineRef.current;
    if (!timeline) return null;
    const duration = (timeline.endMs - timeline.startMs) / 1000;
    return `${duration.toFixed(0)}s @ ${speed.toFixed(1)}x`;
  }, [speed, seekPct, sim]);

  if (authLoading || !user) {
    return (
      <Box sx={{ p: 3 }}>
        <LinearProgress />
      </Box>
    );
  }

  const isRunning = sim?.status === "running" && playingRef.current && !pausedRef.current;
  const isPaused = sim?.status === "paused" || (playingRef.current && pausedRef.current);
  const canControl = !!sim && sim.status !== "stopped";

  return (
    <Box
      sx={{
        display: "grid",
        gridTemplateColumns: { xs: "1fr", md: "340px 1fr" },
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
          <Button size="small" startIcon={<RefreshCw size={14} />} onClick={loadVehicles} disabled={loadingVehicles}>
            Reload
          </Button>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Replay historical vehicle trajectories from <code>car_points_history</code>. Points stream chronologically with
          per-segment heading and speed, interpolated by <code>requestAnimationFrame</code>.
        </Typography>
        {error && <Alert severity="error">{error}</Alert>}

        <Divider />

        <Typography variant="subtitle2">Vehicles</Typography>
        {loadingVehicles ? (
          <LinearProgress />
        ) : vehicles.length === 0 ? (
          <Typography variant="body2" color="text.secondary">
            No vehicle points have been seeded yet.
          </Typography>
        ) : (
          <List dense disablePadding>
            {vehicles.map((v, idx) => {
              const palette = PALETTE[idx % PALETTE.length];
              const checked = selected.has(v.vehicle_id);
              return (
                <ListItem key={v.vehicle_id} disablePadding>
                  <ListItemButton
                    onClick={() => toggleVehicle(v.vehicle_id)}
                    disabled={isRunning || isPaused}
                    sx={{ borderRadius: 1 }}
                  >
                    <ListItemIcon sx={{ minWidth: 32 }}>
                      <Checkbox
                        edge="start"
                        checked={checked}
                        size="small"
                        tabIndex={-1}
                        disableRipple
                        sx={{ color: palette.hex, "&.Mui-checked": { color: palette.hex } }}
                      />
                    </ListItemIcon>
                    <ListItemText
                      primary={
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="body2">{v.vehicle_id}</Typography>
                          <Chip size="small" label={`${v.point_count} pts`} variant="outlined" />
                        </Stack>
                      }
                      secondary={v.route_ids.join(", ") || "—"}
                    />
                  </ListItemButton>
                </ListItem>
              );
            })}
          </List>
        )}

        <Divider />

        <Typography variant="subtitle2">Controls</Typography>
        <Stack direction="row" spacing={1}>
          <Button
            variant="contained"
            startIcon={<Play size={16} />}
            onClick={handleStart}
            disabled={starting || isRunning || isPaused || selected.size === 0}
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
              <Switch
                size="small"
                checked={loop}
                onChange={(_, v) => setLoop(v)}
              />
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
            disabled={!timelineRef.current}
          />
        </Stack>

        <Divider />

        <Typography variant="subtitle2">Status</Typography>
        {sim ? (
          <Stack spacing={0.5}>
            <Typography variant="caption" color="text.secondary">
              Simulation <code>{sim.simulation_id.slice(0, 8)}…</code> — <b>{sim.status}</b>
            </Typography>
            {Object.values(live).map((s, idx) => {
              const palette = PALETTE[Array.from(selected).indexOf(s.vehicleId) % PALETTE.length] ?? PALETTE[idx];
              return (
                <Stack
                  key={s.vehicleId}
                  direction="row"
                  spacing={1}
                  alignItems="center"
                  sx={{ fontSize: 12 }}
                >
                  <Box sx={{ width: 10, height: 10, borderRadius: "50%", bgcolor: palette.hex }} />
                  <Typography variant="caption" sx={{ minWidth: 72 }}>
                    {s.vehicleId}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">
                    {s.speedKmh.toFixed(1)} km/h · {s.headingDeg.toFixed(0)}° · {s.status}
                  </Typography>
                </Stack>
              );
            })}
          </Stack>
        ) : (
          <Typography variant="caption" color="text.secondary">
            No active simulation. Select vehicles and press Start.
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
