<?php

use Illuminate\Support\Facades\Route;

Route::get('/', function () {
    return response()->json([
        'service' => 'CrowdSim 3D API',
        'docs'    => '/api/health',
    ]);
});
