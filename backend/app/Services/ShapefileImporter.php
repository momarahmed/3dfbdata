<?php

namespace App\Services;

use App\Models\FeatureLayer;
use Illuminate\Http\UploadedFile;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\File;
use Illuminate\Support\Str;
use RuntimeException;
use Shapefile\Shapefile;
use Shapefile\ShapefileReader;
use ZipArchive;

class ShapefileImporter
{
    /**
     * Import the supplied upload into PostGIS, returning the FeatureLayer record.
     * Accepted inputs:
     *   - ZIP archive containing .shp/.shx/.dbf (+ optional .prj, .cpg)
     *   - Raw .geojson/.json file (FeatureCollection or Feature)
     */
    public function import(UploadedFile $upload, string $displayName, ?string $description = null): FeatureLayer
    {
        $workDir = storage_path('app/feature-layers/'.Str::uuid()->toString());
        File::ensureDirectoryExists($workDir);

        try {
            $sourceName = $upload->getClientOriginalName() ?: 'upload';
            $ext        = strtolower(pathinfo($sourceName, PATHINFO_EXTENSION));

            $layer = FeatureLayer::query()->create([
                'name'        => $displayName,
                'slug'        => Str::slug($displayName).'-'.Str::lower(Str::random(6)),
                'source_name' => $sourceName,
                'source_type' => in_array($ext, ['json', 'geojson'], true) ? 'geojson' : 'shapefile',
                'srid'        => 4326,
                'status'      => 'IMPORTING',
                'description' => $description,
            ]);

            try {
                if (in_array($ext, ['json', 'geojson'], true)) {
                    $stats = $this->importGeoJson($layer, $upload->getRealPath());
                } else {
                    $stats = $this->importShapefileArchive($layer, $upload, $workDir);
                }

                $layer->fill([
                    'status'         => 'READY',
                    'feature_count'  => $stats['count'],
                    'geometry_type'  => $stats['geometry_type'],
                    'bbox_xmin'      => $stats['bbox'][0] ?? null,
                    'bbox_ymin'      => $stats['bbox'][1] ?? null,
                    'bbox_xmax'      => $stats['bbox'][2] ?? null,
                    'bbox_ymax'      => $stats['bbox'][3] ?? null,
                    'field_schema'   => $stats['fields'],
                    'message'        => null,
                ])->save();
            } catch (\Throwable $e) {
                $layer->fill(['status' => 'FAILED', 'message' => $e->getMessage()])->save();
                throw $e;
            }

            return $layer->refresh();
        } finally {
            File::deleteDirectory($workDir);
        }
    }

    private function importShapefileArchive(FeatureLayer $layer, UploadedFile $upload, string $workDir): array
    {
        $zipPath = $workDir.'/upload.zip';
        File::copy($upload->getRealPath(), $zipPath);

        $zip = new ZipArchive();
        if ($zip->open($zipPath) !== true) {
            throw new RuntimeException('Could not open ZIP archive. Please upload a .zip containing .shp/.shx/.dbf (+ .prj).');
        }
        $zip->extractTo($workDir);
        $zip->close();

        $shpPath = $this->findExtension($workDir, 'shp');
        if ($shpPath === null) {
            throw new RuntimeException('No .shp file found inside the ZIP archive.');
        }

        $reader = new ShapefileReader($shpPath, [
            Shapefile::OPTION_DBF_CONVERT_TO_UTF8       => true,
            Shapefile::OPTION_SUPPRESS_Z                => true,
            Shapefile::OPTION_SUPPRESS_M                => true,
            Shapefile::OPTION_IGNORE_FILE_DBF           => false,
        ]);

        $fields = [];
        foreach ($reader->getFields() as $name => $info) {
            $fields[] = [
                'name'    => $name,
                'type'    => $info['type'] ?? 'C',
                'size'    => $info['size'] ?? null,
                'decimal' => $info['decimals'] ?? 0,
            ];
        }

        $geometryType = $this->shapeTypeToGeometry($reader->getShapeType(Shapefile::FORMAT_STR));

        $count   = 0;
        $bounds  = null;
        $buffer  = [];

        while (($record = $reader->fetchRecord()) !== false) {
            if ($record->isDeleted()) {
                continue;
            }

            try {
                $wkt = $record->getWKT();
            } catch (\Throwable) {
                continue;
            }

            if ($wkt === null || $wkt === '') {
                continue;
            }

            $data = [];
            foreach ($fields as $f) {
                $data[$f['name']] = $record->getData($f['name']);
            }

            try {
                $gBounds = $record->getBoundingBox();
                if (is_array($gBounds) && isset($gBounds['xmin'])) {
                    $bounds = $this->unionBounds($bounds, [
                        (float) $gBounds['xmin'],
                        (float) $gBounds['ymin'],
                        (float) $gBounds['xmax'],
                        (float) $gBounds['ymax'],
                    ]);
                }
            } catch (\Throwable) {
                /* ignore bbox failure */
            }

            $buffer[] = [$wkt, $data];
            $count++;

            if (count($buffer) >= 500) {
                $this->flushBuffer($layer->id, $buffer);
                $buffer = [];
            }
        }

        if (! empty($buffer)) {
            $this->flushBuffer($layer->id, $buffer);
        }

        return [
            'count'         => $count,
            'geometry_type' => $geometryType,
            'bbox'          => $bounds ?? [null, null, null, null],
            'fields'        => $fields,
        ];
    }

    private function importGeoJson(FeatureLayer $layer, string $path): array
    {
        $json = json_decode((string) file_get_contents($path), true);
        if (! is_array($json)) {
            throw new RuntimeException('GeoJSON file is not valid JSON.');
        }

        $features = [];
        if (($json['type'] ?? '') === 'FeatureCollection') {
            $features = $json['features'] ?? [];
        } elseif (($json['type'] ?? '') === 'Feature') {
            $features = [$json];
        } else {
            throw new RuntimeException('Expected a GeoJSON Feature or FeatureCollection.');
        }

        if (empty($features)) {
            throw new RuntimeException('GeoJSON contains no features.');
        }

        $count         = 0;
        $bounds        = null;
        $geometryType  = null;
        $fieldNames    = [];
        $buffer        = [];

        foreach ($features as $f) {
            $geom  = $f['geometry'] ?? null;
            $props = $f['properties'] ?? [];
            if (! is_array($geom) || ! isset($geom['type'])) {
                continue;
            }

            $geometryType ??= strtoupper($geom['type']);

            foreach (array_keys((array) $props) as $k) {
                $fieldNames[$k] = true;
            }

            $geomJson = json_encode($geom);
            if ($geomJson === false) {
                continue;
            }
            $buffer[] = [$geomJson, (array) $props, 'geojson'];
            $count++;

            $bounds = $this->unionBounds($bounds, $this->geometryBounds($geom));

            if (count($buffer) >= 500) {
                $this->flushBufferGeoJson($layer->id, $buffer);
                $buffer = [];
            }
        }

        if (! empty($buffer)) {
            $this->flushBufferGeoJson($layer->id, $buffer);
        }

        return [
            'count'         => $count,
            'geometry_type' => $geometryType ?: 'GEOMETRY',
            'bbox'          => $bounds ?? [null, null, null, null],
            'fields'        => array_map(fn (string $k) => ['name' => $k, 'type' => 'string'], array_keys($fieldNames)),
        ];
    }

    /** @param array<int, array{0:string,1:array}> $buffer */
    private function flushBuffer(string $layerId, array $buffer): void
    {
        $now    = now();
        $values = [];
        $params = [];

        foreach ($buffer as [$wkt, $props]) {
            $values[] = '(?, ST_SetSRID(ST_GeomFromText(?), 4326), ?::jsonb, ?, ?)';
            $params[] = $layerId;
            $params[] = $wkt;
            $params[] = json_encode($props, JSON_UNESCAPED_UNICODE);
            $params[] = $now;
            $params[] = $now;
        }

        DB::statement(
            'INSERT INTO feature_layer_features (feature_layer_id, geom, properties, created_at, updated_at) VALUES '
                .implode(', ', $values),
            $params
        );
    }

    /** @param array<int, array{0:string,1:array,2:string}> $buffer */
    private function flushBufferGeoJson(string $layerId, array $buffer): void
    {
        $now    = now();
        $values = [];
        $params = [];

        foreach ($buffer as [$geomJson, $props]) {
            $values[] = '(?, ST_SetSRID(ST_GeomFromGeoJSON(?), 4326), ?::jsonb, ?, ?)';
            $params[] = $layerId;
            $params[] = $geomJson;
            $params[] = json_encode($props, JSON_UNESCAPED_UNICODE);
            $params[] = $now;
            $params[] = $now;
        }

        DB::statement(
            'INSERT INTO feature_layer_features (feature_layer_id, geom, properties, created_at, updated_at) VALUES '
                .implode(', ', $values),
            $params
        );
    }

    private function findExtension(string $dir, string $ext): ?string
    {
        $ext = strtolower($ext);
        $rii = new \RecursiveIteratorIterator(new \RecursiveDirectoryIterator($dir, \FilesystemIterator::SKIP_DOTS));
        foreach ($rii as $file) {
            if (! $file->isFile()) {
                continue;
            }
            if (strtolower($file->getExtension()) === $ext) {
                return $file->getPathname();
            }
        }

        return null;
    }

    private function shapeTypeToGeometry(string $shapeType): string
    {
        return match (strtoupper($shapeType)) {
            'POINT', 'POINTZ', 'POINTM'       => 'POINT',
            'MULTIPOINT', 'MULTIPOINTZ'       => 'MULTIPOINT',
            'POLYLINE', 'POLYLINEZ', 'POLYLINEM' => 'MULTILINESTRING',
            'POLYGON', 'POLYGONZ', 'POLYGONM' => 'MULTIPOLYGON',
            default                            => strtoupper($shapeType),
        };
    }

    /**
     * @param array<int, float>|null       $current
     * @param array<int, float>|null       $next
     *
     * @return array<int, float>|null
     */
    private function unionBounds(?array $current, ?array $next): ?array
    {
        if ($next === null) {
            return $current;
        }
        if ($current === null) {
            return $next;
        }

        return [
            min($current[0], $next[0]),
            min($current[1], $next[1]),
            max($current[2], $next[2]),
            max($current[3], $next[3]),
        ];
    }

    /** @return array<int, float>|null */
    private function geometryBounds(array $geom): ?array
    {
        $coords = $geom['coordinates'] ?? null;
        if ($coords === null) {
            return null;
        }

        $xs = [];
        $ys = [];
        $walk = function ($c) use (&$walk, &$xs, &$ys): void {
            if (! is_array($c)) {
                return;
            }
            if (count($c) >= 2 && is_numeric($c[0]) && is_numeric($c[1])) {
                $xs[] = (float) $c[0];
                $ys[] = (float) $c[1];

                return;
            }
            foreach ($c as $child) {
                $walk($child);
            }
        };
        $walk($coords);

        if (empty($xs)) {
            return null;
        }

        return [min($xs), min($ys), max($xs), max($ys)];
    }
}
