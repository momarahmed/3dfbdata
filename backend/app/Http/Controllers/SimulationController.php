<?php

namespace App\Http\Controllers;

use App\Models\Simulation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;
use Illuminate\Support\Facades\DB;
use Illuminate\Validation\Rule;

/**
 * Simulation lifecycle API (PRD §14.5).
 *
 * This first iteration drives replays client-side via REST + requestAnimationFrame
 * (see FE SimulationPage). A future revision will publish per-point events to
 * Redis Streams and fan them out via a WebSocket gateway.
 */
class SimulationController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => Simulation::orderByDesc('created_at')->limit(50)->get(),
        ]);
    }

    public function show(string $id): JsonResponse
    {
        return response()->json(['data' => Simulation::findOrFail($id)]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'vehicle_ids'              => ['required', 'array', 'min:1'],
            'vehicle_ids.*'            => ['string', 'max:100'],
            'route_id'                 => ['nullable', 'string', 'max:100'],
            'speed_multiplier'         => ['nullable', 'numeric', 'between:0.1,10'],
            'loop'                     => ['nullable', 'boolean'],
        ]);

        $pointRange = $this->computePointRange($data['vehicle_ids'], $data['route_id'] ?? null);

        $sim = Simulation::create([
            'status'           => 'running',
            'vehicle_ids'      => $data['vehicle_ids'],
            'route_id'         => $data['route_id'] ?? null,
            'speed_multiplier' => (float) ($data['speed_multiplier'] ?? 1.0),
            'loop'             => (bool) ($data['loop'] ?? false),
            'started_at'       => now(),
            'last_point_time'  => $pointRange['first'],
            'metadata'         => [
                'point_count'      => $pointRange['count'],
                'first_point_time' => $pointRange['first'],
                'last_point_time'  => $pointRange['last'],
            ],
        ]);

        return response()->json(['data' => $sim], 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $sim = Simulation::findOrFail($id);

        $data = $request->validate([
            'speed_multiplier' => ['nullable', 'numeric', 'between:0.1,10'],
            'loop'             => ['nullable', 'boolean'],
        ]);

        if (array_key_exists('speed_multiplier', $data)) {
            $sim->speed_multiplier = (float) $data['speed_multiplier'];
        }
        if (array_key_exists('loop', $data)) {
            $sim->loop = (bool) $data['loop'];
        }

        $sim->save();

        return response()->json(['data' => $sim]);
    }

    public function pause(string $id): JsonResponse
    {
        return $this->transition($id, fn (Simulation $s) => $s->update([
            'status'    => 'paused',
            'paused_at' => now(),
        ]), allowed: ['running']);
    }

    public function resume(string $id): JsonResponse
    {
        return $this->transition($id, fn (Simulation $s) => $s->update([
            'status'    => 'running',
            'paused_at' => null,
        ]), allowed: ['paused']);
    }

    public function stop(string $id): JsonResponse
    {
        return $this->transition($id, fn (Simulation $s) => $s->update([
            'status'   => 'stopped',
            'ended_at' => now(),
        ]), allowed: ['running', 'paused']);
    }

    public function reset(string $id): JsonResponse
    {
        return $this->transition($id, function (Simulation $s): void {
            $range = $this->computePointRange($s->vehicle_ids ?? [], $s->route_id);
            $s->update([
                'status'          => 'running',
                'paused_at'       => null,
                'ended_at'        => null,
                'last_sequence'   => 0,
                'last_point_time' => $range['first'],
            ]);
        }, allowed: ['running', 'paused', 'stopped', 'completed']);
    }

    public function seek(Request $request, string $id): JsonResponse
    {
        $data = $request->validate([
            'point_time' => ['required', 'date'],
        ]);

        return $this->transition($id, function (Simulation $s) use ($data): void {
            $s->update([
                'last_point_time' => Carbon::parse($data['point_time']),
            ]);
        }, allowed: ['running', 'paused', 'stopped']);
    }

    public function destroy(string $id): JsonResponse
    {
        $sim = Simulation::findOrFail($id);
        $sim->delete();
        return response()->json(['status' => 'deleted']);
    }

    private function transition(string $id, \Closure $apply, array $allowed): JsonResponse
    {
        $sim = Simulation::findOrFail($id);
        if (! in_array($sim->status, $allowed, true)) {
            return response()->json([
                'error' => [
                    'code'    => 'SIMULATION_CONFLICT',
                    'message' => sprintf('Cannot transition from status "%s"', $sim->status),
                ],
            ], 409);
        }
        $apply($sim);
        return response()->json(['data' => $sim->fresh()]);
    }

    private function computePointRange(array $vehicleIds, ?string $routeId): array
    {
        if (empty($vehicleIds)) {
            return ['first' => null, 'last' => null, 'count' => 0];
        }

        $placeholders = implode(',', array_fill(0, count($vehicleIds), '?'));
        $bindings = $vehicleIds;
        $sql = "SELECT MIN(point_time) AS first, MAX(point_time) AS last, COUNT(*) AS count
                FROM car_points_history
                WHERE vehicle_id IN ($placeholders)";

        if ($routeId) {
            $sql .= ' AND route_id = ?';
            $bindings[] = $routeId;
        }

        $row = DB::selectOne($sql, $bindings);

        return [
            'first' => $row->first ?? null,
            'last'  => $row->last ?? null,
            'count' => (int) ($row->count ?? 0),
        ];
    }
}
