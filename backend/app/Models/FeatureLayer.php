<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Concerns\HasUuids;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;

class FeatureLayer extends Model
{
    use HasUuids;

    protected $fillable = [
        'name',
        'slug',
        'source_name',
        'source_type',
        'geometry_type',
        'srid',
        'feature_count',
        'bbox_xmin',
        'bbox_ymin',
        'bbox_xmax',
        'bbox_ymax',
        'field_schema',
        'description',
        'status',
        'message',
    ];

    protected $casts = [
        'srid'          => 'integer',
        'feature_count' => 'integer',
        'bbox_xmin'     => 'float',
        'bbox_ymin'     => 'float',
        'bbox_xmax'     => 'float',
        'bbox_ymax'     => 'float',
        'field_schema'  => 'array',
    ];

    public function features(): HasMany
    {
        return $this->hasMany(FeatureLayerFeature::class);
    }
}
