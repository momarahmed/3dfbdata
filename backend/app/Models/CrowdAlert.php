<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

class CrowdAlert extends Model
{
    protected $fillable = ['title', 'zone', 'severity', 'status', 'triggered_at'];

    protected $casts = [
        'triggered_at' => 'datetime',
    ];
}
