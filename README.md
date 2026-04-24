# CrowdSim 3D Enterprise — Local Stack

Monorepo aligned with `PRD/Routing_Points_PRD_v2_1_esri.md` and the CrowdSim UI previews under `PRD/`.

| Plane | Stack |
|--------|--------|
| **Frontend** | Next.js 15, React 19, MUI 9, ArcGIS Maps SDK (`@arcgis/core`), Recharts |
| **Backend** | Laravel 12, Sanctum, PostgreSQL **18 + PostGIS 3.6**, Redis 7 |
| **Esri read path** | GeoJSON feature services exposed per `FeatureLayer` via `/api/feature-layers/{id}/geojson`, consumed by ArcGIS Maps SDK on the Map page. |

## Quick start

```bash
cp .env.example .env
docker compose up --build -d
```

- **App UI:** http://127.0.0.1:3000  
- **Login:** `demo@crowdsim.ai` / `Password123!` (seeded)  
- **API:** http://127.0.0.1:8000/api/health  

```bash
docker compose logs -f backend
docker compose logs -f frontend
docker compose down
docker compose up --build -d
```

### Laravel inside the container

```bash
docker compose exec backend php artisan migrate:fresh --seed
docker compose exec backend php artisan route:list
```

## curl checks (Testing / QA)

```bash
curl -s http://127.0.0.1:8000/api/health
```

PowerShell (login):

```powershell
Invoke-RestMethod -Uri "http://127.0.0.1:8000/api/auth/login" -Method Post `
  -ContentType "application/json" `
  -Body '{"email":"demo@crowdsim.ai","password":"Password123!"}'
```

Use the returned `token`:

```bash
curl -s http://127.0.0.1:8000/api/dashboard/summary -H "Authorization: Bearer TOKEN"
curl -s http://127.0.0.1:8000/api/feature-layers -H "Authorization: Bearer TOKEN"
```

## Product / architecture notes

- **PostgreSQL vs MySQL:** `PRD/dev-env.txt` mentions MySQL; this repository uses **PostgreSQL 18 + PostGIS** to match `Routing_Points_PRD_v2_1_esri.md` (geometry + routing source of truth). MySQL was not added to avoid duplicating OLTP databases.
- **Routing Task pipeline:** the legacy FeatureServer shim and `routing_jobs` pipeline have been retired. Routing is now run from the Map page via `POST /api/routing-tasks`; results are written as `FeatureLayer` rows in PostGIS and streamed as GeoJSON to ArcGIS Maps SDK.
- **3D + TimeSlider:** PRD §12 / Appendix D — scaffolded in docs; MapView is shipped in UI. Enable `NEXT_PUBLIC_ARCGIS_API_KEY` for full Esri basemaps.

## Repo layout

```
docker-compose.yml
backend/          # Laravel 12
frontend/         # Next.js 15
infra/postgres/   # PostGIS bootstrap SQL
PRD/              # Specs + UI reference JSX
```
