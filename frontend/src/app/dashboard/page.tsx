"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Box,
  Card,
  CardContent,
  Chip,
  LinearProgress,
  Stack,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
} from "@mui/material";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { useAuth } from "@/context/AuthContext";
import { apiFetch } from "@/lib/api";

type Summary = {
  venues: { id: number; name: string; region: string | null; status: string; capacity: number | null }[];
  scenarios: { id: number; name: string; category: string | null; status: string; runs: number }[];
  alerts: { id: number; title: string; zone: string | null; severity: string; status: string }[];
};

const chartSeed = [
  { t: "08:00", density: 22 },
  { t: "10:00", density: 34 },
  { t: "12:00", density: 58 },
  { t: "14:00", density: 56 },
  { t: "16:00", density: 39 },
];

export default function DashboardPage() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [summary, setSummary] = useState<Summary | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) router.replace("/login");
  }, [loading, user, router]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const s = await apiFetch<Summary>("/api/dashboard/summary");
        setSummary(s);
      } catch (e) {
        setErr(e instanceof Error ? e.message : "Failed to load dashboard");
      }
    })();
  }, [user]);

  if (!user) {
    return <LinearProgress />;
  }

  return (
    <Stack spacing={3}>
      <Box>
        <Typography variant="h5">Operations dashboard</Typography>
        <Typography variant="body2" color="text.secondary">
          Live KPIs, venue posture, and published scenarios — aligned with PRD v2.1 (Esri delivery plane).
        </Typography>
      </Box>

      {err && (
        <Typography color="error" variant="body2">
          {err}
        </Typography>
      )}

      <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "repeat(4,1fr)" }, gap: 2 }}>
        {summary && (
          <>
            <Kpi title="Active venues" value={summary.venues.filter((v) => v.status === "active").length} color="success" />
            <Kpi title="Total venues" value={summary.venues.length} />
            <Kpi title="Published scenarios" value={summary.scenarios.filter((s) => s.status === "published").length} color="success" />
            <Kpi title="Open alerts" value={summary.alerts.filter((a) => a.status === "open").length} color="warning" />
          </>
        )}
      </Box>

      <Card>
        <CardContent>
          <Typography variant="subtitle1" sx={{ mb: 2 }}>
            Density trend (illustrative)
          </Typography>
          <Box sx={{ width: "100%", height: 260 }}>
            <ResponsiveContainer>
              <AreaChart data={chartSeed}>
                <defs>
                  <linearGradient id="c" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#22d3ee" stopOpacity={0.35} />
                    <stop offset="95%" stopColor="#22d3ee" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                <XAxis dataKey="t" stroke="#94a3b8" />
                <YAxis stroke="#94a3b8" />
                <Tooltip contentStyle={{ background: "#0f172a", border: "1px solid #1e293b" }} />
                <Area type="monotone" dataKey="density" stroke="#22d3ee" fillOpacity={1} fill="url(#c)" />
              </AreaChart>
            </ResponsiveContainer>
          </Box>
        </CardContent>
      </Card>

      {summary && (
        <Box sx={{ display: "grid", gridTemplateColumns: { xs: "1fr", md: "1fr 1fr" }, gap: 2 }}>
          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ mb: 2 }}>
                Venues
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Name</TableCell>
                    <TableCell>Region</TableCell>
                    <TableCell align="right">Capacity</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summary.venues.map((v) => (
                    <TableRow key={v.id} hover>
                      <TableCell>{v.name}</TableCell>
                      <TableCell>{v.region ?? "—"}</TableCell>
                      <TableCell align="right">{v.capacity?.toLocaleString() ?? "—"}</TableCell>
                      <TableCell>
                        <Chip size="small" label={v.status} color={v.status === "active" ? "success" : "default"} />
                      </TableCell>
                    </TableRow>
                  ))}
                  {summary.venues.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography variant="body2" color="text.secondary">
                          No venues registered yet.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardContent>
              <Typography variant="subtitle1" sx={{ mb: 2 }}>
                Recent alerts
              </Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>Title</TableCell>
                    <TableCell>Zone</TableCell>
                    <TableCell>Severity</TableCell>
                    <TableCell>Status</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {summary.alerts.map((a) => (
                    <TableRow key={a.id} hover>
                      <TableCell>{a.title}</TableCell>
                      <TableCell>{a.zone ?? "—"}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={a.severity}
                          color={a.severity === "High" ? "error" : a.severity === "Medium" ? "warning" : "default"}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip size="small" label={a.status} variant="outlined" />
                      </TableCell>
                    </TableRow>
                  ))}
                  {summary.alerts.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4}>
                        <Typography variant="body2" color="text.secondary">
                          No alerts in the last window.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </Box>
      )}
    </Stack>
  );
}

function Kpi({ title, value, color }: { title: string; value: number; color?: "success" | "warning" }) {
  const c = color === "success" || color === "warning" ? color : "primary";
  return (
    <Card>
      <CardContent>
        <Typography variant="body2" color="text.secondary">
          {title}
        </Typography>
        <Typography variant="h4" color={c}>
          {value}
        </Typography>
      </CardContent>
    </Card>
  );
}
