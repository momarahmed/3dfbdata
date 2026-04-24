import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Activity,
  AlertTriangle,
  ArrowUpRight,
  BarChart3,
  Bell,
  Building2,
  Camera,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Compass,
  Cpu,
  Gauge,
  LayoutDashboard,
  Map,
  PlayCircle,
  Shield,
  Sparkles,
  Users,
  Waves,
} from "lucide-react";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Funnel,
  FunnelChart,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  PolarAngleAxis,
  PolarGrid,
  PolarRadiusAxis,
  Radar,
  RadarChart,
  RadialBar,
  RadialBarChart,
  ResponsiveContainer,
  Sankey,
  Scatter,
  ScatterChart,
  Tooltip,
  Treemap,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

const densityTrend = [
  { time: "08:00", density: 22, inflow: 110, outflow: 75, incidents: 1 },
  { time: "09:00", density: 29, inflow: 135, outflow: 80, incidents: 1 },
  { time: "10:00", density: 34, inflow: 148, outflow: 96, incidents: 2 },
  { time: "11:00", density: 43, inflow: 182, outflow: 111, incidents: 2 },
  { time: "12:00", density: 58, inflow: 224, outflow: 151, incidents: 3 },
  { time: "13:00", density: 62, inflow: 240, outflow: 175, incidents: 4 },
  { time: "14:00", density: 56, inflow: 209, outflow: 188, incidents: 3 },
  { time: "15:00", density: 49, inflow: 188, outflow: 194, incidents: 2 },
  { time: "16:00", density: 39, inflow: 162, outflow: 178, incidents: 2 },
  { time: "17:00", density: 30, inflow: 129, outflow: 165, incidents: 1 },
];

const zoneHeat = [
  { zone: "North Gate", occupancy: 78, safe: 22, averageSpeed: 1.1 },
  { zone: "East Concourse", occupancy: 92, safe: 8, averageSpeed: 0.8 },
  { zone: "South Gate", occupancy: 66, safe: 34, averageSpeed: 1.4 },
  { zone: "VIP Corridor", occupancy: 41, safe: 59, averageSpeed: 1.8 },
  { zone: "Central Plaza", occupancy: 97, safe: 3, averageSpeed: 0.7 },
  { zone: "Parking Link", occupancy: 54, safe: 46, averageSpeed: 1.5 },
];

const evacuationStages = [
  { value: 9800, name: "Agents Spawned" },
  { value: 9400, name: "Reached Main Routes" },
  { value: 8100, name: "Entered Exits" },
  { value: 7420, name: "Safely Cleared" },
];

const movementVectors = [
  { x: 0.8, y: 72, z: 280 },
  { x: 1.1, y: 84, z: 320 },
  { x: 1.2, y: 91, z: 355 },
  { x: 1.5, y: 108, z: 420 },
  { x: 1.7, y: 116, z: 470 },
  { x: 0.9, y: 76, z: 300 },
  { x: 1.9, y: 124, z: 510 },
  { x: 2.1, y: 131, z: 560 },
  { x: 1.3, y: 94, z: 390 },
  { x: 1.6, y: 111, z: 435 },
];

const riskRadial = [
  { name: "Critical", value: 78, fill: "var(--chart-1)" },
  { name: "Warning", value: 63, fill: "var(--chart-2)" },
  { name: "Stable", value: 41, fill: "var(--chart-3)" },
];

const routeChoice = [
  { name: "Exit A", value: 28 },
  { name: "Exit B", value: 19 },
  { name: "Exit C", value: 14 },
  { name: "Exit D", value: 23 },
  { name: "Exit E", value: 16 },
];

const routeChoiceColors = ["#22d3ee", "#38bdf8", "#6366f1", "#8b5cf6", "#34d399"];
const sensorHealthColors = ["#22c55e", "#f59e0b", "#f43f5e"];

const operationalRadar = [
  { subject: "Safety", live: 88, target: 95 },
  { subject: "Flow", live: 76, target: 90 },
  { subject: "Visibility", live: 82, target: 90 },
  { subject: "Response", live: 71, target: 92 },
  { subject: "Prediction", live: 85, target: 94 },
  { subject: "Control", live: 80, target: 91 },
];

const hierarchyData = [
  {
    name: "Facility",
    children: [
      {
        name: "Transit",
        children: [
          { name: "Platform 1", size: 1800 },
          { name: "Platform 2", size: 1400 },
          { name: "Ticket Hall", size: 1200 },
        ],
      },
      {
        name: "Arena",
        children: [
          { name: "North Stands", size: 2100 },
          { name: "South Stands", size: 1900 },
          { name: "VIP Area", size: 650 },
        ],
      },
      {
        name: "Perimeter",
        children: [
          { name: "Parking", size: 1100 },
          { name: "Security Check", size: 900 },
          { name: "Shuttle Zone", size: 720 },
        ],
      },
    ],
  },
];

const flowLinks = {
  nodes: [
    { name: "Entry Gates" },
    { name: "Concourse" },
    { name: "Main Bowl" },
    { name: "VIP" },
    { name: "Emergency Exit" },
    { name: "Parking" },
  ],
  links: [
    { source: 0, target: 1, value: 840 },
    { source: 1, target: 2, value: 580 },
    { source: 1, target: 3, value: 140 },
    { source: 2, target: 4, value: 210 },
    { source: 2, target: 5, value: 290 },
    { source: 3, target: 5, value: 90 },
  ],
};

const cameraFeedHealth = [
  { name: "Online", value: 88 },
  { name: "Warning", value: 8 },
  { name: "Offline", value: 4 },
];

const simulationComparison = [
  { scenario: "Concert", baseline: 12.1, optimized: 8.4, target: 7.5 },
  { scenario: "Match Day", baseline: 10.8, optimized: 7.2, target: 6.8 },
  { scenario: "Festival", baseline: 14.4, optimized: 9.1, target: 8.4 },
  { scenario: "Emergency", baseline: 16.2, optimized: 10.3, target: 9.5 },
];

const alerts = [
  {
    title: "Density threshold exceeded",
    zone: "Central Plaza",
    severity: "High",
    time: "2 min ago",
  },
  {
    title: "Flow slowdown detected",
    zone: "East Concourse",
    severity: "Medium",
    time: "6 min ago",
  },
  {
    title: "Camera latency stabilized",
    zone: "North Gate",
    severity: "Info",
    time: "12 min ago",
  },
];

const kpis = [
  {
    title: "Live Agents",
    value: "9,842",
    delta: "+12.8%",
    sub: "vs previous interval",
    icon: Users,
  },
  {
    title: "Peak Density",
    value: "6.8 p/m²",
    delta: "+0.9",
    sub: "critical watch zone",
    icon: Gauge,
  },
  {
    title: "Evacuation ETA",
    value: "08:42",
    delta: "-14%",
    sub: "after route optimization",
    icon: Clock3,
  },
  {
    title: "Incident Risk",
    value: "Medium",
    delta: "-9.4%",
    sub: "predictive engine",
    icon: Shield,
  },
];

function StatCard({ item }) {
  const Icon = item.icon;
  return (
    <Card className="border-white/10 bg-white/[0.04] backdrop-blur-xl">
      <CardContent className="p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs uppercase tracking-[0.18em] text-white/50">{item.title}</p>
            <div className="mt-3 flex items-end gap-3">
              <h3 className="text-3xl font-semibold text-white">{item.value}</h3>
              <Badge variant="secondary" className="border-0 bg-white/10 text-white">
                {item.delta}
              </Badge>
            </div>
            <p className="mt-2 text-sm text-white/55">{item.sub}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/10 p-3 text-white">
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function SectionCard({ title, description, action, children, className = "" }) {
  return (
    <Card className={`border-white/10 bg-white/[0.04] backdrop-blur-xl ${className}`}>
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle className="text-white">{title}</CardTitle>
            <CardDescription className="mt-1 text-white/55">{description}</CardDescription>
          </div>
          {action}
        </div>
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

function TooltipBox({ active, payload, label }) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="rounded-xl border border-white/10 bg-slate-950/95 px-3 py-2 shadow-2xl">
      {label ? <p className="mb-1 text-xs text-white/50">{label}</p> : null}
      {payload.map((entry, i) => (
        <p key={i} className="text-sm text-white/90">
          <span className="text-white/50">{entry.name}:</span> {entry.value}
        </p>
      ))}
    </div>
  );
}

function MiniLiveMap() {
  const dots = [
    { left: "18%", top: "28%", pulse: "delay-75" },
    { left: "32%", top: "62%", pulse: "delay-150" },
    { left: "48%", top: "36%", pulse: "delay-200" },
    { left: "64%", top: "54%", pulse: "delay-300" },
    { left: "78%", top: "30%", pulse: "delay-500" },
  ];

  return (
    <div className="relative h-[420px] overflow-hidden rounded-3xl border border-white/10 bg-[radial-gradient(circle_at_top,_rgba(96,165,250,0.15),_transparent_28%),linear-gradient(180deg,_rgba(15,23,42,0.9),_rgba(2,6,23,0.98))]">
      <div className="absolute inset-0 opacity-40 [background-image:linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] [background-size:42px_42px]" />
      <div className="absolute inset-6 rounded-[28px] border border-cyan-400/20" />
      <div className="absolute left-[12%] top-[18%] h-[18%] w-[28%] rounded-[28px] border border-sky-400/30 bg-sky-400/10" />
      <div className="absolute right-[14%] top-[16%] h-[22%] w-[22%] rounded-[32px] border border-indigo-400/30 bg-indigo-400/10" />
      <div className="absolute left-[28%] top-[48%] h-[24%] w-[42%] rounded-[40px] border border-emerald-400/25 bg-emerald-400/10" />
      <div className="absolute left-[18%] top-[28%] h-[42%] w-[64%] rounded-full border border-dashed border-white/10" />
      <div className="absolute left-[10%] top-[76%] right-[10%] h-[1px] bg-gradient-to-r from-transparent via-cyan-300/50 to-transparent" />
      <div className="absolute left-[8%] top-[10%] flex items-center gap-2 rounded-full border border-white/10 bg-slate-900/70 px-3 py-1 text-xs text-white/80 backdrop-blur">
        <Sparkles className="h-3.5 w-3.5" />
        3D Simulation Preview
      </div>
      <div className="absolute bottom-4 left-4 right-4 grid gap-3 md:grid-cols-3">
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3 backdrop-blur">
          <p className="text-xs text-white/50">Active Zone</p>
          <p className="mt-1 text-sm font-medium text-white">Central Plaza</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3 backdrop-blur">
          <p className="text-xs text-white/50">Agent Speed</p>
          <p className="mt-1 text-sm font-medium text-white">0.84 m/s average</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-slate-900/60 p-3 backdrop-blur">
          <p className="text-xs text-white/50">Prediction</p>
          <p className="mt-1 text-sm font-medium text-white">Congestion in 6 min</p>
        </div>
      </div>

      {dots.map((dot, i) => (
        <React.Fragment key={i}>
          <div
            className={`absolute h-3.5 w-3.5 animate-ping rounded-full bg-cyan-400/70 ${dot.pulse}`}
            style={{ left: dot.left, top: dot.top }}
          />
          <div
            className="absolute h-3.5 w-3.5 rounded-full border border-white/30 bg-cyan-300 shadow-[0_0_30px_rgba(34,211,238,0.8)]"
            style={{ left: dot.left, top: dot.top }}
          />
        </React.Fragment>
      ))}
    </div>
  );
}

export default function CrowdSimEnterpriseDashboard() {
  const [timeRange, setTimeRange] = useState("today");
  const [facility, setFacility] = useState("stadium-alpha");

  const headline = useMemo(() => {
    if (facility === "stadium-alpha") return "Stadium Alpha";
    if (facility === "metro-hub") return "Metro Hub";
    return "Expo District";
  }, [facility]);

  return (
    <div className="min-h-screen bg-slate-950 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(56,189,248,0.12),_transparent_24%),radial-gradient(circle_at_left,_rgba(99,102,241,0.12),_transparent_28%)]" />
      <div className="relative flex min-h-screen">
        <aside className="hidden w-[290px] shrink-0 border-r border-white/10 bg-white/[0.03] p-5 xl:flex xl:flex-col">
          <div className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-4">
            <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white text-slate-950 shadow-lg">
              <Waves className="h-5 w-5" />
            </div>
            <div>
              <p className="text-sm font-semibold text-white">CrowdSim 3D</p>
              <p className="text-xs text-white/50">Enterprise Control Platform</p>
            </div>
          </div>

          <div className="mt-6 space-y-1">
            {[
              [LayoutDashboard, "Executive Dashboard", true],
              [Map, "3D Simulation"],
              [Activity, "Live Telemetry"],
              [Shield, "Safety Analytics"],
              [BarChart3, "Scenario Reports"],
              [Camera, "Sensors & Vision"],
              [Building2, "Facility Digital Twin"],
              [Cpu, "AI Predictions"],
              [Bell, "Alerts Center"],
              [Compass, "Route Optimization"],
            ].map(([Icon, label, active], i) => (
              <button
                key={i}
                className={`flex w-full items-center justify-between rounded-2xl px-4 py-3 text-left transition ${
                  active
                    ? "border border-white/10 bg-white/10 text-white"
                    : "text-white/60 hover:bg-white/[0.06] hover:text-white"
                }`}
              >
                <span className="flex items-center gap-3">
                  <Icon className="h-4.5 w-4.5" />
                  <span className="text-sm">{label}</span>
                </span>
                <ChevronRight className="h-4 w-4 opacity-50" />
              </button>
            ))}
          </div>

          <div className="mt-auto rounded-3xl border border-cyan-400/20 bg-cyan-400/10 p-4">
            <div className="flex items-center gap-2 text-cyan-200">
              <Sparkles className="h-4 w-4" />
              <p className="text-sm font-medium">Optimization Engine Active</p>
            </div>
            <p className="mt-2 text-sm leading-6 text-cyan-50/80">
              AI recommendations reduced evacuation time by 14% across the active scenario portfolio.
            </p>
            <Button className="mt-4 w-full rounded-2xl bg-white text-slate-950 hover:bg-white/90">
              Review Scenario Actions
            </Button>
          </div>
        </aside>

        <main className="relative flex-1 p-4 md:p-6 xl:p-8">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35 }}
            className="mx-auto max-w-[1800px]"
          >
            <div className="mb-6 flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/[0.04] p-5 backdrop-blur-xl xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex flex-wrap items-center gap-3">
                  <Badge className="rounded-full border-0 bg-emerald-400/15 px-3 py-1 text-emerald-300">
                    Live Simulation
                  </Badge>
                  <Badge className="rounded-full border-0 bg-white/10 px-3 py-1 text-white/80">
                    {headline}
                  </Badge>
                </div>
                <h1 className="mt-3 text-3xl font-semibold tracking-tight text-white md:text-4xl">
                  Crowd intelligence, safety, prediction, and 3D operational command.
                </h1>
                <p className="mt-2 max-w-4xl text-sm leading-6 text-white/60 md:text-base">
                  Enterprise-grade control center for monitoring density, route choice, evacuation readiness, sensor health,
                  behavioral prediction, and digital twin scenario performance.
                </p>
              </div>

              <div className="flex flex-col gap-3 sm:flex-row">
                <Select value={facility} onValueChange={setFacility}>
                  <SelectTrigger className="w-[210px] rounded-2xl border-white/10 bg-white/5 text-white">
                    <SelectValue placeholder="Facility" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stadium-alpha">Stadium Alpha</SelectItem>
                    <SelectItem value="metro-hub">Metro Hub</SelectItem>
                    <SelectItem value="expo-district">Expo District</SelectItem>
                  </SelectContent>
                </Select>

                <Select value={timeRange} onValueChange={setTimeRange}>
                  <SelectTrigger className="w-[170px] rounded-2xl border-white/10 bg-white/5 text-white">
                    <SelectValue placeholder="Range" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="today">Today</SelectItem>
                    <SelectItem value="6h">Last 6 hours</SelectItem>
                    <SelectItem value="24h">Last 24 hours</SelectItem>
                    <SelectItem value="7d">Last 7 days</SelectItem>
                  </SelectContent>
                </Select>

                <Button className="rounded-2xl bg-white text-slate-950 hover:bg-white/90">
                  <PlayCircle className="mr-2 h-4 w-4" />
                  Run New Scenario
                </Button>
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {kpis.map((item) => (
                <StatCard key={item.title} item={item} />
              ))}
            </div>

            <Tabs defaultValue="overview" className="mt-6">
              <TabsList className="grid h-auto w-full grid-cols-2 gap-2 rounded-3xl border border-white/10 bg-white/[0.04] p-2 md:grid-cols-5">
                <TabsTrigger value="overview" className="rounded-2xl data-[state=active]:bg-white data-[state=active]:text-slate-950">
                  Overview
                </TabsTrigger>
                <TabsTrigger value="flow" className="rounded-2xl data-[state=active]:bg-white data-[state=active]:text-slate-950">
                  Flow Analysis
                </TabsTrigger>
                <TabsTrigger value="safety" className="rounded-2xl data-[state=active]:bg-white data-[state=active]:text-slate-950">
                  Safety
                </TabsTrigger>
                <TabsTrigger value="operations" className="rounded-2xl data-[state=active]:bg-white data-[state=active]:text-slate-950">
                  Operations
                </TabsTrigger>
                <TabsTrigger value="forecast" className="rounded-2xl data-[state=active]:bg-white data-[state=active]:text-slate-950">
                  Forecasts
                </TabsTrigger>
              </TabsList>

              <TabsContent value="overview" className="mt-6 space-y-4">
                <div className="grid gap-4 xl:grid-cols-[1.3fr_0.7fr]">
                  <SectionCard
                    title="3D Simulation Preview"
                    description="Spatial preview pane for live monitoring, crowd pulses, and risk anticipation."
                    action={<Badge className="rounded-full border-0 bg-white/10 text-white">WebGL Ready</Badge>}
                  >
                    <MiniLiveMap />
                  </SectionCard>

                  <div className="space-y-4">
                    <SectionCard
                      title="Alerts & Decisions"
                      description="Critical events generated from sensor fusion and behavioral analytics."
                      action={<AlertTriangle className="h-4 w-4 text-amber-300" />}
                    >
                      <div className="space-y-3">
                        {alerts.map((alert) => (
                          <div key={alert.title} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                            <div className="flex items-start justify-between gap-3">
                              <div>
                                <p className="font-medium text-white">{alert.title}</p>
                                <p className="mt-1 text-sm text-white/55">
                                  {alert.zone} · {alert.time}
                                </p>
                              </div>
                              <Badge
                                className={`rounded-full border-0 ${
                                  alert.severity === "High"
                                    ? "bg-rose-400/15 text-rose-300"
                                    : alert.severity === "Medium"
                                      ? "bg-amber-400/15 text-amber-300"
                                      : "bg-sky-400/15 text-sky-300"
                                }`}
                              >
                                {alert.severity}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </SectionCard>

                    <SectionCard
                      title="Sensor Health"
                      description="Network status across cameras, counters, and vision processors."
                    >
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="flex h-[180px] items-center justify-center">
                          <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                              <Pie data={cameraFeedHealth} dataKey="value" nameKey="name" innerRadius={42} outerRadius={68} paddingAngle={4}>
                                {cameraFeedHealth.map((_, i) => (
                                  <Cell key={i} fill={sensorHealthColors[i % sensorHealthColors.length]} />
                                ))}
                              </Pie>
                              <Tooltip content={<TooltipBox />} />
                            </PieChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="space-y-4">
                          <div>
                            <div className="mb-2 flex items-center justify-between text-sm text-white/70">
                              <span>Cameras</span>
                              <span>224 / 231 online</span>
                            </div>
                            <Progress value={96} className="h-2 bg-white/10" />
                          </div>
                          <div>
                            <div className="mb-2 flex items-center justify-between text-sm text-white/70">
                              <span>People Counters</span>
                              <span>88 / 92 online</span>
                            </div>
                            <Progress value={95} className="h-2 bg-white/10" />
                          </div>
                          <div>
                            <div className="mb-2 flex items-center justify-between text-sm text-white/70">
                              <span>AI Edge Nodes</span>
                              <span>17 / 18 healthy</span>
                            </div>
                            <Progress value={94} className="h-2 bg-white/10" />
                          </div>
                        </div>
                      </div>
                    </SectionCard>
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <SectionCard title="Density, Inflow, and Outflow" description="Composite view of live density and movement balance over time.">
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={densityTrend}>
                          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                          <XAxis dataKey="time" stroke="rgba(255,255,255,0.35)" />
                          <YAxis stroke="rgba(255,255,255,0.35)" />
                          <Tooltip content={<TooltipBox />} />
                          <Legend />
                          <Bar dataKey="inflow" radius={[10, 10, 0, 0]} fill="#22d3ee" />
                          <Bar dataKey="outflow" radius={[10, 10, 0, 0]} fill="#6366f1" />
                          <Line type="monotone" dataKey="density" stroke="#f59e0b" strokeWidth={3} dot={false} />
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </SectionCard>

                  <SectionCard title="Exit Route Preference" description="Route distribution across all simulated agents.">
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie data={routeChoice} dataKey="value" nameKey="name" innerRadius={68} outerRadius={108} paddingAngle={3}>
                            {routeChoice.map((_, i) => (
                              <Cell key={i} fill={routeChoiceColors[i % routeChoiceColors.length]} />
                            ))}
                          </Pie>
                          <Tooltip content={<TooltipBox />} />
                          <Legend />
                        </PieChart>
                      </ResponsiveContainer>
                    </div>
                  </SectionCard>
                </div>
              </TabsContent>

              <TabsContent value="flow" className="mt-6 space-y-4">
                <div className="grid gap-4 xl:grid-cols-2">
                  <SectionCard title="Zone Occupancy vs Safe Capacity" description="Stacked status by zone to locate congestion build-up quickly.">
                    <div className="h-[340px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={zoneHeat} layout="vertical" margin={{ left: 20, right: 10 }}>
                          <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                          <XAxis type="number" stroke="rgba(255,255,255,0.35)" />
                          <YAxis type="category" dataKey="zone" stroke="rgba(255,255,255,0.35)" width={110} />
                          <Tooltip content={<TooltipBox />} />
                          <Legend />
                          <Bar dataKey="occupancy" stackId="a" radius={[0, 10, 10, 0]} fill="var(--chart-1)" />
                          <Bar dataKey="safe" stackId="a" radius={[0, 10, 10, 0]} fill="var(--chart-2)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </SectionCard>

                  <SectionCard title="Speed vs Density Correlation" description="Scatter analysis to inspect where slowdowns begin to emerge.">
                    <div className="h-[340px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ScatterChart>
                          <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                          <XAxis type="number" dataKey="x" name="speed" unit=" m/s" stroke="rgba(255,255,255,0.35)" />
                          <YAxis type="number" dataKey="y" name="density" unit=" p/m²" stroke="rgba(255,255,255,0.35)" />
                          <Tooltip cursor={{ strokeDasharray: "3 3" }} content={<TooltipBox />} />
                          <Scatter name="Agents" data={movementVectors} fill="var(--chart-3)" />
                        </ScatterChart>
                      </ResponsiveContainer>
                    </div>
                  </SectionCard>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <SectionCard title="Movement Trend" description="Area pattern for density pressure changes during active sessions.">
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart data={densityTrend}>
                          <defs>
                            <linearGradient id="densityFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--chart-1)" stopOpacity={0.55} />
                              <stop offset="95%" stopColor="var(--chart-1)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                          <XAxis dataKey="time" stroke="rgba(255,255,255,0.35)" />
                          <YAxis stroke="rgba(255,255,255,0.35)" />
                          <Tooltip content={<TooltipBox />} />
                          <Area type="monotone" dataKey="density" stroke="var(--chart-1)" fill="url(#densityFill)" strokeWidth={3} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </SectionCard>

                  <SectionCard title="Facility Flow Paths" description="Sankey flow from entry to concourse, venue, exits, and parking.">
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <Sankey data={flowLinks} nodePadding={28} margin={{ left: 20, right: 20, top: 10, bottom: 10 }} />
                      </ResponsiveContainer>
                    </div>
                  </SectionCard>
                </div>
              </TabsContent>

              <TabsContent value="safety" className="mt-6 space-y-4">
                <div className="grid gap-4 xl:grid-cols-3">
                  <SectionCard title="Risk Ring" description="Status across critical, warning, and stable risk bands." className="xl:col-span-1">
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadialBarChart innerRadius="20%" outerRadius="100%" data={riskRadial} startAngle={180} endAngle={0}>
                          <PolarAngleAxis type="number" domain={[0, 100]} tick={false} />
                          <RadialBar background dataKey="value" cornerRadius={14} />
                          <Tooltip content={<TooltipBox />} />
                        </RadialBarChart>
                      </ResponsiveContainer>
                    </div>
                  </SectionCard>

                  <SectionCard title="Operational Maturity" description="Live performance against safety, flow, response, and control targets." className="xl:col-span-1">
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={operationalRadar}>
                          <PolarGrid stroke="rgba(255,255,255,0.15)" />
                          <PolarAngleAxis dataKey="subject" stroke="rgba(255,255,255,0.55)" />
                          <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="rgba(255,255,255,0.25)" />
                          <Radar name="Live" dataKey="live" fill="var(--chart-1)" fillOpacity={0.45} stroke="var(--chart-1)" />
                          <Radar name="Target" dataKey="target" fill="var(--chart-2)" fillOpacity={0.15} stroke="var(--chart-2)" />
                          <Legend />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </SectionCard>

                  <SectionCard title="Evacuation Funnel" description="How efficiently the crowd moves from spawn to safe clearance." className="xl:col-span-1">
                    <div className="h-[300px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <FunnelChart>
                          <Tooltip content={<TooltipBox />} />
                          <Funnel dataKey="value" data={evacuationStages} isAnimationActive />
                        </FunnelChart>
                      </ResponsiveContainer>
                    </div>
                  </SectionCard>
                </div>

                <div className="grid gap-4 xl:grid-cols-2">
                  <SectionCard title="Incident Trend" description="Trendline of predicted issues alongside density pressure.">
                    <div className="h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={densityTrend}>
                          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                          <XAxis dataKey="time" stroke="rgba(255,255,255,0.35)" />
                          <YAxis stroke="rgba(255,255,255,0.35)" />
                          <Tooltip content={<TooltipBox />} />
                          <Legend />
                          <Line type="monotone" dataKey="incidents" stroke="var(--chart-1)" strokeWidth={3} dot={false} />
                          <Line type="monotone" dataKey="density" stroke="var(--chart-2)" strokeWidth={2} dot={false} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                  </SectionCard>

                  <SectionCard title="Zone Hierarchy" description="Treemap of occupancy distribution across major facilities and sub-areas.">
                    <div className="h-[320px] overflow-hidden rounded-2xl">
                      <ResponsiveContainer width="100%" height="100%">
                        <Treemap data={hierarchyData} dataKey="size" aspectRatio={4 / 3} stroke="rgba(255,255,255,0.25)" fill="var(--chart-3)" />
                      </ResponsiveContainer>
                    </div>
                  </SectionCard>
                </div>
              </TabsContent>

              <TabsContent value="operations" className="mt-6 space-y-4">
                <div className="grid gap-4 xl:grid-cols-[0.95fr_1.05fr]">
                  <SectionCard title="Operational Checklist" description="High-priority workflows for command center teams.">
                    <div className="space-y-3">
                      {[
                        ["Deploy overflow marshals to East Concourse", "Recommended", true],
                        ["Throttle Gate C inflow by 12%", "Approved", true],
                        ["Activate alternate VIP corridor routing", "Pending", false],
                        ["Increase camera sampling on Central Plaza", "Completed", true],
                      ].map(([label, status, done], i) => (
                        <div key={i} className="flex items-center justify-between rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                          <div className="flex items-center gap-3">
                            {done ? (
                              <CheckCircle2 className="h-5 w-5 text-emerald-300" />
                            ) : (
                              <Clock3 className="h-5 w-5 text-amber-300" />
                            )}
                            <div>
                              <p className="text-sm font-medium text-white">{label}</p>
                              <p className="text-xs text-white/50">Command workflow</p>
                            </div>
                          </div>
                          <Badge className="rounded-full border-0 bg-white/10 text-white">{status}</Badge>
                        </div>
                      ))}
                    </div>
                  </SectionCard>

                  <SectionCard title="Scenario Benchmarking" description="Compare baseline and optimized scenarios against target thresholds.">
                    <div className="h-[330px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={simulationComparison}>
                          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                          <XAxis dataKey="scenario" stroke="rgba(255,255,255,0.35)" />
                          <YAxis stroke="rgba(255,255,255,0.35)" />
                          <Tooltip content={<TooltipBox />} />
                          <Legend />
                          <Bar dataKey="baseline" radius={[10, 10, 0, 0]} fill="var(--chart-1)" />
                          <Bar dataKey="optimized" radius={[10, 10, 0, 0]} fill="var(--chart-2)" />
                          <Bar dataKey="target" radius={[10, 10, 0, 0]} fill="var(--chart-3)" />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </SectionCard>
                </div>
              </TabsContent>

              <TabsContent value="forecast" className="mt-6 space-y-4">
                <div className="grid gap-4 xl:grid-cols-3">
                  <SectionCard title="30-Min Congestion Outlook" description="Forecast confidence generated by predictive behavioral engine." className="xl:col-span-2">
                    <div className="h-[340px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <AreaChart
                          data={densityTrend.map((d, i) => ({
                            ...d,
                            projected: Math.round(d.density * (i > 5 ? 1.15 : 1.04)),
                          }))}
                        >
                          <defs>
                            <linearGradient id="forecastFill" x1="0" y1="0" x2="0" y2="1">
                              <stop offset="5%" stopColor="var(--chart-2)" stopOpacity={0.55} />
                              <stop offset="95%" stopColor="var(--chart-2)" stopOpacity={0} />
                            </linearGradient>
                          </defs>
                          <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                          <XAxis dataKey="time" stroke="rgba(255,255,255,0.35)" />
                          <YAxis stroke="rgba(255,255,255,0.35)" />
                          <Tooltip content={<TooltipBox />} />
                          <Legend />
                          <Area type="monotone" dataKey="density" stroke="var(--chart-1)" fillOpacity={0} strokeWidth={3} />
                          <Area type="monotone" dataKey="projected" stroke="var(--chart-2)" fill="url(#forecastFill)" strokeWidth={3} />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </SectionCard>

                  <SectionCard title="AI Signals" description="Prescriptive guidance generated from live inference.">
                    <div className="space-y-3">
                      {[
                        ["Congestion probability", "82%", "High likelihood near Central Plaza"],
                        ["Evacuation readiness", "91%", "Exit balance currently healthy"],
                        ["Counter-flow anomaly", "17%", "Low but rising on East link"],
                        ["Resource sufficiency", "88%", "Current staffing adequate"],
                      ].map(([label, score, text], i) => (
                        <div key={i} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
                          <div className="flex items-center justify-between gap-3">
                            <p className="text-sm font-medium text-white">{label}</p>
                            <div className="flex items-center gap-2 text-sm text-emerald-300">
                              {score}
                              <ArrowUpRight className="h-4 w-4" />
                            </div>
                          </div>
                          <p className="mt-2 text-sm text-white/55">{text}</p>
                        </div>
                      ))}
                    </div>
                  </SectionCard>
                </div>
              </TabsContent>
            </Tabs>
          </motion.div>
        </main>
      </div>
    </div>
  );
}
