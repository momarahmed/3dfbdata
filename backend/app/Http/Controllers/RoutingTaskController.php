<?php

namespace App\Http\Controllers;

use App\Models\FeatureLayer;
use App\Models\RoutingTask;
use App\Services\RoutingTaskService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Illuminate\Validation\Rule;

class RoutingTaskController extends Controller
{
    public function __construct(private readonly RoutingTaskService $service)
    {
    }

    /**
     * List spatial PostGIS feature layers that can be used as routing inputs.
     * Supports an optional `?geometry=LINE|POINT` filter.
     */
    public function layers(Request $request): JsonResponse
    {
        $geom = strtoupper((string) $request->query('geometry', ''));

        $query = FeatureLayer::query()
            ->where('status', 'READY')
            ->where('feature_count', '>', 0)
            ->orderByDesc('created_at');

        if ($geom === 'LINE') {
            $query->where(function ($q): void {
                $q->where('geometry_type', 'ILIKE', '%LINE%')
                  ->orWhere('geometry_type', 'ILIKE', '%POLYLINE%');
            });
        } elseif ($geom === 'POINT') {
            $query->where('geometry_type', 'ILIKE', '%POINT%');
        }

        return response()->json([
            'data' => $query->get()->map(fn (FeatureLayer $l) => [
                'id'            => $l->id,
                'name'          => $l->name,
                'geometry_type' => $l->geometry_type,
                'feature_count' => (int) $l->feature_count,
                'srid'          => (int) $l->srid,
                'fields'        => array_values(array_map(
                    fn ($f) => ['name' => $f['name'] ?? null, 'type' => $f['type'] ?? null],
                    is_array($l->field_schema) ? $l->field_schema : []
                )),
            ])->values(),
        ]);
    }

    /**
     * Return the fields/columns of a single feature layer.
     * Merges the stored `field_schema` with keys observed in a small sample
     * (so GeoJSON-imported layers — whose schema can be sparse — still return everything).
     */
    public function fields(FeatureLayer $featureLayer): JsonResponse
    {
        $fields = [];
        foreach (is_array($featureLayer->field_schema) ? $featureLayer->field_schema : [] as $f) {
            $name = $f['name'] ?? null;
            if ($name) {
                $fields[$name] = ['name' => $name, 'type' => $f['type'] ?? 'string'];
            }
        }

        // Sample to backfill any keys missing from field_schema.
        $rows = DB::select(
            'SELECT properties FROM feature_layer_features WHERE feature_layer_id = ? LIMIT 25',
            [$featureLayer->id]
        );
        foreach ($rows as $r) {
            $props = $r->properties ? json_decode($r->properties, true) : [];
            if (! is_array($props)) {
                continue;
            }
            foreach (array_keys($props) as $k) {
                if (! isset($fields[$k])) {
                    $fields[$k] = ['name' => $k, 'type' => 'string'];
                }
            }
        }

        return response()->json([
            'layer' => [
                'id'            => $featureLayer->id,
                'name'          => $featureLayer->name,
                'geometry_type' => $featureLayer->geometry_type,
                'feature_count' => (int) $featureLayer->feature_count,
                'srid'          => (int) $featureLayer->srid,
            ],
            'fields' => array_values($fields),
        ]);
    }

    public function index(Request $request): JsonResponse
    {
        $tasks = RoutingTask::query()
            ->orderByDesc('created_at')
            ->limit((int) $request->query('limit', 50))
            ->get();

        return response()->json(['data' => $tasks]);
    }

    public function show(RoutingTask $routingTask): JsonResponse
    {
        $base = rtrim(config('app.url'), '/');

        $routes = $routingTask->output_routes_layer_id
            ? FeatureLayer::find($routingTask->output_routes_layer_id)
            : null;
        $nodes = $routingTask->output_nodes_layer_id
            ? FeatureLayer::find($routingTask->output_nodes_layer_id)
            : null;
        $points = $routingTask->output_points_layer_id
            ? FeatureLayer::find($routingTask->output_points_layer_id)
            : null;

        $fmt = fn (?FeatureLayer $l) => $l ? [
            'id'            => $l->id,
            'name'          => $l->name,
            'geometry_type' => $l->geometry_type,
            'feature_count' => (int) $l->feature_count,
            'geojson_url'   => "{$base}/api/feature-layers/{$l->id}/geojson",
        ] : null;

        return response()->json([
            'task'           => $routingTask,
            'output_layers'  => [
                'routes' => $fmt($routes),
                'nodes'  => $fmt($nodes),
                'points' => $fmt($points),
            ],
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name'                      => ['required', 'string', 'max:120'],
            'roads_layer_id'            => ['required', 'uuid', 'exists:feature_layers,id'],
            'start_layer_id'            => ['required', 'uuid', 'exists:feature_layers,id'],
            'end_layer_id'              => ['required', 'uuid', 'exists:feature_layers,id'],
            'output_routes_layer_name'  => ['required', 'string', 'max:120', 'regex:/^[A-Za-z0-9 _\-]+$/'],
            'output_nodes_layer_name'   => ['required', 'string', 'max:120', 'regex:/^[A-Za-z0-9 _\-]+$/'],

            'speed_field'               => ['nullable', 'string', 'max:64'],
            'oneway_field'              => ['nullable', 'string', 'max:64'],

            'pair_mode'                 => ['required', Rule::in(['ONE_END', 'BY_ORDER', 'BY_FIELD'])],
            'pair_field'                => ['nullable', 'string', 'max:64', 'required_if:pair_mode,BY_FIELD'],

            'start_id_field'            => ['nullable', 'string', 'max:64'],
            'end_id_field'              => ['nullable', 'string', 'max:64'],

            'auto_project_to_utm'       => ['required', 'boolean'],
            'target_epsg'               => ['required', 'integer', 'min:1024', 'max:999999'],

            'round_xy'                  => ['required', 'integer', 'min:0', 'max:6'],
            'default_speed_kmh'         => ['required', 'numeric', 'gt:0', 'max:500'],
            'min_speed_kmh'             => ['required', 'numeric', 'gt:0', 'max:500'],
            'max_speed_kmh'             => ['required', 'numeric', 'gt:0', 'max:500'],
            'heuristic_max_speed_kmh'   => ['required', 'numeric', 'gt:0', 'max:500'],

            'generate_points'           => ['sometimes', 'boolean'],
            'output_points_layer_name'  => ['required_if:generate_points,true', 'nullable', 'string', 'max:120', 'regex:/^[A-Za-z0-9 _\-]+$/'],
            'points_step_m'             => ['required_if:generate_points,true', 'nullable', 'numeric', 'gt:0', 'max:10000'],
            'points_heading_offset_m'   => ['required_if:generate_points,true', 'nullable', 'numeric', 'gt:0', 'max:10000'],
            'departure_iso_utc'         => ['nullable', 'string', 'max:40'],
        ]);

        $checkFields = ['output_routes_layer_name', 'output_nodes_layer_name'];
        if (! empty($data['generate_points'])) {
            $checkFields[] = 'output_points_layer_name';
        }

        // Guard against duplicate output layer names (case-insensitive).
        foreach ($checkFields as $field) {
            if (empty($data[$field])) {
                continue;
            }
            $exists = FeatureLayer::query()
                ->whereRaw('LOWER(name) = ?', [strtolower($data[$field])])
                ->exists();
            if ($exists) {
                return response()->json([
                    'error'   => 'Output name conflict',
                    'message' => "A feature layer named \"{$data[$field]}\" already exists. Choose a different name.",
                    'field'   => $field,
                ], 422);
            }
        }

        $distinct = array_filter([
            $data['output_routes_layer_name'] ?? null,
            $data['output_nodes_layer_name'] ?? null,
            ! empty($data['generate_points']) ? ($data['output_points_layer_name'] ?? null) : null,
        ]);
        if (count($distinct) !== count(array_unique(array_map('strtolower', $distinct)))) {
            return response()->json([
                'error'   => 'Output name conflict',
                'message' => 'Routes, nodes and points output names must all differ.',
            ], 422);
        }

        try {
            $task = $this->service->run($data);
        } catch (\InvalidArgumentException $e) {
            return response()->json(['error' => 'Validation error', 'message' => $e->getMessage()], 422);
        } catch (\Throwable $e) {
            Log::error('Routing task failed', ['error' => $e->getMessage(), 'trace' => $e->getTraceAsString()]);

            return response()->json(['error' => 'Routing task failed', 'message' => $e->getMessage()], 500);
        }

        return $this->show($task);
    }

    public function destroy(RoutingTask $routingTask): JsonResponse
    {
        $routingTask->delete();

        return response()->json(['ok' => true]);
    }
}
