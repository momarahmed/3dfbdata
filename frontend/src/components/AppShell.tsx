"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  AppBar,
  Box,
  Button,
  Drawer,
  List,
  ListItemButton,
  ListItemText,
  Toolbar,
  Typography,
} from "@mui/material";
import { LayoutDashboard, LogOut, Map as MapIcon, PlayCircle, UploadCloud } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

const drawerWidth = 240;

const nav = [
  { href: "/dashboard", label: "Operations dashboard", icon: LayoutDashboard },
  { href: "/map", label: "Map", icon: MapIcon },
  { href: "/simulation", label: "Simulation", icon: PlayCircle },
  { href: "/ops/shapefiles", label: "Upload shapefiles", icon: UploadCloud },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  return (
    <Box sx={{ display: "flex", minHeight: "100vh" }}>
      <AppBar position="fixed" sx={{ zIndex: (t) => t.zIndex.drawer + 1, bgcolor: "rgba(15,23,42,0.92)" }}>
        <Toolbar sx={{ gap: 2 }}>
          <Typography variant="h6" sx={{ flexGrow: 1, fontWeight: 700 }}>
            CrowdSim 3D
          </Typography>
          {user && (
            <Typography variant="body2" color="text.secondary">
              {user.name}
            </Typography>
          )}
          <Button
            color="inherit"
            startIcon={<LogOut size={18} />}
            onClick={async () => {
              await logout();
              router.push("/login");
            }}
          >
            Sign out
          </Button>
        </Toolbar>
      </AppBar>
      <Drawer
        variant="permanent"
        sx={{
          width: drawerWidth,
          flexShrink: 0,
          [`& .MuiDrawer-paper`]: { width: drawerWidth, boxSizing: "border-box", bgcolor: "background.paper" },
        }}
      >
        <Toolbar />
        <List sx={{ px: 1, py: 2 }}>
          {nav.map((item) => {
            const Icon = item.icon;
            const active = pathname === item.href;
            return (
              <ListItemButton
                key={item.href}
                component={Link}
                href={item.href}
                selected={active}
                sx={{ borderRadius: 2, mb: 0.5 }}
              >
                <Box sx={{ mr: 1.5, display: "flex", alignItems: "center" }}>
                  <Icon size={20} />
                </Box>
                <ListItemText primary={item.label} />
              </ListItemButton>
            );
          })}
        </List>
      </Drawer>
      <Box component="main" sx={{ flexGrow: 1, p: 3, width: `calc(100% - ${drawerWidth}px)` }}>
        <Toolbar />
        {children}
      </Box>
    </Box>
  );
}
