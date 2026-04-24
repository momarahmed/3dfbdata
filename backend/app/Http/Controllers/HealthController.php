<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Redis;

class HealthController extends Controller
{
    public function index(): JsonResponse
    {
        $checks = [
            'app'   => true,
            'db'    => false,
            'redis' => false,
        ];

        try {
            DB::select('select 1');
            $checks['db'] = true;
        } catch (\Throwable) {
        }

        try {
            $pong = Redis::connection()->command('ping');
            $checks['redis'] = $pong === true || $pong === '+PONG' || $pong === 'PONG' || $pong === 1;
        } catch (\Throwable) {
        }

        $ok = $checks['db'] && $checks['redis'];

        return response()->json([
            'status'  => $ok ? 'healthy' : 'degraded',
            'checks'  => $checks,
            'version' => '1.0.0',
        ], $ok ? 200 : 503);
    }
}
