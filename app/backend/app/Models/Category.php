<?php
namespace App\Models;

use App\Models\Concerns\BelongsToTenant;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\HasMany;


class Category extends Model
{
    use BelongsToTenant;

    protected $fillable = ['name', 'tenant_id'];

    public function items(): HasMany
    {
        return $this->hasMany(Item::class);
    }

}