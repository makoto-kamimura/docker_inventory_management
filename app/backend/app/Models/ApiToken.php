<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

class ApiToken extends Model
{
    /** Alexa スキル用のトークンの名前。履歴の source にも使う */
    public const ALEXA = 'alexa';

    /** Alexa スキル用のトークンに許す操作 (README の D13) */
    public const ALEXA_ABILITIES = ['items:read', 'items:decrement', 'items:increment'];

    protected $fillable = ['user_id', 'name', 'token', 'last_used_at', 'login_method', 'abilities', 'expires_at'];

    protected $hidden = ['token'];

    protected function casts(): array
    {
        return [
            'last_used_at' => 'datetime',
            'abilities' => 'array',
            'expires_at' => 'datetime',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }

    /**
     * 平文トークンを SHA-256 でハッシュ化する (DB には常にハッシュを保存)。
     */
    public static function hash(string $plain): string
    {
        return hash('sha256', $plain);
    }

    /** 用途を絞ったトークンか (abilities が null なら、すべての API を使える通常のトークン) */
    public function isScoped(): bool
    {
        return $this->abilities !== null;
    }

    public function allows(string $ability): bool
    {
        return ! $this->isScoped() || in_array($ability, $this->abilities, true);
    }

    public function isExpired(): bool
    {
        return $this->expires_at !== null && $this->expires_at->isPast();
    }

    /** 履歴に残す操作の経路。Alexa 用のトークンなら alexa、それ以外は null */
    public function historySource(): ?string
    {
        return $this->name === self::ALEXA && $this->isScoped() ? self::ALEXA : null;
    }
}
