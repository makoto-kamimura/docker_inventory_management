<?php

namespace App\Http\Middleware;

use App\Models\ApiToken;
use Closure;
use Illuminate\Contracts\Auth\Middleware\AuthenticatesRequests;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;
use Symfony\Component\HttpFoundation\Response;

/**
 * AuthenticatesRequests は印のインターフェース。これを実装すると、Laravel のミドルウェアの優先度の一覧で
 * SubstituteBindings (ルートのモデルの解決) より先に並ぶ。
 * テナントのグローバルスコープ (BelongsToTenant) はログイン中のユーザーを前提にしているので、
 * モデルの解決より先に認証する (README の D10)。外さないこと
 */
class AuthenticateToken implements AuthenticatesRequests
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

        if ($token === null || $token->isExpired()) {
            return $this->unauthenticated();
        }

        // 用途を絞ったトークン (Alexa など) は、ルートに ability: の指定があるときだけ通す (既定で断る。README の D13)。
        // 指定された操作をトークンが持つかは EnsureTokenAbility が確かめる
        if ($token->isScoped() && ! self::routeDeclaresAbility($request)) {
            return response()->json(['message' => 'This token cannot use this API.'], 403);
        }

        // 「SSO だけ」にした人の、パスワードで入ったトークンは使えない (オンにした時点で、ほかの端末のログインも切れる)
        $method = $token->login_method ?? 'pwd';
        if (! self::loginMethodAllowed($token->user, $method)) {
            return $this->unauthenticated();
        }

        $token->forceFill(['last_used_at' => now()])->save();

        // 後続のコントローラ/ログアウトで現在のトークンを参照できるよう保持
        $request->attributes->set('api_token', $token);
        $request->attributes->set('login_method', in_array($method, ['sso', 'cli'], true) ? $method : 'pwd');

        Auth::setUser($token->user);
        $request->setUserResolver(fn () => $token->user);

        return $next($request);
    }

    /**
     * この方法 (pwd / sso) でのログインを、この利用者に許すか。「SSO だけ」の人には SSO のログインしか許さない。
     * SSO が無効な環境や、非常用の切り替え (OIDC_ALLOW_PASSWORD_FOR_SSO_ONLY=true) のときは守らせない (締め出し防止)
     */
    public static function loginMethodAllowed(?\App\Models\User $user, string $method): bool
    {
        if ($user === null) {
            return false;
        }
        $enforced = \App\Services\Sso\Oidc::enabled() && ! config('sso.allow_password_for_sso_only');

        // cli は運用者がサーバーで発行したトークン (Alexa 用など)。パスワードのログインではないので止めない
        return ! ($enforced && $user->sso_only && $method === 'pwd');
    }

    private static function routeDeclaresAbility(Request $request): bool
    {
        foreach ($request->route()?->gatherMiddleware() ?? [] as $middleware) {
            if (is_string($middleware) && str_starts_with($middleware, 'ability:')) {
                return true;
            }
        }

        return false;
    }

    private function unauthenticated(): Response
    {
        return response()->json(['message' => 'Unauthenticated.'], 401);
    }
}
