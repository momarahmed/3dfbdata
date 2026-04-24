import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  ShieldCheck,
  Radar,
  Building2,
  Lock,
  Eye,
  EyeOff,
  ArrowRight,
  BadgeCheck,
  Activity,
  Globe,
  Users,
  BarChart3,
  Cpu,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";

const metrics = [
  { label: "Active Simulations", value: "1,248" },
  { label: "Tracked Agents", value: "9.6M" },
  { label: "Avg. Response", value: "34 ms" },
];

const capabilities = [
  {
    icon: Radar,
    title: "Live 3D Monitoring",
    text: "Track density, flow, bottlenecks, and evacuation dynamics in real time.",
  },
  {
    icon: BarChart3,
    title: "Operational Analytics",
    text: "Review crowd KPIs, alerts, safety thresholds, and scenario outcomes instantly.",
  },
  {
    icon: Cpu,
    title: "AI-Assisted Scenarios",
    text: "Compare response strategies and optimize throughput across complex venues.",
  },
];

function VectorBackground() {
  const nodes = useMemo(
    () =>
      Array.from({ length: 22 }).map((_, i) => ({
        id: i,
        top: `${8 + (i * 11) % 84}%`,
        left: `${4 + (i * 17) % 92}%`,
        delay: (i % 8) * 0.35,
        duration: 5 + (i % 5),
      })),
    []
  );

  return (
    <div className="absolute inset-0 overflow-hidden">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(35,168,255,0.18),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(29,78,216,0.16),transparent_32%),linear-gradient(135deg,#06111f_0%,#081426_35%,#0b172b_60%,#09111d_100%)]" />

      <svg
        className="absolute inset-0 h-full w-full opacity-30"
        viewBox="0 0 1440 1024"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        preserveAspectRatio="none"
      >
        <path d="M0 160C220 120 260 260 470 240C680 220 700 70 940 96C1170 120 1220 270 1440 220" stroke="rgba(94,194,255,0.22)" strokeWidth="1.5" />
        <path d="M0 380C220 320 300 470 520 430C740 390 770 250 960 268C1150 286 1240 430 1440 400" stroke="rgba(120,170,255,0.18)" strokeWidth="1.2" />
        <path d="M0 690C220 630 340 770 560 734C780 698 870 560 1080 596C1260 628 1330 760 1440 744" stroke="rgba(94,194,255,0.16)" strokeWidth="1.2" />
        <path d="M1130 0L840 1024" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
        <path d="M845 0L560 1024" stroke="rgba(148,163,184,0.08)" strokeWidth="1" />
        <path d="M560 0L250 1024" stroke="rgba(148,163,184,0.06)" strokeWidth="1" />
      </svg>

      {nodes.map((node, index) => (
        <motion.div
          key={node.id}
          className="absolute"
          style={{ top: node.top, left: node.left }}
          initial={{ opacity: 0.25, scale: 0.8 }}
          animate={{ opacity: [0.2, 0.85, 0.2], scale: [0.85, 1.15, 0.85] }}
          transition={{
            repeat: Infinity,
            duration: node.duration,
            delay: node.delay,
            ease: "easeInOut",
          }}
        >
          <div className="relative">
            <div className="h-2.5 w-2.5 rounded-full bg-cyan-300/70 shadow-[0_0_22px_rgba(103,232,249,0.75)]" />
            {index % 2 === 0 && (
              <div className="absolute left-1/2 top-1/2 h-16 w-px -translate-x-1/2 -translate-y-1/2 bg-gradient-to-b from-cyan-200/0 via-cyan-200/20 to-cyan-200/0" />
            )}
            {index % 3 === 0 && (
              <div className="absolute left-1/2 top-1/2 w-16 h-px -translate-x-1/2 -translate-y-1/2 bg-gradient-to-r from-cyan-200/0 via-cyan-200/20 to-cyan-200/0" />
            )}
          </div>
        </motion.div>
      ))}

      <div className="absolute inset-y-0 right-[-12%] w-[42rem] rounded-full bg-cyan-400/10 blur-3xl" />
      <div className="absolute bottom-[-15%] left-[10%] h-72 w-72 rounded-full bg-blue-500/10 blur-3xl" />
      <div className="absolute top-[12%] left-[6%] h-48 w-48 rounded-full border border-cyan-300/10" />
      <div className="absolute bottom-[12%] right-[18%] h-36 w-36 rounded-full border border-blue-300/10" />
    </div>
  );
}

function BrandPanel() {
  return (
    <motion.div
      initial={{ opacity: 0, x: -20 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.6 }}
      className="relative hidden xl:flex xl:flex-col xl:justify-between"
    >
      <div>
        <div className="mb-8 inline-flex items-center gap-3 rounded-full border border-cyan-400/20 bg-white/5 px-4 py-2 backdrop-blur-md">
          <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-cyan-400 to-blue-600 text-slate-950 shadow-lg shadow-cyan-500/20">
            <Users className="h-5 w-5" />
          </div>
          <div>
            <div className="text-sm font-semibold tracking-[0.22em] text-cyan-200/90 uppercase">CrowdSim 3D</div>
            <div className="text-xs text-slate-400">Enterprise Crowd Simulation Platform</div>
          </div>
        </div>

        <div className="max-w-2xl">
          <div className="mb-4 inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1.5 text-xs font-medium text-emerald-200 backdrop-blur-md">
            <BadgeCheck className="h-3.5 w-3.5" />
            Mission-critical access for operations teams
          </div>

          <h1 className="max-w-2xl text-5xl font-semibold leading-[1.05] tracking-tight text-white 2xl:text-6xl">
            Secure access to your real-time crowd intelligence command center.
          </h1>
          <p className="mt-5 max-w-xl text-base leading-7 text-slate-300">
            Monitor 3D movement, run operational scenarios, manage venue risk, and coordinate response workflows from one enterprise-grade platform.
          </p>
        </div>

        <div className="mt-10 grid max-w-2xl grid-cols-1 gap-4 lg:grid-cols-3">
          {metrics.map((metric) => (
            <Card
              key={metric.label}
              className="border-white/10 bg-white/5 text-white shadow-2xl shadow-black/20 backdrop-blur-xl"
            >
              <CardContent className="p-5">
                <div className="text-2xl font-semibold tracking-tight">{metric.value}</div>
                <div className="mt-1 text-sm text-slate-400">{metric.label}</div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>

      <div className="mt-10 grid max-w-3xl grid-cols-1 gap-4 md:grid-cols-3">
        {capabilities.map((item) => {
          const Icon = item.icon;
          return (
            <Card
              key={item.title}
              className="border-white/10 bg-slate-950/30 text-white shadow-2xl shadow-black/20 backdrop-blur-xl"
            >
              <CardContent className="p-5">
                <div className="mb-4 flex h-11 w-11 items-center justify-center rounded-2xl border border-cyan-400/20 bg-cyan-400/10 text-cyan-200">
                  <Icon className="h-5 w-5" />
                </div>
                <div className="text-base font-semibold">{item.title}</div>
                <p className="mt-2 text-sm leading-6 text-slate-400">{item.text}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </motion.div>
  );
}

function LoginPanel() {
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);

  return (
    <motion.div
      initial={{ opacity: 0, y: 24 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.55, delay: 0.08 }}
      className="w-full max-w-xl"
    >
      <Card className="overflow-hidden rounded-[28px] border-white/10 bg-white/8 text-white shadow-[0_20px_80px_rgba(2,8,23,0.55)] backdrop-blur-2xl">
        <CardContent className="p-0">
          <div className="border-b border-white/10 bg-gradient-to-r from-white/8 to-white/0 px-8 py-7">
            <div className="flex items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 rounded-full border border-cyan-400/20 bg-cyan-400/10 px-3 py-1 text-xs font-medium text-cyan-200">
                  <ShieldCheck className="h-3.5 w-3.5" />
                  Zero-trust access
                </div>
                <h2 className="mt-4 text-3xl font-semibold tracking-tight">Sign in</h2>
                <p className="mt-2 text-sm leading-6 text-slate-300">
                  Continue to the CrowdSim operations workspace.
                </p>
              </div>
              <div className="hidden h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/5 text-cyan-200 sm:flex">
                <Globe className="h-6 w-6" />
              </div>
            </div>
          </div>

          <div className="space-y-6 px-8 py-8">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Button
                variant="outline"
                className="h-12 rounded-2xl border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
              >
                <Building2 className="mr-2 h-4 w-4" />
                SSO / SAML
              </Button>
              <Button
                variant="outline"
                className="h-12 rounded-2xl border-white/10 bg-white/5 text-slate-100 hover:bg-white/10"
              >
                <Activity className="mr-2 h-4 w-4" />
                Azure AD
              </Button>
            </div>

            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/10" />
              </div>
              <div className="relative flex justify-center text-xs uppercase tracking-[0.22em] text-slate-500">
                <span className="bg-[rgba(8,18,32,0.7)] px-3">or use workspace credentials</span>
              </div>
            </div>

            <div className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="workspace" className="text-slate-200">Workspace / Tenant</Label>
                <Input
                  id="workspace"
                  placeholder="operations-emea-prod"
                  className="h-12 rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="email" className="text-slate-200">Business email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="ops.manager@crowdsim.ai"
                  className="h-12 rounded-2xl border-white/10 bg-white/5 text-white placeholder:text-slate-500"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-slate-200">Password</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your password"
                    className="h-12 rounded-2xl border-white/10 bg-white/5 pr-12 text-white placeholder:text-slate-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-400 transition hover:bg-white/10 hover:text-slate-200"
                    aria-label={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <label className="flex items-center gap-3 text-sm text-slate-300">
                <Checkbox checked={remember} onCheckedChange={(v) => setRemember(Boolean(v))} />
                Keep me signed in on this device
              </label>
              <button className="text-sm font-medium text-cyan-300 transition hover:text-cyan-200">
                Forgot password?
              </button>
            </div>

            <Button className="h-13 w-full rounded-2xl bg-gradient-to-r from-cyan-400 to-blue-600 text-base font-semibold text-slate-950 shadow-lg shadow-cyan-600/25 hover:opacity-95">
              Access platform
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>

            <div className="grid grid-cols-1 gap-3 rounded-2xl border border-white/10 bg-slate-950/25 p-4 text-sm text-slate-300 sm:grid-cols-3">
              <div className="flex items-center gap-2">
                <Lock className="h-4 w-4 text-cyan-300" />
                MFA ready
              </div>
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-cyan-300" />
                SOC-aligned
              </div>
              <div className="flex items-center gap-2">
                <BadgeCheck className="h-4 w-4 text-cyan-300" />
                Audit logging
              </div>
            </div>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

export default function CrowdSimLoginPage() {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <VectorBackground />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1700px] items-center px-6 py-10 sm:px-10 lg:px-14 2xl:px-20">
        <div className="grid w-full grid-cols-1 gap-10 xl:grid-cols-[1.15fr_0.85fr] xl:gap-14">
          <BrandPanel />
          <div className="flex items-center justify-center xl:justify-end">
            <LoginPanel />
          </div>
        </div>
      </div>

      <div className="pointer-events-none absolute inset-x-0 bottom-0 z-10 border-t border-white/5 bg-gradient-to-r from-white/5 via-transparent to-white/5 px-6 py-4 text-center text-xs tracking-[0.18em] text-slate-500 uppercase backdrop-blur-md">
        Crowd orchestration · Evacuation modeling · Venue intelligence · Enterprise resilience
      </div>
    </div>
  );
}
