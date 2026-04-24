<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class RoutingTask extends Model
{
    use HasUuids;

    protected $fillable = [
        'name',
        'status',
        'progress',
        'message',
        'roads_layer_id',
        'start_layer_id',
        'end_layer_id',
        'output_routes_layer_id',
        'output_nodes_layer_id',
        'output_points_layer_id',
        'parameters',
        'stats',
    ];

    protected $casts = [
        'progress'   => 'integer',
        'parameters' => 'array',
        'stats'      => 'array',
    ];
}
