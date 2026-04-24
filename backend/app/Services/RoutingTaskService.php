<?php

namespace App\Services;

use App\Models\FeatureLayer;
use App\Models\RoutingTask;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use InvalidArgumentException;
use RuntimeException;
use SplPriorityQueue;

/**
 * A* shortest-time routing on a directed road graph built from a PostGIS polyline layer.
 *
 * This is a PHP port of the reference `Routing & points Working.ipynb` notebook:
 *   - builds a directed graph from road segments (with speed and one-way handling);
 *   - snaps start/end points to the nearest graph node;
 *   - supports ONE_END / BY_ORDER / BY_FIELD pairing;
 *   - uses a straight-line lower-bound travel-time heuristic.
 *
 * Outputs are saved back into PostGIS as two new FeatureLayer rows
 * (routes + graph nodes) so they show up automatically in the existing
 * `/map` page layer list.
 */
class RoutingTaskService
{
    public function run(array $params): RoutingTask
    {
        $this->validateParameters($params);

        $task = RoutingTask::create([
            'name'                   => $params['name'],
            'status'                 => 'RUNNING',
            'progress'               => 1,
            'message'                => 'Loading inputs',
            'roads_layer_id'         => $params['roads_layer_id'],
            'start_layer_id'         => $params['start_layer_id'],
            'end_layer_id'           => $params['end_layer_id'],
            'parameters'             => $params,
        ]);

        try {
            $roadsLayer = FeatureLayer::findOrFail($params['roads_layer_id']);
            $startLayer = FeatureLayer::findOrFail($params['start_layer_id']);
            $endLayer   = FeatureLayer::findOrFail($params['end_layer_id']);

            $this->assertGeometryLike($roadsLayer, ['LINE', 'MULTILINE', 'POLYLINE']);
            $this->assertGeometryLike($startLayer, ['POINT']);
            $this->assertGeometryLike($endLayer,   ['POINT']);

            $this->assertFeatureCount($roadsLayer, 'Roads layer');
            $this->assertFeatureCount($startLayer, 'Start points layer');
            $this->assertFeatureCount($endLayer,   'End points layer');

            $targetSrid = (int) ($params['auto_project_to_utm'] ? $params['target_epsg'] : 4326);
            $roundXy    = (int) $params['round_xy'];

            $task->update(['progress' => 10, 'message' => 'Building road graph']);

            $graph = $this->buildGraph(
                roadsLayerId: $params['roads_layer_id'],
                speedField:   $params['speed_field'] ?? null,
                onewayField:  $params['oneway_field'] ?? null,
                targetSrid:   $targetSrid,
                roundXy:      $roundXy,
                defaultSpeed: (float) $params['default_speed_kmh'],
                minSpeed:     (float) $params['min_speed_kmh'],
                maxSpeed:     (float) $params['max_speed_kmh'],
            );

            if ($graph['node_count'] === 0 || $graph['edge_count'] === 0) {
                throw new RuntimeException('Roads layer produced an empty graph (no usable segments).');
            }

            $task->update(['progress' => 35, 'message' => "Graph built: {$graph['node_count']} nodes / {$graph['edge_count']} edges"]);

            $starts = $this->loadPoints(
                layerId:    $params['start_layer_id'],
                idField:    $params['start_id_field'] ?? null,
                pairField:  $params['pair_mode'] === 'BY_FIELD' ? ($params['pair_field'] ?? null) : null,
                targetSrid: $targetSrid,
            );
            $ends = $this->loadPoints(
                layerId:    $params['end_layer_id'],
                idField:    $params['end_id_field'] ?? null,
                pairField:  $params['pair_mode'] === 'BY_FIELD' ? ($params['pair_field'] ?? null) : null,
                targetSrid: $targetSrid,
            );

            if (empty($starts)) {
                throw new RuntimeException('Start points layer has no usable geometries.');
            }
            if (empty($ends)) {
                throw new RuntimeException('End points layer has no usable geometries.');
            }

            $task->update(['progress' => 45, 'message' => 'Snapping points to graph nodes']);

            $this->snapPoints($starts, $graph);
            $this->snapPoints($ends,   $graph);

            $pairs = $this->buildPairs($starts, $ends, $params['pair_mode']);
            if (empty($pairs)) {
                throw new RuntimeException('No start/end pairs could be built with the given pairing mode.');
            }

            $task->update(['progress' => 55, 'message' => 'Running A* across '.count($pairs).' pair(s)']);

            $routes = $this->runAstarAll($graph, $pairs, $starts, $ends, (float) $params['heuristic_max_speed_kmh']);

            $task->update(['progress' => 85, 'message' => 'Writing output feature layers']);

            $generatePoints = ! empty($params['generate_points']);

            [$routesLayer, $nodesLayer, $pointsLayer, $pointsCount] = DB::transaction(function () use (
                $task, $params, $targetSrid, $graph, $routes, $generatePoints
            ) {
                $routesLayer = $this->createRoutesLayer(
                    displayName: $params['output_routes_layer_name'],
                    taskId:      $task->id,
                    routes:      $routes,
                    srcSrid:     $targetSrid,
                    params:      $params,
                );

                $nodesLayer = $this->createNodesLayer(
                    displayName: $params['output_nodes_layer_name'],
                    taskId:      $task->id,
                    graph:       $graph,
                    srcSrid:     $targetSrid,
                );

                $pointsLayer = null;
                $pointsCount = 0;
                if ($generatePoints) {
                    [$pointsLayer, $pointsCount] = $this->createRoutePointsLayer(
                        displayName: $params['output_points_layer_name'],
                        taskId:      $task->id,
                        routes:      $routes,
                        srcSrid:     $targetSrid,
                        params:      $params,
                    );
                }

                return [$routesLayer, $nodesLayer, $pointsLayer, $pointsCount];
            });

            $okCount  = count(array_filter($routes, fn ($r) => $r['status'] === 'OK'));
            $failures = count($routes) - $okCount;

            $message = "Done. {$okCount} route(s) OK, {$failures} failed.";
            if ($generatePoints) {
                $message .= " {$pointsCount} route points generated.";
            }

            $task->update([
                'status'                 => 'SUCCESS',
                'progress'               => 100,
                'message'                => $message,
                'output_routes_layer_id' => $routesLayer->id,
                'output_nodes_layer_id'  => $nodesLayer->id,
                'output_points_layer_id' => $pointsLayer?->id,
                'stats'                  => [
                    'graph_nodes'   => $graph['node_count'],
                    'graph_edges'   => $graph['edge_count'],
                    'routes_ok'     => $okCount,
                    'routes_failed' => $failures,
                    'pairs'         => count($pairs),
                    'target_srid'   => $targetSrid,
                    'route_points'  => $pointsCount,
                ],
            ]);

            return $task->fresh();
        } catch (\Throwable $e) {
            $task->update([
                'status'   => 'FAILED',
                'progress' => 0,
                'message'  => $e->getMessage(),
            ]);
            throw $e;
        }
    }

    // -------------------------------------------------------- validation utils

    private function validateParameters(array $p): void
    {
        $pairMode = $p['pair_mode'] ?? '';
        if (! in_array($pairMode, ['ONE_END', 'BY_ORDER', 'BY_FIELD'], true)) {
            throw new InvalidArgumentException('pair_mode must be ONE_END, BY_ORDER, or BY_FIELD.');
        }
        if ($pairMode === 'BY_FIELD' && empty($p['pair_field'])) {
            throw new InvalidArgumentException('pair_field is required when pair_mode = BY_FIELD.');
        }
        foreach (['default_speed_kmh', 'min_speed_kmh', 'max_speed_kmh', 'heuristic_max_speed_kmh'] as $k) {
            if (! isset($p[$k]) || ! is_numeric($p[$k]) || (float) $p[$k] <= 0) {
                throw new InvalidArgumentException("{$k} must be a positive number.");
            }
        }
        if ((float) $p['min_speed_kmh'] > (float) $p['max_speed_kmh']) {
            throw new InvalidArgumentException('min_speed_kmh cannot be greater than max_speed_kmh.');
        }
        if (! isset($p['round_xy']) || ! is_numeric($p['round_xy'])) {
            throw new InvalidArgumentException('round_xy must be numeric.');
        }
        $srid = (int) ($p['target_epsg'] ?? 0);
        if (! empty($p['auto_project_to_utm']) && ($srid < 1024 || $srid > 999999)) {
            throw new InvalidArgumentException('target_epsg must be a valid EPSG code when auto-projecting.');
        }
        foreach (['output_routes_layer_name', 'output_nodes_layer_name'] as $k) {
            $v = trim((string) ($p[$k] ?? ''));
            if ($v === '' || ! preg_match('/^[A-Za-z0-9 _\-]{1,120}$/', $v)) {
                throw new InvalidArgumentException("{$k} must be 1-120 chars (letters, digits, space, _ or -).");
            }
        }

        if (! empty($p['generate_points'])) {
            $n = trim((string) ($p['output_points_layer_name'] ?? ''));
            if ($n === '' || ! preg_match('/^[A-Za-z0-9 _\-]{1,120}$/', $n)) {
                throw new InvalidArgumentException('output_points_layer_name must be 1-120 chars (letters, digits, space, _ or -).');
            }
            $step = (float) ($p['points_step_m'] ?? 0);
            if ($step <= 0 || $step > 10000) {
                throw new InvalidArgumentException('points_step_m must be a positive number (<= 10000).');
            }
            $offset = (float) ($p['points_heading_offset_m'] ?? 0);
            if ($offset <= 0 || $offset > $step) {
                throw new InvalidArgumentException('points_heading_offset_m must be > 0 and <= points_step_m.');
            }
            if (! empty($p['departure_iso_utc'])) {
                $iso = (string) $p['departure_iso_utc'];
                // Accept both "2026-02-25T08:00:00Z" and "2026-02-25T08:00:00+00:00"-style strings.
                try {
                    new \DateTimeImmutable($iso);
                } catch (\Throwable) {
                    throw new InvalidArgumentException('departure_iso_utc must be a valid ISO 8601 UTC timestamp.');
                }
            }
        }
    }

    private function assertGeometryLike(FeatureLayer $layer, array $keywords): void
    {
        $gt = strtoupper((string) ($layer->geometry_type ?? ''));
        foreach ($keywords as $kw) {
            if (str_contains($gt, $kw)) {
                return;
            }
        }
        throw new InvalidArgumentException(
            "Layer \"{$layer->name}\" has geometry type {$gt}; expected one of ".implode(', ', $keywords).'.'
        );
    }

    private function assertFeatureCount(FeatureLayer $layer, string $label): void
    {
        if ((int) $layer->feature_count <= 0) {
            throw new RuntimeException("{$label} \"{$layer->name}\" is empty.");
        }
    }

    // ------------------------------------------------------------- graph build

    /**
     * @return array{
     *   nodes: array<string, array{0: float, 1: float}>,
     *   adj:   array<string, array<string, array{weight: float, len_m: float}>>,
     *   node_count: int,
     *   edge_count: int,
     * }
     */
    private function buildGraph(
        string $roadsLayerId,
        ?string $speedField,
        ?string $onewayField,
        int $targetSrid,
        int $roundXy,
        float $defaultSpeed,
        float $minSpeed,
        float $maxSpeed,
    ): array {
        $rows = DB::cursor(
            'SELECT properties,
                    ST_AsGeoJSON(ST_Transform(geom, ?::integer)) AS gj
             FROM feature_layer_features
             WHERE feature_layer_id = ?',
            [$targetSrid, $roadsLayerId]
        );

        $nodes = [];
        $adj   = [];
        $edgeCount = 0;

        $addEdge = function (string $a, string $b, float $lenM, float $minutes) use (&$adj, &$edgeCount): void {
            if (! isset($adj[$a])) {
                $adj[$a] = [];
            }
            if (isset($adj[$a][$b])) {
                if ($minutes < $adj[$a][$b]['weight']) {
                    $adj[$a][$b] = ['weight' => $minutes, 'len_m' => $lenM];
                }
            } else {
                $adj[$a][$b] = ['weight' => $minutes, 'len_m' => $lenM];
                $edgeCount++;
            }
        };

        foreach ($rows as $row) {
            if (! $row->gj) {
                continue;
            }
            $geom = json_decode($row->gj, true);
            if (! is_array($geom)) {
                continue;
            }
            $props = $row->properties ? json_decode($row->properties, true) : [];

            $speed  = $this->clampSpeed($speedField ? ($props[$speedField] ?? null) : null, $defaultSpeed, $minSpeed, $maxSpeed);
            $oneway = $this->normalizeOneway($onewayField ? ($props[$onewayField] ?? null) : null);

            $speedMPerMin = ($speed * 1000.0) / 60.0;
            if ($speedMPerMin <= 0) {
                continue;
            }

            foreach ($this->iterateLines($geom) as $line) {
                $ptCount = count($line);
                for ($i = 0; $i < $ptCount - 1; $i++) {
                    $u = [round($line[$i][0],     $roundXy), round($line[$i][1],     $roundXy)];
                    $v = [round($line[$i + 1][0], $roundXy), round($line[$i + 1][1], $roundXy)];

                    $ukey = $u[0].','.$u[1];
                    $vkey = $v[0].','.$v[1];
                    if ($ukey === $vkey) {
                        continue;
                    }

                    $lenM = hypot($v[0] - $u[0], $v[1] - $u[1]);
                    if ($lenM <= 0) {
                        continue;
                    }
                    $minutes = $lenM / $speedMPerMin;

                    $nodes[$ukey] = $u;
                    $nodes[$vkey] = $v;

                    if ($oneway === 'FT') {
                        $addEdge($ukey, $vkey, $lenM, $minutes);
                    } elseif ($oneway === 'TF') {
                        $addEdge($vkey, $ukey, $lenM, $minutes);
                    } else {
                        $addEdge($ukey, $vkey, $lenM, $minutes);
                        $addEdge($vkey, $ukey, $lenM, $minutes);
                    }
                }
            }
        }

        return [
            'nodes'      => $nodes,
            'adj'        => $adj,
            'node_count' => count($nodes),
            'edge_count' => $edgeCount,
        ];
    }

    /** @return iterable<int, array<int, array{0: float, 1: float}>> */
    private function iterateLines(array $geom): iterable
    {
        $type = strtoupper($geom['type'] ?? '');
        $coords = $geom['coordinates'] ?? null;
        if ($type === 'LINESTRING' && is_array($coords)) {
            yield $this->coerceLine($coords);
        } elseif ($type === 'MULTILINESTRING' && is_array($coords)) {
            foreach ($coords as $line) {
                yield $this->coerceLine($line);
            }
        } elseif ($type === 'GEOMETRYCOLLECTION') {
            foreach ($geom['geometries'] ?? [] as $g) {
                yield from $this->iterateLines($g);
            }
        }
    }

    /** @return array<int, array{0: float, 1: float}> */
    private function coerceLine(array $coords): array
    {
        $out = [];
        foreach ($coords as $p) {
            if (is_array($p) && isset($p[0], $p[1]) && is_numeric($p[0]) && is_numeric($p[1])) {
                $out[] = [(float) $p[0], (float) $p[1]];
            }
        }

        return $out;
    }

    private function clampSpeed(mixed $raw, float $default, float $min, float $max): float
    {
        if ($raw === null || $raw === '') {
            return $default;
        }
        if (! is_numeric($raw)) {
            return $default;
        }
        $v = (float) $raw;
        if ($v <= 0) {
            return $default;
        }

        return max($min, min($max, $v));
    }

    private function normalizeOneway(mixed $raw): string
    {
        if ($raw === null || $raw === '') {
            return 'BOTH';
        }
        $s = strtoupper(trim((string) $raw));
        if (in_array($s, ['B', 'BOTH', '0', 'N', 'NO', 'FALSE', 'F'], true)) {
            return 'BOTH';
        }
        if (in_array($s, ['FT', 'WITH_DIGITIZED', 'WITHDIGITIZED', 'FWD', 'FORWARD'], true)) {
            return 'FT';
        }
        if (in_array($s, ['TF', 'AGAINST_DIGITIZED', 'AGAINSTDIGITIZED', 'REV', 'REVERSE'], true)) {
            return 'TF';
        }
        if (in_array($s, ['1', 'Y', 'YES', 'TRUE', 'T'], true)) {
            return 'FT';
        }

        return 'BOTH';
    }

    // --------------------------------------------------------- points loading

    /**
     * @return array<int, array{id: string, pair: string, x: float, y: float, near_key?: string, near_dist?: float}>
     */
    private function loadPoints(string $layerId, ?string $idField, ?string $pairField, int $targetSrid): array
    {
        $rows = DB::select(
            'SELECT id, properties, ST_AsGeoJSON(ST_Transform(geom, ?::integer)) AS gj
             FROM feature_layer_features
             WHERE feature_layer_id = ?
             ORDER BY id',
            [$targetSrid, $layerId]
        );

        $out = [];
        foreach ($rows as $r) {
            $geom = json_decode($r->gj ?? 'null', true);
            if (! is_array($geom)) {
                continue;
            }
            $coord = null;
            $t = strtoupper($geom['type'] ?? '');
            if ($t === 'POINT' && isset($geom['coordinates'][0], $geom['coordinates'][1])) {
                $coord = $geom['coordinates'];
            } elseif ($t === 'MULTIPOINT' && isset($geom['coordinates'][0][0], $geom['coordinates'][0][1])) {
                $coord = $geom['coordinates'][0];
            }
            if (! $coord) {
                continue;
            }

            $props = $r->properties ? json_decode($r->properties, true) : [];
            $id = ($idField && isset($props[$idField]))
                ? (string) $props[$idField]
                : (string) $r->id;
            $pair = ($pairField && isset($props[$pairField]))
                ? (string) $props[$pairField]
                : '';

            $out[] = [
                'id'   => $id,
                'pair' => $pair,
                'x'    => (float) $coord[0],
                'y'    => (float) $coord[1],
            ];
        }

        return $out;
    }

    /** Brute-force nearest-node snap. Fine for graphs up to ~200k nodes. */
    private function snapPoints(array &$points, array $graph): void
    {
        $nodeKeys = array_keys($graph['nodes']);
        $n = count($nodeKeys);
        if ($n === 0) {
            return;
        }

        $nodeXs = [];
        $nodeYs = [];
        foreach ($nodeKeys as $k) {
            [$nx, $ny] = $graph['nodes'][$k];
            $nodeXs[] = $nx;
            $nodeYs[] = $ny;
        }

        foreach ($points as &$p) {
            $px = $p['x'];
            $py = $p['y'];
            $best  = PHP_FLOAT_MAX;
            $bestI = -1;
            for ($i = 0; $i < $n; $i++) {
                $dx = $nodeXs[$i] - $px;
                $dy = $nodeYs[$i] - $py;
                $d2 = $dx * $dx + $dy * $dy;
                if ($d2 < $best) {
                    $best  = $d2;
                    $bestI = $i;
                }
            }
            if ($bestI >= 0) {
                $p['near_key']  = $nodeKeys[$bestI];
                $p['near_dist'] = sqrt($best);
            }
        }
        unset($p);
    }

    /**
     * @param  array<int, array{id: string, pair: string}> $starts
     * @param  array<int, array{id: string, pair: string}> $ends
     *
     * @return array<int, array{s: int, e: int|null, pair: string}>
     */
    private function buildPairs(array $starts, array $ends, string $mode): array
    {
        $pairs = [];

        if ($mode === 'ONE_END') {
            foreach (array_keys($starts) as $si) {
                $pairs[] = ['s' => $si, 'e' => 0, 'pair' => ''];
            }
        } elseif ($mode === 'BY_ORDER') {
            $n = min(count($starts), count($ends));
            for ($i = 0; $i < $n; $i++) {
                $pairs[] = ['s' => $i, 'e' => $i, 'pair' => ''];
            }
        } else { // BY_FIELD
            $byPid = [];
            foreach ($ends as $ei => $e) {
                $byPid[$e['pair']][] = $ei;
            }
            foreach ($starts as $si => $s) {
                $candidates = $byPid[$s['pair']] ?? [];
                $pairs[] = [
                    's'    => $si,
                    'e'    => $candidates[0] ?? null,
                    'pair' => $s['pair'],
                ];
            }
        }

        return $pairs;
    }

    // ----------------------------------------------------------- A* algorithm

    /**
     * @param  array{nodes: array, adj: array} $graph
     * @param  array<int, array{s: int, e: int|null, pair: string}> $pairs
     *
     * @return array<int, array{
     *   status: string, start_id: string, end_id: string, pair_id: string,
     *   start_snap_d: float|null, end_snap_d: float|null,
     *   node_count: int|null, total_min: float|null, total_len_m: float|null,
     *   coords: array<int, array{0: float, 1: float}>, msg: string,
     * }>
     */
    private function runAstarAll(array $graph, array $pairs, array $starts, array $ends, float $heuristicMaxSpeedKmh): array
    {
        $hSpeedMPerMin = ($heuristicMaxSpeedKmh * 1000.0) / 60.0;
        if ($hSpeedMPerMin <= 0) {
            $hSpeedMPerMin = 1.0;
        }

        $out = [];
        foreach ($pairs as $p) {
            $s = $starts[$p['s']] ?? null;
            $e = $p['e'] !== null ? ($ends[$p['e']] ?? null) : null;
            if ($s === null) {
                continue;
            }

            $sid = $s['id'];
            $eid = $e['id'] ?? '';
            $pid = $p['pair'];

            if ($e === null) {
                $out[] = $this->routeRecord('NO_MATCH_END', $sid, $eid, $pid, null, null, null, null, null, [], 'No matching end for PairID');
                continue;
            }

            if (empty($s['near_key']) || empty($e['near_key'])) {
                $out[] = $this->routeRecord('SNAP_FAIL', $sid, $eid, $pid,
                    $s['near_dist'] ?? null, $e['near_dist'] ?? null, null, null, null, [],
                    'Near search did not return a valid snapped node');
                continue;
            }

            $path = $this->astar($graph, $s['near_key'], $e['near_key'], $hSpeedMPerMin);
            if ($path === null) {
                $out[] = $this->routeRecord('NO_PATH', $sid, $eid, $pid,
                    $s['near_dist'], $e['near_dist'], null, null, null, [],
                    'No path between snapped nodes (directed/one-way constraints may block)');
                continue;
            }

            [$pathKeys, $totalMin, $totalLen] = $path;
            $coords = [];
            foreach ($pathKeys as $k) {
                [$nx, $ny] = $graph['nodes'][$k];
                $coords[] = [$nx, $ny];
            }

            $out[] = $this->routeRecord('OK', $sid, $eid, $pid,
                $s['near_dist'], $e['near_dist'],
                count($pathKeys), $totalMin, $totalLen, $coords, '');
        }

        return $out;
    }

    /**
     * Classic A*; returns [nodeKeysPath, totalMinutes, totalLengthM] or null when no path.
     *
     * @return array{0: array<int, string>, 1: float, 2: float}|null
     */
    private function astar(array $graph, string $startKey, string $goalKey, float $hSpeedMPerMin): ?array
    {
        if (! isset($graph['nodes'][$startKey]) || ! isset($graph['nodes'][$goalKey])) {
            return null;
        }
        if ($startKey === $goalKey) {
            return [[$startKey], 0.0, 0.0];
        }
        if (! isset($graph['adj'][$startKey])) {
            return null;
        }

        [$gx, $gy] = $graph['nodes'][$goalKey];

        $gScore = [$startKey => 0.0];
        $lenAcc = [$startKey => 0.0];
        $came   = [];
        $closed = [];

        $open = new SplPriorityQueue();
        $open->setExtractFlags(SplPriorityQueue::EXTR_DATA);
        // SplPriorityQueue is a max-heap, so push with negated priority.
        $open->insert($startKey, 0.0);

        while (! $open->isEmpty()) {
            $current = $open->extract();
            if (isset($closed[$current])) {
                continue;
            }
            if ($current === $goalKey) {
                return $this->reconstruct($came, $current, $gScore, $lenAcc);
            }
            $closed[$current] = true;

            $adjRow = $graph['adj'][$current] ?? [];
            foreach ($adjRow as $nbr => $edge) {
                if (isset($closed[$nbr])) {
                    continue;
                }
                $tentative = $gScore[$current] + $edge['weight'];
                if (! isset($gScore[$nbr]) || $tentative < $gScore[$nbr]) {
                    $came[$nbr]   = $current;
                    $gScore[$nbr] = $tentative;
                    $lenAcc[$nbr] = ($lenAcc[$current] ?? 0.0) + $edge['len_m'];

                    [$nx, $ny] = $graph['nodes'][$nbr];
                    $hEst = hypot($nx - $gx, $ny - $gy) / $hSpeedMPerMin;
                    $f = $tentative + $hEst;
                    $open->insert($nbr, -$f);
                }
            }
        }

        return null;
    }

    /** @return array{0: array<int, string>, 1: float, 2: float} */
    private function reconstruct(array $came, string $current, array $gScore, array $lenAcc): array
    {
        $path = [$current];
        while (isset($came[$current])) {
            $current = $came[$current];
            $path[] = $current;
        }
        $path = array_reverse($path);
        $last = $path[count($path) - 1];

        return [$path, (float) ($gScore[$last] ?? 0.0), (float) ($lenAcc[$last] ?? 0.0)];
    }

    private function routeRecord(
        string $status, string $sid, string $eid, string $pid,
        ?float $startSnapD, ?float $endSnapD,
        ?int $nodeCount, ?float $totalMin, ?float $totalLenM,
        array $coords, string $msg
    ): array {
        return [
            'status'       => $status,
            'start_id'     => $sid,
            'end_id'       => $eid,
            'pair_id'      => $pid,
            'start_snap_d' => $startSnapD,
            'end_snap_d'   => $endSnapD,
            'node_count'   => $nodeCount,
            'total_min'    => $totalMin,
            'total_len_m'  => $totalLenM,
            'coords'       => $coords,
            'msg'          => $msg,
        ];
    }

    // ------------------------------------------------------ output FeatureLayers

    /** @param array<int, array> $routes */
    private function createRoutesLayer(
        string $displayName,
        string $taskId,
        array $routes,
        int $srcSrid,
        array $params,
    ): FeatureLayer {
        $layer = FeatureLayer::create([
            'name'          => $displayName,
            'slug'          => Str::slug($displayName).'-'.Str::lower(Str::random(6)),
            'source_name'   => 'routing-task:'.$taskId,
            'source_type'   => 'routing_task_routes',
            'geometry_type' => 'LINESTRING',
            'srid'          => 4326,
            'status'        => 'READY',
            'description'   => 'Routes generated by Routing Task '.$taskId,
            'field_schema'  => [
                ['name' => 'route_id',        'type' => 'integer'],
                ['name' => 'start_id',        'type' => 'string'],
                ['name' => 'end_id',          'type' => 'string'],
                ['name' => 'pair_id',         'type' => 'string'],
                ['name' => 'pair_mode',       'type' => 'string'],
                ['name' => 'status',          'type' => 'string'],
                ['name' => 'msg',             'type' => 'string'],
                ['name' => 'node_count',      'type' => 'integer'],
                ['name' => 'start_snap_d',    'type' => 'double'],
                ['name' => 'end_snap_d',      'type' => 'double'],
                ['name' => 'total_time_min',  'type' => 'double'],
                ['name' => 'total_distance_m','type' => 'double'],
                ['name' => 'default_speed_kmh','type' => 'double'],
                ['name' => 'min_speed_kmh',   'type' => 'double'],
                ['name' => 'max_speed_kmh',   'type' => 'double'],
                ['name' => 'created_at',      'type' => 'string'],
            ],
        ]);

        $bounds = null;
        $count  = 0;
        $now    = now();
        $routeId = 0;

        foreach ($routes as $r) {
            $routeId++;
            if (count($r['coords']) < 2 || $r['status'] !== 'OK') {
                continue;
            }
            $wktParts = [];
            foreach ($r['coords'] as [$x, $y]) {
                $wktParts[] = $x.' '.$y;
            }
            $wkt = 'LINESTRING('.implode(', ', $wktParts).')';

            $props = [
                'route_id'         => $routeId,
                'start_id'         => $r['start_id'],
                'end_id'           => $r['end_id'],
                'pair_id'          => $r['pair_id'],
                'pair_mode'        => $params['pair_mode'],
                'status'           => $r['status'],
                'msg'              => $r['msg'],
                'node_count'       => $r['node_count'],
                'start_snap_d'     => $r['start_snap_d'],
                'end_snap_d'       => $r['end_snap_d'],
                'total_time_min'   => $r['total_min'],
                'total_distance_m' => $r['total_len_m'],
                'default_speed_kmh'=> $params['default_speed_kmh'],
                'min_speed_kmh'    => $params['min_speed_kmh'],
                'max_speed_kmh'    => $params['max_speed_kmh'],
                'created_at'       => $now->toIso8601String(),
            ];

            DB::insert(
                'INSERT INTO feature_layer_features (feature_layer_id, geom, properties, created_at, updated_at)
                 VALUES (?, ST_Transform(ST_SetSRID(ST_GeomFromText(?), ?::integer), 4326), ?::jsonb, ?, ?)',
                [$layer->id, $wkt, $srcSrid, json_encode($props, JSON_UNESCAPED_UNICODE), $now, $now]
            );

            $count++;

            foreach ($r['coords'] as [$x, $y]) {
                $bounds = $this->extendBounds($bounds, $x, $y);
            }
        }

        // Convert bounds to WGS84 via PostGIS for accuracy.
        $wgs = $this->computeLayerBboxWgs84($layer->id);

        $layer->update([
            'feature_count' => $count,
            'bbox_xmin'     => $wgs[0],
            'bbox_ymin'     => $wgs[1],
            'bbox_xmax'     => $wgs[2],
            'bbox_ymax'     => $wgs[3],
        ]);

        return $layer->refresh();
    }

    /** @param array{nodes: array, adj: array} $graph */
    private function createNodesLayer(
        string $displayName,
        string $taskId,
        array $graph,
        int $srcSrid,
    ): FeatureLayer {
        $layer = FeatureLayer::create([
            'name'          => $displayName,
            'slug'          => Str::slug($displayName).'-'.Str::lower(Str::random(6)),
            'source_name'   => 'routing-task:'.$taskId,
            'source_type'   => 'routing_task_nodes',
            'geometry_type' => 'POINT',
            'srid'          => 4326,
            'status'        => 'READY',
            'description'   => 'Graph nodes generated by Routing Task '.$taskId,
            'field_schema'  => [
                ['name' => 'node_id',    'type' => 'integer'],
                ['name' => 'x',          'type' => 'double'],
                ['name' => 'y',          'type' => 'double'],
                ['name' => 'created_at', 'type' => 'string'],
            ],
        ]);

        $now   = now();
        $id    = 0;
        $buffer = [];

        foreach ($graph['nodes'] as [$x, $y]) {
            $id++;
            $buffer[] = [$x, $y, $id];
            if (count($buffer) >= 500) {
                $this->flushNodes($layer->id, $buffer, $srcSrid, $now);
                $buffer = [];
            }
        }
        if (! empty($buffer)) {
            $this->flushNodes($layer->id, $buffer, $srcSrid, $now);
        }

        $wgs = $this->computeLayerBboxWgs84($layer->id);

        $layer->update([
            'feature_count' => $id,
            'bbox_xmin'     => $wgs[0],
            'bbox_ymin'     => $wgs[1],
            'bbox_xmax'     => $wgs[2],
            'bbox_ymax'     => $wgs[3],
        ]);

        return $layer->refresh();
    }

    /** @param array<int, array{0: float, 1: float, 2: int}> $buffer */
    private function flushNodes(string $layerId, array $buffer, int $srcSrid, mixed $now): void
    {
        $values = [];
        $params = [];
        foreach ($buffer as [$x, $y, $nid]) {
            $wkt = 'POINT('.$x.' '.$y.')';
            $props = [
                'node_id'    => $nid,
                'x'          => $x,
                'y'          => $y,
                'created_at' => $now->toIso8601String(),
            ];
            $values[] = '(?, ST_Transform(ST_SetSRID(ST_GeomFromText(?), ?::integer), 4326), ?::jsonb, ?, ?)';
            $params[] = $layerId;
            $params[] = $wkt;
            $params[] = $srcSrid;
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

    // -------------------------------------------------------- route points

    /**
     * Sample each successful route at a fixed step (meters) and write one point per sample
     * with cumulative distance, cumulative minutes, ISO time, heading and cardinal direction.
     * Ported from the `GENERATE POINTS` cell of Routing & points Working.ipynb.
     *
     * @param  array<int, array> $routes
     *
     * @return array{0: \App\Models\FeatureLayer, 1: int}
     */
    private function createRoutePointsLayer(
        string $displayName,
        string $taskId,
        array $routes,
        int $srcSrid,
        array $params,
    ): array {
        $step   = (float) ($params['points_step_m'] ?? 5.0);
        $offset = (float) ($params['points_heading_offset_m'] ?? 0.5);
        $departure = $this->parseDeparture($params['departure_iso_utc'] ?? null);

        $layer = FeatureLayer::create([
            'name'          => $displayName,
            'slug'          => Str::slug($displayName).'-'.Str::lower(Str::random(6)),
            'source_name'   => 'routing-task:'.$taskId,
            'source_type'   => 'routing_task_route_points',
            'geometry_type' => 'POINT',
            'srid'          => 4326,
            'status'        => 'READY',
            'description'   => 'Route points (densified) generated by Routing Task '.$taskId,
            'field_schema'  => [
                ['name' => 'route_id',      'type' => 'integer'],
                ['name' => 'algorithm',     'type' => 'string'],
                ['name' => 'start_id',      'type' => 'string'],
                ['name' => 'end_id',        'type' => 'string'],
                ['name' => 'pair_id',       'type' => 'string'],
                ['name' => 'status',        'type' => 'string'],
                ['name' => 'total_min',     'type' => 'double'],
                ['name' => 'total_len_m',   'type' => 'double'],
                ['name' => 'step_m',        'type' => 'double'],
                ['name' => 'cum_dist_m',    'type' => 'double'],
                ['name' => 'cum_min',       'type' => 'double'],
                ['name' => 'time_iso',      'type' => 'string'],
                ['name' => 'heading',       'type' => 'double'],
                ['name' => 'cardinal_dir',  'type' => 'string'],
            ],
        ]);

        $now     = now();
        $buffer  = [];
        $total   = 0;
        $routeId = 0;

        foreach ($routes as $r) {
            $routeId++;
            if ($r['status'] !== 'OK' || count($r['coords']) < 2) {
                continue;
            }

            $samples = $this->densifyRoute($r['coords'], $step, $offset);
            if (empty($samples)) {
                continue;
            }

            $totalRouteLenM = $samples[array_key_last($samples)]['d'];
            $totalMin       = (float) ($r['total_min'] ?? 0.0);
            $totalLenM      = (float) ($r['total_len_m'] ?? $totalRouteLenM);
            $effectiveLen   = $totalRouteLenM > 0 ? $totalRouteLenM : $totalLenM;

            foreach ($samples as $s) {
                $frac   = $effectiveLen > 0 ? ($s['d'] / $effectiveLen) : 0.0;
                $cumMin = $totalMin > 0 ? $frac * $totalMin : 0.0;

                $timeIso = '';
                if ($departure !== null) {
                    $t = $departure->modify(sprintf('+%d seconds', (int) round($cumMin * 60)));
                    $timeIso = $t->format('Y-m-d\TH:i:s\Z');
                }

                $props = [
                    'route_id'     => $routeId,
                    'algorithm'    => 'A*_TIME',
                    'start_id'     => $r['start_id'],
                    'end_id'       => $r['end_id'],
                    'pair_id'      => $r['pair_id'],
                    'status'       => $r['status'],
                    'total_min'    => $totalMin,
                    'total_len_m'  => $totalLenM,
                    'step_m'       => $step,
                    'cum_dist_m'   => $s['d'],
                    'cum_min'      => $cumMin,
                    'time_iso'     => $timeIso,
                    'heading'      => $s['heading'],
                    'cardinal_dir' => $s['cardinal'],
                ];

                $buffer[] = [$s['x'], $s['y'], $props];
                $total++;

                if (count($buffer) >= 500) {
                    $this->flushRoutePoints($layer->id, $buffer, $srcSrid, $now);
                    $buffer = [];
                }
            }
        }

        if (! empty($buffer)) {
            $this->flushRoutePoints($layer->id, $buffer, $srcSrid, $now);
        }

        $wgs = $this->computeLayerBboxWgs84($layer->id);

        $layer->update([
            'feature_count' => $total,
            'bbox_xmin'     => $wgs[0],
            'bbox_ymin'     => $wgs[1],
            'bbox_xmax'     => $wgs[2],
            'bbox_ymax'     => $wgs[3],
        ]);

        return [$layer->refresh(), $total];
    }

    /**
     * Sample a polyline (projected meters) every $step meters, plus the final vertex.
     * Heading at each sample is the bearing between points $offset before and $offset after.
     *
     * @param  array<int, array{0: float, 1: float}> $coords
     *
     * @return array<int, array{d: float, x: float, y: float, heading: float, cardinal: string}>
     */
    private function densifyRoute(array $coords, float $step, float $offset): array
    {
        $n = count($coords);
        if ($n < 2 || $step <= 0) {
            return [];
        }

        // Cumulative distance along the polyline and segment lengths.
        $cum = [0.0];
        for ($i = 1; $i < $n; $i++) {
            $dx = $coords[$i][0] - $coords[$i - 1][0];
            $dy = $coords[$i][1] - $coords[$i - 1][1];
            $cum[] = $cum[$i - 1] + hypot($dx, $dy);
        }
        $routeLen = $cum[$n - 1];
        if ($routeLen <= 0) {
            return [];
        }

        // Build sampling distances: 0, step, 2*step, ..., last not exceeding routeLen, plus routeLen exactly.
        $distances = [];
        $d = 0.0;
        while ($d < $routeLen) {
            $distances[] = $d;
            $d += $step;
        }
        if (empty($distances) || abs($distances[array_key_last($distances)] - $routeLen) > 1e-6) {
            $distances[] = $routeLen;
        }

        $samples = [];
        foreach ($distances as $dist) {
            [$px, $py] = $this->positionAlong($coords, $cum, $dist);

            $dBack  = max($dist - $offset, 0.0);
            $dAhead = min($dist + $offset, $routeLen);
            if (abs($dAhead - $dBack) < 1e-9) {
                $dBack  = 0.0;
                $dAhead = $routeLen;
            }
            [$bx, $by] = $this->positionAlong($coords, $cum, $dBack);
            [$ax, $ay] = $this->positionAlong($coords, $cum, $dAhead);

            $heading = $this->bearingDegrees($bx, $by, $ax, $ay);
            $cardinal = $this->cardinal($heading);

            $samples[] = [
                'd'        => $dist,
                'x'        => $px,
                'y'        => $py,
                'heading'  => $heading,
                'cardinal' => $cardinal,
            ];
        }

        return $samples;
    }

    /**
     * Linear interpolation along a polyline at distance $dist (meters).
     *
     * @param  array<int, array{0: float, 1: float}> $coords
     * @param  array<int, float>                     $cum      cumulative distances per vertex
     *
     * @return array{0: float, 1: float}
     */
    private function positionAlong(array $coords, array $cum, float $dist): array
    {
        $n = count($coords);
        if ($dist <= 0) {
            return [$coords[0][0], $coords[0][1]];
        }
        $total = $cum[$n - 1];
        if ($dist >= $total) {
            return [$coords[$n - 1][0], $coords[$n - 1][1]];
        }

        // Binary-search the segment whose cumulative end exceeds $dist.
        $lo = 0;
        $hi = $n - 1;
        while ($lo < $hi) {
            $mid = intdiv($lo + $hi, 2);
            if ($cum[$mid] < $dist) {
                $lo = $mid + 1;
            } else {
                $hi = $mid;
            }
        }
        // segment is [$lo-1 -> $lo]
        $i0 = max($lo - 1, 0);
        $i1 = $lo;
        $segLen = $cum[$i1] - $cum[$i0];
        if ($segLen <= 0) {
            return [$coords[$i1][0], $coords[$i1][1]];
        }
        $t = ($dist - $cum[$i0]) / $segLen;
        $x = $coords[$i0][0] + ($coords[$i1][0] - $coords[$i0][0]) * $t;
        $y = $coords[$i0][1] + ($coords[$i1][1] - $coords[$i0][1]) * $t;

        return [$x, $y];
    }

    /** Bearing in degrees 0..360 clockwise from North — same convention as the notebook. */
    private function bearingDegrees(float $x1, float $y1, float $x2, float $y2): float
    {
        $dx = $x2 - $x1;
        $dy = $y2 - $y1;
        $deg = rad2deg(atan2($dx, $dy));

        return fmod(($deg + 360.0), 360.0);
    }

    private function cardinal(float $deg): string
    {
        $dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        $idx = ((int) floor(($deg + 22.5) / 45.0)) % 8;
        if ($idx < 0) {
            $idx += 8;
        }

        return $dirs[$idx];
    }

    private function parseDeparture(?string $iso): ?\DateTimeImmutable
    {
        if (! $iso || trim($iso) === '') {
            return null;
        }
        try {
            return new \DateTimeImmutable($iso, new \DateTimeZone('UTC'));
        } catch (\Throwable) {
            return null;
        }
    }

    /** @param array<int, array{0: float, 1: float, 2: array<string, mixed>}> $buffer */
    private function flushRoutePoints(string $layerId, array $buffer, int $srcSrid, mixed $now): void
    {
        $values = [];
        $params = [];
        foreach ($buffer as [$x, $y, $props]) {
            $wkt = 'POINT('.$x.' '.$y.')';
            $values[] = '(?, ST_Transform(ST_SetSRID(ST_GeomFromText(?), ?::integer), 4326), ?::jsonb, ?, ?)';
            $params[] = $layerId;
            $params[] = $wkt;
            $params[] = $srcSrid;
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

    // -------------------------------------------------------- bbox utils

    /** @return array{0: ?float, 1: ?float, 2: ?float, 3: ?float} */
    private function computeLayerBboxWgs84(string $layerId): array
    {
        $r = DB::selectOne(
            'SELECT ST_XMin(ext) AS xmin, ST_YMin(ext) AS ymin, ST_XMax(ext) AS xmax, ST_YMax(ext) AS ymax
             FROM (SELECT ST_Extent(geom) AS ext FROM feature_layer_features WHERE feature_layer_id = ?) t',
            [$layerId]
        );
        if (! $r || $r->xmin === null) {
            return [null, null, null, null];
        }

        return [(float) $r->xmin, (float) $r->ymin, (float) $r->xmax, (float) $r->ymax];
    }

    /**
     * @param  array{0: float, 1: float, 2: float, 3: float}|null $current
     *
     * @return array{0: float, 1: float, 2: float, 3: float}
     */
    private function extendBounds(?array $current, float $x, float $y): array
    {
        if ($current === null) {
            return [$x, $y, $x, $y];
        }

        return [
            min($current[0], $x),
            min($current[1], $y),
            max($current[2], $x),
            max($current[3], $y),
        ];
    }
}
