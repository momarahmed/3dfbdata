"use client";

import dynamic from "next/dynamic";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  IconButton,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  TextField,
  Tooltip,
  Typography,
} from "@mui/material";
import { Trash2, UploadCloud, MapPin, Layers, Eye } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { apiFetch, getApiBase, getToken } from "@/lib/api";

const FeatureLayerMapClient = dynamic(
  () => import("@/components/FeatureLayerMapClient").then((m) => m.FeatureLayerMapClient),
  { ssr: false, loading: () => <LinearProgress /> }
);

type FeatureLayer = {
  id: string;
  name: string;
  slug: string;
  status: "READY" | "IMPORTING" | "FAILED";
  source_name: string | null;
  source_type: "shapefile" | "geojson" | string;
  geometry_type: string | null;
  feature_count: number;
  bbox: [number, number, number, number] | null;
  description: string | null;
  message: string | null;
  geojson_url: string;
  created_at: string;
};

export default function ShapefilesPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [layers, setLayers] = useState<FeatureLayer[]>([]);
  const [reloading, setReloading] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [previewIds, setPreviewIds] = useState<string[]>([]);
  const inputRef = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => {
    setReloading(true);
    try {
      const list = await apiFetch<{ data: FeatureLayer[] }>("/api/feature-layers");
      setLayers(list.data);
    } finally {
      setReloading(false);
    }
  }, []);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    void reload();
  }, [user, reload]);

  const onFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null;
    setFile(f);
    if (f && !name) {
      const base = f.name.replace(/\.(zip|geojson|json)$/i, "");
      setName(base);
    }
  };

  const submit = useCallback(async () => {
    if (!file) {
      setError("Please choose a .zip (shapefile) or .geojson file first.");
      return;
    }
    if (!name.trim()) {
      setError("Please provide a name for this layer.");
      return;
    }
    setError(null);
    setUploading(true);
    try {
      const apiBase = getApiBase();
      const fd = new FormData();
      fd.append("name", name.trim());
      if (description.trim()) fd.append("description", description.trim());
      fd.append("file", file);

      const token = getToken();
      const res = await fetch(`${apiBase}/api/feature-layers`, {
        method: "POST",
        body: fd,
        headers: token ? { Authorization: `Bearer ${token}`, Accept: "application/json" } : { Accept: "application/json" },
      });
      const text = await res.text();
      const body = text ? JSON.parse(text) : {};
      if (!res.ok) {
        throw new Error(body?.message || body?.error || `HTTP ${res.status}`);
      }
      setName("");
      setDescription("");
      setFile(null);
      if (inputRef.current) inputRef.current.value = "";
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }, [file, name, description, reload]);

  const remove = useCallback(
    async (id: string) => {
      if (!confirm("Delete this feature layer? Features are removed from PostGIS immediately.")) return;
      await apiFetch(`/api/feature-layers/${id}`, { method: "DELETE" });
      setPreviewIds((prev) => prev.filter((p) => p !== id));
      await reload();
    },
    [reload]
  );

  const togglePreview = useCallback((id: string) => {
    setPreviewIds((prev) => (prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]));
  }, []);

  const previewLayers = useMemo(
    () =>
      layers
        .filter((l) => previewIds.includes(l.id) && l.status === "READY")
        .map((l) => ({
          id: l.id,
          name: l.name,
          geojson_url: l.geojson_url,
          geometry_type: l.geometry_type,
        })),
    [layers, previewIds]
  );

  if (!user) return <LinearProgress />;

  return (
    <Stack spacing={2}>
      <Box>
        <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 0.5 }}>
          <Layers size={20} />
          <Typography variant="h5">Upload shapefiles</Typography>
        </Stack>
        <Typography variant="body2" color="text.secondary">
          Upload <b>ESRI shapefile bundles</b> (<code>.zip</code> with .shp / .shx / .dbf / optional .prj) or raw{" "}
          <code>.geojson</code>. Features are imported into PostGIS and exposed as GeoJSON feature services, ready to
          be selected as inputs for routing tasks from the Map page.
        </Typography>
      </Box>

      <Card>
        <CardContent>
          <Stack spacing={2}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              New layer
            </Typography>
            {error && <Alert severity="error">{error}</Alert>}
            <Stack direction={{ xs: "column", md: "row" }} spacing={2}>
              <TextField
                label="Layer name"
                size="small"
                value={name}
                onChange={(e) => setName(e.target.value)}
                fullWidth
              />
              <TextField
                label="Description (optional)"
                size="small"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                fullWidth
              />
            </Stack>
            <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: "center" }}>
              <Button
                component="label"
                variant="outlined"
                startIcon={<UploadCloud size={18} />}
                sx={{ whiteSpace: "nowrap" }}
              >
                {file ? "Change file" : "Choose file"}
                <input
                  ref={inputRef}
                  hidden
                  type="file"
                  accept=".zip,.geojson,.json,application/zip,application/json,application/geo+json"
                  onChange={onFile}
                />
              </Button>
              {file && (
                <Chip
                  label={`${file.name} · ${(file.size / 1024).toFixed(1)} KB`}
                  onDelete={() => {
                    setFile(null);
                    if (inputRef.current) inputRef.current.value = "";
                  }}
                />
              )}
              <Box sx={{ flexGrow: 1 }} />
              <Button
                variant="contained"
                disabled={uploading || !file}
                onClick={() => void submit()}
                startIcon={uploading ? <CircularProgress size={16} color="inherit" /> : <UploadCloud size={18} />}
              >
                {uploading ? "Importing…" : "Upload & import to PostGIS"}
              </Button>
            </Stack>
            <Typography variant="caption" color="text.secondary">
              Assumes coordinates in <b>EPSG:4326</b>. For projected shapefiles, re-project to WGS84 before upload.
            </Typography>
          </Stack>
        </CardContent>
      </Card>

      <Card>
        <CardContent>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", justifyContent: "space-between", mb: 1 }}>
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              Feature layers in PostGIS
            </Typography>
            <Typography variant="caption" color="text.secondary">
              {layers.length} layer{layers.length === 1 ? "" : "s"} · {reloading ? "refreshing…" : "live"}
            </Typography>
          </Stack>

          {layers.length === 0 ? (
            <Typography variant="body2" color="text.secondary">
              No layers imported yet. Upload one above to make it available as a routing job input.
            </Typography>
          ) : (
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Features</TableCell>
                  <TableCell>Source</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {layers.map((l) => {
                  const previewing = previewIds.includes(l.id);
                  return (
                    <TableRow key={l.id} hover>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>
                          {l.name}
                        </Typography>
                        {l.description && (
                          <Typography variant="caption" color="text.secondary">
                            {l.description}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell>
                        <Chip size="small" icon={<MapPin size={14} />} label={l.geometry_type || "—"} />
                      </TableCell>
                      <TableCell align="right">{l.feature_count.toLocaleString()}</TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" label={l.source_type} />
                        <Typography variant="caption" color="text.secondary" sx={{ display: "block" }}>
                          {l.source_name}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={l.status}
                          color={l.status === "READY" ? "success" : l.status === "FAILED" ? "error" : "warning"}
                        />
                        {l.message && (
                          <Typography variant="caption" color="error" sx={{ display: "block" }}>
                            {l.message}
                          </Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        <Tooltip title={previewing ? "Hide on map" : "Preview on map"}>
                          <span>
                            <IconButton
                              size="small"
                              color={previewing ? "primary" : "default"}
                              onClick={() => togglePreview(l.id)}
                              disabled={l.status !== "READY"}
                            >
                              <Eye size={16} />
                            </IconButton>
                          </span>
                        </Tooltip>
                        <Tooltip title="Delete layer">
                          <IconButton size="small" color="error" onClick={() => void remove(l.id)}>
                            <Trash2 size={16} />
                          </IconButton>
                        </Tooltip>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {previewLayers.length > 0 && (
        <Card>
          <CardContent>
            <Typography variant="subtitle1" sx={{ fontWeight: 600, mb: 1 }}>
              Preview ({previewLayers.length} layer{previewLayers.length === 1 ? "" : "s"})
            </Typography>
            <FeatureLayerMapClient layers={previewLayers} height={520} />
          </CardContent>
        </Card>
      )}
    </Stack>
  );
}
