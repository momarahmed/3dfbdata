<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Str;

class Simulation extends Model
{
    protected $table = 'simulations';

    protected $primaryKey = 'simulation_id';

    public $incrementing = false;

    protected $keyType = 'string';

    protected $fillable = [
        'simulation_id',
        'status',
        'vehicle_ids',
        'route_id',
        'speed_multiplier',
        'loop',
        'started_at',
        'paused_at',
        'ended_at',
        'last_point_time',
        'last_sequence',
        'metadata',
    ];

    protected $casts = [
        'vehicle_ids'      => 'array',
        'metadata'         => 'array',
        'loop'             => 'boolean',
        'speed_multiplier' => 'float',
        'last_sequence'    => 'integer',
        'started_at'       => 'datetime',
        'paused_at'        => 'datetime',
        'ended_at'         => 'datetime',
        'last_point_time'  => 'datetime',
    ];

    protected static function booted(): void
    {
        static::creating(function (Simulation $model): void {
            if (empty($model->simulation_id)) {
                $model->simulation_id = (string) Str::uuid();
            }
        });
    }
}
