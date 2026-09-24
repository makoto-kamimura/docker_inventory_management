<?php

namespace App\Models\Concerns;

use Illuminate\Database\Eloquent\Builder;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Support\Facades\Auth;

/**
 * 認証中ユーザーのテナントで自動的に絞り込み・自動採番を行う。
 * 未認証コンテキスト (artisan/seeder) では絞り込みを行わない。
 */
trait BelongsToTenant
{
    protected static function bootBelongsToTenant(): void
    {
        static::addGlobalScope('tenant', function (Builder $builder) {
            $tenantId = static::currentTenantId();
            if ($tenantId !== null) {
                $builder->where($builder->getModel()->getTable() . '.tenant_id', $tenantId);
            }
        });

        static::creating(function (Model $model) {
            if (empty($model->tenant_id) && ($tenantId = static::currentTenantId()) !== null) {
                $model->tenant_id = $tenantId;
            }
        });
    }

    protected static function currentTenantId(): ?int
    {
        return Auth::user()?->tenant_id;
    }
}
