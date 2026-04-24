<?php

namespace Database\Seeders;

use Illuminate\Database\Seeder;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;

/**
 * Seeds `car_points_history` with two demo vehicles following synthesised
 * routes around Riyadh, each point carrying timestamp, speed, and heading
 * (see PRD §12.1 and UC-01).
 *
 * Idempotent: rebuilds the demo vehicles on every run.
 */
class VehiclePointsSeeder extends Seeder
{
    public function run(): void
    {
        DB::table('car_points_history')->whereIn('vehicle_id', ['CAR-001', 'CAR-002'])->delete();

        $base = Carbon::parse('2026-04-24 07:00:00', 'UTC');

        // CAR-001: loop around the King Fahd Stadium area (closed poly-line).
        $car001 = $this->buildPath(
            [
                [46.66894, 24.72290],
                [46.67250, 24.72300],
                [46.67540, 24.72220],
                [46.67700, 24.72000],
                [46.67640, 24.71700],
                [46.67300, 24.71520],
                [46.66920, 24.71550],
                [46.66710, 24.71780],
                [46.66760, 24.72090],
                [46.66894, 24.72290],
            ],
            densifyPerSegment: 20
        );

        // CAR-002: east-bound run from Kingdom Tower area toward the stadium.
        $car002 = $this->buildPath(
            [
                [46.68253, 24.71136],
                [46.69020, 24.71500],
                [46.69680, 24.71950],
                [46.70320, 24.72220],
                [46.70920, 24.72410],
                [46.71480, 24.72560],
                [46.72100, 24.72690],
            ],
            densifyPerSegment: 30
        );

        $this->insertBatch('CAR-001', 'ROUTE-RYD-LOOP', $car001, $base, avgSpeedKmh: 40);
        $this->insertBatch('CAR-002', 'ROUTE-RYD-EAST', $car002, $base->copy()->addSeconds(5), avgSpeedKmh: 55);
    }

    /**
     * Linearly interpolate between waypoints to produce a denser point track.
     *
     * @param  array<int, array{0: float, 1: float}> $waypoints (lon, lat)
     */
    private function buildPath(array $waypoints, int $densifyPerSegment): array
    {
        $out = [];
        for ($i = 0, $n = count($waypoints); $i < $n - 1; $i++) {
            $a = $waypoints[$i];
            $b = $waypoints[$i + 1];
            for ($j = 0; $j < $densifyPerSegment; $j++) {
                $t = $j / $densifyPerSegment;
                $out[] = [
                    $a[0] + ($b[0] - $a[0]) * $t,
                    $a[1] + ($b[1] - $a[1]) * $t,
                ];
            }
        }
        $out[] = $waypoints[count($waypoints) - 1];
        return $out;
    }

    private function insertBatch(string $vehicleId, string $routeId, array $path, Carbon $start, float $avgSpeedKmh): void
    {
        $rows = [];
        $count = count($path);
        for ($i = 0; $i < $count; $i++) {
            [$lon, $lat] = $path[$i];
            $heading = $this->bearing($path[max(0, $i - 1)], $path[min($count - 1, $i + 1)]);
            $pointTime = $start->copy()->addSeconds($i * 2);
            $rows[] = [
                'vehicle_id'  => $vehicleId,
                'route_id'    => $routeId,
                'point_time'  => $pointTime->toIso8601String(),
                'speed_kmh'   => round($avgSpeedKmh + sin($i / 7) * 6, 2),
                'heading_deg' => round($heading, 2),
                'longitude'   => $lon,
                'latitude'    => $lat,
            ];
        }

        foreach (array_chunk($rows, 200) as $chunk) {
            DB::transaction(function () use ($chunk): void {
                foreach ($chunk as $row) {
                    DB::statement(
                        'INSERT INTO car_points_history
                         (vehicle_id, route_id, point_time, speed_kmh, heading_deg, longitude, latitude, geom, created_at, updated_at)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), NOW(), NOW())',
                        [
                            $row['vehicle_id'],
                            $row['route_id'],
                            $row['point_time'],
                            $row['speed_kmh'],
                            $row['heading_deg'],
                            $row['longitude'],
                            $row['latitude'],
                            $row['longitude'],
                            $row['latitude'],
                        ]
                    );
                }
            });
        }
    }

    private function bearing(array $a, array $b): float
    {
        [$lon1, $lat1] = $a;
        [$lon2, $lat2] = $b;
        $phi1 = deg2rad($lat1);
        $phi2 = deg2rad($lat2);
        $lambda = deg2rad($lon2 - $lon1);
        $y = sin($lambda) * cos($phi2);
        $x = cos($phi1) * sin($phi2) - sin($phi1) * cos($phi2) * cos($lambda);
        $theta = atan2($y, $x);
        return fmod((rad2deg($theta) + 360), 360);
    }
}
