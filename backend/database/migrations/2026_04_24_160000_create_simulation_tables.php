<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Schema for the real-time vehicle streaming subsystem
 * (see PRD/realtime_geospatial_vehicle_streaming_prd_v2.md §12).
 *
 * Notes vs. PRD:
 * - `car_points_history` is created as a single table in this first iteration
 *   to keep the Laravel schema builder happy. Monthly partitioning via pg_partman
 *   is called out as a future enhancement (PRD §12.1).
 * - All geometries are stored in EPSG:4326 (WGS84).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('car_points_history', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->string('vehicle_id', 100)->index();
            $table->string('route_id', 100)->nullable();
            $table->timestampTz('point_time');
            $table->decimal('speed_kmh', 10, 2)->nullable();
            $table->decimal('heading_deg', 10, 2)->nullable();
            $table->decimal('longitude', 12, 8);
            $table->decimal('latitude', 12, 8);
            $table->jsonb('metadata')->nullable();
            $table->timestamps();
        });

        DB::statement('ALTER TABLE car_points_history ADD COLUMN geom geometry(Point, 4326)');
        DB::statement('CREATE INDEX idx_cph_vehicle_time ON car_points_history (vehicle_id, point_time)');
        DB::statement('CREATE INDEX idx_cph_route_time   ON car_points_history (route_id,   point_time)');
        DB::statement('CREATE INDEX idx_cph_geom         ON car_points_history USING GIST (geom)');
        DB::statement('ALTER TABLE car_points_history ADD CONSTRAINT cph_lon_range CHECK (longitude BETWEEN -180 AND 180)');
        DB::statement('ALTER TABLE car_points_history ADD CONSTRAINT cph_lat_range CHECK (latitude  BETWEEN  -90 AND  90)');

        Schema::create('simulations', function (Blueprint $table): void {
            $table->uuid('simulation_id')->primary();
            $table->string('status', 32)->default('pending')->index(); // pending|running|paused|stopped|completed|failed
            $table->jsonb('vehicle_ids');
            $table->string('route_id', 100)->nullable();
            $table->decimal('speed_multiplier', 5, 2)->default(1.0);
            $table->boolean('loop')->default(false);
            $table->timestampTz('started_at')->nullable();
            $table->timestampTz('paused_at')->nullable();
            $table->timestampTz('ended_at')->nullable();
            $table->timestampTz('last_point_time')->nullable();
            $table->bigInteger('last_sequence')->default(0);
            $table->jsonb('metadata')->nullable();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('simulations');
        Schema::dropIfExists('car_points_history');
    }
};
