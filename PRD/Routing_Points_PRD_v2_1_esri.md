# PRD v2.1 — Time‑Based Routing & Route‑Point Densification (Esri Edition)

**Enterprise Feature Specification — presented on Esri 2D Maps and Esri 3D Scenes**

---

## 0. Document Control

| Field                | Value                                                   |
|----------------------|---------------------------------------------------------|
| **Document ID**      | PRD‑ROUTE‑001                                           |
| **Version**          | 2.1 (Esri edition; supersedes v2.0)                     |
| **Status**           | Draft — ready for engineering review                    |
| **Target release**   | Q2–Q3 2026                                              |
| **Source of truth**  | `Routing___points_Working_.ipynb`                       |
| **Last updated**     | 2026‑04‑23                                              |

### 0.2 Local engineering implementation **(Added 2026‑04‑23)**

A runnable **dev stack** (Next.js 15 + Laravel 12 + PostgreSQL 18 / PostGIS 3.6 + Redis) lives at the repository root with `docker-compose.yml`. It delivers:

- **Application REST** — auth (Sanctum), routing jobs CRUD, demo **synthesize** path for PENDING jobs, dashboard / ops catalog APIs.
- **Esri read path (MVP)** — Laravel **FeatureServer JSON shim** at `/arcgis/rest/services/Routing/FeatureServer` so ArcGIS JS `FeatureLayer` can load in the job detail map without running Koop yet. Production should replace this with **Koop + `koop-provider-pg`** per §9.
- **UI** — login, operations dashboard (Recharts), data explorer (venues / scenarios / alerts), job detail with **MapView** and copy‑paste layer URLs (PRD §12 / §10.2).

See root **`README.md`** for URLs, curl / PowerShell checks, and migration commands.

### 0.1 Change log — v2.0 → v2.1

Every change below is also marked inline with **(Updated v2.1 — Esri)** in the relevant section.

| Section                              | Change      | Summary                                                                               |
|--------------------------------------|-------------|---------------------------------------------------------------------------------------|
| §1 Executive Summary                 | **Updated** | Visualization delivered through **ArcGIS Maps SDK for JavaScript** (2D + 3D).         |
| §3 Goals & Objectives                | **Updated** | Added O7 (Esri‑native rendering parity) and O8 (3D scene performance).                |
| §6 User Journeys                     | **Updated** | Dispatcher journey extended with 3D scene path.                                       |
| §8 Non‑Functional Requirements       | **Updated** | Added 3D FPS and FeatureServer query latency targets.                                 |
| §9 Technical Architecture            | **Replaced**| MapLibre/MVT replaced by **Koop → ArcGIS Feature Services** and Esri JS SDK clients.  |
| §10 API Contracts                    | **Extended**| Added ArcGIS REST **FeatureServer** endpoints served by Koop.                         |
| §11 Data Model                       | **Extended**| Added Z‑geometry variants and `elevationInfo` guidance for 3D.                        |
| §12 UX / UI Requirements             | **Replaced**| Esri widgets, MapView + SceneView, `PointSymbol3D`, `LineSymbol3D`, TimeSlider.       |
| §15 Dependencies                     | **Updated** | ArcGIS API key / ArcGIS Location Platform account, Koop package, 3D basemap ground.   |
| §16 Risks                            | **Extended**| R10 (Koop maturity), R11 (3D perf on low‑end), R12 (basemap/API‑key cost).           |
| §17 Success Metrics                  | **Updated** | Added FeatureServer p95, SceneView first‑frame, time‑slider FPS.                      |
| §18 DevOps                           | **Updated** | Koop deployment, CDN for JS SDK, edge caching for Feature Service responses.          |
| §20 Release Plan                     | **Updated** | New Phase 2a (Feature Services) and Phase 2b (3D scene) split.                        |
| Appendix D                           | **Added**   | ArcGIS JS SDK code snippets (FeatureLayer, SceneView, TimeSlider, popup).             |

---

## 1. Executive Summary **(Updated v2.1 — Esri)**

We will convert an ArcGIS Pro Jupyter notebook that computes time‑optimal road routes and densifies them into 5 m sampled points into a **cloud‑native feature of our application, delivered to users through Esri 2D Maps and Esri 3D Scenes**.

- **Data plane:** PostgreSQL 15 + PostGIS 3.4 + pgRouting 3.4 — single source of truth, no ArcGIS file geodatabases at runtime.
- **Delivery plane:** **Koop** (Esri‑maintained open‑source toolkit) exposes the routing tables as **ArcGIS Feature Service** endpoints conforming to the Esri **GeoServices REST** specification.
- **Presentation plane:** **ArcGIS Maps SDK for JavaScript (v4.32 LTS or v5.x)** consumes those Feature Services as native `FeatureLayer`s rendered inside:
  - a **`MapView`** (2D) for analysts and operations,
  - a **`SceneView`** (3D) for dispatchers and stakeholders who need elevation, perspective, and tilted camera context.
- **Time dimension:** the Esri **`TimeSlider`** widget drives route playback; each `route_points` feature carries a `time_utc` attribute and a `heading` value, rendered as rotating 3D arrows.

**Why Esri:** our operations teams already use ArcGIS Pro, ArcGIS Online, and ArcGIS Enterprise. Delivering the new feature on Esri clients means **zero training overhead**, direct integration with existing web maps/scenes, and native consumption by downstream ArcGIS workflows (dashboards, StoryMaps, Experience Builder).

**Outcome.** A non‑GIS user submits a routing job, and within 3 minutes sees results as a live Feature Service that can be added to any ArcGIS web map or scene — including their existing operations dashboard — with Esri‑standard popups, time slider, legend, and 3D symbology.

---

## 2. Problem Statement

Unchanged from v2.0. Summary: the notebook is desktop‑bound, non‑productized, `arcpy`‑licensed, slow to write results, and invisible to the rest of the product. Porting to the platform unlocks self‑service for operations, removes per‑seat ArcGIS Pro dependency from the runtime path, and makes results natively consumable by our Esri clients.

---

## 3. Goals & Objectives (SMART) **(Updated v2.1 — Esri)**

### 3.1 Goals

**G1** — Productize the capability inside the existing application by end of Q3 2026.
**G2** — 100 % of I/O in PostgreSQL/PostGIS; no `.gdb` at runtime.
**G3** — 3,500‑route `ONE_END` run ≤ 3 min; FeatureServer p95 ≤ 400 ms.
**G4** — Algorithmic parity with the notebook on a golden dataset.
**G5** — Fully observable and operable by the platform team.
**G6 (Updated)** — **Esri‑native delivery**: results appear as standard ArcGIS Feature Services, consumable by any ArcGIS Maps SDK, ArcGIS Pro, or ArcGIS Online/Enterprise client without custom code.
**G7 (New)** — **3D scene support**: routes and route points render in a `SceneView` with correct elevation, tilt, and heading‑oriented symbology at ≥ 30 FPS on recommended client hardware.

### 3.2 SMART objectives

| ID  | Objective                                                  | Measure                                   | Target            | Owner    | Due         |
|-----|------------------------------------------------------------|-------------------------------------------|-------------------|----------|-------------|
| O1  | GA of routing feature                                      | Release completed                         | 100 %             | Product  | 2026‑09‑30  |
| O2  | Remove runtime `arcpy`                                     | Runtime `arcpy` imports                   | 0                 | Eng Lead | 2026‑08‑15  |
| O3  | 3,500‑pair run under SLA                                   | p95 job wall clock                        | ≤ 180 s           | Eng      | 2026‑08‑31  |
| O4  | FeatureServer latency under load                           | p95 FS query response, 200 rps            | ≤ 400 ms          | Platform | 2026‑09‑15  |
| O5  | Algorithmic parity                                         | Parity test pass rate                     | 100 %             | GIS Lead | 2026‑07‑31  |
| O6  | Non‑GIS adoption                                           | Weekly active users                       | ≥ 20 (8 wks)      | Product  | 2026‑11‑30  |
| **O7** | **Esri consumer parity (New)**                          | Layer adds cleanly in ArcGIS Pro, AGOL web map, Experience Builder, SceneView | 4/4 targets pass | GIS Lead | 2026‑09‑15 |
| **O8** | **3D scene performance (New)**                          | FPS in SceneView rendering 1 route (≥ 2k points) on a mid‑range laptop | ≥ 30 FPS sustained | Frontend | 2026‑09‑22 |

---

## 4. Stakeholders (RACI)

Unchanged from v2.0; add one line:

| Stakeholder / Role     | Plan | Design | Build | Test | Deploy | Operate |
|------------------------|:----:|:------:|:-----:|:----:|:------:|:-------:|
| **Esri Platform Lead** | C    | R      | C     | C    | C      | C       |

---

## 5. User Personas

Unchanged from v2.0 (Layla, Khalid, Fahad, Dr. Ahmed, Sara). One addition for completeness:

### 5.6 Nora — Executive / Command Center Lead **(Updated v2.1 — Esri)**

- **Goals:** see the big picture in 3D — fleet routes draped over terrain/city, shaded by ETA.
- **Needs:** 3D scene, tilt, basemap with buildings, time slider, share via URL.
- **Tools:** an existing ArcGIS Experience Builder app that will embed the new layer; a wall‑mounted dashboard in the command center.

---

## 6. User Journeys & Flows **(Updated v2.1 — Esri)**

### 6.1 Journey A — Operations Manager (same as v2.0)

Upload CSVs → submit job → monitor → view **in a 2D `MapView`** → share URL.

### 6.2 Journey B — Dispatcher inspects one route in **3D SceneView**

1. Opens the job in the **3D Scene tab** (default for the Dispatcher persona).
2. Scene loads with Esri terrain ground, buildings basemap, and the two routing feature layers.
3. Clicks a route → Esri popup shows start/end IDs, total time, total length, snap quality.
4. Presses play on the **TimeSlider** → a 3D arrow (PointSymbol3D) traces the route at the correct rate, rotated by `heading`.
5. Tilts the camera to inspect a congested interchange.
6. Optional: copy layer URL → paste into ArcGIS Pro for deeper analysis.

### 6.3 Journey C — Data scientist (same as v2.0)

Same three steps, but the pull path is now `GET /arcgis/rest/services/Routing/FeatureServer/1/query?...` — Esri REST is already an accepted integration pattern.

### 6.4 Journey D — Embed in an existing ArcGIS web map **(New)**

An AGOL/Portal user adds the Feature Service URL to an existing web map; the layer is discovered, its renderer auto‑applied, and the map is shared with no additional code.

### 6.5 Job lifecycle (unchanged)

```
        submit                 worker picks up
  ─────────────▶ PENDING ────────────────────▶ RUNNING
                                                  │
                               ┌──────────────────┼────────────────┐
                               │                  │                │
                     all OK    │     some failed  │      fatal     │
                               ▼                  ▼                ▼
                            SUCCESS            PARTIAL           FAILED
                                                  ▲
                              RUNNING ─────▶ CANCELLED (user)
```

---

## 7. Functional Requirements (User Stories & Acceptance Criteria)

All stories from v2.0 carry forward unchanged. **New / updated stories below.**

### E5 — Visualization **(Replaced v2.1 — Esri)**

#### US‑5.1 **(Updated)** Feature Services on Esri 2D map

*As Khalid, I want to see routes on a standard Esri 2D basemap with Esri widgets so that I don't need to learn a new UI.*

- **AC‑5.1.1** Given a successful job, when I open its detail page, then a `MapView` renders the routes `FeatureLayer` (`/FeatureServer/0`) and the route‑points `FeatureLayer` (`/FeatureServer/1`) over an Esri basemap.
- **AC‑5.1.2** The map includes these Esri widgets: `LayerList`, `Legend`, `BasemapGallery`, `Search`, `Home`, `ScaleBar`, `TimeSlider`.
- **AC‑5.1.3** Layer queries for a typical extent return ≤ **400 ms p95** (FeatureServer `/query`).
- **AC‑5.1.4** At small scales (zoomed out), route points are **feature‑reduced** via `FeatureReductionCluster` so the scene stays legible.

#### US‑5.2 **(Updated)** Esri popups and selection

- **AC‑5.2.1** Given I click a route polyline, when the popup opens, then it shows `StartID`, `EndID`, `TotalMin` (mm:ss), `TotalLenM` (km), `Status`, and `Msg` via a `PopupTemplate`.
- **AC‑5.2.2** Given I click a route point, the popup shows `CumDistM`, `CumMin`, `TimeUTC`, `Heading`, `CardinalDir`.
- **AC‑5.2.3** A "Select route" action in the route popup filters the points layer to that `RouteOID` via `definitionExpression`.

#### US‑5.3 **(New)** 3D scene rendering in SceneView

*As Fahad/Nora, I want a 3D scene so that I can see routes in their real‑world context (terrain, buildings, elevation).*

- **AC‑5.3.1** Given the same job, when I switch to the **3D tab**, then a `SceneView` renders the same two feature layers over an Esri **world elevation** ground and a **3D buildings** basemap.
- **AC‑5.3.2** Route polylines are rendered with `LineSymbol3D` (`PathSymbol3DLayer` with 1–2 m width) and `elevationInfo.mode = "relative-to-ground"` with `offset = 2 m` so the route is clearly visible above the road.
- **AC‑5.3.3** Route points use `PointSymbol3D` with an `ObjectSymbol3DLayer` arrow; symbol `heading` bound to the feature's `Heading` attribute via a visual variable (`type: "rotation"`, `field: "Heading"`, `rotationType: "geographic"`).
- **AC‑5.3.4** The scene sustains **≥ 30 FPS** while the TimeSlider plays at real speed on a mid‑range client (Intel i5 / M1, integrated GPU).
- **AC‑5.3.5** The `SceneView` and `MapView` are synchronized: panning in 2D moves the 3D camera to the same extent and vice versa (optional but recommended — `reactiveUtils` bridge).

#### US‑5.4 **(New)** Time slider playback

- **AC‑5.4.1** The `TimeSlider` is bound to `route_points.TimeUTC`.
- **AC‑5.4.2** Playback at 1× real time advances one route animation per minute of wall clock for a route of total 60 min (configurable speed 1×/10×/60×/300×).
- **AC‑5.4.3** Highlight state (`featureEffect` with `includedEffect: "bloom(1.5, 0.5px, 0.0)"`) marks the "current" point within the current time window.

#### US‑5.5 **(New)** Embed and share

- **AC‑5.5.1** Each job produces two canonical Esri URLs the user can copy:
  - `https://{host}/arcgis/rest/services/Routing/FeatureServer/0` (routes)
  - `https://{host}/arcgis/rest/services/Routing/FeatureServer/1` (points)
- **AC‑5.5.2** Pasting either URL into **ArcGIS Online**, **ArcGIS Pro**, or **Experience Builder** adds the layer without error and applies its default renderer.

### E6 — Admin & governance (unchanged)

### E7 — (New) **3D configuration admin**

#### US‑7.1 Default renderer management

*As Layla (GIS), I want to publish default 3D renderers so every user sees a consistent look.*

- **AC‑7.1.1** Admin UI lets a GIS user upload a renderer JSON (Esri renderer spec) per layer; Koop returns it in the service metadata.
- **AC‑7.1.2** If no admin renderer is set, the layer returns a sensible default (blue route lines by status; red points oriented by heading).

---

## 8. Non‑Functional Requirements **(Updated v2.1 — Esri)**

### 8.1 Performance targets

| Metric                                                        | Target (p95)        | Notes                                  |
|---------------------------------------------------------------|---------------------|----------------------------------------|
| 3,500‑pair `ONE_END` job wall clock                           | ≤ 180 s             | Single worker                          |
| Route‑point bulk insert throughput                            | ≥ 200k rows/s       | `COPY BINARY`                          |
| **FeatureServer `/query` response (typical extent)**          | ≤ 400 ms            | Koop → PostgreSQL, cached              |
| **SceneView first meaningful frame after job open**           | ≤ 4 s               | 3D scene first render                  |
| **SceneView sustained FPS during time slider playback**       | ≥ 30 FPS            | Mid‑range client                       |
| Route‑point fetch (GeoJSON alternative)                       | ≤ 500 ms            | ~2,000 points                          |
| Job status GET                                                | ≤ 100 ms            |                                        |

### 8.2 Scalability

- Koop instances scale horizontally behind the load balancer; stateless.
- **Response caching** at the edge (CDN + Koop's internal cache) for FeatureServer metadata and hot tiles‑like queries.
- PostgreSQL primary + synchronous replica + N read replicas; Koop always reads from a read replica unless the query is post‑job‑creation (optional knob).

### 8.3 Availability & resiliency

SLO 99.9 % for FeatureServer and job submission. Worker crash → job returns to `PENDING` (idempotent restart). Koop restart is transparent (stateless).

### 8.4 Security, compliance (unchanged)

OIDC + WAF + row‑level security + PDPL residency + SOC 2. See §19.

### 8.5 Usability & accessibility

WCAG 2.1 AA; Arabic (RTL) + English (LTR); Esri widgets are localized by the SDK (locale set at init).

### 8.6 Maintainability

Code coverage ≥ 80 %. Contract tests validate that Koop responses conform to the **GeoServices REST specification** for `FeatureServer` — fail the build on drift.

---

## 9. Technical Architecture **(Replaced v2.1 — Esri)**

### 9.1 Context (C4 — Level 1)

```
┌───────────────────────────────────────────────────────────────┐
│                   Browser client                              │
│                                                               │
│   ┌───────────────────────────┐    ┌────────────────────┐    │
│   │ ArcGIS Maps SDK for JS    │    │ App shell (React)  │    │
│   │  MapView (2D)             │    │  Dashboard, wizard │    │
│   │  SceneView (3D)           │    │  Auth (OIDC)       │    │
│   │  FeatureLayer ▲           │    └────────────────────┘    │
│   │  TimeSlider, LayerList    │                              │
│   └─────────────┬─────────────┘                              │
└─────────────────┼────────────────────────────────────────────┘
                  │  HTTPS (ArcGIS REST)
                  ▼
          ┌───────────────┐         ┌───────────────────────────┐
          │  API Gateway  │◀────────│  ArcGIS basemaps / ground │
          │  + WAF + Auth │         │  (Esri hosted)            │
          └───────┬───────┘         └───────────────────────────┘
                  │
      ┌───────────┴──────────────┐
      │                          │
      ▼                          ▼
┌───────────────┐        ┌──────────────────────────────┐
│ Routing API   │        │ Koop Feature Service adapter │
│ (FastAPI)     │        │ (Node.js + koop-provider-pg) │
│ • submit job  │        │ • /FeatureServer/{layerId}   │
│ • status      │        │ • /query, /generateRenderer  │
└──────┬────────┘        └───────────┬──────────────────┘
       │                             │
       └─────────────┬───────────────┘
                     ▼
           ┌────────────────────────────┐
           │ PostgreSQL + PostGIS +     │
           │ pgRouting (primary + RR)   │
           └─────────┬──────────────────┘
                     │
                     ▼
           ┌────────────────────────────┐
           │ Routing Workers (K8s)      │
           │ Python 3.11 / shapely /    │
           │ psycopg 3 / pgRouting call │
           └────────────────────────────┘
```

### 9.2 Container view

| Container                  | Tech                                          | Responsibility                                                |
|----------------------------|-----------------------------------------------|---------------------------------------------------------------|
| `routing-api`              | Python 3.11, FastAPI                          | Job lifecycle, uploads, admin                                 |
| `routing-worker`           | Python 3.11, shapely, psycopg 3, pgRouting call | A\* + densification + `COPY`                                |
| **`koop-service` (New)**   | **Node.js 20, Koop, `koop-provider-pg`**       | **Exposes PG tables as ArcGIS Feature Services**              |
| `postgres`                 | PG 15 + PostGIS 3.4 + pgRouting 3.4            | Source of truth                                               |
| `queue`                    | Redis or PG `LISTEN/NOTIFY`                    | Decouple API from workers                                     |
| `object-store`             | S3‑compatible                                  | Uploads, Parquet exports                                      |
| `web`                      | React + **ArcGIS Maps SDK for JS** (esm build) | UI (Dashboard, Job Detail with MapView + SceneView)           |
| `observability-stack`      | Prometheus / Grafana / Loki / Tempo            | Metrics, logs, traces                                         |

### 9.3 Why Koop (and not one of the alternatives)

| Option                                               | Chosen?  | Rationale                                                                                   |
|------------------------------------------------------|----------|---------------------------------------------------------------------------------------------|
| **Koop + `koop-provider-pg`**                        | **Yes**  | Open source, Esri‑maintained, speaks GeoServices natively, stateless, containerizable.      |
| ArcGIS Enterprise + PostgreSQL geodatabase (SDE)     | No (v1)  | Heavy license + ops footprint; over‑capable for our needs; revisit only if editing required.|
| `pg_featureserv` (OGC API Features) + `OGCFeatureLayer` | No    | ArcGIS client support is narrower than `FeatureLayer`; some widgets expect FeatureLayer.    |
| Publish hosted feature layers on ArcGIS Online       | No       | Duplicates data; sync overhead; unsuitable for frequent re‑runs.                            |
| Custom REST implementing GeoServices spec ourselves  | No       | Reimplements what Koop already provides.                                                    |

### 9.4 Client SDK version policy

- **Adopt ArcGIS Maps SDK for JavaScript 4.32 LTS** for stability. Track **5.x** in a staging build; migrate when 5.x reaches LTS.
- Load via npm (preferred) for deterministic builds; fallback to the Esri CDN only for quick prototypes.
- Pin Calcite Design System to the version recommended in that SDK release notes.

### 9.5 Coordinate systems in transit

- Data at rest in PostGIS: **SRID 32638 (UTM 38N)** — for metric math.
- Koop returns geometries in the SRID the client asks for via `outSR`. Web maps normally request **102100 / 3857**; 3D scenes typically use **4326**. Koop delegates the transform to PostGIS (`ST_Transform`).
- All layers advertise `supportedQueryFormats: JSON, PBF` (PBF is ~30–50 % smaller on the wire).

---

## 10. API Contracts **(Extended v2.1 — Esri)**

Two families of endpoints:

1. **Application REST** (FastAPI, unchanged from v2.0) — for submitting jobs, uploading inputs, managing graph, polling status.
2. **ArcGIS Feature Services** (Koop, new) — for all **read** traffic that powers the map.

### 10.1 Application REST — unchanged

`POST /api/routing/inputs/start` · `POST /api/routing/inputs/end` · `POST /api/routing/roads` · `POST /api/routing/graph/rebuild` · `POST /api/routing/jobs` · `GET /api/routing/jobs/{id}` · `DELETE /api/routing/jobs/{id}`.

### 10.2 Esri FeatureServer (Koop) **(New)**

Published under a stable base path so it can be added directly to ArcGIS clients:

```
https://{host}/arcgis/rest/services/Routing/FeatureServer
```

Standard GeoServices endpoints that MUST be supported (Koop provides them out of the box):

| Endpoint                                                        | Purpose                                            |
|-----------------------------------------------------------------|----------------------------------------------------|
| `/FeatureServer`                                                | Service metadata (layers, spatial reference, etc.) |
| `/FeatureServer/0`                                              | **Routes** layer metadata (fields, renderer)       |
| `/FeatureServer/0/query`                                        | Query routes (Esri query params)                   |
| `/FeatureServer/1`                                              | **Route points** layer metadata                    |
| `/FeatureServer/1/query`                                        | Query route points                                 |
| `/FeatureServer/0/queryExtent`                                  | Bounding extent for filters                        |
| `/FeatureServer/{i}/generateRenderer`                           | Optional; class breaks / unique values             |

Filtering is via the ArcGIS query parameters the SDK sends automatically: `where`, `outFields`, `returnGeometry`, `geometry`, `spatialRel`, `outSR`, `resultOffset`, `resultRecordCount`, `orderByFields`, `time` (for TimeSlider), `f` (format: `json` or `pbf`).

### 10.3 Layer field list advertised by Koop

**Routes layer (/FeatureServer/0):**
`ObjectID`, `RouteOID`, `JobId`, `StartID`, `EndID`, `PairID`, `Algorithm`, `Status`, `Msg`, `TotalMin`, `TotalLenM`, `StartSnapD`, `EndSnapD`, `NodeCount`, `DepartureUTC`, `CreatedAt`.

**Route points layer (/FeatureServer/1):**
`ObjectID`, `RouteOID`, `JobId`, `Seq`, `CumDistM`, `CumMin`, `TimeUTC`, `Heading`, `CardinalDir`, `StepM`.

Koop requires a stable monotonic `OBJECTID`. We expose the surrogate `id` column as `OBJECTID`; set via `koop-provider-pg` `idField` configuration.

### 10.4 Time information

Layer metadata advertises:

```json
{
  "timeInfo": {
    "startTimeField": "TimeUTC",
    "endTimeField":   null,
    "timeReference": { "timeZone": "UTC" },
    "timeExtent":    [ minUTC, maxUTC ]
  }
}
```

This is what enables the Esri `TimeSlider` widget to drive the layer without custom code.

### 10.5 Example queries the client will issue

```http
# Points for a job, for the current time window, in Web Mercator
GET /arcgis/rest/services/Routing/FeatureServer/1/query
    ?where=JobId='7e…'
    &time=1746086400000,1746090000000
    &outFields=RouteOID,Heading,CardinalDir,CumMin,TimeUTC
    &outSR=102100
    &returnGeometry=true
    &f=pbf

# Routes layer, OK only
GET /arcgis/rest/services/Routing/FeatureServer/0/query
    ?where=JobId='7e…' AND Status='OK'
    &outFields=*
    &outSR=102100
    &f=pbf
```

### 10.6 Application REST OpenAPI — unchanged from v2.0

The OpenAPI excerpt in v2.0 §10.1 is retained for the submission path. The FeatureServer path is specified by the **GeoServices REST specification** (Esri’s published spec) and does not need a separate OpenAPI — Koop’s implementation is considered the source of truth.

---

## 11. Data Model **(Extended v2.1 — Esri)**

### 11.1 Changes vs. v2.0

Only additive changes; no existing columns renamed.

#### `routes` — add Z variant for 3D scene (optional but recommended)

```sql
ALTER TABLE routes
    ADD COLUMN geom_z  geometry(LineStringZ,  32638),   -- for SceneView native Z
    ADD COLUMN geom_zm geometry(LineStringZM, 32638);   -- Z + M, for advanced consumers
```

Population strategy:

- Fastest path: set Z to a constant small offset (e.g., `2.0 m`) and rely on **`FeatureLayer.elevationInfo.mode = "relative-to-ground"`** at the client. The ArcGIS ground service supplies terrain; the client drapes the line over it.
- Higher fidelity: sample a DEM at each vertex at graph‑build time and store true Z.
- v1 default: offset mode (no DEM required), preserving SLAs. A later release can migrate to true Z with a background job.

#### `route_points` — Z mode

Same pattern. Store the 2D `geom` and set `elevationInfo.mode = "relative-to-ground"` with `offset = 2 m` at client registration. No schema change required in v1.

### 11.2 Partition strategy

`route_points` hash‑partitioned by `route_id` (32 partitions) — unchanged.

### 11.3 OBJECTID requirement for Esri

ArcGIS Feature Services require a non‑null, unique, stable `OBJECTID` per row of integer type. PostgreSQL `bigserial` satisfies this; Koop is configured to map `id → OBJECTID`. Never reuse or recycle this value.

### 11.4 Retention — unchanged

90 days online / 1 year cold archive for routes and route_points.

---

## 12. UX / UI Requirements **(Replaced v2.1 — Esri)**

### 12.1 Screens

#### 12.1.1 Routing Dashboard

Same as v2.0 (DataTable of jobs). **Updated**: the preview thumbnail per job is an Esri **static map image** (`ExportWebMap` or a pre‑rendered thumbnail generated at job completion).

#### 12.1.2 Job Detail — **two synchronized views (new)**

Tabbed layout: **2D Map** | **3D Scene**. The user toggles between tabs; camera bookmarks are shared across tabs via `reactiveUtils`.

**Common elements (both tabs):**

- Top bar: job name, status pill, progress bar (RUNNING), cancel button, **"Copy layer URL"** (routes and points), "Add to ArcGIS Online" link.
- Left: Esri `LayerList` + `Legend`.
- Right: details panel (selected route attributes).
- Bottom: Esri `TimeSlider` widget bound to the points layer `timeInfo`.
- Bottom‑right: `ScaleBar` (2D) or `Navigation` (3D).

**2D tab:**

- `MapView`, basemap default "streets‑navigation‑vector" (Esri). Ground elevation N/A.
- Routes layer: `SimpleRenderer` with `SimpleLineSymbol`, width 3, color by `Status`.
- Points layer: `FeatureReductionCluster` at small scales; `SimpleMarkerSymbol` + rotation visual variable by `Heading` at large scales.

**3D tab:**

- `SceneView`, basemap "topo‑3d" or "streets‑navigation‑3d", ground "world‑elevation" (Esri).
- Optional 3D buildings via `SceneLayer` from `basemap3d`.
- Routes layer: `SimpleRenderer` with `LineSymbol3D` → `PathSymbol3DLayer` (1.5 m width, blue). `elevationInfo.mode = "relative-to-ground"`, `offset = 2 m`.
- Points layer: `PointSymbol3D` with `ObjectSymbol3DLayer` (an arrow / chevron GLB asset) sized 4 m, colored by `CardinalDir`. `VisualVariable` `rotation` bound to `Heading` (`rotationType: "geographic"`).
- Camera initial: `goTo` the routes layer full extent, tilted 60°, heading ‑15°.

### 12.1.3 Submit Job Wizard — unchanged

### 12.2 Component inventory

| Component                | Source                           | Used in                   |
|--------------------------|----------------------------------|---------------------------|
| `MapView`                | `@arcgis/core/views/MapView`     | Job Detail 2D tab         |
| `SceneView`              | `@arcgis/core/views/SceneView`   | Job Detail 3D tab         |
| `FeatureLayer`           | `@arcgis/core/layers/FeatureLayer` | Routes + points         |
| `TimeSlider`             | `@arcgis/core/widgets/TimeSlider`| Bottom bar                |
| `LayerList`              | `@arcgis/core/widgets/LayerList` | Left panel                |
| `Legend`                 | `@arcgis/core/widgets/Legend`    | Left panel                |
| `BasemapGallery`         | `@arcgis/core/widgets/BasemapGallery` | Left panel (collapsed) |
| `Search`                 | `@arcgis/core/widgets/Search`    | Top bar                   |
| `PopupTemplate`          | `@arcgis/core/PopupTemplate`     | Both layers               |
| `FeatureReductionCluster`| `@arcgis/core/layers/support/FeatureReductionCluster` | Points layer, 2D small scale |
| Calcite UI components    | `@esri/calcite-components`       | App shell buttons/inputs  |

### 12.3 States to design

Empty / loading / error / partial‑success / large‑job warning — unchanged from v2.0, styled with **Calcite** to match Esri’s look & feel.

### 12.4 Internationalization

`intl.setLocale("ar")` and `intl.setLocale("en")` on the SDK; RTL handled by both Calcite and the SDK widgets. The map itself is intrinsically LTR but popups and widgets mirror.

### 12.5 Accessibility notes

- `MapView`/`SceneView` navigation fully keyboard operable (Esri defaults).
- Popup content uses semantic HTML; screen‑reader‑tested on the two tabs.
- Color choices colorblind‑safe (Okabe–Ito); renderers verified against `Color Oracle`.

---

## 13. Edge Cases & Error Handling

From v2.0 EC‑1…EC‑12, plus:

| #    | Case                                                                       | Behavior                                                    |
|------|----------------------------------------------------------------------------|-------------------------------------------------------------|
| EC‑13 | Client requests `outSR` Koop cannot transform (unsupported SRID)           | 400 with problem details; UI falls back to 4326.            |
| EC‑14 | Feature Service query exceeds result record count (`maxRecordCount=2000`)  | Client paginates via `resultOffset`; verified in tests.     |
| EC‑15 | SceneView WebGL context lost (driver reset)                                | App catches `view.when()` rejection, offers reload.         |
| EC‑16 | ArcGIS basemap unreachable                                                  | Fall back to Esri "gray‑vector" then to OSM‑vector mirror. |
| EC‑17 | Extremely dense points cause the client to exceed `maximumNumberOfFeatures` in 3D | Automatic `FeatureReductionCluster` + `definitionExpression = "Seq % 5 = 0"` at higher tilts. |

---

## 14. Assumptions & Constraints

Unchanged from v2.0, plus:

- The organization has an **ArcGIS Location Platform** API key or an ArcGIS Online organizational account to use Esri basemaps and ground. If not, the plan includes an open basemap fallback (adds UX cost).
- The ArcGIS Maps SDK for JavaScript will be consumed **under its standard terms**, with keys rotated via Secrets Manager.

---

## 15. Dependencies **(Updated v2.1 — Esri)**

| Dependency                                          | Type     | Owner        | Status      |
|-----------------------------------------------------|----------|--------------|-------------|
| Approved roads dataset                              | Data     | GIS Lead     | In review   |
| pgRouting in prod PG                                | Platform | DB Engineer  | Pending     |
| Object storage bucket                               | Infra    | Platform     | Pending     |
| OIDC client registration                            | Security | IAM team     | Pending     |
| DPIA sign‑off                                        | Compliance | DPO        | Not started |
| **ArcGIS API key / Location Platform account**      | External | Platform     | **Pending** |
| **Koop runtime image (Node.js + `koop-provider-pg`)** | Infra | Platform     | **New**     |
| **3D arrow `.glb` asset for ObjectSymbol3DLayer**   | Design   | UX           | **New**     |
| **Renderer JSON library (routes / points)**         | GIS      | GIS Lead     | **New**     |
| **ArcGIS basemap routes (Esri hosted)**             | External | Platform     | **New**     |

---

## 16. Risks & Mitigation **(Extended v2.1 — Esri)**

R1–R9 from v2.0 unchanged. New risks:

| ID   | Risk                                                         | L | I | Score | Mitigation                                                                                   |
|------|--------------------------------------------------------------|---|---|:-----:|----------------------------------------------------------------------------------------------|
| R10  | Koop provider maturity — bugs or missing GeoServices features | M | M | 4     | Pin a known‑good version; contribute fixes upstream; maintain a thin compatibility test suite; fallback is `pg_featureserv` + `OGCFeatureLayer`. |
| R11  | 3D performance on low‑end tablets/dispatchers                 | M | M | 4     | Automatic LOD: collapse points to clusters at tilt > 45° and zoom ≤ 14; offload arrows to `FeatureReductionCluster` style for 3D.              |
| R12  | ArcGIS basemap / API‑key cost at scale                        | M | L | 2     | Monitor request volume; negotiate volume tier; cache basemaps behind our CDN where allowed by Esri terms; have an OSM vector fallback.         |
| R13  | Coordinate system mismatch with existing ArcGIS web maps       | L | M | 2     | Koop honors `outSR`; document recommended `spatialReference` per client.                                                                      |
| R14  | Renderer drift between 2D and 3D (look and feel inconsistency) | M | L | 2     | Publish a single renderer JSON per layer; reuse across views; CI visual diff test using Playwright + ArcGIS headless mode.                    |

Scoring: L=1, M=2, H=3; score = L × I.

---

## 17. Success Metrics **(Updated v2.1 — Esri)**

### 17.1 Product KPIs

Unchanged from v2.0, plus:

| KPI                                          | Baseline | 3 mo   | 6 mo   |
|----------------------------------------------|----------|--------|--------|
| **FeatureServer query p95**                  | n/a      | ≤ 400 ms | ≤ 300 ms |
| **3D SceneView first meaningful frame**      | n/a      | ≤ 4 s    | ≤ 3 s    |
| **TimeSlider playback FPS (mid‑range client)** | n/a    | ≥ 30 FPS | ≥ 45 FPS |
| **Share count** (URLs copied / layers embedded elsewhere) | 0 | 50  | 200     |

### 17.2 DORA metrics — unchanged

### 17.3 Operational SLIs

Add: `koop_query_seconds`, `koop_cache_hit_ratio`, `scene_client_reported_fps` (via RUM telemetry).

---

## 18. DevOps & Cloud Alignment **(Updated v2.1 — Esri)**

### 18.1 Kubernetes

- New deployment: `koop-service` (3 replicas min, HPA on req/s). Dedicated **HPA target** 60 % CPU. PodDisruptionBudget `minAvailable: 2`.
- `NetworkPolicy`: Koop can reach only PG read replicas and no other services.

### 18.2 CDN & caching

- **Edge cache** in front of `/arcgis/rest/services/...`:
  - `/FeatureServer` (metadata) — cache 60 s.
  - `/query` responses — cache 30 s, keyed by full query string (vary by `outSR`, `where`, `time`, `f`).
  - Cache purged by `job_id` via a webhook from `routing-worker` on completion.
- Static assets (`@arcgis/core` bundle + Calcite) served from our CDN with long cache TTL, hashed filenames.

### 18.3 Observability (additions)

Prometheus metrics exported by Koop via `prom-client`:

- `koop_requests_total{layer, endpoint}`
- `koop_request_duration_seconds{layer, endpoint, status}`
- `koop_cache_hits_total` / `koop_cache_misses_total`
- `koop_upstream_pg_query_duration_seconds`

Front‑end RUM (via the existing observability SDK) reports:

- `map_initial_load_ms`
- `scene_initial_load_ms`
- `scene_fps_p50`, `scene_fps_p95`
- `time_slider_interaction_ms`

### 18.4 CI/CD additions

- **Koop contract test** in the pipeline: spin up Koop against a test PG, run a known set of GeoServices requests, and compare the JSON response to golden fixtures.
- **Visual regression** for 2D map and 3D scene using Playwright + pixelmatch; threshold 0.1 % pixel diff on reference fixtures.

### 18.5 Rollback

Feature flag disables Koop's routes in the API Gateway (instant); additive DB migrations only; client SDK version pinned, rollback by redeploying the previous web image.

---

## 19. Security & Compliance

Unchanged from v2.0. Notes for the Esri path:

- **ArcGIS API key** stored in Secrets Manager; injected into the client at build time as a short‑lived token fetched server‑side (never shipped raw in the client bundle for production).
- **CORS**: Koop configured to allow only our application origins; AGOL and ArcGIS Pro do not require CORS since they fetch server‑side.
- **Row‑level security** in PG is enforced by Koop connecting with a role that carries `SET app.user_id = {token.sub}`; `RLS` policies filter per user/team. Koop uses a short‑lived JWT obtained from the main API.
- **PDPL**: Esri basemap tiles are fetched from Esri CDNs, not stored by us. Routing data (PII‑adjacent) remains in our KSA region PG.

---

## 20. Release Plan & Milestones **(Updated v2.1 — Esri)**

### Phase 0 — Foundations (Weeks 1–3)

Same as v2.0. **Add:** stand up a Koop dev instance pointed at the dev PG; verify `GET /FeatureServer` returns the expected metadata for an empty table.

### Phase 1 — Routing MVP (Weeks 4–7)

Same as v2.0. **Add:** Koop advertises routes and points layers (empty) to ensure the client integration scaffold is in place early.

### Phase 2a — **(New)** Feature Services live (Weeks 8–9)

- Koop provider tuned for `route_points` query performance.
- Edge cache rules set.
- Contract test suite green.
- **Exit:** an ArcGIS Pro user adds the FeatureServer URL and sees the data correctly.

### Phase 2b — 2D & 3D clients (Weeks 10–12)

- `MapView` tab shipped with all widgets and renderers.
- `SceneView` tab shipped with elevationInfo, LineSymbol3D, ObjectSymbol3DLayer, TimeSlider.
- Arabic localization of Calcite + SDK.
- **Exit:** AT‑5.1…AT‑5.5 green in staging; UX sign‑off.

### Phase 3 — Hardening & GA (Weeks 13–15)

Load test at 2× peak, chaos drill, DPIA sign‑off, canary rollout, GA. Unchanged from v2.0 otherwise.

### Post‑GA

- Live traffic speeds.
- **3D Scene Layer Package (SLPK)** of historical routes for long‑term archive viewing.
- Alternative routes, k‑shortest paths.

---

## 21. Open Questions

| #  | Question                                                                                      | Needed by | Owner    |
|----|-----------------------------------------------------------------------------------------------|-----------|----------|
| Q1 | Esri licensing model chosen — Location Platform keys vs. ArcGIS Online organizational?        | Phase 0   | Platform |
| Q2 | Will the feature be embedded in an existing Experience Builder app, or is the app shell new?  | Phase 2b  | Product  |
| Q3 | DEM source for true‑Z routes (post‑v1) — Esri world elevation or in‑country national DEM?     | Post‑GA   | GIS Lead |
| Q4 | Q‑existing from v2.0 (queue tech, tenant model, retention, exports, graph‑rebuild SLA).       | —         | —        |

---

## 22. Appendices

### Appendix A — DDL

Unchanged. Optional addition:

```sql
ALTER TABLE routes
    ADD COLUMN geom_z  geometry(LineStringZ,  32638),
    ADD COLUMN geom_zm geometry(LineStringZM, 32638);
```

### Appendix B — Example job submission

Unchanged.

### Appendix C — Glossary

Adds:

- **GeoServices REST specification** — Esri's open REST specification for map/feature/image services, which Koop implements.
- **Koop** — Esri‑maintained open‑source Node.js toolkit that exposes arbitrary data sources as Feature Services.
- **FeatureLayer / SceneLayer** — layer classes in the ArcGIS Maps SDK for JavaScript for rendering feature data in 2D and 3D respectively.
- **MapView / SceneView** — 2D and 3D view classes in the ArcGIS Maps SDK for JavaScript.
- **I3S** — Indexed 3D Scene Layer, the OGC‑adopted Esri specification for 3D scene layer packages (SLPK).
- **TimeSlider** — Esri widget that drives layer visibility by a time extent.
- **ElevationInfo** — FeatureLayer property controlling how features are placed along the z axis in SceneView.

### Appendix D — **(New)** ArcGIS Maps SDK for JavaScript code snippets

The AI coding agent can start from these skeletons. Uses ES modules and `@arcgis/core`.

#### D.1 Registering the FeatureServer in a 2D MapView

```js
import Map from "@arcgis/core/Map.js";
import MapView from "@arcgis/core/views/MapView.js";
import FeatureLayer from "@arcgis/core/layers/FeatureLayer.js";
import PopupTemplate from "@arcgis/core/PopupTemplate.js";
import TimeSlider from "@arcgis/core/widgets/TimeSlider.js";
import Legend from "@arcgis/core/widgets/Legend.js";
import LayerList from "@arcgis/core/widgets/LayerList.js";

const base = "https://app.example.com/arcgis/rest/services/Routing/FeatureServer";

const routes = new FeatureLayer({
  url: `${base}/0`,
  outFields: ["*"],
  popupTemplate: new PopupTemplate({
    title: "Route {StartID} → {EndID}",
    content: `
      <b>Total time:</b> {TotalMin} min<br>
      <b>Distance:</b>  {TotalLenM} m<br>
      <b>Status:</b>    {Status}<br>
      <b>Message:</b>   {Msg}`
  }),
  definitionExpression: `JobId = '${jobId}'`
});

const points = new FeatureLayer({
  url: `${base}/1`,
  outFields: ["*"],
  popupTemplate: new PopupTemplate({
    title: "Route {RouteOID} @ {TimeUTC}",
    content: "Heading {Heading}° ({CardinalDir}), {CumDistM} m / {CumMin} min in"
  }),
  definitionExpression: `JobId = '${jobId}'`
});

const map = new Map({ basemap: "streets-navigation-vector", layers: [routes, points] });
const view = new MapView({ container: "mapDiv", map, zoom: 11, center: [46.72, 24.69] });

view.ui.add(new Legend({ view }), "bottom-left");
view.ui.add(new LayerList({ view }), "top-right");

const timeSlider = new TimeSlider({
  container: "timeSliderDiv",
  view,
  mode: "time-window",
  playRate: 1000
});
points.when(() => { timeSlider.fullTimeExtent = points.timeInfo.fullTimeExtent; });
```

#### D.2 Same layers in a 3D SceneView

```js
import SceneView from "@arcgis/core/views/SceneView.js";
import {
  LineSymbol3D, PathSymbol3DLayer,
  PointSymbol3D, ObjectSymbol3DLayer
} from "@arcgis/core/symbols.js";
import SimpleRenderer from "@arcgis/core/renderers/SimpleRenderer.js";

routes.elevationInfo = { mode: "relative-to-ground", offset: 2 };
routes.renderer = new SimpleRenderer({
  symbol: new LineSymbol3D({
    symbolLayers: [ new PathSymbol3DLayer({ profile: "quad", width: 1.5, height: 0.2,
      material: { color: [30, 144, 255] } }) ]
  })
});

points.elevationInfo = { mode: "relative-to-ground", offset: 2 };
points.renderer = new SimpleRenderer({
  symbol: new PointSymbol3D({
    symbolLayers: [ new ObjectSymbol3DLayer({
      resource: { href: "/assets/arrow.glb" },
      width: 4, height: 4, depth: 4, anchor: "bottom"
    }) ]
  }),
  visualVariables: [{
    type: "rotation",
    field: "Heading",
    rotationType: "geographic"
  }]
});

const sceneMap = new Map({
  basemap: "topo-3d",
  ground: "world-elevation",
  layers: [routes, points]
});

const scene = new SceneView({
  container: "sceneDiv",
  map: sceneMap,
  camera: { tilt: 60, heading: -15 },
  qualityProfile: "high"
});
```

#### D.3 Minimal popup formatters (time + km)

```js
import { fromJSON } from "@arcgis/core/arcade.js";
// Example Arcade expression used in a popup field:
// Format total time as mm:ss from a minutes double field.
// Use as an expressionInfo on the PopupTemplate.
// Text: Floor($feature.TotalMin) + " min " + Round(($feature.TotalMin - Floor($feature.TotalMin))*60) + " s"
```

#### D.4 Client‑side RLS token refresh (conceptual)

```js
import esriConfig from "@arcgis/core/config.js";

async function refreshToken() {
  const tok = await fetch("/api/session/arcgis-token").then(r => r.json());
  esriConfig.request.interceptors.push({
    urls: [ "https://app.example.com/arcgis/rest/services/Routing" ],
    before: (req) => { req.requestOptions.headers = { ...(req.requestOptions.headers||{}), Authorization: `Bearer ${tok.jwt}` }; }
  });
}
await refreshToken();
setInterval(refreshToken, tok.expires_in * 1000 * 0.8);
```

---

*End of PRD v2.1 — Esri edition.*
