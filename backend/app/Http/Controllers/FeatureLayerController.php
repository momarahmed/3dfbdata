<?php

namespace App\Http\Controllers;

use App\Models\FeatureLayer;
use App\Services\ShapefileImporter;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;

class FeatureLayerController extends Controller
{
    public function index(): JsonResponse
    {
        $layers = FeatureLayer::query()
            ->orderByDesc('created_at')
            ->get();

        return response()->json([
            'data' => $layers->map(fn (FeatureLayer $l) => $this->summary($l))->values(),
        ]);
    }

    public function show(FeatureLayer $featureLayer): JsonResponse
    {
        return response()->json($this->summary($featureLayer, withSample: true));
    }

    public function store(Request $request, ShapefileImporter $importer): JsonResponse
    {
        $data = $request->validate([
            'name'        => ['required', 'string', 'max:120'],
            'description' => ['nullable', 'string', 'max:2000'],
            'file'        => [
                'required',
                'file',
                'max:51200', // 50 MiB
                'mimetypes:application/zip,application/x-zip-compressed,application/octet-stream,application/json,application/geo+json,text/plain',
            ],
        ]);

        try {
            $layer = $importer->import(
                $request->file('file'),
                $data['name'],
                $data['description'] ?? null
            );
        } catch (\Throwable $e) {
            return response()->json([
                'error'   => 'Import failed',
                'message' => $e->getMessage(),
            ], 422);
        }

        return response()->json($this->summary($layer), 201);
    }

    public function destroy(FeatureLayer $featureLayer): JsonResponse
    {
        $featureLayer->delete();

        return response()->json(['ok' => true]);
    }

    public function geojson(Request $request, FeatureLayer $featureLayer): JsonResponse
    {
        $requestedLimit = (int) $request->query('limit', 10000);
        $limit = max(1, min(10000, $requestedLimit));

        $rows = DB::select(
            'SELECT id, properties, ST_AsGeoJSON(geom) AS gj
             FROM feature_layer_features
             WHERE feature_layer_id = ?
             ORDER BY id
             LIMIT ?',
            [$featureLayer->id, $limit]
        );

        $features = [];
        foreach ($rows as $r) {
            $geom = json_decode($r->gj ?? 'null', true);
            if (! is_array($geom)) {
                continue;
            }
            $props = $r->properties ? json_decode($r->properties, true) : [];
            $features[] = [
                'type'       => 'Feature',
                'id'         => (int) $r->id,
                'geometry'   => $geom,
                'properties' => is_array($props) ? $props : [],
            ];
        }

        return response()->json([
            'type'     => 'FeatureCollection',
            'name'     => $featureLayer->name,
            'crs'      => [
                'type'       => 'name',
                'properties' => ['name' => 'urn:ogc:def:crs:OGC:1.3:CRS84'],
            ],
            'features' => $features,
            'layer'    => $this->summary($featureLayer),
        ]);
    }

    private function summary(FeatureLayer $l, bool $withSample = false): array
    {
        $geojsonUrl = rtrim(config('app.url'), '/').'/api/feature-layers/'.$l->id.'/geojson';

        $out = [
            'id'            => $l->id,
            'name'          => $l->name,
            'slug'          => $l->slug,
            'status'        => $l->status,
            'source_name'   => $l->source_name,
            'source_type'   => $l->source_type,
            'geometry_type' => $l->geometry_type,
            'feature_count' => (int) $l->feature_count,
            'bbox'          => $l->bbox_xmin !== null
                ? [$l->bbox_xmin, $l->bbox_ymin, $l->bbox_xmax, $l->bbox_ymax]
                : null,
            'srid'          => $l->srid,
            'description'   => $l->description,
            'message'       => $l->message,
            'field_schema'  => $l->field_schema ?? [],
            'geojson_url'   => $geojsonUrl,
            'created_at'    => $l->created_at,
            'updated_at'    => $l->updated_at,
        ];

        if ($withSample) {
            $sample = DB::select(
                'SELECT properties FROM feature_layer_features WHERE feature_layer_id = ? LIMIT 3',
                [$l->id]
            );
            $out['sample_properties'] = array_map(
                fn ($r) => $r->properties ? json_decode($r->properties, true) : null,
                $sample
            );
        }

        return $out;
    }
}
