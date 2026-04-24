-- CrowdSim 3D — PostGIS & helper extensions bootstrap
-- Executed once on first container start (docker-entrypoint-initdb.d).

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS postgis_topology;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- pgRouting is optional in the MVP — enable it if the extension is available
-- in the image without failing the first boot.
DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM pg_available_extensions WHERE name = 'pgrouting') THEN
        EXECUTE 'CREATE EXTENSION IF NOT EXISTS pgrouting';
    END IF;
END
$$;
