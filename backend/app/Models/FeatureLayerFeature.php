<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class FeatureLayerFeature extends Model
{
    protected $fillable = ['feature_layer_id', 'properties'];

    protected $casts = [
        'properties' => 'array',
    ];

    public function featureLayer(): BelongsTo
    {
        return $this->belongsTo(FeatureLayer::class);
    }
}
