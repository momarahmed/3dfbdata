<?php

namespace App\Http\Controllers;

use App\Models\Distanation;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class DistanationController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => $this->rowsAsFeatures(),
        ]);
    }

    /**
     * GeoJSON FeatureCollection; layer name "distanations". Geometries EPSG:4326 (WGS84).
     */
    public function geojson(): JsonResponse
    {
        return response()->json([
            'type'     => 'FeatureCollection',
            'name'     => 'distanations',
            'crs'      => [
                'type'       => 'name',
                'properties' => ['name' => 'EPSG:4326'],
            ],
            'features' => $this->rowsAsFeatures(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'dist_name' => ['required', 'string', 'max:120'],
            'lng'       => ['required', 'numeric', 'between:-180,180'],
            'lat'       => ['required', 'numeric', 'between:-90,90'],
        ]);

        $id = (string) Str::uuid();

        DB::insert(
            'INSERT INTO distanations (id, dist_name, geom, created_at, updated_at)
             VALUES (?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), NOW(), NOW())',
            [$id, $data['dist_name'], $data['lng'], $data['lat']]
        );

        return response()->json($this->featureById($id), 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $distanation = Distanation::query()->findOrFail($id);

        $data = $request->validate([
            'dist_name' => ['nullable', 'string', 'max:120'],
            'lng'       => ['nullable', 'numeric', 'between:-180,180'],
            'lat'       => ['nullable', 'numeric', 'between:-90,90'],
        ]);

        if (array_key_exists('dist_name', $data) && $data['dist_name'] !== null) {
            $distanation->dist_name = $data['dist_name'];
            $distanation->save();
        }

        if (array_key_exists('lng', $data) && array_key_exists('lat', $data)
            && $data['lng'] !== null && $data['lat'] !== null) {
            DB::update(
                'UPDATE distanations SET geom = ST_SetSRID(ST_MakePoint(?, ?), 4326), updated_at = NOW() WHERE id = ?',
                [$data['lng'], $data['lat'], $id]
            );
        }

        return response()->json($this->featureById($id));
    }

    public function destroy(string $id): JsonResponse
    {
        $distanation = Distanation::query()->findOrFail($id);
        $distanation->delete();

        return response()->json(['ok' => true]);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function rowsAsFeatures(): array
    {
        $rows = DB::select(
            'SELECT id, dist_name, ST_X(geom) AS lng, ST_Y(geom) AS lat
             FROM distanations
             ORDER BY created_at ASC'
        );

        return array_map(fn ($r) => $this->featureFromRow($r), $rows);
    }

    private function featureById(string $id): array
    {
        $r = DB::selectOne(
            'SELECT id, dist_name, ST_X(geom) AS lng, ST_Y(geom) AS lat
             FROM distanations WHERE id = ?',
            [$id]
        );

        return $this->featureFromRow($r);
    }

    private function featureFromRow(object $r): array
    {
        return [
            'type'       => 'Feature',
            'id'         => $r->id,
            'geometry'   => [
                'type'        => 'Point',
                'coordinates' => [(float) $r->lng, (float) $r->lat],
            ],
            'properties' => [
                'id'        => $r->id,
                'dist_name' => $r->dist_name,
            ],
        ];
    }
}
