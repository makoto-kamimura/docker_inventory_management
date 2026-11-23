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

        // 「SSO だけ」にした人の、パスワードで入ったトークンは使えない (オンにした時点で、ほかの端末のログインも切れる)
        $method = $token->login_method ?? 'pwd';
        if (! self::loginMethodAllowed($token->user, $method)) {
            return $this->unauthenticated();
        }

        $token->forceFill(['last_used_at' => now()])->save();

        // 後続のコントローラ/ログアウトで現在のトークンを参照できるよう保持
        $request->attributes->set('api_token', $token);
        $request->attributes->set('login_method', $method === 'sso' ? 'sso' : 'pwd');

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

        return ! ($enforced && $user->sso_only && $method !== 'sso');
    }

    private function unauthenticated(): Response
    {
        return response()->json(['message' => 'Unauthenticated.'], 401);
    }
}
