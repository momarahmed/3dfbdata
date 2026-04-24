<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\Schema;

/**
 * Remove the legacy routing-job pipeline (routing_jobs / geo_routes / route_points).
 *
 * These tables backed the "Submit routing job" + "Data explorer" screens and the
 * Esri FeatureServer shim. They have been superseded by the RoutingTask workflow,
 * which writes its outputs as first-class FeatureLayer rows in PostGIS.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::dropIfExists('route_points');
        Schema::dropIfExists('geo_routes');
        Schema::dropIfExists('routing_jobs');
    }

    public function down(): void
    {
        // Intentional no-op: the legacy tables are obsolete and should not come back.
    }
};
