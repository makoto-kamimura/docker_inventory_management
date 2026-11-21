<?php

namespace App\Http\Controllers;

use App\Models\User;
use App\Services\Sso\Oidc;
use App\Services\Sso\Rejected;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Http\Response;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Log;
use Throwable;

/**
 * SSO (OpenID Connect) でのログイン。Web とモバイルで同じ流れを使う。
 *
 * 1. (連携のときだけ) POST /me/identities/sso/intent … ログイン中の利用者に、使い捨ての intent を発行
 * 2. GET  /auth/sso/start    … クライアントが作った code_challenge を受け取り、認証サーバーへ送る
 * 3. GET  /auth/sso/callback … 認証サーバーから戻る。使い捨ての結果コードを付けてクライアントへ戻す
 * 4. POST /auth/sso/exchange … 結果コードと code_verifier を引き換える。ここでログイン / 連携が成立する
 *
 * 新しい利用者は作らない。SSO で入れるのは、パスワードでログインしたうえで連携した人だけ。
 */
class SsoController extends Controller
{
    /** 開始から認証サーバーでの操作を終えるまでの猶予 (秒) */
    private const FLOW_TTL = 600;

    /** 結果コードの有効期間 (秒) */
    private const RESULT_TTL = 60;

    private function ensureEnabled(): void
    {
        abort_unless(Oidc::enabled(), 404);
    }

    private function err(int $status, string $message): JsonResponse
    {
        return response()->json(['message' => $message], $status);
    }

    /** ログイン画面が「SSO でログイン」を出すかどうかと、その名前 */
    public function providers(): JsonResponse
    {
        return response()->json(['sso' => Oidc::enabled(), 'sso_name' => Oidc::enabled() ? Oidc::displayName() : null]);
    }

    public function start(Request $request): RedirectResponse|JsonResponse
    {
        $this->ensureEnabled();
        $challenge = (string) $request->query('code_challenge', '');
        if (! Oidc::isValidChallenge($challenge)) {
            return $this->err(400, 'code_challenge が正しくありません');
        }
        $client = (string) $request->query('client', '');
        if ($client === 'web') {
            $returnTo = Oidc::webReturnUrl();
        } elseif ($client === 'mobile') {
            $returnTo = (string) $request->query('redirect_uri', '');
            if (! Oidc::mobileRedirectAllowed($returnTo, config('sso.mobile_redirect_prefixes'))) {
                return $this->err(400, 'redirect_uri が許可されていません');
            }
        } else {
            return $this->err(400, 'client が正しくありません');
        }

        DB::table('oauth_flows')->where('expires_at', '<', now())->delete();

        $state = Oidc::randomToken();
        $nonce = Oidc::randomToken();
        $serverVerifier = Oidc::randomToken();
        $fields = [
            'state_hash' => Oidc::hashToken($state),
            'nonce' => $nonce,
            'server_verifier' => $serverVerifier,
            'client_challenge' => $challenge,
            'return_to' => $returnTo,
            'expires_at' => now()->addSeconds(self::FLOW_TTL),
        ];

        $mode = (string) $request->query('mode', '');
        if ($mode === 'login') {
            DB::table('oauth_flows')->insert($fields + ['mode' => 'login', 'created_at' => now()]);
        } elseif ($mode === 'link') {
            // intent は 1 回だけ使える。使ったら消して state に進める
            $updated = DB::table('oauth_flows')
                ->where('intent_hash', Oidc::hashToken((string) $request->query('intent', '')))
                ->where('mode', 'link')
                ->where('expires_at', '>', now())
                ->update($fields + ['intent_hash' => null]);
            if ($updated === 0) {
                return redirect()->away(Oidc::withQuery($returnTo, 'error', 'expired'), 303);
            }
        } else {
            return $this->err(400, 'mode が正しくありません');
        }

        try {
            $url = Oidc::authorizationUrl($state, $nonce, Oidc::pkceChallenge($serverVerifier));
        } catch (Throwable $e) {
            Log::error('sso: cannot reach the identity provider: '.$e->getMessage());

            return $this->err(502, '認証サーバーに接続できません');
        }

        return redirect()->away($url, 303);
    }

    public function callback(Request $request): RedirectResponse|Response
    {
        try {
            return redirect()->away($this->handleCallback($request), 303);
        } catch (Throwable $e) {
            Log::warning('sso callback rejected: '.$e->getMessage());

            return response(
                '<!doctype html><meta charset=utf-8><meta name=viewport content="width=device-width">'
                .'<p>ログインの有効期限が切れたか、正しくない要求です。アプリに戻って、もう一度やり直してください。</p>',
                400
            )->header('Content-Type', 'text/html; charset=utf-8');
        }
    }

    private function handleCallback(Request $request): string
    {
        if (! Oidc::enabled()) {
            throw new \RuntimeException('sso is disabled');
        }
        $stateHash = Oidc::hashToken((string) $request->query('state', ''));
        // state は 1 回だけ使える
        $flow = DB::transaction(function () use ($stateHash) {
            $flow = DB::table('oauth_flows')->where('state_hash', $stateHash)->where('expires_at', '>', now())
                ->lockForUpdate()->first();
            if ($flow) {
                DB::table('oauth_flows')->where('id', $flow->id)->update(['state_hash' => null]);
            }

            return $flow;
        });
        if (! $flow || ! $flow->return_to) {
            throw new \RuntimeException('unknown or expired state');
        }

        $result = $this->finish($flow, $request->query('code'), $request->query('error'));
        if (is_string($result)) {
            DB::table('oauth_flows')->where('id', $flow->id)->delete();

            return Oidc::withQuery($flow->return_to, 'error', $result);
        }
        [$subject, $email] = $result;
        $code = Oidc::randomToken();
        DB::table('oauth_flows')->where('id', $flow->id)->update([
            'result_hash' => Oidc::hashToken($code),
            'result_subject' => $subject,
            'result_email' => $email,
            'nonce' => null,
            'server_verifier' => null,
            'expires_at' => now()->addSeconds(self::RESULT_TTL),
        ]);

        return Oidc::withQuery($flow->return_to, 'code', $code);
    }

    /** 認証サーバーから受け取ったものを確かめ、[sub, email] を返す。失敗したときはクライアントに返す理由 */
    private function finish(object $flow, mixed $code, mixed $error): array|string
    {
        if ($error !== null) {
            return 'cancelled';
        }
        if (! is_string($code) || $code === '' || ! $flow->nonce || ! $flow->server_verifier) {
            return 'failed';
        }
        try {
            $idToken = Oidc::exchangeCode($code, $flow->server_verifier);
        } catch (Throwable $e) {
            Log::warning('sso token exchange failed: '.$e->getMessage());

            return 'failed';
        }
        try {
            $claims = Oidc::verify($idToken, $flow->nonce);
        } catch (Rejected $e) {
            if ($e->reason === 'mfa_required') {
                Log::info('sso: login without MFA was rejected');

                return 'mfa_required';
            }
            Log::warning("sso id_token rejected: {$e->reason}");

            return 'failed';
        } catch (Throwable $e) {
            Log::warning('sso id_token could not be verified: '.$e->getMessage());

            return 'failed';
        }
        if ($flow->mode === 'login') {
            $linked = DB::table('user_identities')->where('provider', Oidc::PROVIDER)->where('subject', $claims['sub'])->exists();
            if (! $linked) {
                Log::info('sso login: account is not linked');

                return 'not_linked';
            }
        }
        $email = is_string($claims['email'] ?? null) ? $claims['email'] : null;

        return [$claims['sub'], $email];
    }

    /** 結果コードを、開始したクライアントの code_verifier と引き換える */
    public function exchange(Request $request): JsonResponse
    {
        $this->ensureEnabled();
        $code = trim((string) $request->input('code', ''));
        $verifier = (string) $request->input('code_verifier', '');
        // 結果コードは 1 回だけ使える。code_verifier が違っても消す (総当たりさせない)
        $flow = DB::transaction(function () use ($code) {
            $flow = DB::table('oauth_flows')->where('result_hash', Oidc::hashToken($code))->where('expires_at', '>', now())
                ->lockForUpdate()->first();
            if ($flow) {
                DB::table('oauth_flows')->where('id', $flow->id)->delete();
            }

            return $flow;
        });
        if (! $flow || ! Oidc::verifyPkce($verifier, (string) $flow->client_challenge) || ! $flow->result_subject) {
            if ($flow) {
                Log::warning('sso exchange: code_verifier mismatch');
            }

            return $this->err(401, 'Unauthenticated.');
        }

        if ($flow->mode === 'login') {
            $identity = DB::table('user_identities')->where('provider', Oidc::PROVIDER)->where('subject', $flow->result_subject)->first();
            $user = $identity ? User::find($identity->user_id) : null;
            if (! $user) {
                return $this->err(401, 'Unauthenticated.');
            }
            DB::table('user_identities')->where('id', $identity->id)->update(['last_login_at' => now()]);
            Log::info("sso login succeeded user_id={$user->id}");

            return response()->json([
                'mode' => 'login',
                'token' => $user->issueApiToken('api', 'sso'),
                'user' => AuthController::userPayload($user),
            ]);
        }

        // 連携: ログイン中の本人と、連携を始めた本人が同じであること
        $me = $this->bearerUser($request);
        if (! $me) {
            return $this->err(401, 'Unauthenticated.');
        }
        if ((int) $flow->user_id !== (int) $me->id) {
            Log::warning("sso link: user mismatch user_id={$me->id}");

            return $this->err(403, 'この操作の権限がありません');
        }
        if (Oidc::linkDenied($me->email, config('sso.link_deny_email_domains'))) {
            return $this->err(400, 'デモ用のアカウントには SSO を連携できません');
        }
        $owner = DB::table('user_identities')->where('provider', Oidc::PROVIDER)->where('subject', $flow->result_subject)->first();
        if ($owner && (int) $owner->user_id !== (int) $me->id) {
            return $this->err(409, 'この SSO のアカウントは、ほかの利用者に連携されています');
        }
        if ($owner) {
            DB::table('user_identities')->where('id', $owner->id)->update(['email' => $flow->result_email, 'updated_at' => now()]);
        } else {
            if (DB::table('user_identities')->where('user_id', $me->id)->where('provider', Oidc::PROVIDER)->exists()) {
                return $this->err(409, '別の SSO のアカウントと連携済みです。解除してから連携してください');
            }
            DB::table('user_identities')->insert([
                'user_id' => $me->id,
                'provider' => Oidc::PROVIDER,
                'subject' => $flow->result_subject,
                'email' => $flow->result_email,
                'created_at' => now(),
                'updated_at' => now(),
            ]);
        }
        Log::info("sso account linked user_id={$me->id}");

        return response()->json(['mode' => 'link', 'email' => $flow->result_email]);
    }

    /** 交換は認証なしの経路なので、Bearer があれば自分で確かめる (「SSO だけ」も守らせる) */
    private function bearerUser(Request $request): ?User
    {
        $plain = $request->bearerToken();
        if (! $plain) {
            return null;
        }
        $token = \App\Models\ApiToken::where('token', \App\Models\ApiToken::hash($plain))->first();
        if (! $token || ! $token->user) {
            return null;
        }
        if (! \App\Http\Middleware\AuthenticateToken::loginMethodAllowed($token->user, $token->login_method ?? 'pwd')) {
            return null;
        }

        return $token->user;
    }

    /** 連携を始める。ブラウザの遷移では Bearer を送れないので、ここで使い捨ての intent を渡す */
    public function intent(Request $request): JsonResponse
    {
        $this->ensureEnabled();
        $me = $request->user();
        if (Oidc::linkDenied($me->email, config('sso.link_deny_email_domains'))) {
            return $this->err(400, 'デモ用のアカウントには SSO を連携できません');
        }
        $intent = Oidc::randomToken();
        DB::table('oauth_flows')->insert([
            'mode' => 'link',
            'user_id' => $me->id,
            'intent_hash' => Oidc::hashToken($intent),
            'expires_at' => now()->addSeconds(self::FLOW_TTL),
            'created_at' => now(),
        ]);

        return response()->json(['intent' => $intent]);
    }

    /** 自分の連携の一覧と、SSO が使えるか */
    public function identities(Request $request): JsonResponse
    {
        $me = $request->user();
        $rows = DB::table('user_identities')->where('user_id', $me->id)->orderBy('provider')
            ->get(['provider', 'email', 'created_at', 'last_login_at']);

        return response()->json([
            'sso_enabled' => Oidc::enabled(),
            'sso_name' => Oidc::enabled() ? Oidc::displayName() : null,
            'can_link' => Oidc::enabled() && ! Oidc::linkDenied($me->email, config('sso.link_deny_email_domains')),
            'identities' => $rows,
            'sso_only' => (bool) $me->sso_only,
            'login_method' => $request->attributes->get('login_method', 'pwd'),
        ]);
    }

    /** SSO の連携を解除する。「SSO だけ」も外す (連携がなければ SSO では入れないため) */
    public function unlink(Request $request): JsonResponse
    {
        $me = $request->user();
        $removed = DB::transaction(function () use ($me) {
            $n = DB::table('user_identities')->where('user_id', $me->id)->where('provider', Oidc::PROVIDER)->delete();
            DB::table('users')->where('id', $me->id)->update(['sso_only' => false]);

            return $n;
        });
        if ($removed > 0) {
            Log::info("sso account unlinked user_id={$me->id}");
        }

        return response()->json(['unlinked' => $removed > 0]);
    }

    /**
     * 「SSO だけでログインする」を切り替える。オンにできるのは、連携していて、いま SSO でログインしている人だけ。
     * オンにすると、パスワードで入っていたほかの端末のログインもその時点で切れる (AuthenticateToken が確かめる)
     */
    public function setSsoOnly(Request $request): JsonResponse
    {
        $this->ensureEnabled();
        $me = $request->user();
        $enabled = (bool) $request->boolean('enabled');
        if ($enabled) {
            if (! DB::table('user_identities')->where('user_id', $me->id)->where('provider', Oidc::PROVIDER)->exists()) {
                return $this->err(400, '先に SSO のアカウントを連携してください');
            }
            if ($request->attributes->get('login_method') !== 'sso') {
                return $this->err(400, 'SSO でログインし直してから有効にしてください (SSO で入れることを確かめるため)');
            }
        }
        DB::table('users')->where('id', $me->id)->update(['sso_only' => $enabled]);
        Log::info("sso-only changed user_id={$me->id} enabled=".($enabled ? 'true' : 'false'));

        return response()->json(['sso_only' => $enabled]);
    }
}
