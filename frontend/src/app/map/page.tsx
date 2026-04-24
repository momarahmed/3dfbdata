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
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  Divider,
  FormControl,
  IconButton,
  InputLabel,
  LinearProgress,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  MenuItem,
  Paper,
  Select,
  Stack,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Layers, MapPin, Plus, Trash2, RefreshCw, Move, Server, Pencil, Route } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, getApiBase } from "@/lib/api";
import type { FullMapHandle, UserLayer, ExternalLayer } from "@/components/FullMapClient";
import { RoutingTaskPanel, type RoutingTaskResult } from "@/components/RoutingTaskPanel";

const FullMapClient = dynamic(
  () => import("@/components/FullMapClient").then((m) => m.FullMapClient),
  { ssr: false, loading: () => <LinearProgress /> }
);

type EditingPoint =
  | { kind: "destination"; id: string; name: string; lng: number; lat: number }
  | { kind: "distanation"; id: string; dist_name: string; lng: number; lat: number };

const externalTypes: ExternalLayer["type"][] = [
  "FeatureLayer",
  "MapImageLayer",
  "TileLayer",
  "VectorTileLayer",
  "WMS",
];

const externalPresets: Array<{ label: string; url: string; type: ExternalLayer["type"] }> = [
  {
    label: "USA Topo Maps (Esri)",
    url: "https://services.arcgisonline.com/arcgis/rest/services/USA_Topo_Maps/MapServer",
    type: "MapImageLayer",
  },
  {
    label: "World Imagery (Esri)",
    url: "https://services.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer",
    type: "TileLayer",
  },
  {
    label: "USGS National Map (MapServer)",
    url: "https://basemap.nationalmap.gov/arcgis/rest/services/USGSTopo/MapServer",
    type: "TileLayer",
  },
];

export default function MapPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const mapRef = useRef<FullMapHandle>(null);

  const [userLayers, setUserLayers] = useState<UserLayer[]>([]);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [externalLayers, setExternalLayers] = useState<ExternalLayer[]>([]);
  const [selectedExternalIds, setSelectedExternalIds] = useState<string[]>([]);
  const [destinationsVisible, setDestinationsVisible] = useState(true);
  const [distanationsVisible, setDistanationsVisible] = useState(true);
  const [destCount, setDestCount] = useState<number>(0);
  const [distanationCount, setDistanationCount] = useState<number>(0);

  const [extUrl, setExtUrl] = useState("");
  const [extName, setExtName] = useState("");
  const [extType, setExtType] = useState<ExternalLayer["type"]>("FeatureLayer");

  const [status, setStatus] = useState<string | null>(null);
  const [editing, setEditing] = useState<EditingPoint | null>(null);
  const [editLabel, setEditLabel] = useState("");

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  const reloadUserLayers = useCallback(async () => {
    const list = await apiFetch<{ data: UserLayer[] & { status: string }[] }>("/api/feature-layers");
    setUserLayers(
      list.data
        .filter((l) => (l as unknown as { status: string }).status === "READY")
        .map((l) => ({
          id: l.id,
          name: l.name,
          geojson_url: l.geojson_url,
          geometry_type: l.geometry_type,
        }))
    );
  }, []);

  const reloadDestCount = useCallback(async () => {
    const apiBase = getApiBase();
    try {
      const res = await fetch(`${apiBase}/api/destinations/geojson`);
      const fc = await res.json();
      setDestCount(Array.isArray(fc.features) ? fc.features.length : 0);
    } catch {
      /* ignore */
    }
  }, []);

  const reloadDistanationCount = useCallback(async () => {
    const apiBase = getApiBase();
    try {
      const res = await fetch(`${apiBase}/api/distanations/geojson`);
      const fc = await res.json();
      setDistanationCount(Array.isArray(fc.features) ? fc.features.length : 0);
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void reloadUserLayers();
    void reloadDestCount();
    void reloadDistanationCount();
  }, [user, reloadUserLayers, reloadDestCount, reloadDistanationCount]);

  const toggleUser = (id: string) =>
    setSelectedUserIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const toggleExternal = (id: string) =>
    setSelectedExternalIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const addExternal = () => {
    const url = extUrl.trim();
    if (!url) return;
    try {
      new URL(url);
    } catch {
      setStatus("Please provide a valid URL.");
      return;
    }
    const id = crypto.randomUUID();
    const name = extName.trim() || guessName(url) || extType;
    setExternalLayers((prev) => [...prev, { id, url, name, type: extType }]);
    setSelectedExternalIds((prev) => [...prev, id]);
    setExtUrl("");
    setExtName("");
    setStatus(`Added "${name}" (${extType}).`);
  };

  const removeExternal = (id: string) => {
    setExternalLayers((prev) => prev.filter((l) => l.id !== id));
    setSelectedExternalIds((prev) => prev.filter((x) => x !== id));
  };

  const handleEditDestination = useCallback((feat: { id: string; name: string; lng: number; lat: number }) => {
    setEditing({ kind: "destination", ...feat });
    setEditLabel(feat.name);
  }, []);

  const handleEditDistanation = useCallback((feat: { id: string; dist_name: string; lng: number; lat: number }) => {
    setEditing({ kind: "distanation", ...feat });
    setEditLabel(feat.dist_name);
  }, []);

  const saveEdit = useCallback(async () => {
    if (!editing) return;
    const label = editLabel.trim();
    if (!label) {
      setStatus(editing.kind === "distanation" ? "dist_name cannot be empty." : "Name cannot be empty.");
      return;
    }
    try {
      if (editing.kind === "destination") {
        await apiFetch(`/api/destinations/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name: label }),
        });
        setStatus("Destination renamed.");
        await mapRef.current?.refreshDestinations();
        await reloadDestCount();
      } else {
        await apiFetch(`/api/distanations/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dist_name: label }),
        });
        setStatus("Distanation dist_name updated.");
        await mapRef.current?.refreshDistanations();
        await reloadDistanationCount();
      }
      setEditing(null);
    } catch (e) {
      setStatus(`Save failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }, [editing, editLabel, reloadDestCount, reloadDistanationCount]);

  const moveEdit = useCallback(() => {
    if (!editing) return;
    if (editing.kind === "destination") {
      mapRef.current?.startEditDestination(editing.id);
    } else {
      mapRef.current?.startEditDistanation(editing.id);
    }
    setEditing(null);
    setStatus("Drag the point to a new location, then click away to save.");
  }, [editing]);

  const deleteEdit = useCallback(async () => {
    if (!editing) return;
    const label = editing.kind === "destination" ? editing.name : editing.dist_name;
    if (!confirm(`Delete "${label}"?`)) return;
    if (editing.kind === "destination") {
      await mapRef.current?.deleteDestination(editing.id);
      await reloadDestCount();
    } else {
      await mapRef.current?.deleteDistanation(editing.id);
      await reloadDistanationCount();
    }
    setEditing(null);
  }, [editing, reloadDestCount, reloadDistanationCount]);

  const onStatus = useCallback(
    (msg: string | null) => {
      setStatus(msg);
      void reloadDestCount();
      void reloadDistanationCount();
    },
    [reloadDestCount, reloadDistanationCount]
  );

  const handleRoutingTaskSuccess = useCallback(
    async (result: RoutingTaskResult) => {
      await reloadUserLayers();
      const newIds: string[] = [];
      if (result.output_layers.routes?.id) newIds.push(result.output_layers.routes.id);
      if (result.output_layers.nodes?.id) newIds.push(result.output_layers.nodes.id);
      if (result.output_layers.points?.id) newIds.push(result.output_layers.points.id);
      if (newIds.length > 0) {
        setSelectedUserIds((prev) => Array.from(new Set([...prev, ...newIds])));
      }
      const routesId = result.output_layers.routes?.id;
      if (routesId) {
        setTimeout(() => mapRef.current?.zoomToLayer(routesId), 1500);
      }
      const names = [
        result.output_layers.routes?.name,
        result.output_layers.nodes?.name,
        result.output_layers.points?.name,
      ].filter(Boolean).join(", ");
      setStatus(`Routing task finished. Layers added to map: ${names}.`);
    },
    [reloadUserLayers]
  );

  const userLayersMemo = useMemo(() => userLayers, [userLayers]);
  const extLayersMemo = useMemo(() => externalLayers, [externalLayers]);
  const selUserMemo = useMemo(() => selectedUserIds, [selectedUserIds]);
  const selExtMemo = useMemo(() => selectedExternalIds, [selectedExternalIds]);

  if (!user) return <LinearProgress />;

  return (
    <Box
      sx={{
        display: "flex",
        flexDirection: { xs: "column", lg: "row" },
        height: { xs: "auto", lg: "calc(100dvh - 32px)" },
        minHeight: { xs: 0, lg: 560 },
        maxHeight: { xs: "none", lg: "calc(100dvh - 32px)" },
        gap: { xs: 2, lg: 2.5 },
        p: { xs: 1.5, sm: 2 },
        boxSizing: "border-box",
      }}
    >
      <Paper
        elevation={1}
        sx={{
          width: { xs: "100%", lg: 400, xl: 440 },
          maxWidth: { xs: "100%", lg: 440 },
          flexShrink: 0,
          alignSelf: { xs: "stretch", lg: "flex-start" },
          maxHeight: { xs: "none", lg: "100%" },
          overflowY: "auto",
          overflowX: "hidden",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          p: { xs: 2, sm: 2.5 },
          display: "flex",
          flexDirection: "column",
          gap: 2.5,
          bgcolor: "background.paper",
          // Comfortable reading width and type scale inside the panel
          "& .MuiFormLabel-root": { fontSize: "0.8125rem" },
          "& .MuiInputBase-input, & .MuiSelect-select": { fontSize: "0.9375rem" },
          "& .MuiListItemText-primary": { fontSize: "0.9375rem", lineHeight: 1.45 },
          "& .MuiListItemText-secondary": { fontSize: "0.75rem", lineHeight: 1.4, mt: 0.25 },
        }}
      >
        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.75 }}>
            <Layers size={20} />
            <Typography variant="h5" sx={{ fontWeight: 700, fontSize: { xs: "1.15rem", sm: "1.25rem" } }}>
              Map
            </Typography>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.55, fontSize: "0.875rem" }}>
            Toggle PostGIS layers, add any ArcGIS service by URL, and manage destination points directly on the map.
          </Typography>
        </Box>

        {status && (
          <Alert severity="info" onClose={() => setStatus(null)}>
            {status}
          </Alert>
        )}

        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, fontSize: "0.8125rem", letterSpacing: 0.02 }}>
              Destinations (editable)
            </Typography>
            <Chip size="small" label={destCount} />
          </Stack>
          <Stack direction="row" spacing={1} sx={{ mt: 1, flexWrap: "wrap", gap: 1 }}>
            <Button
              size="small"
              variant="contained"
              startIcon={<Plus size={16} />}
              onClick={() => mapRef.current?.startCreateDestination()}
            >
              Add point
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshCw size={16} />}
              onClick={() => {
                void mapRef.current?.refreshDestinations();
                void reloadDestCount();
              }}
            >
              Refresh
            </Button>
            <Tooltip title={destinationsVisible ? "Hide layer" : "Show layer"}>
              <Checkbox checked={destinationsVisible} onChange={(_, v) => setDestinationsVisible(v)} size="small" />
            </Tooltip>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ display: "block", mt: 0.75, lineHeight: 1.5, fontSize: "0.8125rem" }}>
            Click a green point to rename / move / delete. Use the map&apos;s Sketch panel for selection + bulk edits.
          </Typography>
        </Box>

        <Divider />

        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, fontSize: "0.8125rem", letterSpacing: 0.02 }}>
              Distanations (EPSG:4326)
            </Typography>
            <Chip size="small" label={distanationCount} />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.75, mb: 1, lineHeight: 1.5, fontSize: "0.8125rem" }}>
            Point layer <b>distanations</b> stored in WGS84 (EPSG:4326). Fields: <code>id</code>, <code>dist_name</code>. For shapefile
            uploads, re-project to WGS84 before import (see Upload shapefiles).
          </Typography>
          <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
            <Button
              size="small"
              variant="contained"
              color="secondary"
              startIcon={<Plus size={16} />}
              onClick={() => mapRef.current?.startCreateDistanation()}
            >
              Add distanation
            </Button>
            <Button
              size="small"
              variant="outlined"
              startIcon={<RefreshCw size={16} />}
              onClick={() => {
                void mapRef.current?.refreshDistanations();
                void reloadDistanationCount();
              }}
            >
              Refresh
            </Button>
            <Tooltip title={distanationsVisible ? "Hide layer" : "Show layer"}>
              <Checkbox checked={distanationsVisible} onChange={(_, v) => setDistanationsVisible(v)} size="small" />
            </Tooltip>
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ display: "block", mt: 0.75, lineHeight: 1.5, fontSize: "0.8125rem" }}>
            Purple points. Click to edit <code>dist_name</code>; use <b>Sketch · Distanations</b> on the map to move or delete.
          </Typography>
        </Box>

        <Divider />

        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, fontSize: "0.8125rem", letterSpacing: 0.02 }}>
              PostgreSQL feature layers
            </Typography>
            <Chip size="small" label={userLayers.length} />
          </Stack>
          {userLayers.length === 0 ? (
            <Typography variant="body2" color="text.secondary" sx={{ lineHeight: 1.5, fontSize: "0.8125rem" }}>
              No imported layers yet. Upload via <b>Upload shapefiles</b>.
            </Typography>
          ) : (
            <List disablePadding sx={{ mt: 0.5 }}>
              {userLayers.map((l) => {
                const active = selectedUserIds.includes(l.id);
                return (
                  <ListItem
                    key={l.id}
                    disablePadding
                    sx={{ py: 0.25 }}
                    secondaryAction={
                      <Chip size="small" label={l.geometry_type || "—"} variant="outlined" sx={{ mr: 0.5 }} />
                    }
                  >
                    <ListItemButton onClick={() => toggleUser(l.id)} sx={{ py: 1, pr: 1 }}>
                      <ListItemIcon sx={{ minWidth: 36, mt: 0.25 }}>
                        <Checkbox edge="start" size="small" checked={active} tabIndex={-1} disableRipple />
                      </ListItemIcon>
                      <ListItemText primary={l.name} slotProps={{ primary: { sx: { pr: 1 } } }} />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>

        <Divider />

        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
            <Route size={18} />
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, fontSize: "0.8125rem", letterSpacing: 0.02 }}>
              Routing Task
            </Typography>
          </Stack>
          <RoutingTaskPanel onSuccess={handleRoutingTaskSuccess} />
        </Box>

        <Divider />

        <Box>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between" }}>
            <Typography variant="subtitle2" color="text.secondary" sx={{ fontWeight: 700, fontSize: "0.8125rem", letterSpacing: 0.02 }}>
              External ArcGIS services
            </Typography>
            <Chip size="small" label={externalLayers.length} />
          </Stack>
          <Stack spacing={1} sx={{ mt: 1 }}>
            <TextField
              size="small"
              label="Service URL"
              placeholder="https://.../FeatureServer/0"
              value={extUrl}
              onChange={(e) => setExtUrl(e.target.value)}
              fullWidth
            />
            <Stack direction="row" spacing={1}>
              <TextField
                size="small"
                label="Display name"
                value={extName}
                onChange={(e) => setExtName(e.target.value)}
                fullWidth
              />
              <FormControl size="small" sx={{ minWidth: 160 }}>
                <InputLabel>Type</InputLabel>
                <Select
                  value={extType}
                  label="Type"
                  onChange={(e) => setExtType(e.target.value as ExternalLayer["type"])}
                >
                  {externalTypes.map((t) => (
                    <MenuItem key={t} value={t}>
                      {t}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Stack>
            <Stack direction="row" spacing={1}>
              <Button size="small" variant="contained" startIcon={<Server size={14} />} onClick={addExternal}>
                Add service
              </Button>
              <Button
                size="small"
                variant="text"
                onClick={() => {
                  setExtUrl(externalPresets[0].url);
                  setExtName(externalPresets[0].label);
                  setExtType(externalPresets[0].type);
                }}
              >
                Use sample
              </Button>
            </Stack>
            <Stack direction="row" spacing={0.5} sx={{ flexWrap: "wrap", gap: 0.5 }}>
              {externalPresets.map((p) => (
                <Chip
                  key={p.url}
                  size="small"
                  variant="outlined"
                  label={p.label}
                  onClick={() => {
                    setExtUrl(p.url);
                    setExtName(p.label);
                    setExtType(p.type);
                  }}
                />
              ))}
            </Stack>
          </Stack>

          {externalLayers.length > 0 && (
            <List disablePadding sx={{ mt: 1 }}>
              {externalLayers.map((l) => {
                const active = selectedExternalIds.includes(l.id);
                return (
                  <ListItem
                    key={l.id}
                    disablePadding
                    sx={{ py: 0.25 }}
                    secondaryAction={
                      <Stack direction="row" spacing={0.5} sx={{ alignItems: "center" }}>
                        <Chip size="small" label={l.type} variant="outlined" />
                        <IconButton size="small" onClick={() => removeExternal(l.id)}>
                          <Trash2 size={14} />
                        </IconButton>
                      </Stack>
                    }
                  >
                    <ListItemButton onClick={() => toggleExternal(l.id)} sx={{ py: 1, pr: 1, alignItems: "flex-start" }}>
                      <ListItemIcon sx={{ minWidth: 36, mt: 0.5 }}>
                        <Checkbox edge="start" size="small" checked={active} tabIndex={-1} disableRipple />
                      </ListItemIcon>
                      <ListItemText
                        primary={l.name}
                        secondary={l.url}
                        slotProps={{
                          secondary: { style: { wordBreak: "break-all", fontSize: 12, lineHeight: 1.4 } },
                        }}
                      />
                    </ListItemButton>
                  </ListItem>
                );
              })}
            </List>
          )}
        </Box>
      </Paper>

      <Paper
        elevation={1}
        sx={{
          flex: 1,
          minWidth: 0,
          minHeight: { xs: 420, lg: 0 },
          flexBasis: { xs: "55vh", lg: "auto" },
          overflow: "hidden",
          border: "1px solid",
          borderColor: "divider",
          borderRadius: 2,
          bgcolor: "background.paper",
        }}
      >
        <FullMapClient
          ref={mapRef}
          userLayers={userLayersMemo}
          externalLayers={extLayersMemo}
          selectedUserIds={selUserMemo}
          selectedExternalIds={selExtMemo}
          destinationsVisible={destinationsVisible}
          distanationsVisible={distanationsVisible}
          onEditDestination={handleEditDestination}
          onEditDistanation={handleEditDistanation}
          onStatus={onStatus}
        />
      </Paper>

      <Dialog open={!!editing} onClose={() => setEditing(null)} fullWidth maxWidth="xs">
        <DialogTitle sx={{ display: "flex", alignItems: "center", gap: 1 }}>
          <MapPin size={18} />{" "}
          {editing?.kind === "distanation" ? "Distanation (EPSG:4326)" : "Destination"}
        </DialogTitle>
        <DialogContent dividers>
          {editing && (
            <Stack spacing={2} sx={{ pt: 1 }}>
              <TextField
                label={editing.kind === "distanation" ? "dist_name" : "Name"}
                value={editLabel}
                onChange={(e) => setEditLabel(e.target.value)}
                fullWidth
                size="small"
              />
              <TextField
                label="id"
                value={editing.id}
                fullWidth
                size="small"
                slotProps={{ htmlInput: { readOnly: true } }}
              />
              <Stack direction="row" spacing={1}>
                <TextField
                  label="Longitude"
                  value={editing.lng.toFixed(6)}
                  size="small"
                  slotProps={{ htmlInput: { readOnly: true } }}
                />
                <TextField
                  label="Latitude"
                  value={editing.lat.toFixed(6)}
                  size="small"
                  slotProps={{ htmlInput: { readOnly: true } }}
                />
              </Stack>
            </Stack>
          )}
        </DialogContent>
        <DialogActions sx={{ justifyContent: "space-between" }}>
          <Button color="error" startIcon={<Trash2 size={16} />} onClick={() => void deleteEdit()}>
            Delete
          </Button>
          <Stack direction="row" spacing={1}>
            <Button startIcon={<Move size={16} />} onClick={moveEdit}>
              Move on map
            </Button>
            <Button variant="contained" startIcon={<Pencil size={16} />} onClick={() => void saveEdit()}>
              {editing?.kind === "distanation" ? "Save dist_name" : "Save name"}
            </Button>
          </Stack>
        </DialogActions>
      </Dialog>
    </Box>
  );
}

function guessName(url: string): string {
  try {
    const u = new URL(url);
    const parts = u.pathname.split("/").filter(Boolean);
    return parts.slice(-3).join(" / ") || u.hostname;
  } catch {
    return url;
  }
}
