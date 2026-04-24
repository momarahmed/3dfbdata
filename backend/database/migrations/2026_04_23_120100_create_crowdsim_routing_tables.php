<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('routing_jobs', function (Blueprint $table) {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('status')->default('PENDING')->index();
            $table->unsignedTinyInteger('progress')->default(0);
            $table->text('message')->nullable();
            $table->timestamps();
        });

        Schema::create('geo_routes', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->uuid('job_id')->index();
            $table->integer('route_oid')->index();
            $table->string('start_id', 64);
            $table->string('end_id', 64);
            $table->integer('pair_id')->nullable();
            $table->string('algorithm', 32)->default('ONE_END');
            $table->string('status', 16)->default('OK')->index();
            $table->text('msg')->nullable();
            $table->double('total_min')->default(0);
            $table->double('total_len_m')->default(0);
            $table->double('start_snap_d')->nullable();
            $table->double('end_snap_d')->nullable();
            $table->integer('node_count')->nullable();
            $table->timestampTz('departure_utc')->nullable();
            $table->timestamps();

            $table->foreign('job_id')->references('id')->on('routing_jobs')->cascadeOnDelete();
        });

        DB::statement('ALTER TABLE geo_routes ADD COLUMN geom geometry(LineString, 4326)');
        DB::statement('CREATE INDEX geo_routes_geom_gix ON geo_routes USING GIST (geom)');

        Schema::create('route_points', function (Blueprint $table) {
            $table->bigIncrements('id');
            $table->unsignedBigInteger('route_id')->index();
            $table->uuid('job_id')->index();
            $table->integer('seq');
            $table->double('cum_dist_m')->default(0);
            $table->double('cum_min')->default(0);
            $table->timestampTz('time_utc')->index();
            $table->double('heading')->default(0);
            $table->string('cardinal_dir', 8)->nullable();
            $table->double('step_m')->nullable();
            $table->timestamps();

            $table->foreign('route_id')->references('id')->on('geo_routes')->cascadeOnDelete();
            $table->foreign('job_id')->references('id')->on('routing_jobs')->cascadeOnDelete();
        });

        DB::statement('ALTER TABLE route_points ADD COLUMN geom geometry(Point, 4326)');
        DB::statement('CREATE INDEX route_points_geom_gix ON route_points USING GIST (geom)');
        DB::statement('CREATE INDEX route_points_job_time_idx ON route_points (job_id, time_utc)');

        Schema::create('venues', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('region', 64)->nullable();
            $table->string('status', 32)->default('active')->index();
            $table->unsignedInteger('capacity')->nullable();
            $table->timestamps();
        });

        Schema::create('simulation_scenarios', function (Blueprint $table) {
            $table->id();
            $table->string('name');
            $table->string('category', 64)->nullable();
            $table->string('status', 32)->default('draft')->index();
            $table->unsignedInteger('runs')->default(0);
            $table->timestamps();
        });

        Schema::create('crowd_alerts', function (Blueprint $table) {
            $table->id();
            $table->string('title');
            $table->string('zone', 128)->nullable();
            $table->string('severity', 16)->index();
            $table->string('status', 32)->default('open')->index();
            $table->timestampTz('triggered_at')->useCurrent();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('crowd_alerts');
        Schema::dropIfExists('simulation_scenarios');
        Schema::dropIfExists('venues');
        Schema::dropIfExists('route_points');
        Schema::dropIfExists('geo_routes');
        Schema::dropIfExists('routing_jobs');
    }
};
