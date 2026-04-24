# Real-Time Geospatial Vehicle Streaming System — Product Requirements Document (Enhanced)

**Document Version:** 2.0
**Previous Version:** 1.0 (2026-04-24)
**Date:** 2026-04-24
**Status:** Ready for engineering review
**Prepared For:** Real-Time Geospatial Systems Development Team
**System Type:** Web-based real-time vehicle tracking, simulation, and map visualization platform
**Primary Goal:** Stream vehicle movement points from PostgreSQL/PostGIS to an ArcGIS Maps frontend through a decoupled simulator and WebSocket server, with support for user-uploaded shapefiles and multi-vehicle replay.

---

## Document Control

| Field | Value |
|---|---|
| Owner | Product / Engineering Lead |
| Reviewers | Backend Lead, Frontend Lead, GIS Lead, SRE Lead, Security |
| Approvers | Engineering Director |
| Change Cadence | Revise on scope or architecture change |
| Related Documents | ArcGIS Maps SDK for JavaScript docs, PostGIS manual, OGC Simple Features |

### Change Log

| Version | Date | Author | Summary |
|---|---|---|---|
| 1.0 | 2026-04-24 | Original authors | Initial PRD. |
| 2.0 | 2026-04-24 | Systems Architecture | Restructured sections; fixed NFR latency targets; added message bus for horizontal scaling; added shapefile upload subsystem; added Simulation control button; added WebSocket v2 protocol with sequence numbers, resumability, and backpressure; promoted frontend rendering to tiered strategy (GraphicsLayer → FeatureLayer + WebGL); added observability, security, SLOs, error-code catalog, and risks register. |

---

## 1. Executive Summary

This document defines the requirements for a **Real-Time Geospatial Vehicle Streaming System**: a modular, browser-delivered platform that replays or streams vehicle GPS points from a **PostgreSQL/PostGIS** database to an **ArcGIS Maps SDK for JavaScript** frontend through a **Simulator Service** and a **WebSocket gateway**.

The platform serves three primary workflows:

1. **Replay Simulation** — Operators pick a vehicle and route, press **Simulation**, and watch the vehicle animate along its historical trajectory with correct heading and speed in near real time.
2. **Shapefile Ingest** — GIS staff upload ESRI Shapefiles (points, lines, polygons) through the UI; the system reprojects them to EPSG:4326 and loads them into `roads`, `routes`, or a generic spatial staging table.
3. **Multi-Vehicle Live View** — Multiple operators connect concurrently to observe many vehicles moving across a shared basemap without cross-session interference.

The system is built to evolve: today it replays historical points from PostGIS; tomorrow it can ingest live AVL/IoT feeds, publish feature services, or plug into ArcGIS Velocity — without reworking the client.

---

## 2. Product Vision

Deliver a **reusable, scalable, GIS-native streaming framework** that lets any team stand up real-time vehicle visualization in under a day, and grows from a laptop Docker Compose stack to a multi-instance, Kubernetes-hosted fleet platform without rewriting the client or the data contract.

---

## 3. Business Objectives

| Objective | Description | Measure of Success |
|---|---|---|
| Real-time visualization | Show moving cars on an ArcGIS web map with imperceptible lag. | P95 point-to-pixel latency ≤ 500 ms on LAN, ≤ 1,500 ms on WAN. |
| Database-driven simulation | PostGIS is the authoritative source for points, roads, and routes. | All simulated points are traceable to a row in `car_points_history`. |
| Replay historical trips | Re-run any past trip as if live, with speed multiplier. | User can replay any completed trip with 0.1x–10x multiplier. |
| Scalable streaming | Handle many vehicles and many viewers simultaneously. | 10,000 simulated vehicles × 100 concurrent viewers on a 3-node deployment. |
| GIS-ready architecture | PostGIS storage, ArcGIS rendering, GeoJSON on the wire, standard CRS handling. | All geometries validated against OGC SFA; all wire coords in EPSG:4326. |
| Extensible backend | Same contract supported by Node.js or FastAPI implementations. | Both reference implementations pass the same E2E test suite. |
| User-uploaded spatial data | Operators ingest shapefiles without DBA involvement. | A 50 MB shapefile uploads, reprojects, and renders within 60 seconds. |

---

## 4. Glossary

| Term | Meaning |
|---|---|
| AVL | Automatic Vehicle Location. |
| CRS / SRID | Coordinate Reference System / Spatial Reference ID (e.g., 4326 = WGS84). |
| GeoJSON | RFC 7946 JSON format for geographic features. |
| PostGIS | Spatial extension for PostgreSQL. |
| Replay | Streaming historical points with preserved temporal spacing. |
| Simulation | A named, controllable run of a replay (start/pause/resume/stop/reset). |
| SLO / SLI | Service Level Objective / Indicator. |
| WKID | Well-Known ID for a CRS, as used by ArcGIS (same numbering as EPSG). |

---

## 5. High-Level System Context

```text
┌────────────────────┐    upload    ┌─────────────────┐
│  GIS Staff / Ops   │─────────────▶│ Shapefile Ingest │──┐
│  (Browser)         │              │    Service       │  │
└────────┬───────────┘              └─────────────────┘  │
         │ HTTP + WS                                      │
         ▼                                                ▼
┌─────────────────────┐     WS      ┌─────────────────────────────┐
│  ArcGIS Web Client  │◀───────────▶│   WebSocket Gateway         │
│  (React + ArcGIS    │             │   (fan-out to N clients)    │
│   Maps SDK for JS)  │             └──────────────┬──────────────┘
└─────────┬───────────┘                            │ pub/sub
          │ REST                                   ▼
          │                           ┌─────────────────────────────┐
          │                           │ Message Bus (Redis Streams  │
          │                           │ or NATS JetStream)          │
          │                           └──────────────┬──────────────┘
          │                                          ▲
          │                                          │ publish vehicle events
          ▼                                          │
┌─────────────────────┐    SQL     ┌─────────────────┴───────────┐
│  Backend API        │◀──────────▶│   Simulator Engine           │
│  (FastAPI or Node)  │            │   (ordered replay worker)    │
└─────────┬───────────┘            └─────────────────┬───────────┘
          │                                           │ SQL
          ▼                                           ▼
                ┌───────────────────────────────────────┐
                │       PostgreSQL 16 + PostGIS 3.4      │
                │   car_points_history (partitioned)     │
                │   routes  |  roads  |  shapefile_jobs  │
                │   simulations  |  uploaded_layers      │
                └───────────────────────────────────────┘
```

**Key architectural change vs. v1.0:** The Simulator and WebSocket Gateway are **decoupled through a message bus**. This is what makes horizontal scaling possible — you can run N gateway pods and M simulator workers independently, and any client subscribed to a simulation channel receives events regardless of which worker produced them.

---

## 6. Target Users & Personas

| Persona | Primary Goals | Key Pain Points Addressed |
|---|---|---|
| GIS Administrator | Load roads/routes, verify spatial data integrity. | Upload shapefiles without writing SQL; validate CRS automatically. |
| Dispatcher / Operator | Monitor vehicles in real time; control simulations. | Single-click start; instant visual feedback; multi-vehicle overview. |
| Backend Developer | Extend APIs, swap data sources. | Clear contracts, versioned API, both FastAPI and Node reference implementations. |
| Frontend Developer | Add map widgets, custom symbology. | Documented layer API, React integration patterns. |
| System Architect | Deploy securely at scale. | Stateless services, message bus, horizontal scaling, observability hooks. |
| Analyst | Replay and inspect historical trips. | Speed multiplier, seek-to-timestamp, downloadable trip summaries. |

---

## 7. Scope

### 7.1 In Scope (v1.0 of the system)

1. PostgreSQL/PostGIS schema: `car_points_history` (time-partitioned), `roads`, `routes`, `simulations`, `uploaded_layers`, `shapefile_jobs`.
2. Backend service implementing the documented REST + WebSocket contract, in either **FastAPI (Python)** or **Node.js (NestJS or Fastify)**.
3. Simulator engine supporting single- and multi-vehicle replay with lifecycle controls and speed multiplier.
4. Message bus integration (Redis Streams by default, NATS JetStream as alternative) for simulator ↔ gateway decoupling.
5. WebSocket gateway with sequenced messages, heartbeat, session resumption, and backpressure.
6. ArcGIS Maps SDK for JavaScript frontend with React, basemap, route layer, vehicle layer, trail layer (optional), popups, control panel, and status panel.
7. **Shapefile Upload subsystem** with async processing, CRS reprojection to EPSG:4326, attribute preservation, and progress feedback.
8. **Simulation control bar in the UI**, placed between the Map and the Upload Shapefiles button, exposing Start, Pause, Resume, Stop, Reset, and Speed controls.
9. Observability: structured logs, Prometheus metrics, OpenTelemetry traces.
10. Docker Compose deployment profile and a Kubernetes reference manifest set.

### 7.2 Out of Scope (deferred to later phases)

- Native mobile clients.
- Live GPS hardware integration (AVL/OBD/IoT).
- Driver behavior scoring and fleet optimization.
- AI-based ETA or route prediction.
- ArcGIS Enterprise feature service publishing.
- ArcGIS Velocity integration.
- Kafka or MQTT transport (Redis Streams/NATS cover the intended scale).
- SSO/SAML. JWT local auth is provided.

### 7.3 Explicit Non-Goals

- This system does **not** compete with commercial AVL products.
- This system does **not** provide routing or navigation engine features.

---

## 8. Core Use Cases

### UC-01 — Load Vehicle Points from Database

**Actor:** Simulator Service
**Trigger:** A simulation is started by an operator.
**Preconditions:** `car_points_history` contains rows for the selected vehicle/route.
**Flow:**
1. Operator selects a vehicle and route in the control panel.
2. Backend validates identifiers and creates a `simulations` row with status `pending`.
3. Simulator queries `car_points_history` ordered by `(vehicle_id, point_time)`.
4. Simulator buffers the first window (default: 500 points) into memory.
**Success Criteria:** Points load in chronological order; every point carries longitude, latitude, timestamp, heading, speed, vehicle_id, route_id.
**Failure Modes:** No points found → error `NO_POINTS_FOUND`; DB timeout → error `DB_TIMEOUT`.

### UC-02 — Start Vehicle Movement Simulation

**Actor:** Operator
**Flow:**
1. Operator clicks **Simulation** button (located between the map view and the Upload Shapefiles button).
2. Frontend sends `POST /api/v1/simulations`.
3. Backend creates the simulation record, starts the simulator worker, publishes a `simulation_status: started` event.
4. WebSocket gateway fans out the first `vehicle_position` events.
5. Frontend receives events, initializes vehicle markers on the vehicle layer.
**Success Criteria:** First marker visible within 1 second of clicking Simulation; headings and speeds match database values; status panel updates in real time.

### UC-03 — Display Route Line

**Actor:** Frontend User
**Flow:**
1. Route is selected.
2. Frontend calls `GET /api/v1/routes/{route_id}/geometry`.
3. Backend returns a GeoJSON Feature.
4. Frontend adds a polyline graphic to the route layer.
**Success Criteria:** Polyline renders within 500 ms of selection; map auto-zooms to the route bounding box on first render.

### UC-04 — Stream Multiple Vehicles Concurrently

**Actor:** Operator
**Flow:** Operator starts a multi-vehicle simulation → simulator merges multiple time-ordered streams via a shared simulation clock → gateway broadcasts per-vehicle events → frontend maintains one graphic per `vehicle_id`.
**Success Criteria:** Each vehicle updates independently; no cross-vehicle flicker; status panel lists all active vehicles with live metrics.

### UC-05 — Control Simulation Lifecycle

**Actor:** Operator
**Controls:**

| Control | Behavior | API |
|---|---|---|
| Start | Begin streaming from first buffered point. | `POST /simulations` |
| Pause | Preserve current position; stop emitting events. | `POST /simulations/{id}/pause` |
| Resume | Continue from paused position. | `POST /simulations/{id}/resume` |
| Stop | Terminate the simulation; release resources. | `POST /simulations/{id}/stop` |
| Reset | Clear client-side state and reposition to first point. | `POST /simulations/{id}/reset` |
| Speed | Adjust wall-clock spacing between points. | `PATCH /simulations/{id}` with `speed_multiplier` |
| Seek | Jump to a specific `point_time`. | `POST /simulations/{id}/seek` |

### UC-06 — Upload a Shapefile (**new**)

**Actor:** GIS Administrator
**Flow:**
1. User clicks **Upload Shapefiles** (to the right of the Simulation button).
2. User selects a `.zip` archive containing `.shp`, `.shx`, `.dbf`, and `.prj`.
3. Frontend uploads to `POST /api/v1/uploads/shapefile` (multipart).
4. Backend returns a `job_id`; the ingest worker unpacks, validates, reprojects (GDAL/ogr2ogr) to EPSG:4326, and inserts features into `uploaded_layers`.
5. Frontend polls `GET /api/v1/uploads/jobs/{job_id}` or subscribes to the `uploads` WebSocket channel for progress.
6. On completion, the new layer appears in the layer list and renders on the map.
**Success Criteria:** A 50 MB shapefile completes in ≤ 60 seconds; invalid archives produce actionable error messages; CRS mismatches are reported but attempted automatically.

### UC-07 — Reconnect After Network Interruption (**new**)

**Actor:** Frontend
**Flow:** Client detects WS disconnect → reconnects with exponential backoff → sends `resume` frame with last received `sequence` → gateway replays missed events (if within retention window) or signals `RESYNC_REQUIRED`.
**Success Criteria:** No data loss when reconnect happens within the retention window (default 60 seconds); UI clearly indicates degraded state if full resync is required.

---

## 9. Functional Requirements

### 9.1 Database

| ID | Requirement | Priority |
|---|---|---|
| DB-FR-001 | Store vehicle movement points in `car_points_history`. | Must |
| DB-FR-002 | Each point carries `vehicle_id`, `route_id`, `point_time`, `speed_kmh`, `heading_deg`, `longitude`, `latitude`, `geom (Point, 4326)`, and optional `metadata`. | Must |
| DB-FR-003 | Store road geometries in `roads`. | Must |
| DB-FR-004 | Store route geometries in `routes`. | Must |
| DB-FR-005 | GIST index on all geometry columns. | Must |
| DB-FR-006 | B-tree composite indexes on `(vehicle_id, point_time)` and `(route_id, point_time)`. | Must |
| DB-FR-007 | Time-based partitioning on `car_points_history` (monthly by default). | Must |
| DB-FR-008 | Support querying points by vehicle, route, time range, and spatial bounding box. | Must |
| DB-FR-009 | Return route and road geometries as GeoJSON via `ST_AsGeoJSON`. | Must |
| DB-FR-010 | Validate longitude ∈ [-180, 180] and latitude ∈ [-90, 90] via `CHECK` constraints. | Must |
| DB-FR-011 | Store uploaded shapefile features in `uploaded_layers` with originating `job_id`. | Must |
| DB-FR-012 | Track shapefile ingestion status in `shapefile_jobs`. | Must |
| DB-FR-013 | Enforce referential integrity between `simulations`, `vehicles`, and `routes`. | Should |

### 9.2 Simulator Engine

| ID | Requirement | Priority |
|---|---|---|
| SIM-FR-001 | Stream points in strict ascending `point_time` order per vehicle. | Must |
| SIM-FR-002 | Publish events to the message bus on a per-simulation channel. | Must |
| SIM-FR-003 | Support single- and multi-vehicle simulations. | Must |
| SIM-FR-004 | Support Start, Pause, Resume, Stop, Reset, and Seek. | Must |
| SIM-FR-005 | Configurable speed multiplier in range [0.1, 10.0]. | Must |
| SIM-FR-006 | Assign a monotonically increasing `sequence` per simulation per vehicle. | Must |
| SIM-FR-007 | Retain the last 60 seconds (configurable) of published events to support resume-on-reconnect. | Must |
| SIM-FR-008 | Skip and log invalid points instead of crashing the simulation. | Must |
| SIM-FR-009 | Emit `simulation_status` events at all lifecycle transitions. | Must |
| SIM-FR-010 | Persist simulation state so a restart of the worker can resume cleanly. | Should |
| SIM-FR-011 | Support looping playback when `loop: true`. | Could |
| SIM-FR-012 | Emit a `vehicle_completed` event when a vehicle finishes its trajectory. | Must |

### 9.3 WebSocket Gateway

| ID | Requirement | Priority |
|---|---|---|
| WS-FR-001 | Accept authenticated client connections. | Must |
| WS-FR-002 | Subscribe clients to simulation channels derived from `simulation_id`. | Must |
| WS-FR-003 | Forward bus events to subscribed clients with ≤ 50 ms added latency at P95. | Must |
| WS-FR-004 | Send heartbeat (`ping`) frames every 20 seconds; close idle connections after 60 seconds without pong. | Must |
| WS-FR-005 | Support client-initiated resume with `last_sequence`. | Must |
| WS-FR-006 | Apply per-connection backpressure: drop oldest non-critical events when the client falls more than N events behind. | Must |
| WS-FR-007 | Limit to 100 subscriptions per connection. | Should |
| WS-FR-008 | Enforce origin and token validation in production. | Must |

### 9.4 Backend API

| ID | Requirement | Priority |
|---|---|---|
| API-FR-001 | List vehicles. | Must |
| API-FR-002 | List routes. | Must |
| API-FR-003 | Return route geometry as GeoJSON. | Must |
| API-FR-004 | Return road geometry as GeoJSON within a bounding box. | Should |
| API-FR-005 | Create, pause, resume, stop, reset, seek, and patch simulations. | Must |
| API-FR-006 | List and fetch uploaded layers. | Must |
| API-FR-007 | Accept shapefile uploads (multipart) and return a `job_id`. | Must |
| API-FR-008 | Return job status for shapefile processing. | Must |
| API-FR-009 | `/healthz` (liveness) and `/readyz` (readiness, including DB and bus reachability). | Must |
| API-FR-010 | Expose `/metrics` in Prometheus text format. | Must |
| API-FR-011 | All APIs versioned under `/api/v1`. | Must |

### 9.5 ArcGIS Frontend

| ID | Requirement | Priority |
|---|---|---|
| FE-FR-001 | Built on ArcGIS Maps SDK for JavaScript (≥ 4.29). | Must |
| FE-FR-002 | React application with clearly separated layers, services, and components. | Must |
| FE-FR-003 | Display an ArcGIS basemap with a user-selectable gallery. | Must |
| FE-FR-004 | Render route lines on a dedicated `GraphicsLayer`. | Must |
| FE-FR-005 | Render moving vehicles on a **tiered rendering strategy**: `GraphicsLayer` for ≤ 200 active vehicles; client-side `FeatureLayer` with WebGL for > 200. | Must |
| FE-FR-006 | Animate marker movement with `requestAnimationFrame` interpolation between received points. | Must |
| FE-FR-007 | Rotate the marker by `heading_deg`. | Must |
| FE-FR-008 | Display speed, heading, timestamp, vehicle_id, and route_id in a status panel and popup. | Must |
| FE-FR-009 | Auto-zoom to route or vehicle on selection. | Should |
| FE-FR-010 | Handle multiple vehicles concurrently without flicker. | Must |
| FE-FR-011 | Reconnect to WebSocket with exponential backoff and session resume. | Must |
| FE-FR-012 | Provide the Simulation control bar between the map and the Upload Shapefiles action (see §17). | Must |
| FE-FR-013 | Provide a Shapefile Upload dialog with drag-and-drop and progress bar. | Must |
| FE-FR-014 | Indicate connection state (Connected, Reconnecting, Disconnected) in the header. | Must |
| FE-FR-015 | Optional trail layer showing a vehicle's recent N points. | Should |

---

## 10. Non-Functional Requirements

**All latency numbers are wall-clock, measured at the stated percentile, under the stated load.**

| ID | Requirement | Target |
|---|---|---|
| NFR-001 | End-to-end point-to-pixel latency (DB row → rendered marker) on LAN | P50 ≤ 250 ms · P95 ≤ 500 ms · P99 ≤ 1,000 ms |
| NFR-002 | End-to-end point-to-pixel latency on WAN (≤ 100 ms RTT) | P50 ≤ 500 ms · P95 ≤ 1,500 ms |
| NFR-003 | Gateway-added latency (bus publish → client receive) | P95 ≤ 50 ms |
| NFR-004 | Map animation smoothness | ≥ 30 FPS at 200 vehicles; ≥ 15 FPS at 2,000 vehicles |
| NFR-005 | DB query: load 10,000 ordered points | ≤ 3 s with required indexes |
| NFR-006 | Concurrent connected viewers per gateway pod | ≥ 500 |
| NFR-007 | Concurrent simulated vehicles per simulator pod | ≥ 1,000 |
| NFR-008 | System-wide vehicle capacity | ≥ 10,000 with 3 simulator pods |
| NFR-009 | Shapefile upload: 50 MB archive | End-to-end ≤ 60 s |
| NFR-010 | Availability (production target) | 99.5% monthly |
| NFR-011 | Browser support | Last two major versions of Chrome, Edge, Firefox, and Safari |
| NFR-012 | Secrets management | All credentials via env vars or secret manager; never in source |
| NFR-013 | Observability | Structured JSON logs, Prometheus metrics, OpenTelemetry traces on every request and WS event |
| NFR-014 | Accessibility | WCAG 2.1 AA for all controls outside the map canvas |
| NFR-015 | i18n | UI strings externalized; LTR today, RTL-ready |

### 10.1 Service Level Indicators and Objectives

| SLI | Definition | SLO |
|---|---|---|
| Availability | Successful responses / total responses to `/healthz` over 30 days | ≥ 99.5% |
| WS publish lag | Time from bus publish to client receive | P95 ≤ 50 ms |
| Simulation correctness | Count of simulations that deliver all points in order / total | ≥ 99.9% |
| Shapefile success rate | Completed jobs / total submitted (excluding user-malformed archives) | ≥ 99% |

---

## 11. Recommended Architecture

### 11.1 Deployment Topology (reference)

```text
  ┌──────────┐   ┌──────────┐   ┌──────────┐        ┌──────────────┐
  │ Frontend │   │ Frontend │   │ Frontend │        │  Prometheus  │
  │ (static) │   │ (static) │   │ (static) │        │  Grafana     │
  └────┬─────┘   └────┬─────┘   └────┬─────┘        │  Loki/Tempo  │
       └────────┬──────┴──────┬──────┘              └──────┬───────┘
                ▼             ▼                            │
         ┌─────────────────────────┐                       │
         │   Ingress / Reverse     │                       │
         │   Proxy (TLS, origins)  │                       │
         └──────────┬──────────────┘                       │
                    │                                       │
         ┌──────────┴──────────┐                            │
         │                     │                            │
         ▼                     ▼                            │
┌────────────────┐   ┌─────────────────────┐                │
│  API pods (N)  │   │  WS Gateway pods(M) │◀─ scrape ──────┤
└──────┬─────────┘   └─────────┬───────────┘                │
       │                       │                            │
       ▼                       ▼                            │
┌─────────────────────────────────────────┐                 │
│     Redis Streams / NATS JetStream      │◀─ scrape ───────┤
└───────────────┬─────────────────────────┘                 │
                ▲                                           │
                │ publish                                   │
┌───────────────┴────────────┐                              │
│   Simulator workers (K)    │◀─ scrape ────────────────────┤
└───────────────┬────────────┘                              │
                │                                           │
                ▼                                           │
   ┌─────────────────────────────┐                          │
   │ PostgreSQL 16 + PostGIS 3.4 │◀─ postgres_exporter ─────┘
   │ (primary + replica)         │
   └─────────────────────────────┘
```

### 11.2 Technology Stack

| Layer | Recommended | Alternative | Notes |
|---|---|---|---|
| Backend | FastAPI 0.110+ (Python 3.12) | NestJS 10 / Fastify 4 (Node 20) | Pick one and stick with it; contract is identical. |
| Database | PostgreSQL 16 + PostGIS 3.4 | — | Enable `pg_partman` for automated partition management; TimescaleDB optional. |
| Message Bus | Redis 7 Streams | NATS JetStream | Redis is simplest; NATS wins on sustained fan-out. |
| WebSocket | FastAPI `WebSocket` or `ws` (Node) | Socket.IO | Prefer raw WS; Socket.IO adds a protocol layer we don't need. |
| Frontend | React 18 + Vite 5 | Vue 3 + Vite | React is what the team likely knows. |
| Map SDK | ArcGIS Maps SDK for JS 4.29+ | — | Use ES modules via `@arcgis/core`. |
| Shapefile ingest | GDAL 3.8 (`ogr2ogr`) | Python `pyogrio` | `ogr2ogr` is the proven path. |
| Deployment (dev) | Docker Compose | — | |
| Deployment (prod) | Kubernetes | Nomad | K8s manifests provided. |
| Observability | Prometheus + Grafana + Loki + Tempo | Datadog | OpenTelemetry is the instrumentation standard. |

---

## 12. Data Model and Database Design

### 12.1 `car_points_history` (time-partitioned)

```sql
CREATE TABLE car_points_history (
    id BIGSERIAL,
    vehicle_id VARCHAR(100) NOT NULL,
    route_id   VARCHAR(100),
    point_time TIMESTAMPTZ NOT NULL,
    speed_kmh  NUMERIC(10,2) CHECK (speed_kmh >= 0),
    heading_deg NUMERIC(10,2) CHECK (heading_deg BETWEEN 0 AND 360),
    longitude  NUMERIC(12,8) NOT NULL CHECK (longitude BETWEEN -180 AND 180),
    latitude   NUMERIC(12,8) NOT NULL CHECK (latitude  BETWEEN  -90 AND  90),
    geom       GEOMETRY(Point, 4326) NOT NULL,
    metadata   JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    PRIMARY KEY (id, point_time)
) PARTITION BY RANGE (point_time);

-- Monthly partitions managed by pg_partman or a cron job.
CREATE TABLE car_points_history_2026_04
  PARTITION OF car_points_history
  FOR VALUES FROM ('2026-04-01') TO ('2026-05-01');

CREATE INDEX idx_cph_vehicle_time ON car_points_history (vehicle_id, point_time);
CREATE INDEX idx_cph_route_time   ON car_points_history (route_id,   point_time);
CREATE INDEX idx_cph_geom         ON car_points_history USING GIST (geom);
```

**Why partitioning?** At sustained telemetry rates (10 Hz × 10,000 vehicles ≈ 8.6 B rows/day), a monolithic table is infeasible. Monthly range partitions make retention, vacuum, and dropping old data trivial.

### 12.2 `routes`

```sql
CREATE TABLE routes (
    id          BIGSERIAL PRIMARY KEY,
    route_id    VARCHAR(100) UNIQUE NOT NULL,
    route_name  VARCHAR(255),
    description TEXT,
    geom        GEOMETRY(LineString, 4326),
    metadata    JSONB,
    created_at  TIMESTAMPTZ DEFAULT NOW(),
    updated_at  TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_routes_geom ON routes USING GIST (geom);
```

### 12.3 `roads`

```sql
CREATE TABLE roads (
    id             BIGSERIAL PRIMARY KEY,
    road_id        VARCHAR(100) UNIQUE,
    road_name      VARCHAR(255),
    road_type      VARCHAR(100),
    speed_limit_kmh NUMERIC(10,2),
    geom           GEOMETRY(LineString, 4326),
    metadata       JSONB,
    created_at     TIMESTAMPTZ DEFAULT NOW(),
    updated_at     TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_roads_geom ON roads USING GIST (geom);
```

### 12.4 `simulations` (**new**)

```sql
CREATE TABLE simulations (
    simulation_id   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status          VARCHAR(32) NOT NULL,   -- pending|running|paused|stopped|completed|failed
    vehicle_ids     TEXT[]      NOT NULL,
    route_id        VARCHAR(100),
    speed_multiplier NUMERIC(5,2) DEFAULT 1.0,
    loop            BOOLEAN      DEFAULT FALSE,
    started_at      TIMESTAMPTZ,
    ended_at        TIMESTAMPTZ,
    last_sequence   BIGINT       DEFAULT 0,
    owner_user_id   VARCHAR(100),
    metadata        JSONB,
    created_at      TIMESTAMPTZ DEFAULT NOW(),
    updated_at      TIMESTAMPTZ DEFAULT NOW()
);
```

### 12.5 `shapefile_jobs` (**new**)

```sql
CREATE TABLE shapefile_jobs (
    job_id        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    status        VARCHAR(32) NOT NULL,   -- queued|unpacking|validating|reprojecting|loading|completed|failed
    file_name     TEXT NOT NULL,
    file_size_bytes BIGINT,
    source_srid   INTEGER,
    target_srid   INTEGER DEFAULT 4326,
    feature_count INTEGER,
    target_table  TEXT NOT NULL,          -- 'roads' | 'routes' | 'uploaded_layers'
    error_message TEXT,
    submitted_by  VARCHAR(100),
    submitted_at  TIMESTAMPTZ DEFAULT NOW(),
    completed_at  TIMESTAMPTZ
);
```

### 12.6 `uploaded_layers` (**new**)

```sql
CREATE TABLE uploaded_layers (
    id           BIGSERIAL PRIMARY KEY,
    layer_id     UUID NOT NULL,          -- grouping key per upload
    job_id       UUID REFERENCES shapefile_jobs(job_id),
    feature_name VARCHAR(255),
    geom_type    VARCHAR(32),            -- Point|LineString|Polygon|MultiPolygon|etc.
    geom         GEOMETRY(Geometry, 4326) NOT NULL,
    attributes   JSONB,
    created_at   TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_uploaded_layers_layer ON uploaded_layers (layer_id);
CREATE INDEX idx_uploaded_layers_geom  ON uploaded_layers USING GIST (geom);
```

---

## 13. Shapefile Upload Subsystem (**new**)

### 13.1 Pipeline

```text
Client (multipart ZIP)
      │
      ▼
POST /api/v1/uploads/shapefile  ── returns { job_id }
      │
      ▼
┌───────────────────────┐
│ Unpack & validate     │   .shp, .shx, .dbf required; .prj required
└──────────┬────────────┘
           ▼
┌───────────────────────┐
│ Detect source SRID    │   parse .prj; fallback heuristic disabled by default
└──────────┬────────────┘
           ▼
┌───────────────────────┐
│ Reproject to 4326     │   ogr2ogr -t_srs EPSG:4326
└──────────┬────────────┘
           ▼
┌───────────────────────┐
│ COPY into target table│   roads | routes | uploaded_layers
└──────────┬────────────┘
           ▼
Publish completion event on WS `uploads` channel
```

### 13.2 Constraints & Safeguards

- Max archive size: **200 MB** (configurable; default 50 MB in dev).
- Required members inside ZIP: `.shp`, `.shx`, `.dbf`; `.prj` strongly recommended and required by default.
- Allowed geometry types: Point, MultiPoint, LineString, MultiLineString, Polygon, MultiPolygon.
- Attribute names are lowercased and snake_cased; non-UTF-8 attribute names are rejected with a clear error.
- Processing runs in a dedicated worker queue; API returns immediately.
- Temp files are stored in an ephemeral volume and deleted after processing (success or failure).

### 13.3 Error Codes (shapefile-specific)

| Code | Meaning |
|---|---|
| `ZIP_INVALID` | Archive could not be opened. |
| `SHP_MISSING_COMPONENT` | Required file (.shp/.shx/.dbf) missing from archive. |
| `PRJ_MISSING` | `.prj` missing and strict mode is enabled. |
| `SRID_UNKNOWN` | `.prj` could not be mapped to a known EPSG code. |
| `GEOM_UNSUPPORTED` | Unsupported geometry type. |
| `ATTR_ENCODING` | Non-UTF-8 attribute data. |
| `REPROJ_FAILED` | `ogr2ogr` reprojection failed. |
| `LOAD_FAILED` | Final `COPY` into target table failed. |

---

## 14. Backend API Specification (v1)

Base URL examples:

```text
http://localhost:8000/api/v1   # FastAPI
http://localhost:3001/api/v1   # Node
```

All responses are `application/json; charset=utf-8`. Errors follow a single envelope:

```json
{ "error": { "code": "NO_POINTS_FOUND", "message": "No points for vehicle CAR-001 on route ROUTE-001", "request_id": "..." } }
```

### 14.1 Health

- `GET /healthz` → 200 if the process is up.
- `GET /readyz` → 200 if DB and bus are reachable; 503 otherwise.

### 14.2 Vehicles

- `GET /vehicles` → list vehicles with point count and time range.
- `GET /vehicles/{vehicle_id}` → single vehicle metadata.
- `GET /vehicles/{vehicle_id}/points?route_id=&from=&to=&limit=` → paginated historical points.

### 14.3 Routes

- `GET /routes` → list routes.
- `GET /routes/{route_id}` → route metadata.
- `GET /routes/{route_id}/geometry` → GeoJSON Feature.

### 14.4 Roads

- `GET /roads?bbox=minx,miny,maxx,maxy` → roads within bounding box as GeoJSON FeatureCollection.

### 14.5 Simulations

| Method | Path | Purpose |
|---|---|---|
| `POST` | `/simulations` | Create and start a simulation. |
| `GET` | `/simulations/{id}` | Simulation state. |
| `PATCH` | `/simulations/{id}` | Update `speed_multiplier` or `loop`. |
| `POST` | `/simulations/{id}/pause` | Pause. |
| `POST` | `/simulations/{id}/resume` | Resume. |
| `POST` | `/simulations/{id}/stop` | Stop. |
| `POST` | `/simulations/{id}/reset` | Reset to first point. |
| `POST` | `/simulations/{id}/seek` | Seek to a `point_time`. |

Create request:

```json
{
  "vehicle_ids": ["CAR-001", "CAR-002"],
  "route_id": "ROUTE-001",
  "speed_multiplier": 1.0,
  "loop": false,
  "start_at": null
}
```

Create response:

```json
{
  "simulation_id": "7f4b8a2e-...-...",
  "status": "running",
  "ws_channel": "/ws/v1/simulations/7f4b8a2e-...-..."
}
```

**Idempotency:** Clients should send an `Idempotency-Key` header on `POST /simulations`; re-sending the same key within 24 hours returns the original response.

### 14.6 Uploads (**new**)

- `POST /uploads/shapefile` (multipart) → `{ "job_id": "...", "status": "queued" }`.
- `GET /uploads/jobs/{job_id}` → current job status and error details if any.
- `GET /uploaded-layers` → list ingested layers.
- `GET /uploaded-layers/{layer_id}/geometry?bbox=...` → GeoJSON FeatureCollection for a layer.

---

## 15. WebSocket Protocol v1 (**enhanced**)

### 15.1 Endpoints

```text
ws://host/ws/v1/simulations/{simulation_id}?token=...&resume_from=<sequence>
ws://host/ws/v1/uploads?token=...
```

### 15.2 Frame envelope

Every frame is a single JSON object with a `type` and a `sequence` (server-assigned per channel).

```json
{ "type": "vehicle_position", "sequence": 15, "ts": "2026-04-24T10:00:15.200Z", "payload": { ... } }
```

### 15.3 Server → Client frame types

| `type` | Purpose |
|---|---|
| `hello` | Sent on connect; includes negotiated protocol version and heartbeat interval. |
| `vehicle_position` | Per-vehicle position update. |
| `simulation_status` | Lifecycle event (`started`, `paused`, `resumed`, `stopped`, `completed`, `failed`). |
| `vehicle_completed` | Emitted when a vehicle finishes its trajectory. |
| `upload_progress` | Shapefile job progress (phase + percent). |
| `upload_completed` | Shapefile job terminal result. |
| `error` | Error frame with `code` and `message`. |
| `ping` | Heartbeat from server. |

### 15.4 Client → Server frame types

| `type` | Purpose |
|---|---|
| `pong` | Heartbeat reply. |
| `subscribe` | Subscribe to a channel (used on the `/uploads` connection). |
| `unsubscribe` | Unsubscribe. |
| `resume` | Resume from a `last_sequence`. |

### 15.5 Vehicle Position payload

```json
{
  "simulation_id": "7f4b8a2e-...",
  "vehicle_id": "CAR-001",
  "route_id": "ROUTE-001",
  "timestamp": "2026-04-24T10:00:15.200Z",
  "position": { "longitude": 46.6753, "latitude": 24.7136, "wkid": 4326 },
  "speed_kmh": 42.5,
  "heading_deg": 87.3,
  "status": "moving"
}
```

### 15.6 Backpressure rules

- If a client's send buffer exceeds `MAX_CLIENT_BACKLOG` (default 256 messages), the gateway drops `vehicle_position` frames (they are superseded by newer frames) while **never** dropping `simulation_status`, `error`, or `vehicle_completed`.
- After a drop, the gateway emits a single `warning` frame with code `CLIENT_LAGGING` so the client can enter a degraded-UI state.

### 15.7 Reconnection & Resume

1. Client reconnects and sends `resume { last_sequence }`.
2. If the requested sequence is still within the retention window, server streams the missed events in order.
3. Otherwise, server sends `error { code: "RESYNC_REQUIRED" }` and the client must reinitialize layer state.

---

## 16. Simulation Engine Design

### 16.1 Single-Vehicle Replay

```text
1. Query ordered points for (vehicle_id, route_id).
2. Initialize simulation_clock from first point_time.
3. For each point p:
     wait_ms = (p.time - previous.time) / speed_multiplier
     sleep(wait_ms)
     publish(vehicle_position, p)
4. After last point → publish(vehicle_completed).
```

### 16.2 Multi-Vehicle Replay

Uses a **shared simulation clock** and a **priority queue** ordered by the next `point_time` across all vehicles:

```text
1. Load first window for each vehicle into the heap.
2. Loop:
     pop smallest-time point
     sleep until (point.time advanced by multiplier)
     publish
     fetch next point for that vehicle, push onto heap
3. When all vehicle streams drain → publish(simulation_status: completed).
```

This guarantees global temporal ordering with O(log V) per tick and predictable memory (one buffered window per vehicle).

### 16.3 Speed Multiplier

```text
actual_wait_time = (next.point_time - prev.point_time) / speed_multiplier
```

Floor wait times at 5 ms to avoid busy loops; clamp multiplier to `[0.1, 10.0]`.

### 16.4 State Persistence

Every N seconds (default 5) the simulator snapshots `{simulation_id, vehicle_id, last_sequence, last_point_time}` to `simulations.last_sequence` and per-vehicle rows. On worker restart, state is read back and replay resumes from the next point.

---

## 17. Frontend Architecture

### 17.1 Page Layout

```text
┌────────────────────────────────────────────────────────────────┐
│ Header: Title · Connection Status · User                        │
├────────────────────────────────────────────────────────────────┤
│ Left Panel               │                                      │
│  Vehicle selector        │                                      │
│  Route selector          │             MAP VIEW                 │
│  Simulation controls     │        (ArcGIS MapView)              │
│  Speed slider            │                                      │
│  Layer list              │                                      │
│                          │                                      │
├──────────────────────────┴──────────────────────────────────────┤
│ Action Bar:  [Map]  [ Simulation ]  [ Upload Shapefiles ]        │
├────────────────────────────────────────────────────────────────┤
│ Status Panel: per-vehicle speed/heading/timestamp/route          │
└────────────────────────────────────────────────────────────────┘
```

**Placement note:** Per the original author's instruction, the **Simulation** action button sits in the Action Bar **between the Map action and the Upload Shapefiles action**. Clicking it opens the simulation control drawer (or, if a simulation is already running, toggles the control visibility).

### 17.2 Component Tree (React)

```text
<App>
  <Header connectionState />
  <Layout>
    <LeftPanel>
      <VehiclePicker />
      <RoutePicker />
      <SimulationControls />
      <SpeedSlider />
      <LayerList />
    </LeftPanel>
    <MapView>
      <BasemapGallery />
      <RouteLayer />
      <VehicleLayer />      {/* GraphicsLayer or FeatureLayer based on count */}
      <TrailLayer />
      <UploadedLayersHost />
    </MapView>
  </Layout>
  <ActionBar>
    <MapAction />
    <SimulationAction />    {/* NEW */}
    <UploadShapefilesAction />
  </ActionBar>
  <StatusPanel />
  <ShapefileUploadDialog />
  <Toasts />
</App>
```

### 17.3 State Management

- UI state (selections, dialogs): `zustand` or `redux-toolkit`.
- Server state (routes, vehicles, jobs): `@tanstack/react-query`.
- Map state lives **outside** React (ArcGIS views are imperative). Communicate with the map through thin service modules, not through re-renders.

### 17.4 Vehicle Layer — Tiered Rendering

| Active Vehicles | Layer | Rationale |
|---|---|---|
| 1–200 | `GraphicsLayer` | Simplest API; smooth per-graphic updates. |
| 201–5,000 | Client-side `FeatureLayer` (from in-memory graphics) | Uses WebGL; scales to thousands of features. |
| 5,001+ | `FeatureLayer` + feature reduction clustering at low zoom | Preserves interactivity without destroying FPS. |

The frontend picks the correct layer dynamically based on the live vehicle count. **This is the single most important frontend decision** — `GraphicsLayer` alone cannot meet NFR-005 (10,000 vehicles). Do not skip this tier.

### 17.5 Smooth Animation

Use `requestAnimationFrame`, not `setInterval`:

```javascript
function animate(graphic, fromLonLat, toLonLat, durationMs) {
  const start = performance.now();
  function step(now) {
    const t = Math.min(1, (now - start) / durationMs);
    const lon = fromLonLat[0] + (toLonLat[0] - fromLonLat[0]) * t;
    const lat = fromLonLat[1] + (toLonLat[1] - fromLonLat[1]) * t;
    graphic.geometry = { type: "point", longitude: lon, latitude: lat, spatialReference: { wkid: 4326 } };
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
```

Interpolation duration equals the wall-clock gap between the two received points, so animation naturally matches the simulation speed multiplier.

### 17.6 Vehicle Symbol

```javascript
const vehicleSymbol = {
  type: "picture-marker",
  url: "/assets/car-marker.svg",
  width: "32px",
  height: "32px",
  angle: headingDeg
};
```

Use SVG so the marker scales crisply. For >5,000 vehicles, switch to a simple-marker triangle to avoid per-graphic texture overhead.

---

## 18. Data Validation Rules

| Rule | Check |
|---|---|
| VAL-001 | `vehicle_id` present and non-empty. |
| VAL-002 | `point_time` present and parseable as ISO-8601 with timezone. |
| VAL-003 | `longitude` ∈ [-180, 180]. |
| VAL-004 | `latitude` ∈ [-90, 90]. |
| VAL-005 | `heading_deg` ∈ [0, 360]. |
| VAL-006 | `speed_kmh` ≥ 0 and ≤ 400 (configurable sanity cap). |
| VAL-007 | `geom` passes `ST_IsValid`. |
| VAL-008 | Route geometry is LineString or MultiLineString and `ST_IsValid`. |
| VAL-009 | Uploaded feature SRID is known; if missing, reject unless "assume 4326" is explicitly enabled. |
| VAL-010 | Attribute JSON does not exceed 16 KB per feature (configurable). |

Invalid points are **skipped, counted, and logged** — never streamed.

---

## 19. Error Code Catalog

| Code | Layer | Meaning |
|---|---|---|
| `NO_POINTS_FOUND` | API/Sim | No points for the selected vehicle/route. |
| `DB_TIMEOUT` | API/Sim | Query exceeded timeout. |
| `DB_UNAVAILABLE` | API | Database not reachable. |
| `INVALID_SIMULATION_ID` | API/WS | Simulation ID not found. |
| `SIMULATION_CONFLICT` | API | Simulation already in requested state. |
| `RESYNC_REQUIRED` | WS | Client resume beyond retention window. |
| `CLIENT_LAGGING` | WS | Client backlog threshold exceeded. |
| `ORIGIN_FORBIDDEN` | WS | Origin not allow-listed. |
| `AUTH_INVALID` | API/WS | Token missing, expired, or malformed. |
| `UPLOAD_TOO_LARGE` | API | Upload above configured limit. |
| `ZIP_INVALID` | Upload | Cannot open archive. |
| `SHP_MISSING_COMPONENT` | Upload | Missing `.shp`/`.shx`/`.dbf`. |
| `PRJ_MISSING` | Upload | Missing `.prj` (strict mode). |
| `SRID_UNKNOWN` | Upload | Cannot derive EPSG code from `.prj`. |
| `GEOM_UNSUPPORTED` | Upload | Unsupported geometry type. |
| `REPROJ_FAILED` | Upload | `ogr2ogr` failure. |
| `LOAD_FAILED` | Upload | DB load step failed. |

---

## 20. Security

| ID | Requirement |
|---|---|
| SEC-001 | Database credentials only via environment variables or secret manager. |
| SEC-002 | Frontend never connects directly to PostgreSQL. |
| SEC-003 | Backend validates and sanitizes every path parameter and query parameter; never concatenates SQL. |
| SEC-004 | CORS allow-list is explicit in production; wildcard only in dev. |
| SEC-005 | WebSocket connections require a signed short-lived JWT issued by `/api/v1/auth/ws-token`. Tokens are scoped to a `simulation_id`. |
| SEC-006 | TLS / WSS everywhere in production; HTTP-to-HTTPS redirect at ingress. |
| SEC-007 | Logs redact tokens, passwords, and bearer headers. |
| SEC-008 | Rate limiting: 60 requests/min per IP on REST by default; configurable. Per-connection message rate on WS. |
| SEC-009 | Upload endpoint runs a MIME sniffer; rejects anything not a ZIP even if the extension matches. |
| SEC-010 | Dependency scanning (Dependabot/Renovate) and container image scanning (Trivy) gate every release. |
| SEC-011 | SBOM generated per build (CycloneDX). |
| SEC-012 | Secrets never baked into container images; verified in CI. |

### 20.1 Authentication Model

- Short-lived access JWTs for REST (15 min); refresh tokens where a web session exists.
- `/api/v1/auth/ws-token` exchanges an access token for a narrow-scope WS token (5-minute TTL, single `simulation_id`).
- The WS token is passed as a query parameter (avoids dealing with custom headers in browser WS clients); the query string must not be logged.

---

## 21. Observability

### 21.1 Logs

- JSON lines to stdout; fields: `ts`, `level`, `service`, `request_id`, `simulation_id`, `vehicle_id`, `msg`, plus domain fields.
- Correlate across services with `request_id` from REST and `connection_id` from WS, both propagated into the message bus metadata.

### 21.2 Metrics (Prometheus)

Minimum set:

- `http_requests_total{route,method,status}`
- `http_request_duration_seconds{route,method}`
- `ws_connections_active`
- `ws_messages_sent_total{type}`
- `ws_send_latency_seconds` (bus publish → client receive)
- `simulation_active_count`
- `simulation_events_published_total{type}`
- `simulation_event_publish_latency_seconds`
- `db_query_duration_seconds{query}`
- `upload_jobs_total{status}`
- `upload_job_duration_seconds`

### 21.3 Traces (OpenTelemetry)

Spans cover: `POST /simulations` → simulator create → first publish → gateway forward → client ack; and `POST /uploads/shapefile` → unpack → reproject → COPY → completion event.

### 21.4 Dashboards & Alerts

- **Latency** dashboard: REST latency, WS publish latency, DB query latency.
- **Throughput** dashboard: simulations/sec, events/sec, clients connected.
- **Errors** dashboard: error rate by code.
- Alerts: `/readyz` failing, WS publish P95 above SLO for 5 min, error rate > 1% for 10 min, upload job failure rate > 5% in 1 hour.

---

## 22. Configuration

```env
# Application
APP_ENV=development
APP_HOST=0.0.0.0
APP_PORT=8000
API_VERSION=v1

# Database
POSTGRES_HOST=localhost
POSTGRES_PORT=5432
POSTGRES_DB=geostream
POSTGRES_USER=postgres
POSTGRES_PASSWORD=change_me
POSTGRES_POOL_MIN=2
POSTGRES_POOL_MAX=20

# Message bus
BUS_BACKEND=redis                 # redis | nats
REDIS_URL=redis://localhost:6379/0
REDIS_STREAM_PREFIX=geostream

# WebSocket
WS_PATH=/ws/v1/simulations
WS_HEARTBEAT_INTERVAL_SECONDS=20
WS_IDLE_TIMEOUT_SECONDS=60
WS_RETENTION_SECONDS=60
WS_MAX_CLIENT_BACKLOG=256

# Simulation
DEFAULT_REPLAY_SPEED=1.0
MIN_REPLAY_SPEED=0.1
MAX_REPLAY_SPEED=10.0
MAX_ACTIVE_SIMULATIONS=100
MAX_VEHICLES_PER_SIMULATION=10000

# Uploads
UPLOAD_MAX_BYTES=52428800         # 50 MB default
UPLOAD_WORK_DIR=/var/lib/geostream/uploads
UPLOAD_STRICT_PRJ=true

# Security
JWT_ISSUER=geostream
JWT_ACCESS_TTL_SECONDS=900
JWT_WS_TTL_SECONDS=300
ALLOWED_ORIGINS=http://localhost:5173

# Observability
LOG_LEVEL=INFO
OTEL_EXPORTER_OTLP_ENDPOINT=http://localhost:4317
PROMETHEUS_METRICS_PATH=/metrics
```

---

## 23. Project Structure

### 23.1 FastAPI Option

```text
vehicle-geostream-system/
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── config.py
│   │   ├── db/
│   │   │   ├── session.py
│   │   │   └── migrations/            # Alembic
│   │   ├── models/
│   │   ├── repositories/
│   │   ├── services/
│   │   │   ├── simulator_service.py
│   │   │   ├── shapefile_service.py
│   │   │   ├── bus_publisher.py
│   │   │   └── auth_service.py
│   │   ├── api/v1/
│   │   │   ├── vehicles.py
│   │   │   ├── routes.py
│   │   │   ├── roads.py
│   │   │   ├── simulations.py
│   │   │   ├── uploads.py
│   │   │   └── health.py
│   │   ├── ws/
│   │   │   └── simulation_ws.py
│   │   └── workers/
│   │       ├── simulator_worker.py
│   │       └── shapefile_worker.py
│   ├── tests/
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .env.example
├── frontend/
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── config.ts
│   │   ├── api/
│   │   ├── ws/
│   │   ├── state/
│   │   ├── components/
│   │   │   ├── ActionBar.tsx           # Map · Simulation · Upload
│   │   │   ├── SimulationControls.tsx
│   │   │   ├── ShapefileUploadDialog.tsx
│   │   │   └── ...
│   │   └── map/
│   │       ├── mapFactory.ts
│   │       ├── routeLayer.ts
│   │       ├── vehicleLayerGraphics.ts
│   │       └── vehicleLayerFeature.ts
│   ├── package.json
│   ├── vite.config.ts
│   └── Dockerfile
├── database/
│   ├── 001_extensions.sql
│   ├── 002_tables.sql
│   ├── 003_indexes.sql
│   ├── 004_partitions.sql
│   ├── 005_seed.sql
│   └── README.md
├── deploy/
│   ├── docker-compose.yml
│   └── k8s/
│       ├── api-deployment.yaml
│       ├── ws-deployment.yaml
│       ├── worker-deployment.yaml
│       ├── redis.yaml
│       └── postgres.yaml
└── README.md
```

### 23.2 Node.js Option (Fastify or NestJS)

```text
vehicle-geostream-system/
├── backend/
│   ├── src/
│   │   ├── server.ts
│   │   ├── config.ts
│   │   ├── db/
│   │   ├── repositories/
│   │   ├── services/
│   │   ├── routes/v1/
│   │   ├── ws/
│   │   └── workers/
│   ├── package.json
│   ├── Dockerfile
│   └── .env.example
└── ...
```

---

## 24. Deployment

### 24.1 Docker Compose (development)

```yaml
version: "3.9"

services:
  postgres:
    image: postgis/postgis:16-3.4
    environment:
      POSTGRES_DB: geostream
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: change_me
    ports: ["5432:5432"]
    volumes:
      - pgdata:/var/lib/postgresql/data
      - ./database:/docker-entrypoint-initdb.d

  redis:
    image: redis:7-alpine
    ports: ["6379:6379"]

  backend:
    build: ./backend
    depends_on: [postgres, redis]
    environment:
      POSTGRES_HOST: postgres
      REDIS_URL: redis://redis:6379/0
    ports: ["8000:8000"]

  simulator:
    build:
      context: ./backend
      dockerfile: Dockerfile.worker
    depends_on: [postgres, redis]
    environment:
      POSTGRES_HOST: postgres
      REDIS_URL: redis://redis:6379/0

  shapefile-worker:
    build:
      context: ./backend
      dockerfile: Dockerfile.shapefile
    depends_on: [postgres, redis]

  frontend:
    build: ./frontend
    depends_on: [backend]
    ports: ["5173:5173"]

volumes:
  pgdata:
```

### 24.2 Kubernetes (production sketch)

- One Deployment per service; HPA targets 70% CPU and custom WS connections metric.
- PostgreSQL managed externally (RDS/Cloud SQL) or via an operator (Zalando, CNPG).
- Redis clustered for HA; NATS JetStream as alternative.
- Ingress terminates TLS; WS upgrade passed through.
- NetworkPolicies: only the API and gateway are Internet-reachable; workers and DB are intra-cluster only.
- Pod Disruption Budgets ≥ 1; rolling deploys with `maxSurge=1, maxUnavailable=0`.

---

## 25. Testing Strategy

### 25.1 Testing Pyramid

| Layer | Scope | Examples |
|---|---|---|
| Unit | Pure functions, repositories with mocks, layer reducers, WS message parser, interpolation math. | Target ≥ 80% line coverage on services/ and repositories/. |
| Integration | API + real Postgres + real Redis via testcontainers. | Start simulation → observe Redis stream entries; shapefile upload → observe `uploaded_layers` rows. |
| Contract | OpenAPI schema validation of every response; JSON Schema for every WS frame. | Reject any response that drifts from the spec. |
| E2E | Docker Compose spun up in CI; Playwright drives the UI. | Full Simulation and Upload flows. |
| Load | 1,000 and then 10,000 simulated vehicles; measure against NFRs. | k6 or Locust on the API; custom Node harness for WS. |
| Chaos | Kill simulator pod mid-run; sever Redis; pause Postgres. | System self-heals; clients resume without data loss within retention window. |
| Soak | 24-hour multi-vehicle run at 2x. | No memory leaks; no DB bloat; log volume stable. |

### 25.2 Backend Test Cases

- Repository: ordered point queries, bounding-box road queries, pagination.
- Simulator: pause/resume preserves next sequence; speed multiplier math; invalid points skipped and counted.
- WS Gateway: backpressure drops only non-critical frames; resume within retention replays correctly; expired resume returns `RESYNC_REQUIRED`.
- Shapefile worker: missing `.prj`, unknown SRID, unsupported geometry, non-UTF-8 attributes, oversized archive — each returns the correct error code.

### 25.3 Frontend Test Cases

- `MessageParser` validates all frame types and rejects malformed payloads.
- `VehicleLayer` promotes from GraphicsLayer to FeatureLayer when crossing the 200-vehicle threshold.
- Reconnect with `resume` shows no marker flicker and no sequence gaps.
- `ShapefileUploadDialog` displays progress updates as bus events arrive.
- `SimulationControls` disables Pause when paused, etc. (state machine conformance).

### 25.4 E2E Scenario

```text
1. docker compose up (postgres, redis, backend, simulator, shapefile-worker, frontend)
2. Seed roads, routes, and car points via fixtures.
3. Browser opens the app; connection status turns Connected.
4. User selects vehicle CAR-001 and route ROUTE-001.
5. User clicks the Simulation button (between Map and Upload Shapefiles).
6. Assert: marker appears within 1 s and advances point-by-point.
7. User clicks Pause → marker stops. User clicks Resume → marker continues from the same position.
8. User uploads a 10 MB sample shapefile; assert: progress frames arrive on WS and the new layer renders.
9. User clicks Stop → simulation ends; status panel clears.
10. Repeat with 2 vehicles; assert independent updates.
```

---

## 26. Acceptance Criteria

| ID | Criterion |
|---|---|
| AC-001 | Postgres contains `car_points_history`, `roads`, `routes`, `simulations`, `shapefile_jobs`, `uploaded_layers`. |
| AC-002 | Backend `/readyz` returns 200 when Postgres and Redis are reachable. |
| AC-003 | Frontend displays an ArcGIS basemap. |
| AC-004 | User can select a vehicle and route. |
| AC-005 | Simulation button appears in the Action Bar between Map and Upload Shapefiles. |
| AC-006 | Clicking Simulation creates a simulation and begins streaming within 1 second. |
| AC-007 | Vehicle markers appear, move in correct order, and rotate by `heading_deg`. |
| AC-008 | Pause, Resume, Stop, Reset, Seek, and Speed controls all work as specified. |
| AC-009 | WebSocket reconnect within 60 seconds resumes without data loss. |
| AC-010 | Uploading a valid shapefile creates a `shapefile_jobs` row and an `uploaded_layers` dataset; the layer appears in the UI on success. |
| AC-011 | Uploading an invalid shapefile returns the correct error code and a user-facing message. |
| AC-012 | Invalid points are skipped and counted; skip count is exposed via metrics. |
| AC-013 | 2,000 simulated vehicles render at ≥ 15 FPS on a mid-range laptop in Chrome. |
| AC-014 | `/metrics` exposes all metrics listed in §21.2. |
| AC-015 | All REST endpoints match the OpenAPI schema; all WS frames match their JSON Schemas. |
| AC-016 | Production deployment uses WSS, token-scoped WS connections, and an allow-list of origins. |

---

## 27. Development Roadmap

### Phase 1 — Database Foundation (Week 1)
Install Postgres + PostGIS. Create tables, indexes, partitions. Seed with 1 route, 1 vehicle, 1,000 points. Alembic (or equivalent) baselined.

### Phase 2 — Backend API (Weeks 2–3)
Health endpoints, vehicles, routes, roads. OpenAPI published. Integration tests with testcontainers. Structured logging and `/metrics`.

### Phase 3 — Simulator + Message Bus (Weeks 3–4)
Simulator worker. Redis Streams publisher. Single- and multi-vehicle replay. State persistence. Speed multiplier. Pause/Resume/Stop/Reset/Seek.

### Phase 4 — WebSocket Gateway (Weeks 4–5)
WS endpoint, auth, heartbeat, sequence numbers, resume-on-reconnect, backpressure. Contract tests.

### Phase 5 — Frontend (Weeks 5–7)
React scaffold, ArcGIS integration, basemap, route layer, vehicle layer (tiered), animation, control panel, status panel, reconnect logic, Action Bar with the Simulation button, Upload Shapefiles dialog.

### Phase 6 — Shapefile Upload (Weeks 6–7, parallel)
Upload API, shapefile worker, GDAL reprojection pipeline, progress events on WS, error-code coverage.

### Phase 7 — Observability & Hardening (Week 8)
OpenTelemetry, dashboards, alerts, load tests, chaos tests, soak run, security review, documentation.

### Phase 8 — Packaging & Delivery (Week 9)
Docker Compose finalized, Kubernetes manifests, README with quickstart, sample datasets, recorded demo, training.

---

## 28. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|---|---|---|---|
| `GraphicsLayer` cannot scale to 10,000 vehicles. | High | High | Tiered rendering (§17.4); enforce threshold in FE code. |
| Monolithic `car_points_history` becomes unqueryable. | High | High | Monthly partitioning from day one (§12.1). |
| Simulator and gateway tightly coupled → cannot scale. | High | High | Message bus decouples them (§11.1, §15). |
| Shapefiles arrive in exotic CRSes. | Medium | Medium | GDAL handles most; strict mode reports unknowns clearly. |
| WS clients stall and cause memory pressure on gateway. | Medium | High | Backpressure with drop rules (§15.6). |
| Temporal drift during long replays at high multipliers. | Medium | Medium | Simulation clock resynced from absolute `point_time` each tick, not accumulated sleeps. |
| PostGIS query plan regressions after data growth. | Medium | Medium | Metrics on `db_query_duration_seconds`; alert on P95 regressions; `ANALYZE` automation. |
| Secrets leaked via logs. | Low | High | Structured redaction; CI secret scanner; log review in code review. |
| Large upload exhausts ephemeral disk. | Medium | Medium | Upload size cap and per-worker quota; cleanup on finally. |

---

## 29. Future Enhancements

| Enhancement | Notes |
|---|---|
| Live GPS / AVL ingestion | Replace simulator with a live ingestor; WS contract unchanged. |
| ArcGIS Enterprise feature service publishing | Replay as published FS for cross-tool reuse. |
| ArcGIS Velocity | For high-throughput analytics on the same stream. |
| Kafka / MQTT | If external producers require them; bus adapter is already an abstraction. |
| Vehicle clustering at low zoom | Built on `FeatureReductionCluster`. |
| Historical timeline scrubber | Seek-to-timestamp UI. |
| Geofencing & route deviation | Spatial events when vehicles enter zones or leave routes. |
| ETA calculation | Route progress × average recent speed. |
| ArcGIS 3D SceneView | 3D vehicles with terrain. |
| SSO / SAML | Enterprise identity. |
| Analytics dashboard | Speed distributions, stop detection, trip summaries. |
| Offline tiles / field mode | Cached basemaps and point buffers. |

---

## 30. Key Developer Instructions (preserved intent; sharpened)

The core pipeline **must not change**:

```text
PostgreSQL/PostGIS → Simulator → Message Bus → WebSocket Gateway → ArcGIS Maps Frontend
```

Everything added by this PRD (bus, auth, shapefile upload, tiered rendering, observability, SLOs) is **around** that pipeline, not across it.

The system must:

1. Treat PostgreSQL/PostGIS as the single source of truth for vehicle point data.
2. Store car points in `car_points_history` (partitioned by month).
3. Store road data in `roads` and route data in `routes`.
4. Read points ordered by `(vehicle_id, point_time)`.
5. Publish sequential events to a message bus, never directly to WebSocket clients from the simulator.
6. Send versioned, sequenced, schema-validated JSON frames to the frontend.
7. Use ArcGIS Maps SDK for JavaScript with a tiered rendering strategy.
8. Interpolate marker movement using `requestAnimationFrame`.
9. Support Start, Pause, Resume, Stop, Reset, Seek, and Speed.
10. Expose the Simulation button in the Action Bar between Map and Upload Shapefiles.
11. Provide asynchronous shapefile ingest with CRS reprojection to EPSG:4326.
12. Keep backend, simulator worker, gateway, shapefile worker, and frontend as independently deployable modules.
13. Emit structured logs, metrics, and traces for every request and every WS event.

---

## 31. Definition of Done

The system is complete when:

- A developer can run the full stack locally with `docker compose up`.
- Postgres contains all tables, indexes, partitions, and sample data.
- Backend exposes all v1 endpoints, `/healthz`, `/readyz`, and `/metrics`.
- Simulator publishes correctly-ordered events to the message bus.
- WebSocket gateway broadcasts sequenced events and supports resume-on-reconnect.
- Simulator supports Start, Pause, Resume, Stop, Reset, Seek, and Speed (0.1x–10x).
- Frontend renders an ArcGIS basemap, the selected route, and moving vehicle markers with correct heading and speed.
- The Action Bar contains Map, Simulation, and Upload Shapefiles in that order, left to right.
- Shapefile upload accepts a valid archive, reprojects it to EPSG:4326, and renders the result.
- Multiple browsers see the same simulation without interference.
- Documented acceptance criteria all pass.
- Load tests meet NFR-006, NFR-007, and NFR-008 on the reference deployment.
- OpenAPI spec and WS JSON Schemas are published alongside the source.
- README covers quickstart, configuration, operations, and troubleshooting.

---

## 32. Final Summary

This enhanced PRD builds on the v1.0 foundation and strengthens it along the dimensions that determine whether the system actually survives in production: horizontal scalability (message bus), data volume (partitioning), client rendering at scale (tiered ArcGIS layers), resilience on the wire (sequenced WS protocol with backpressure and resume), operational clarity (observability, SLOs, error catalog), and user-facing completeness (Simulation button and Shapefile Upload subsystem).

The core product remains what v1.0 described: a modular real-time GIS streaming platform that reads PostGIS points, replays them as live movement, and renders them smoothly on an ArcGIS web map. What this revision adds is the engineering depth to take that product from a convincing demo to a service a team can operate.

---

## Appendix A — Sample WebSocket Frames

Hello:

```json
{ "type": "hello", "sequence": 0, "ts": "2026-04-24T10:00:00.000Z",
  "payload": { "protocol_version": "1", "heartbeat_seconds": 20, "retention_seconds": 60 } }
```

Vehicle position:

```json
{ "type": "vehicle_position", "sequence": 15, "ts": "2026-04-24T10:00:15.200Z",
  "payload": {
    "simulation_id": "7f4b8a2e-...",
    "vehicle_id": "CAR-001",
    "route_id": "ROUTE-001",
    "timestamp": "2026-04-24T10:00:15.200Z",
    "position": { "longitude": 46.6753, "latitude": 24.7136, "wkid": 4326 },
    "speed_kmh": 42.5, "heading_deg": 87.3, "status": "moving"
  } }
```

Simulation status:

```json
{ "type": "simulation_status", "sequence": 1, "ts": "2026-04-24T10:00:00.100Z",
  "payload": { "simulation_id": "7f4b8a2e-...", "status": "started", "active_vehicles": 2 } }
```

Error:

```json
{ "type": "error", "sequence": 42, "ts": "2026-04-24T10:05:00.000Z",
  "payload": { "code": "RESYNC_REQUIRED", "message": "Resume sequence outside retention window" } }
```

---

## Appendix B — Minimal ArcGIS Bootstrap

```javascript
import Map from "@arcgis/core/Map";
import MapView from "@arcgis/core/views/MapView";
import GraphicsLayer from "@arcgis/core/layers/GraphicsLayer";

export function createMap(containerId) {
  const routeLayer = new GraphicsLayer({ id: "routes", title: "Routes" });
  const vehicleLayer = new GraphicsLayer({ id: "vehicles", title: "Vehicles" });

  const map = new Map({ basemap: "streets-navigation-vector", layers: [routeLayer, vehicleLayer] });
  const view = new MapView({ container: containerId, map, center: [46.6753, 24.7136], zoom: 12 });
  return { map, view, routeLayer, vehicleLayer };
}
```

---

## Appendix C — References

- ArcGIS Maps SDK for JavaScript: https://developers.arcgis.com/javascript/latest/
- PostGIS: https://postgis.net/documentation/
- GeoJSON (RFC 7946): https://datatracker.ietf.org/doc/html/rfc7946
- OGC Simple Features: https://www.ogc.org/standard/sfa/
- OpenTelemetry: https://opentelemetry.io/
- Redis Streams: https://redis.io/docs/data-types/streams/
- NATS JetStream: https://docs.nats.io/nats-concepts/jetstream
- GDAL `ogr2ogr`: https://gdal.org/programs/ogr2ogr.html

---

*End of document.*
