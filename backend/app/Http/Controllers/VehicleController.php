<?php

namespace App\Http\Controllers;

use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

/**
 * Vehicles derived from `car_points_history` for the simulation subsystem.
 * See PRD §14.2.
 */
class VehicleController extends Controller
{
    public function index(): JsonResponse
    {
        $rows = DB::select(
            'SELECT vehicle_id,
                    COUNT(*)            AS point_count,
                    MIN(point_time)     AS first_point_time,
                    MAX(point_time)     AS last_point_time,
                    array_agg(DISTINCT route_id) FILTER (WHERE route_id IS NOT NULL) AS route_ids
             FROM car_points_history
             GROUP BY vehicle_id
             ORDER BY vehicle_id ASC'
        );

        $data = array_map(fn ($r) => [
            'vehicle_id'        => $r->vehicle_id,
            'point_count'       => (int) $r->point_count,
            'first_point_time'  => $r->first_point_time,
            'last_point_time'   => $r->last_point_time,
            'route_ids'         => $this->parsePgArray($r->route_ids),
        ], $rows);

        return response()->json(['data' => $data]);
    }

    /**
     * Ordered historical points for a vehicle, optionally bounded by route and
     * time range. The simulator uses this endpoint to stream chronologically.
     */
    public function points(Request $request, string $vehicleId): JsonResponse
    {
        $data = $request->validate([
            'route_id' => ['nullable', 'string', 'max:100'],
            'from'     => ['nullable', 'date'],
            'to'       => ['nullable', 'date'],
            'limit'    => ['nullable', 'integer', 'min:1', 'max:50000'],
        ]);

        $limit = (int) ($data['limit'] ?? 10000);

        $bindings = [$vehicleId];
        $sql = 'SELECT vehicle_id, route_id, point_time, speed_kmh, heading_deg, longitude, latitude
                FROM car_points_history
                WHERE vehicle_id = ?';

        if (! empty($data['route_id'])) {
            $sql .= ' AND route_id = ?';
            $bindings[] = $data['route_id'];
        }
        if (! empty($data['from'])) {
            $sql .= ' AND point_time >= ?';
            $bindings[] = $data['from'];
        }
        if (! empty($data['to'])) {
            $sql .= ' AND point_time <= ?';
            $bindings[] = $data['to'];
        }

        $sql .= ' ORDER BY point_time ASC LIMIT ?';
        $bindings[] = $limit;

        $rows = DB::select($sql, $bindings);

        return response()->json([
            'vehicle_id' => $vehicleId,
            'count'      => count($rows),
            'points'     => array_map(fn ($r) => [
                'vehicle_id'  => $r->vehicle_id,
                'route_id'    => $r->route_id,
                'point_time'  => $r->point_time,
                'speed_kmh'   => $r->speed_kmh !== null ? (float) $r->speed_kmh : null,
                'heading_deg' => $r->heading_deg !== null ? (float) $r->heading_deg : null,
                'longitude'   => (float) $r->longitude,
                'latitude'    => (float) $r->latitude,
            ], $rows),
        ]);
    }

    /**
     * Minimal, best-effort Postgres array parser (vehicle_id list is small
     * and comes from a trusted query, so no pg-ext dependency is needed).
     */
    private function parsePgArray(?string $raw): array
    {
        if ($raw === null || $raw === '' || $raw === '{}' || $raw === '{NULL}') {
            return [];
        }
        $trimmed = trim($raw, '{}');
        $parts = str_getcsv($trimmed);
        return array_values(array_filter(array_map('trim', $parts), fn ($v) => $v !== '' && strtoupper($v) !== 'NULL'));
    }
}
