<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('routing_tasks', function (Blueprint $table): void {
            $table->uuid('id')->primary();
            $table->string('name');
            $table->string('status', 24)->default('PENDING')->index();
            $table->unsignedTinyInteger('progress')->default(0);
            $table->text('message')->nullable();

            $table->uuid('roads_layer_id')->nullable();
            $table->uuid('start_layer_id')->nullable();
            $table->uuid('end_layer_id')->nullable();

            $table->uuid('output_routes_layer_id')->nullable();
            $table->uuid('output_nodes_layer_id')->nullable();

            $table->jsonb('parameters')->nullable();
            $table->jsonb('stats')->nullable();

            $table->timestamps();

            $table->foreign('roads_layer_id')->references('id')->on('feature_layers')->nullOnDelete();
            $table->foreign('start_layer_id')->references('id')->on('feature_layers')->nullOnDelete();
            $table->foreign('end_layer_id')->references('id')->on('feature_layers')->nullOnDelete();
            $table->foreign('output_routes_layer_id')->references('id')->on('feature_layers')->nullOnDelete();
            $table->foreign('output_nodes_layer_id')->references('id')->on('feature_layers')->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('routing_tasks');
    }
};
