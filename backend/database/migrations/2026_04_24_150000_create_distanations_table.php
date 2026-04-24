<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('distanations', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('dist_name');
            $table->timestamps();
        });

        DB::statement('ALTER TABLE distanations ADD COLUMN geom geometry(Point, 4326) NOT NULL');
        DB::statement('CREATE INDEX distanations_geom_gix ON distanations USING GIST (geom)');
    }

    public function down(): void
    {
        Schema::dropIfExists('distanations');
    }
};
