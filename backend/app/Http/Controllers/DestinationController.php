<?php

namespace App\Http\Controllers;

use App\Models\Destination;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;

class DestinationController extends Controller
{
    public function index(): JsonResponse
    {
        return response()->json([
            'data' => $this->rowsAsFeatures(),
        ]);
    }

    public function geojson(): JsonResponse
    {
        return response()->json([
            'type'     => 'FeatureCollection',
            'name'     => 'destinations',
            'features' => $this->rowsAsFeatures(),
        ]);
    }

    public function store(Request $request): JsonResponse
    {
        $data = $request->validate([
            'name' => ['required', 'string', 'max:120'],
            'lng'  => ['required', 'numeric', 'between:-180,180'],
            'lat'  => ['required', 'numeric', 'between:-90,90'],
        ]);

        $id = (string) Str::uuid();

        DB::insert(
            'INSERT INTO destinations (id, name, geom, created_at, updated_at)
             VALUES (?, ?, ST_SetSRID(ST_MakePoint(?, ?), 4326), NOW(), NOW())',
            [$id, $data['name'], $data['lng'], $data['lat']]
        );

        return response()->json($this->featureById($id), 201);
    }

    public function update(Request $request, string $id): JsonResponse
    {
        $destination = Destination::query()->findOrFail($id);

        $data = $request->validate([
            'name' => ['nullable', 'string', 'max:120'],
            'lng'  => ['nullable', 'numeric', 'between:-180,180'],
            'lat'  => ['nullable', 'numeric', 'between:-90,90'],
        ]);

        if (array_key_exists('name', $data) && $data['name'] !== null) {
            $destination->name = $data['name'];
            $destination->save();
        }

        if (array_key_exists('lng', $data) && array_key_exists('lat', $data)
            && $data['lng'] !== null && $data['lat'] !== null) {
            DB::update(
                'UPDATE destinations SET geom = ST_SetSRID(ST_MakePoint(?, ?), 4326), updated_at = NOW() WHERE id = ?',
                [$data['lng'], $data['lat'], $id]
            );
        }

        return response()->json($this->featureById($id));
    }

    public function destroy(string $id): JsonResponse
    {
        $destination = Destination::query()->findOrFail($id);
        $destination->delete();

        return response()->json(['ok' => true]);
    }

    /**
     * @return array<int, array<string, mixed>>
     */
    private function rowsAsFeatures(): array
    {
        $rows = DB::select(
            'SELECT id, name, ST_X(geom) AS lng, ST_Y(geom) AS lat, created_at, updated_at
             FROM destinations
             ORDER BY created_at ASC'
        );

        return array_map(fn ($r) => $this->featureFromRow($r), $rows);
    }

    private function featureById(string $id): array
    {
        $r = DB::selectOne(
            'SELECT id, name, ST_X(geom) AS lng, ST_Y(geom) AS lat, created_at, updated_at
             FROM destinations WHERE id = ?',
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
                'id'         => $r->id,
                'name'       => $r->name,
                'created_at' => $r->created_at,
                'updated_at' => $r->updated_at,
            ],
        ];
    }
}
