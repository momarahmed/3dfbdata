"use client";

import {
  Alert,
  Box,
  Button,
  Checkbox,
  Divider,
  FormControl,
  FormControlLabel,
  InputLabel,
  LinearProgress,
  MenuItem,
  Select,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { Rocket } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { apiFetch } from "@/lib/api";

type PairMode = "ONE_END" | "BY_ORDER" | "BY_FIELD";

type RoutingLayer = {
  id: string;
  name: string;
  geometry_type: string | null;
  feature_count: number;
  srid: number;
  fields: Array<{ name: string; type: string | null }>;
};

type FieldList = Array<{ name: string; type: string | null }>;

export type RoutingTaskResult = {
  task: {
    id: string;
    status: string;
    message: string | null;
    stats: Record<string, unknown> | null;
    output_routes_layer_id: string | null;
    output_nodes_layer_id: string | null;
    output_points_layer_id: string | null;
  };
  output_layers: {
    routes: { id: string; name: string; geojson_url: string } | null;
    nodes: { id: string; name: string; geojson_url: string } | null;
    points: { id: string; name: string; geojson_url: string } | null;
  };
};

type Props = {
  onSuccess: (result: RoutingTaskResult) => void;
};

const defaults = {
  output_routes_layer_name: "Routes_AStar",
  output_nodes_layer_name: "GraphNodes_AStar",
  output_points_layer_name: "RoutePoints_5m",
  pair_mode: "ONE_END" as PairMode,
  auto_project_to_utm: true,
  target_epsg: 32638,
  round_xy: 2,
  default_speed_kmh: 50,
  min_speed_kmh: 5,
  max_speed_kmh: 160,
  heuristic_max_speed_kmh: 120,
  generate_points: true,
  points_step_m: 5,
  points_heading_offset_m: 0.5,
};

export function RoutingTaskPanel({ onSuccess }: Props) {
  // Layer catalogs
  const [lineLayers, setLineLayers] = useState<RoutingLayer[]>([]);
  const [pointLayers, setPointLayers] = useState<RoutingLayer[]>([]);
  const [layersLoading, setLayersLoading] = useState(false);
  const [layersError, setLayersError] = useState<string | null>(null);

  // Selections
  const [roadsId, setRoadsId] = useState<string>("");
  const [startId, setStartId] = useState<string>("");
  const [endId, setEndId] = useState<string>("");

  // Fields for selected layers
  const [roadsFields, setRoadsFields] = useState<FieldList>([]);
  const [startFields, setStartFields] = useState<FieldList>([]);
  const [endFields, setEndFields] = useState<FieldList>([]);

  // Form
  const [outRoutesName, setOutRoutesName] = useState(defaults.output_routes_layer_name);
  const [outNodesName, setOutNodesName] = useState(defaults.output_nodes_layer_name);
  const [speedField, setSpeedField] = useState<string>("");
  const [onewayField, setOnewayField] = useState<string>("");
  const [pairMode, setPairMode] = useState<PairMode>(defaults.pair_mode);
  const [pairField, setPairField] = useState<string>("");
  const [startIdField, setStartIdField] = useState<string>("");
  const [endIdField, setEndIdField] = useState<string>("");
  const [autoProject, setAutoProject] = useState(defaults.auto_project_to_utm);
  const [targetEpsg, setTargetEpsg] = useState<number>(defaults.target_epsg);
  const [roundXy, setRoundXy] = useState<number>(defaults.round_xy);
  const [defaultSpeed, setDefaultSpeed] = useState<number>(defaults.default_speed_kmh);
  const [minSpeed, setMinSpeed] = useState<number>(defaults.min_speed_kmh);
  const [maxSpeed, setMaxSpeed] = useState<number>(defaults.max_speed_kmh);
  const [heurSpeed, setHeurSpeed] = useState<number>(defaults.heuristic_max_speed_kmh);

  // Points generation
  const [generatePoints, setGeneratePoints] = useState<boolean>(defaults.generate_points);
  const [outPointsName, setOutPointsName] = useState<string>(defaults.output_points_layer_name);
  const [pointsStep, setPointsStep] = useState<number>(defaults.points_step_m);
  const [headingOffset, setHeadingOffset] = useState<number>(defaults.points_heading_offset_m);
  const [departureIso, setDepartureIso] = useState<string>(""); // optional, "YYYY-MM-DDTHH:mm"

  // Run state
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const loadLayers = useCallback(async () => {
    setLayersLoading(true);
    setLayersError(null);
    try {
      const [lineRes, pointRes] = await Promise.all([
        apiFetch<{ data: RoutingLayer[] }>(`/api/routing-tasks/layers?geometry=LINE`),
        apiFetch<{ data: RoutingLayer[] }>(`/api/routing-tasks/layers?geometry=POINT`),
      ]);
      setLineLayers(lineRes.data);
      setPointLayers(pointRes.data);
    } catch (e) {
      setLayersError(e instanceof Error ? e.message : String(e));
    } finally {
      setLayersLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadLayers();
  }, [loadLayers]);

  useEffect(() => {
    if (!roadsId) {
      setRoadsFields([]);
      return;
    }
    void apiFetch<{ fields: FieldList }>(`/api/routing-tasks/layers/${roadsId}/fields`).then(
      (r) => setRoadsFields(r.fields),
      () => setRoadsFields([])
    );
  }, [roadsId]);

  useEffect(() => {
    if (!startId) {
      setStartFields([]);
      return;
    }
    void apiFetch<{ fields: FieldList }>(`/api/routing-tasks/layers/${startId}/fields`).then(
      (r) => setStartFields(r.fields),
      () => setStartFields([])
    );
  }, [startId]);

  useEffect(() => {
    if (!endId) {
      setEndFields([]);
      return;
    }
    void apiFetch<{ fields: FieldList }>(`/api/routing-tasks/layers/${endId}/fields`).then(
      (r) => setEndFields(r.fields),
      () => setEndFields([])
    );
  }, [endId]);

  const byField = pairMode === "BY_FIELD";
  const pairFieldOptions = useMemo(() => {
    // Intersect start/end fields when BY_FIELD, otherwise show start fields.
    const startNames = new Set(startFields.map((f) => f.name));
    return endFields.filter((f) => startNames.has(f.name));
  }, [startFields, endFields]);

  const validate = (): string | null => {
    if (!roadsId) return "Select a roads layer.";
    if (!startId) return "Select a start points layer.";
    if (!endId) return "Select an end points layer.";
    if (!outRoutesName.trim()) return "Output routes layer name is required.";
    if (!outNodesName.trim()) return "Output nodes layer name is required.";
    if (outRoutesName.trim() === outNodesName.trim())
      return "Routes and nodes output names must differ.";
    if (!/^[A-Za-z0-9 _\-]{1,120}$/.test(outRoutesName.trim()))
      return "Routes output name contains invalid characters (letters, digits, space, _ or - only).";
    if (!/^[A-Za-z0-9 _\-]{1,120}$/.test(outNodesName.trim()))
      return "Nodes output name contains invalid characters.";
    if (byField && !pairField) return "Pair field is required when pairing by field.";
    if (!(minSpeed > 0 && maxSpeed > 0 && defaultSpeed > 0 && heurSpeed > 0))
      return "All speed values must be > 0.";
    if (minSpeed > maxSpeed) return "Min speed cannot exceed max speed.";
    if (autoProject && (targetEpsg < 1024 || targetEpsg > 999999))
      return "Target EPSG must be between 1024 and 999999.";
    if (!Number.isInteger(roundXy) || roundXy < 0 || roundXy > 6)
      return "Round XY must be an integer between 0 and 6.";
    if (generatePoints) {
      if (!outPointsName.trim()) return "Output route-points layer name is required.";
      if (!/^[A-Za-z0-9 _\-]{1,120}$/.test(outPointsName.trim()))
        return "Route-points output name contains invalid characters.";
      if (
        outPointsName.trim() === outRoutesName.trim() ||
        outPointsName.trim() === outNodesName.trim()
      ) {
        return "Route-points output name must differ from routes and nodes output names.";
      }
      if (!(pointsStep > 0)) return "Step (m) must be > 0.";
      if (!(headingOffset > 0) || headingOffset > pointsStep)
        return "Heading offset must be > 0 and ≤ step.";
    }
    return null;
  };

  const submit = async () => {
    const msg = validate();
    if (msg) {
      setError(msg);
      setSuccess(null);
      return;
    }
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const result = await apiFetch<RoutingTaskResult>(`/api/routing-tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: `${outRoutesName.trim()} @ ${new Date().toISOString().slice(0, 19)}`,
          roads_layer_id: roadsId,
          start_layer_id: startId,
          end_layer_id: endId,
          output_routes_layer_name: outRoutesName.trim(),
          output_nodes_layer_name: outNodesName.trim(),
          speed_field: speedField || null,
          oneway_field: onewayField || null,
          pair_mode: pairMode,
          pair_field: byField ? pairField : null,
          start_id_field: startIdField || null,
          end_id_field: endIdField || null,
          auto_project_to_utm: autoProject,
          target_epsg: autoProject ? targetEpsg : 4326,
          round_xy: roundXy,
          default_speed_kmh: defaultSpeed,
          min_speed_kmh: minSpeed,
          max_speed_kmh: maxSpeed,
          heuristic_max_speed_kmh: heurSpeed,

          generate_points: generatePoints,
          output_points_layer_name: generatePoints ? outPointsName.trim() : null,
          points_step_m: generatePoints ? pointsStep : null,
          points_heading_offset_m: generatePoints ? headingOffset : null,
          departure_iso_utc:
            generatePoints && departureIso ? new Date(departureIso).toISOString() : null,
        }),
      });
      const stats = result.task.stats ?? {};
      const ok = stats["routes_ok"] ?? "?";
      const failed = stats["routes_failed"] ?? "?";
      setSuccess(
        `Task ${result.task.status}. Routes OK: ${ok}, failed: ${failed}. Layers added to map.`
      );
      onSuccess(result);
    } catch (e) {
      const anyE = e as { status?: number; body?: { message?: string } };
      const body = anyE.body?.message;
      setError(body ?? (e instanceof Error ? e.message : String(e)));
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Stack spacing={1.5}>
      <Typography variant="overline" color="text.secondary">
        Routing Task (A*)
      </Typography>
      <Typography variant="caption" color="text.secondary">
        Build routes from PostGIS roads + start/end layers. Outputs are saved back as new PostGIS feature layers and automatically added to the map.
      </Typography>

      {layersLoading && <LinearProgress />}
      {layersError && (
        <Alert severity="error" onClose={() => setLayersError(null)}>
          Failed to load layers: {layersError}
        </Alert>
      )}

      <FormControl size="small" fullWidth>
        <InputLabel>Roads layer (line)</InputLabel>
        <Select
          value={roadsId}
          label="Roads layer (line)"
          onChange={(e) => setRoadsId(e.target.value)}
        >
          {lineLayers.map((l) => (
            <MenuItem key={l.id} value={l.id}>
              {l.name} · {l.feature_count}
            </MenuItem>
          ))}
          {lineLayers.length === 0 && <MenuItem value="" disabled>No line layers imported</MenuItem>}
        </Select>
      </FormControl>

      <Stack direction="row" spacing={1}>
        <FormControl size="small" fullWidth>
          <InputLabel>Start points layer</InputLabel>
          <Select
            value={startId}
            label="Start points layer"
            onChange={(e) => setStartId(e.target.value)}
          >
            {pointLayers.map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.name} · {l.feature_count}
              </MenuItem>
            ))}
            {pointLayers.length === 0 && <MenuItem value="" disabled>No point layers imported</MenuItem>}
          </Select>
        </FormControl>
        <FormControl size="small" fullWidth>
          <InputLabel>End points layer</InputLabel>
          <Select
            value={endId}
            label="End points layer"
            onChange={(e) => setEndId(e.target.value)}
          >
            {pointLayers.map((l) => (
              <MenuItem key={l.id} value={l.id}>
                {l.name} · {l.feature_count}
              </MenuItem>
            ))}
            {pointLayers.length === 0 && <MenuItem value="" disabled>No point layers imported</MenuItem>}
          </Select>
        </FormControl>
      </Stack>

      <Divider flexItem />

      <Stack direction="row" spacing={1}>
        <TextField
          size="small"
          fullWidth
          label="Output routes layer name"
          value={outRoutesName}
          onChange={(e) => setOutRoutesName(e.target.value)}
        />
        <TextField
          size="small"
          fullWidth
          label="Output graph nodes layer name"
          value={outNodesName}
          onChange={(e) => setOutNodesName(e.target.value)}
        />
      </Stack>

      <Stack direction="row" spacing={1}>
        <FormControl size="small" fullWidth>
          <InputLabel>Speed field</InputLabel>
          <Select value={speedField} label="Speed field" onChange={(e) => setSpeedField(e.target.value)}>
            <MenuItem value=""><em>— none (use default speed) —</em></MenuItem>
            {roadsFields.map((f) => (
              <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" fullWidth>
          <InputLabel>Oneway field</InputLabel>
          <Select value={onewayField} label="Oneway field" onChange={(e) => setOnewayField(e.target.value)}>
            <MenuItem value=""><em>— none (treat all as two-way) —</em></MenuItem>
            {roadsFields.map((f) => (
              <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Stack direction="row" spacing={1}>
        <FormControl size="small" fullWidth>
          <InputLabel>Pair mode</InputLabel>
          <Select value={pairMode} label="Pair mode" onChange={(e) => setPairMode(e.target.value as PairMode)}>
            <MenuItem value="ONE_END">ONE_END — all starts to first end</MenuItem>
            <MenuItem value="BY_ORDER">BY_ORDER — start[i] ↔ end[i]</MenuItem>
            <MenuItem value="BY_FIELD">BY_FIELD — match by field</MenuItem>
          </Select>
        </FormControl>
        <FormControl size="small" fullWidth disabled={!byField}>
          <InputLabel>Pair field</InputLabel>
          <Select value={pairField} label="Pair field" onChange={(e) => setPairField(e.target.value)}>
            <MenuItem value=""><em>— select —</em></MenuItem>
            {pairFieldOptions.map((f) => (
              <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Stack direction="row" spacing={1}>
        <FormControl size="small" fullWidth>
          <InputLabel>Start ID field</InputLabel>
          <Select value={startIdField} label="Start ID field" onChange={(e) => setStartIdField(e.target.value)}>
            <MenuItem value=""><em>— feature id —</em></MenuItem>
            {startFields.map((f) => (
              <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl size="small" fullWidth>
          <InputLabel>End ID field</InputLabel>
          <Select value={endIdField} label="End ID field" onChange={(e) => setEndIdField(e.target.value)}>
            <MenuItem value=""><em>— feature id —</em></MenuItem>
            {endFields.map((f) => (
              <MenuItem key={f.name} value={f.name}>{f.name}</MenuItem>
            ))}
          </Select>
        </FormControl>
      </Stack>

      <Divider flexItem />

      <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
        <FormControlLabel
          control={<Checkbox size="small" checked={autoProject} onChange={(_, v) => setAutoProject(v)} />}
          label="Auto-project to UTM (meters)"
        />
        <TextField
          size="small"
          type="number"
          label="Target EPSG"
          value={targetEpsg}
          onChange={(e) => setTargetEpsg(parseInt(e.target.value || "0", 10))}
          disabled={!autoProject}
          sx={{ maxWidth: 140 }}
        />
      </Stack>

      <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
        <TextField
          size="small"
          type="number"
          label="Round XY"
          value={roundXy}
          onChange={(e) => setRoundXy(parseInt(e.target.value || "0", 10))}
          sx={{ width: 110 }}
        />
        <TextField
          size="small"
          type="number"
          label="Default speed (km/h)"
          value={defaultSpeed}
          onChange={(e) => setDefaultSpeed(parseFloat(e.target.value || "0"))}
          sx={{ width: 160 }}
        />
        <TextField
          size="small"
          type="number"
          label="Min speed"
          value={minSpeed}
          onChange={(e) => setMinSpeed(parseFloat(e.target.value || "0"))}
          sx={{ width: 120 }}
        />
        <TextField
          size="small"
          type="number"
          label="Max speed"
          value={maxSpeed}
          onChange={(e) => setMaxSpeed(parseFloat(e.target.value || "0"))}
          sx={{ width: 120 }}
        />
        <TextField
          size="small"
          type="number"
          label="Heuristic max speed"
          value={heurSpeed}
          onChange={(e) => setHeurSpeed(parseFloat(e.target.value || "0"))}
          sx={{ width: 170 }}
        />
      </Stack>

      <Divider flexItem />

      <Box>
        <FormControlLabel
          control={
            <Checkbox
              size="small"
              checked={generatePoints}
              onChange={(_, v) => setGeneratePoints(v)}
            />
          }
          label={
            <Typography variant="body2">
              Generate route points (samples along each route)
            </Typography>
          }
        />
        {generatePoints && (
          <Stack spacing={1} sx={{ mt: 1 }}>
            <TextField
              size="small"
              fullWidth
              label="Output route-points layer name"
              value={outPointsName}
              onChange={(e) => setOutPointsName(e.target.value)}
            />
            <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap" }}>
              <TextField
                size="small"
                type="number"
                label="Step (m)"
                value={pointsStep}
                onChange={(e) => setPointsStep(parseFloat(e.target.value || "0"))}
                sx={{ width: 110 }}
              />
              <TextField
                size="small"
                type="number"
                label="Heading offset (m)"
                value={headingOffset}
                onChange={(e) => setHeadingOffset(parseFloat(e.target.value || "0"))}
                sx={{ width: 160 }}
              />
              <TextField
                size="small"
                type="datetime-local"
                label="Departure (UTC)"
                value={departureIso}
                onChange={(e) => setDepartureIso(e.target.value)}
                slotProps={{ inputLabel: { shrink: true } }}
                sx={{ width: 220 }}
                helperText="Leave empty to use 'now' when the task runs"
              />
            </Stack>
          </Stack>
        )}
      </Box>

      {error && (
        <Alert severity="error" onClose={() => setError(null)}>
          {error}
        </Alert>
      )}
      {success && (
        <Alert severity="success" onClose={() => setSuccess(null)}>
          {success}
        </Alert>
      )}
      {submitting && (
        <Box>
          <LinearProgress />
          <Typography variant="caption" color="text.secondary">
            Running A*… building graph, snapping points, computing routes.
          </Typography>
        </Box>
      )}

      <Button
        variant="contained"
        color="primary"
        startIcon={<Rocket size={16} />}
        onClick={() => void submit()}
        disabled={submitting}
      >
        {submitting ? "Running…" : "Run Routing Job"}
      </Button>
    </Stack>
  );
}
