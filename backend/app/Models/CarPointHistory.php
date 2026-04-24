<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CarPointHistory extends Model
{
    protected $table = 'car_points_history';

    protected $fillable = [
        'vehicle_id',
        'route_id',
        'point_time',
        'speed_kmh',
        'heading_deg',
        'longitude',
        'latitude',
        'metadata',
    ];

    protected $casts = [
        'point_time'  => 'datetime',
        'speed_kmh'   => 'float',
        'heading_deg' => 'float',
        'longitude'   => 'float',
        'latitude'    => 'float',
        'metadata'    => 'array',
    ];
}
