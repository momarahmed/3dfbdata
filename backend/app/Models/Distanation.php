<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;

class Distanation extends Model
{
    use HasUuids;

    protected $table = 'distanations';

    protected $fillable = ['dist_name'];
}
