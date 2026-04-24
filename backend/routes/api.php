<?php

use App\Http\Controllers\AuthController;
use App\Http\Controllers\DashboardController;
use App\Http\Controllers\DestinationController;
use App\Http\Controllers\DistanationController;
use App\Http\Controllers\FeatureLayerController;
use App\Http\Controllers\HealthController;
use App\Http\Controllers\RoutingTaskController;
use Illuminate\Support\Facades\Route;

Route::get('/health', [HealthController::class, 'index']);

Route::get('/feature-layers/{featureLayer}/geojson', [FeatureLayerController::class, 'geojson']);
Route::get('/destinations/geojson', [DestinationController::class, 'geojson']);
Route::get('/distanations/geojson', [DistanationController::class, 'geojson']);

Route::post('/auth/login', [AuthController::class, 'login']);

Route::middleware('auth:sanctum')->group(function (): void {
    Route::post('/auth/logout', [AuthController::class, 'logout']);
    Route::get('/auth/me', [AuthController::class, 'me']);

    Route::get('/dashboard/summary', [DashboardController::class, 'summary']);

    Route::get('/feature-layers', [FeatureLayerController::class, 'index']);
    Route::post('/feature-layers', [FeatureLayerController::class, 'store']);
    Route::get('/feature-layers/{featureLayer}', [FeatureLayerController::class, 'show']);
    Route::delete('/feature-layers/{featureLayer}', [FeatureLayerController::class, 'destroy']);

    Route::get('/destinations', [DestinationController::class, 'index']);
    Route::post('/destinations', [DestinationController::class, 'store']);
    Route::patch('/destinations/{id}', [DestinationController::class, 'update'])->whereUuid('id');
    Route::delete('/destinations/{id}', [DestinationController::class, 'destroy'])->whereUuid('id');

    Route::get('/distanations', [DistanationController::class, 'index']);
    Route::post('/distanations', [DistanationController::class, 'store']);
    Route::patch('/distanations/{id}', [DistanationController::class, 'update'])->whereUuid('id');
    Route::delete('/distanations/{id}', [DistanationController::class, 'destroy'])->whereUuid('id');

    // Routing Task (A*) endpoints.
    Route::get('/routing-tasks/layers', [RoutingTaskController::class, 'layers']);
    Route::get('/routing-tasks/layers/{featureLayer}/fields', [RoutingTaskController::class, 'fields']);
    Route::get('/routing-tasks', [RoutingTaskController::class, 'index']);
    Route::post('/routing-tasks', [RoutingTaskController::class, 'store']);
    Route::get('/routing-tasks/{routingTask}', [RoutingTaskController::class, 'show'])->whereUuid('routingTask');
    Route::delete('/routing-tasks/{routingTask}', [RoutingTaskController::class, 'destroy'])->whereUuid('routingTask');
});
