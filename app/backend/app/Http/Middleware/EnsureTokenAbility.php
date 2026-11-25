<?php

namespace App\Http\Middleware;

use App\Models\ApiToken;
use Closure;
use Illuminate\Http\Request;
use Symfony\Component\HttpFoundation\Response;

/**
 * ルートに必要な操作 (ability:items:read など) を、使われたトークンが持つかを確かめる。
 * 通常のトークン (abilities が null) はすべて持つ。auth.token の後ろで使う (README の D13)
 */
class EnsureTokenAbility
{
    public function handle(Request $request, Closure $next, string $ability): Response
    {
        $token = $request->attributes->get('api_token');

        if (! $token instanceof ApiToken || ! $token->allows($ability)) {
            return response()->json(['message' => 'This token cannot use this API.'], 403);
        }

        return $next($request);
    }
}
