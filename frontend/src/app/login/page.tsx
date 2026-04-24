"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Container,
  Stack,
  TextField,
  Typography,
} from "@mui/material";
import { motion } from "framer-motion";
import { useAuth } from "@/context/AuthContext";

function LoginInner() {
  const { login, loading } = useAuth();
  const search = useSearchParams();
  const nextUrl = search?.get("next") || "/dashboard";
  const expired = search?.get("expired") === "1";
  const [email, setEmail] = useState("demo@crowdsim.ai");
  const [password, setPassword] = useState("Password123!");
  const [error, setError] = useState<string | null>(expired ? "Your session expired. Please sign in again." : null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      await login(email, password);
      // Use a full navigation instead of `router.push`. Client-side RSC navigation fetches
      // flight data via `fetch()`; in dev (or on flaky networks) that can throw "Failed to fetch"
      // right after auth while the next page prefetches. A document navigation is reliable.
      const target = nextUrl.startsWith("/") ? nextUrl : "/dashboard";
      window.location.assign(target);
    } catch (ex) {
      const msg = ex instanceof Error ? ex.message : "Login failed";
      setError(msg);
    } finally {
      setBusy(false);
    }
  }

  return (
    <Box
      sx={{
        minHeight: "100vh",
        background: "radial-gradient(circle at 20% 20%, rgba(34,211,238,0.12), transparent 35%), #020617",
        display: "flex",
        alignItems: "center",
        py: 6,
      }}
    >
      <Container maxWidth="sm">
        <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45 }}>
          <Typography variant="h4" sx={{ fontWeight: 700, mb: 1 }}>
            CrowdSim 3D Enterprise
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
            Secure access to operations, routing (Esri FeatureServer), and venue intelligence.
          </Typography>
          <Card elevation={6}>
            <CardContent sx={{ p: 3 }}>
              <Typography variant="h6" sx={{ mb: 2 }}>
                Sign in
              </Typography>
              {error && (
                <Alert severity="error" sx={{ mb: 2 }}>
                  {error}
                </Alert>
              )}
              <Box component="form" onSubmit={onSubmit}>
                <Stack spacing={2}>
                  <TextField
                    label="Business email"
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    fullWidth
                    autoComplete="username"
                  />
                  <TextField
                    label="Password"
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    fullWidth
                    autoComplete="current-password"
                  />
                  <Button type="submit" variant="contained" size="large" disabled={busy || loading}>
                    Access platform
                  </Button>
                  <Typography variant="caption" color="text.secondary">
                    Demo user is seeded automatically: <b>demo@crowdsim.ai</b> / <b>Password123!</b>
                  </Typography>
                </Stack>
              </Box>
            </CardContent>
          </Card>
          <Typography variant="caption" color="text.secondary" sx={{ display: "block", mt: 2 }}>
            Product spec: <code>PRD/Routing_Points_PRD_v2_1_esri.md</code>
          </Typography>
        </motion.div>
      </Container>
    </Box>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginInner />
    </Suspense>
  );
}
