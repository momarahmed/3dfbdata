<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('feature_layers', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('slug')->unique();
            $table->string('source_name')->nullable();
            $table->string('source_type', 32)->default('shapefile');
            $table->string('geometry_type', 32)->nullable();
            $table->integer('srid')->default(4326);
            $table->unsignedInteger('feature_count')->default(0);
            $table->double('bbox_xmin')->nullable();
            $table->double('bbox_ymin')->nullable();
            $table->double('bbox_xmax')->nullable();
            $table->double('bbox_ymax')->nullable();
            $table->jsonb('field_schema')->nullable();
            $table->text('description')->nullable();
            $table->string('status', 24)->default('READY');
            $table->text('message')->nullable();
            $table->timestamps();
        });

        Schema::create('feature_layer_features', function (Blueprint $table): void {
            $table->bigIncrements('id');
            $table->uuid('feature_layer_id')->index();
            $table->jsonb('properties')->nullable();
            $table->timestamps();

            $table->foreign('feature_layer_id')
                ->references('id')->on('feature_layers')
                ->cascadeOnDelete();
        });

        DB::statement('ALTER TABLE feature_layer_features ADD COLUMN geom geometry(Geometry, 4326)');
        DB::statement('CREATE INDEX feature_layer_features_geom_gix ON feature_layer_features USING GIST (geom)');

        Schema::table('routing_jobs', function (Blueprint $table): void {
            $table->jsonb('input_feature_layer_ids')->nullable()->after('message');
        });
    }

    public function down(): void
    {
        Schema::table('routing_jobs', function (Blueprint $table): void {
            $table->dropColumn('input_feature_layer_ids');
        });
        Schema::dropIfExists('feature_layer_features');
        Schema::dropIfExists('feature_layers');
    }
};
