<?php

namespace App\Http\Middleware;

use App\Models\ApiToken;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

class AuthenticateToken
{
    /**
     * Authorization: Bearer <token> を検証し、対応ユーザーを認証済みにする。
     * 無効/欠如なら 401 (JSON) を返す。
     */
    public function handle(Request $request, Closure $next): Response
    {
        $plain = $request->bearerToken();

        if ($plain === null) {
            return $this->unauthenticated();
        }

        $token = ApiToken::where('token', ApiToken::hash($plain))->first();

        if ($token === null) {
            return $this->unauthenticated();
        }

        $token->forceFill(['last_used_at' => now()])->save();

        // 後続のコントローラ/ログアウトで現在のトークンを参照できるよう保持
        $request->attributes->set('api_token', $token);

        Auth::setUser($token->user);
        $request->setUserResolver(fn () => $token->user);

        return $next($request);
    }

    private function unauthenticated(): Response
    {
        return response()->json(['message' => 'Unauthenticated.'], 401);
    }
}
