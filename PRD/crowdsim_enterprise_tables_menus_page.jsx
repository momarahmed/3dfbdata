import React, { useMemo, useState } from "react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Building2,
  ChevronDown,
  Clock3,
  Filter,
  Layers3,
  LayoutGrid,
  Map,
  MoreHorizontal,
  PlayCircle,
  Search,
  Settings,
  Shield,
  Siren,
  SlidersHorizontal,
  Users,
  Waypoints,
} from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Progress } from "@/components/ui/progress";

const scenarios = [
  {
    id: "SCN-24018",
    name: "Stadium Evacuation / Gate Failure",
    site: "King Fahd Arena",
    type: "Evacuation",
    state: "Running",
    agents: 18240,
    density: "5.8 p/m²",
    risk: "High",
    updated: "2 min ago",
    owner: "Ops Control",
  },
  {
    id: "SCN-24019",
    name: "Metro Hub Peak Boarding",
    site: "Central Metro Exchange",
    type: "Transit",
    state: "Queued",
    agents: 9540,
    density: "3.1 p/m²",
    risk: "Medium",
    updated: "12 min ago",
    owner: "Urban Mobility",
  },
  {
    id: "SCN-24020",
    name: "Festival Venue Dynamic Routing",
    site: "Waterfront Event Zone",
    type: "Events",
    state: "Completed",
    agents: 22100,
    density: "4.2 p/m²",
    risk: "Low",
    updated: "28 min ago",
    owner: "Planning Team",
  },
  {
    id: "SCN-24021",
    name: "Airport Terminal Security Surge",
    site: "Terminal B",
    type: "Security",
    state: "Running",
    agents: 12880,
    density: "4.9 p/m²",
    risk: "High",
    updated: "6 min ago",
    owner: "Aviation Ops",
  },
  {
    id: "SCN-24022",
    name: "University Campus Emergency Drill",
    site: "North Academic Cluster",
    type: "Drill",
    state: "Draft",
    agents: 6400,
    density: "2.2 p/m²",
    risk: "Low",
    updated: "1 hr ago",
    owner: "Campus Safety",
  },
];

const alerts = [
  {
    title: "Density threshold exceeded",
    zone: "Concourse C / Sector 04",
    severity: "Critical",
    time: "Now",
  },
  {
    title: "Exit lane obstruction detected",
    zone: "South Gate / Exit 2",
    severity: "High",
    time: "4 min ago",
  },
  {
    title: "Route recalculation initiated",
    zone: "Transit Platform 6",
    severity: "Medium",
    time: "9 min ago",
  },
];

const agentsData = [
  {
    id: "AG-883102",
    profile: "Security Staff",
    currentZone: "Gate A-4",
    speed: "1.3 m/s",
    behavior: "Directed Flow",
    status: "Active",
  },
  {
    id: "AG-883103",
    profile: "VIP Visitor",
    currentZone: "West Lounge",
    speed: "0.9 m/s",
    behavior: "Escorted",
    status: "Monitoring",
  },
  {
    id: "AG-883104",
    profile: "General Public",
    currentZone: "Food Court Spine",
    speed: "1.0 m/s",
    behavior: "Free Movement",
    status: "Active",
  },
  {
    id: "AG-883105",
    profile: "Emergency Responder",
    currentZone: "Emergency Corridor",
    speed: "1.8 m/s",
    behavior: "Priority Routing",
    status: "Dispatched",
  },
];

function statusBadge(value) {
  const map = {
    Running: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    Queued: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    Completed: "bg-sky-500/15 text-sky-300 border-sky-500/30",
    Draft: "bg-zinc-500/15 text-zinc-300 border-zinc-500/30",
    Active: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    Monitoring: "bg-violet-500/15 text-violet-300 border-violet-500/30",
    Dispatched: "bg-rose-500/15 text-rose-300 border-rose-500/30",
  };

  return map[value] || "bg-slate-500/15 text-slate-300 border-slate-500/30";
}

function riskBadge(value) {
  const map = {
    High: "bg-rose-500/15 text-rose-300 border-rose-500/30",
    Medium: "bg-amber-500/15 text-amber-300 border-amber-500/30",
    Low: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
    Critical: "bg-red-500/15 text-red-300 border-red-500/30",
  };

  return map[value] || "bg-slate-500/15 text-slate-300 border-slate-500/30";
}

const sidebar = [
  { label: "Operations Hub", icon: LayoutGrid, active: true },
  { label: "Simulations", icon: PlayCircle },
  { label: "Live Monitoring", icon: Activity },
  { label: "3D Scenes", icon: Layers3 },
  { label: "Zones & Routes", icon: Map },
  { label: "Analytics", icon: BarChart3 },
  { label: "Safety Rules", icon: Shield },
  { label: "Integrations", icon: Waypoints },
  { label: "Administration", icon: Settings },
];

export default function CrowdSimEnterpriseTablesPage() {
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState("scenarios");

  const filteredScenarios = useMemo(() => {
    return scenarios.filter((item) => {
      const q = query.toLowerCase();
      return (
        item.name.toLowerCase().includes(q) ||
        item.site.toLowerCase().includes(q) ||
        item.id.toLowerCase().includes(q) ||
        item.owner.toLowerCase().includes(q)
      );
    });
  }, [query]);

  return (
    <div className="min-h-screen bg-[#07111f] text-slate-100">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,_rgba(0,163,255,0.18),_transparent_28%),radial-gradient(circle_at_bottom_left,_rgba(56,189,248,0.12),_transparent_30%)]" />

      <div className="relative flex min-h-screen">
        <aside className="hidden w-72 border-r border-white/10 bg-slate-950/60 backdrop-blur xl:flex xl:flex-col">
          <div className="border-b border-white/10 px-6 py-5">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-cyan-500/15 ring-1 ring-cyan-400/30">
                <Users className="h-6 w-6 text-cyan-300" />
              </div>
              <div>
                <div className="text-lg font-semibold tracking-wide">CrowdSim 3D</div>
                <div className="text-xs text-slate-400">Enterprise Control Surface</div>
              </div>
            </div>
          </div>

          <div className="flex-1 px-4 py-5">
            <div className="mb-3 px-3 text-[11px] uppercase tracking-[0.25em] text-slate-500">
              Main Navigation
            </div>
            <nav className="space-y-1">
              {sidebar.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.label}
                    className={`flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-left transition ${
                      item.active
                        ? "bg-cyan-500/15 text-white ring-1 ring-cyan-400/30"
                        : "text-slate-300 hover:bg-white/5 hover:text-white"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    <span className="text-sm font-medium">{item.label}</span>
                  </button>
                );
              })}
            </nav>
          </div>

          <div className="border-t border-white/10 p-4">
            <Card className="rounded-3xl border-white/10 bg-white/5 shadow-2xl shadow-cyan-950/20">
              <CardContent className="p-5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-sm font-semibold">Cluster Health</span>
                  <Badge className="border-emerald-500/30 bg-emerald-500/15 text-emerald-300">
                    Stable
                  </Badge>
                </div>
                <p className="mb-4 text-xs leading-5 text-slate-400">
                  Rendering nodes, agent engine, and streaming services are within SLA thresholds.
                </p>
                <div className="space-y-3">
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-slate-400">
                      <span>GPU Render Farm</span>
                      <span>88%</span>
                    </div>
                    <Progress value={88} className="h-2 bg-white/10" />
                  </div>
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-slate-400">
                      <span>Simulation Workers</span>
                      <span>72%</span>
                    </div>
                    <Progress value={72} className="h-2 bg-white/10" />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </aside>

        <main className="flex-1">
          <header className="sticky top-0 z-20 border-b border-white/10 bg-slate-950/50 backdrop-blur-xl">
            <div className="flex flex-col gap-4 px-5 py-4 lg:px-8 xl:flex-row xl:items-center xl:justify-between">
              <div>
                <div className="flex items-center gap-3">
                  <h1 className="text-2xl font-semibold tracking-tight">Operations Tables & Menus</h1>
                  <Badge className="border-cyan-500/30 bg-cyan-500/15 text-cyan-200">
                    Preview
                  </Badge>
                </div>
                <p className="mt-1 text-sm text-slate-400">
                  Enterprise-grade scenario governance, live monitoring, and simulation operations management.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-3">
                <div className="relative min-w-[280px] flex-1 xl:flex-none">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search scenario, site, owner, or ID"
                    className="h-11 rounded-2xl border-white/10 bg-white/5 pl-10 text-slate-100 placeholder:text-slate-500"
                  />
                </div>

                <Button variant="outline" className="h-11 rounded-2xl border-white/10 bg-white/5 text-slate-100 hover:bg-white/10">
                  <Filter className="mr-2 h-4 w-4" />
                  Filters
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button className="h-11 rounded-2xl bg-cyan-500 text-slate-950 hover:bg-cyan-400">
                      Global Actions
                      <ChevronDown className="ml-2 h-4 w-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent className="w-56 border-white/10 bg-slate-950 text-slate-100">
                    <DropdownMenuLabel>Simulation Control</DropdownMenuLabel>
                    <DropdownMenuSeparator className="bg-white/10" />
                    <DropdownMenuItem>Launch selected scenario</DropdownMenuItem>
                    <DropdownMenuItem>Pause all running sessions</DropdownMenuItem>
                    <DropdownMenuItem>Export analytics pack</DropdownMenuItem>
                    <DropdownMenuItem>Sync 3D scene layers</DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>

                <Button variant="outline" size="icon" className="h-11 w-11 rounded-2xl border-white/10 bg-white/5 text-slate-100 hover:bg-white/10">
                  <Bell className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </header>

          <div className="space-y-6 px-5 py-6 lg:px-8">
            <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {[
                { label: "Active Simulations", value: "24", delta: "+4 today", icon: PlayCircle },
                { label: "Live Agents", value: "74,560", delta: "+12.8%", icon: Users },
                { label: "Critical Alerts", value: "07", delta: "Needs response", icon: Siren },
                { label: "Sites Connected", value: "18", delta: "Multi-region", icon: Building2 },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <Card key={item.label} className="rounded-3xl border-white/10 bg-white/5 shadow-2xl shadow-black/10">
                    <CardContent className="p-5">
                      <div className="mb-4 flex items-center justify-between">
                        <div className="rounded-2xl bg-cyan-500/15 p-3 ring-1 ring-cyan-400/25">
                          <Icon className="h-5 w-5 text-cyan-300" />
                        </div>
                        <span className="text-xs text-slate-400">{item.delta}</span>
                      </div>
                      <div className="text-sm text-slate-400">{item.label}</div>
                      <div className="mt-2 text-3xl font-semibold tracking-tight">{item.value}</div>
                    </CardContent>
                  </Card>
                );
              })}
            </section>

            <section className="grid gap-6 xl:grid-cols-[1.45fr_0.85fr]">
              <Card className="rounded-[28px] border-white/10 bg-white/5 shadow-2xl shadow-black/10">
                <CardHeader className="pb-3">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <CardTitle className="text-xl">Operations Workspace</CardTitle>
                      <p className="mt-1 text-sm text-slate-400">
                        Review scenarios, active entities, and operational exceptions in one view.
                      </p>
                    </div>

                    <Tabs value={tab} onValueChange={setTab} className="w-full lg:w-auto">
                      <TabsList className="grid h-11 w-full grid-cols-2 rounded-2xl bg-slate-900/80 lg:w-[360px]">
                        <TabsTrigger value="scenarios" className="rounded-2xl">
                          Scenario Table
                        </TabsTrigger>
                        <TabsTrigger value="agents" className="rounded-2xl">
                          Agent Table
                        </TabsTrigger>
                      </TabsList>
                    </Tabs>
                  </div>
                </CardHeader>

                <CardContent>
                  {tab === "scenarios" ? (
                    <div className="overflow-hidden rounded-3xl border border-white/10">
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-950/70 text-slate-400">
                            <tr className="border-b border-white/10">
                              <th className="px-4 py-4 text-left font-medium">Scenario</th>
                              <th className="px-4 py-4 text-left font-medium">Site</th>
                              <th className="px-4 py-4 text-left font-medium">Type</th>
                              <th className="px-4 py-4 text-left font-medium">State</th>
                              <th className="px-4 py-4 text-left font-medium">Agents</th>
                              <th className="px-4 py-4 text-left font-medium">Density</th>
                              <th className="px-4 py-4 text-left font-medium">Risk</th>
                              <th className="px-4 py-4 text-left font-medium">Owner</th>
                              <th className="px-4 py-4 text-left font-medium">Updated</th>
                              <th className="px-4 py-4 text-right font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredScenarios.map((item, index) => (
                              <tr
                                key={item.id}
                                className={`border-b border-white/10 ${
                                  index % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent"
                                } hover:bg-cyan-500/5`}
                              >
                                <td className="px-4 py-4 align-top">
                                  <div className="font-medium text-white">{item.name}</div>
                                  <div className="mt-1 text-xs text-slate-500">{item.id}</div>
                                </td>
                                <td className="px-4 py-4 text-slate-300">{item.site}</td>
                                <td className="px-4 py-4 text-slate-300">{item.type}</td>
                                <td className="px-4 py-4">
                                  <Badge className={`border ${statusBadge(item.state)}`}>{item.state}</Badge>
                                </td>
                                <td className="px-4 py-4 text-slate-300">{item.agents.toLocaleString()}</td>
                                <td className="px-4 py-4 text-slate-300">{item.density}</td>
                                <td className="px-4 py-4">
                                  <Badge className={`border ${riskBadge(item.risk)}`}>{item.risk}</Badge>
                                </td>
                                <td className="px-4 py-4 text-slate-300">{item.owner}</td>
                                <td className="px-4 py-4 text-slate-400">{item.updated}</td>
                                <td className="px-4 py-4 text-right">
                                  <DropdownMenu>
                                    <DropdownMenuTrigger asChild>
                                      <Button
                                        variant="ghost"
                                        size="icon"
                                        className="h-9 w-9 rounded-xl text-slate-300 hover:bg-white/10 hover:text-white"
                                      >
                                        <MoreHorizontal className="h-4 w-4" />
                                      </Button>
                                    </DropdownMenuTrigger>
                                    <DropdownMenuContent className="w-52 border-white/10 bg-slate-950 text-slate-100">
                                      <DropdownMenuItem>Open control panel</DropdownMenuItem>
                                      <DropdownMenuItem>View 3D scene</DropdownMenuItem>
                                      <DropdownMenuItem>Duplicate scenario</DropdownMenuItem>
                                      <DropdownMenuItem>Export report</DropdownMenuItem>
                                    </DropdownMenuContent>
                                  </DropdownMenu>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  ) : (
                    <div className="overflow-hidden rounded-3xl border border-white/10">
                      <div className="overflow-x-auto">
                        <table className="min-w-full text-sm">
                          <thead className="bg-slate-950/70 text-slate-400">
                            <tr className="border-b border-white/10">
                              <th className="px-4 py-4 text-left font-medium">Agent ID</th>
                              <th className="px-4 py-4 text-left font-medium">Profile</th>
                              <th className="px-4 py-4 text-left font-medium">Zone</th>
                              <th className="px-4 py-4 text-left font-medium">Speed</th>
                              <th className="px-4 py-4 text-left font-medium">Behavior</th>
                              <th className="px-4 py-4 text-left font-medium">Status</th>
                              <th className="px-4 py-4 text-right font-medium">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {agentsData.map((item, index) => (
                              <tr
                                key={item.id}
                                className={`border-b border-white/10 ${
                                  index % 2 === 0 ? "bg-white/[0.02]" : "bg-transparent"
                                } hover:bg-cyan-500/5`}
                              >
                                <td className="px-4 py-4 font-medium text-white">{item.id}</td>
                                <td className="px-4 py-4 text-slate-300">{item.profile}</td>
                                <td className="px-4 py-4 text-slate-300">{item.currentZone}</td>
                                <td className="px-4 py-4 text-slate-300">{item.speed}</td>
                                <td className="px-4 py-4 text-slate-300">{item.behavior}</td>
                                <td className="px-4 py-4">
                                  <Badge className={`border ${statusBadge(item.status)}`}>{item.status}</Badge>
                                </td>
                                <td className="px-4 py-4 text-right">
                                  <Button variant="ghost" className="rounded-xl text-slate-300 hover:bg-white/10 hover:text-white">
                                    Inspect
                                  </Button>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              <div className="space-y-6">
                <Card className="rounded-[28px] border-white/10 bg-white/5 shadow-2xl shadow-black/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <AlertTriangle className="h-5 w-5 text-amber-300" />
                      Operational Alerts
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {alerts.map((alert) => (
                      <div
                        key={alert.title}
                        className="rounded-2xl border border-white/10 bg-slate-950/50 p-4"
                      >
                        <div className="mb-2 flex items-start justify-between gap-3">
                          <div className="text-sm font-medium text-white">{alert.title}</div>
                          <Badge className={`border ${riskBadge(alert.severity)}`}>{alert.severity}</Badge>
                        </div>
                        <div className="text-sm text-slate-400">{alert.zone}</div>
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                          <Clock3 className="h-3.5 w-3.5" />
                          {alert.time}
                        </div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card className="rounded-[28px] border-white/10 bg-white/5 shadow-2xl shadow-black/10">
                  <CardHeader className="pb-3">
                    <CardTitle className="flex items-center gap-2 text-xl">
                      <SlidersHorizontal className="h-5 w-5 text-cyan-300" />
                      Quick Filters
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {[
                      "High Density Zones",
                      "Critical Scenarios",
                      "Transit Simulations",
                      "GPU Heavy Sessions",
                      "Unassigned Alerts",
                    ].map((item, idx) => (
                      <button
                        key={item}
                        className={`flex w-full items-center justify-between rounded-2xl border px-4 py-3 text-left transition ${
                          idx === 0
                            ? "border-cyan-400/30 bg-cyan-500/10 text-white"
                            : "border-white/10 bg-slate-950/40 text-slate-300 hover:bg-white/5"
                        }`}
                      >
                        <span className="text-sm font-medium">{item}</span>
                        <ChevronDown className="h-4 w-4 opacity-60" />
                      </button>
                    ))}
                  </CardContent>
                </Card>
              </div>
            </section>
          </div>
        </main>
      </div>
    </div>
  );
}
