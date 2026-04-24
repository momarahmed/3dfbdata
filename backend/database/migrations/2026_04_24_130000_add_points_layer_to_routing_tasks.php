<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::table('routing_tasks', function (Blueprint $table): void {
            $table->uuid('output_points_layer_id')->nullable()->after('output_nodes_layer_id');

            $table->foreign('output_points_layer_id')
                ->references('id')->on('feature_layers')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('routing_tasks', function (Blueprint $table): void {
            $table->dropForeign(['output_points_layer_id']);
            $table->dropColumn('output_points_layer_id');
        });
    }
};
