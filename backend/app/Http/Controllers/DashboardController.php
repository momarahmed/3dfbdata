<?php

namespace App\Http\Controllers;

use App\Models\CrowdAlert;
use App\Models\SimulationScenario;
use App\Models\Venue;
use Illuminate\Http\JsonResponse;

class DashboardController extends Controller
{
    public function summary(): JsonResponse
    {
        return response()->json([
            'venues'    => Venue::query()->orderBy('name')->limit(20)->get(),
            'scenarios' => SimulationScenario::query()->orderByDesc('updated_at')->limit(10)->get(),
            'alerts'    => CrowdAlert::query()->orderByDesc('triggered_at')->limit(10)->get(),
        ]);
    }
}
