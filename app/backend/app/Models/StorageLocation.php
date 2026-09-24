<?php

namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class StorageLocation extends Model
{
    use BelongsToTenant;

    protected $fillable = ['description', 'tenant_id'];

    public function category(): BelongsTo
    {
        return $this->belongsTo(Category::class);
    }
}
