<?php

namespace Tests\Feature;

use App\Models\Tenant;
use App\Models\User;
use Firebase\JWT\JWT;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Http\Client\Request as HttpRequest;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/**
 * SSO (OpenID Connect) の通しのテスト。偽の認証サーバー (設定の公開・公開鍵・トークン) を Http::fake で立て、
 * ID トークンは本物の RSA / Ed25519 の鍵で署名する。認可コードには「sub・nonce・API 向けの code_challenge・
 * 署名のしかた」を JSON にして base64url にしたものを使い、偽のトークンエンドポイントがそれに合う ID トークンを返す。
 */
class SsoTest extends TestCase
{
    use RefreshDatabase;

    private const ISS = 'https://idp.test/auth/v1/';

    private string $rsaPem;

    private array $rsaJwk;

    private string $edSecret;

    private array $edJwk;

    private string $evilPem;

    private bool $publishRotated = false;

    private string $rotatedSecret;

    private array $rotatedJwk;

    private int $jwksHits = 0;

    protected function setUp(): void
    {
        parent::setUp();
        config([
            'sso.issuer' => self::ISS,
            'sso.client_id' => 'inventory',
            'sso.client_secret' => 'test-secret',
            'sso.public_base_url' => 'https://inventory.test',
            'sso.require_mfa' => true,
            'sso.mobile_redirect_prefixes' => ['inventory://', 'exp://'],
            'sso.link_deny_email_domains' => ['example.com'],
            'sso.allow_password_for_sso_only' => false,
        ]);

        [$this->rsaPem, $this->rsaJwk] = $this->rsaKey('rsa1');
        [$this->evilPem] = $this->rsaKey('evil');
        [$this->edSecret, $this->edJwk] = $this->edKey('ed1');
        [$this->rotatedSecret, $this->rotatedJwk] = $this->edKey('rotated');

        Http::fake(fn (HttpRequest $r) => $this->fakeIdp($r));
    }

    private function rsaKey(string $kid): array
    {
        $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        openssl_pkey_export($key, $pem);
        $d = openssl_pkey_get_details($key)['rsa'];
        $b64 = fn ($v) => rtrim(strtr(base64_encode($v), '+/', '-_'), '=');

        return [$pem, ['kty' => 'RSA', 'alg' => 'RS256', 'use' => 'sig', 'kid' => $kid, 'n' => $b64($d['n']), 'e' => $b64($d['e'])]];
    }

    private function edKey(string $kid): array
    {
        $pair = sodium_crypto_sign_keypair();
        $pub = sodium_crypto_sign_publickey($pair);

        return [base64_encode(sodium_crypto_sign_secretkey($pair)), [
            'kty' => 'OKP', 'crv' => 'Ed25519', 'alg' => 'EdDSA', 'use' => 'sig', 'kid' => $kid,
            'x' => rtrim(strtr(base64_encode($pub), '+/', '-_'), '='),
        ]];
    }

    private function fakeIdp(HttpRequest $r)
    {
        $url = $r->url();
        if (str_ends_with($url, '/.well-known/openid-configuration')) {
            return Http::response([
                'issuer' => self::ISS,
                'authorization_endpoint' => 'https://idp.test/auth/v1/oidc/authorize',
                'token_endpoint' => 'https://idp.test/auth/v1/oidc/token',
                'jwks_uri' => 'https://idp.test/auth/v1/oidc/certs',
            ]);
        }
        if (str_ends_with($url, '/oidc/certs')) {
            $this->jwksHits++;
            $keys = [$this->rsaJwk, $this->edJwk, ['kty' => 'XYZ', 'kid' => 'broken', 'alg' => 'XYZ']];
            if ($this->publishRotated) {
                $keys[] = $this->rotatedJwk;
            }

            return Http::response(['keys' => $keys]);
        }
        if (str_ends_with($url, '/oidc/token')) {
            parse_str($r->body(), $form);
            $code = json_decode(base64_decode(strtr($form['code'], '-_', '+/')), true);
            $challenge = rtrim(strtr(base64_encode(hash('sha256', $form['code_verifier'], true)), '+/', '-_'), '=');
            $ok = $form['client_id'] === 'inventory' && $form['client_secret'] === 'test-secret'
                && $form['redirect_uri'] === 'https://inventory.test/api/auth/sso/callback'
                && $challenge === $code['server_challenge'];
            if (! $ok) {
                return Http::response(['error' => 'invalid_grant'], 400);
            }
            $now = time();
            $claims = [
                'iss' => $code['iss'] ?? self::ISS, 'aud' => $code['aud'] ?? 'inventory', 'sub' => $code['sub'],
                'iat' => $now, 'exp' => $code['exp'] ?? $now + 300, 'nonce' => $code['nonce'],
                'email' => 'family@gmail.com', 'amr' => $code['amr'] ?? ['mfa'],
            ];
            $kid = $code['kid'] ?? 'rsa1';
            $alg = $code['alg'] ?? 'RS256';
            $key = match ($code['key'] ?? $kid) {
                'rsa1' => $this->rsaPem, 'evil' => $this->evilPem, 'ed1' => $this->edSecret, 'rotated' => $this->rotatedSecret,
            };

            return Http::response(['id_token' => JWT::encode($claims, $key, $alg, $kid), 'token_type' => 'Bearer']);
        }

        return Http::response('not found', 404);
    }

    // --- 補助 ---------------------------------------------------------------

    private static function b64(string $s): string
    {
        return rtrim(strtr(base64_encode($s), '+/', '-_'), '=');
    }

    private function pkce(): array
    {
        $v = self::b64(random_bytes(32));

        return [$v, self::b64(hash('sha256', $v, true))];
    }

    private function user(string $email): User
    {
        $tenant = Tenant::firstOrCreate(['name' => 'family']);

        return User::create(['name' => explode('@', $email)[0], 'email' => $email, 'password' => 'password-123', 'tenant_id' => $tenant->id]);
    }

    private function passwordToken(string $email): string
    {
        return $this->postJson('/api/login', ['email' => $email, 'password' => 'password-123'])->assertOk()->json('token');
    }

    private function query(string $url): array
    {
        parse_str((string) parse_url($url, PHP_URL_QUERY), $q);

        return $q;
    }

    /** 開始 → 戻り。[結果コード, verifier, 戻り先] */
    private function flow(string $mode, string $sub, ?string $token = null, string $client = 'web', ?string $redirect = null, array $extra = []): array
    {
        [$verifier, $challenge] = $this->pkce();
        $q = ['mode' => $mode, 'client' => $client, 'code_challenge' => $challenge];
        if ($redirect) {
            $q['redirect_uri'] = $redirect;
        }
        if ($mode === 'link') {
            $q['intent'] = $this->withToken($token)->postJson('/api/me/identities/sso/intent')->assertOk()->json('intent');
            $this->flushHeaders();
        }
        $start = $this->get('/api/auth/sso/start?'.http_build_query($q));
        $start->assertStatus(303);
        $ap = $this->query($start->headers->get('Location'));
        $code = self::b64(json_encode(['sub' => $sub, 'nonce' => $ap['nonce'], 'server_challenge' => $ap['code_challenge']] + $extra));
        $back = $this->get('/api/auth/sso/callback?'.http_build_query(['state' => $ap['state'], 'code' => $code]));
        $loc = (string) $back->headers->get('Location');

        return [$this->query($loc)['code'] ?? null, $verifier, $loc];
    }

    private function exchange(?string $code, string $verifier, ?string $token = null)
    {
        $req = $token ? $this->withToken($token) : $this;
        $res = $req->postJson('/api/auth/sso/exchange', ['code' => $code, 'code_verifier' => $verifier]);
        $this->flushHeaders();

        return $res;
    }

    private function linked(string $email, string $sub): array
    {
        $this->user($email);
        $token = $this->passwordToken($email);
        [$code, $v] = $this->flow('link', $sub, $token);
        $this->exchange($code, $v, $token)->assertOk()->assertJson(['mode' => 'link']);

        return [$token];
    }

    // --- テスト -------------------------------------------------------------

    public function test_providers_and_disabled_state(): void
    {
        $this->getJson('/api/auth/providers')->assertOk()->assertJson(['sso' => true, 'sso_name' => 'SSO']);
        config(['sso.client_secret' => '']);
        $this->getJson('/api/auth/providers')->assertJson(['sso' => false]);
        $this->get('/api/auth/sso/start?mode=login&client=web&code_challenge=x')->assertNotFound();
    }

    public function test_start_validates_input_and_redirects_to_idp(): void
    {
        [, $c] = $this->pkce();
        $this->get('/api/auth/sso/start?mode=login&client=web&code_challenge=short')->assertStatus(400);
        $this->get('/api/auth/sso/start?'.http_build_query(['mode' => 'login', 'client' => 'mobile', 'code_challenge' => $c, 'redirect_uri' => 'https://evil.example/cb']))->assertStatus(400);
        $this->get('/api/auth/sso/start?'.http_build_query(['mode' => 'login', 'client' => 'desktop', 'code_challenge' => $c]))->assertStatus(400);
        $res = $this->get('/api/auth/sso/start?'.http_build_query(['mode' => 'login', 'client' => 'web', 'code_challenge' => $c]));
        $res->assertStatus(303);
        $loc = $res->headers->get('Location');
        $q = $this->query($loc);
        $this->assertStringStartsWith('https://idp.test/auth/v1/oidc/authorize?', $loc);
        $this->assertSame('inventory', $q['client_id']);
        $this->assertSame('https://inventory.test/api/auth/sso/callback', $q['redirect_uri']);
        $this->assertSame('S256', $q['code_challenge_method']);
        $this->assertSame('openid email profile', $q['scope']);
        $this->assertNotSame($c, $q['code_challenge'], 'API 向けの PKCE はクライアントのものと別');
    }

    public function test_id_token_checks(): void
    {
        [, , $loc] = $this->flow('login', 'sub-1');
        $this->assertStringContainsString('error=not_linked', $loc);
        $cases = [
            ['key' => 'evil'],                                  // 公開されていない鍵
            ['kid' => 'nope', 'key' => 'rsa1'],                 // 知らない kid
            ['aud' => 'other-app'],
            ['iss' => 'https://evil.example/auth/v1/'],
            ['exp' => time() - 3600],
        ];
        foreach ($cases as $extra) {
            [, , $loc] = $this->flow('login', 'sub-1', extra: $extra);
            $this->assertStringContainsString('error=failed', $loc, json_encode($extra));
        }
        [, , $loc] = $this->flow('login', 'sub-1', extra: ['amr' => ['pwd']]);
        $this->assertStringContainsString('error=mfa_required', $loc);
    }

    public function test_callback_cancel_and_state_reuse(): void
    {
        [, $c] = $this->pkce();
        $start = $this->get('/api/auth/sso/start?'.http_build_query(['mode' => 'login', 'client' => 'web', 'code_challenge' => $c]));
        $ap = $this->query($start->headers->get('Location'));
        $this->get('/api/auth/sso/callback?'.http_build_query(['state' => $ap['state'], 'error' => 'access_denied']))
            ->assertRedirectContains('error=cancelled');
        $this->get('/api/auth/sso/callback?'.http_build_query(['state' => $ap['state'], 'code' => 'x']))->assertStatus(400);
        $this->get('/api/auth/sso/callback?state=unknown&code=x')->assertStatus(400);
    }

    public function test_link_and_login(): void
    {
        $this->user('demo@example.com');
        $demo = $this->passwordToken('demo@example.com');
        $this->withToken($demo)->postJson('/api/me/identities/sso/intent')->assertStatus(400);
        $this->withToken($demo)->getJson('/api/me/identities')->assertJson(['can_link' => false]);
        $this->flushHeaders();

        $this->user('me@test.local');
        $this->user('other@test.local');
        $me = $this->passwordToken('me@test.local');
        $other = $this->passwordToken('other@test.local');

        [$code, $v] = $this->flow('link', 'sub-me', $me);
        $this->exchange($code, $v, $other)->assertStatus(403);
        [$code, $v] = $this->flow('link', 'sub-me', $me);
        $this->exchange($code, $v)->assertStatus(401);
        [$code, $v] = $this->flow('link', 'sub-me', $me);
        $this->exchange($code, $v, $me)->assertOk()->assertJson(['mode' => 'link', 'email' => 'family@gmail.com']);
        $this->withToken($me)->getJson('/api/me/identities')->assertJsonPath('identities.0.provider', 'sso')
            ->assertJsonPath('identities.0.email', 'family@gmail.com');
        $this->flushHeaders();

        [$code, $v] = $this->flow('link', 'sub-me', $other);
        $this->exchange($code, $v, $other)->assertStatus(409);
        [$code, $v] = $this->flow('link', 'sub-second', $me);
        $this->exchange($code, $v, $me)->assertStatus(409);

        [$code, $v] = $this->flow('login', 'sub-me');
        $this->exchange($code, $this->pkce()[0])->assertStatus(401);
        $this->exchange($code, $v)->assertStatus(401);   // 失敗した結果コードは焼却済み

        [$code, $v] = $this->flow('login', 'sub-me');
        $token = $this->exchange($code, $v)->assertOk()->assertJson(['mode' => 'login'])->json('token');
        $this->exchange($code, $v)->assertStatus(401);   // 再利用
        $this->withToken($token)->getJson('/api/me')->assertOk()->assertJson(['email' => 'me@test.local']);
        $this->flushHeaders();

        [$code, $v] = $this->flow('login', 'sub-me', extra: ['alg' => 'EdDSA', 'kid' => 'ed1']);
        $this->exchange($code, $v)->assertOk();
    }

    public function test_key_rotation_and_refresh_rate_limit(): void
    {
        $this->linked('me@test.local', 'sub-me');
        [$code, $v] = $this->flow('login', 'sub-me');   // 公開鍵を読み込んでおく
        $this->exchange($code, $v)->assertOk();
        $this->publishRotated = true;
        $this->travel(11)->seconds();
        $hits = $this->jwksHits;
        [$code, $v] = $this->flow('login', 'sub-me', extra: ['alg' => 'EdDSA', 'kid' => 'rotated']);
        $this->exchange($code, $v)->assertOk();
        $this->assertSame($hits + 1, $this->jwksHits, '新しい kid で 1 回だけ読み直す');
        $hits = $this->jwksHits;
        [, , $loc] = $this->flow('login', 'sub-me', extra: ['kid' => 'nope2', 'key' => 'rsa1']);
        $this->assertStringContainsString('error=failed', $loc);
        $this->assertSame($hits, $this->jwksHits, '直後の知らない kid では読み直さない');
    }

    public function test_mobile_flow(): void
    {
        $this->linked('me@test.local', 'sub-me');
        [$code, $v, $loc] = $this->flow('login', 'sub-me', client: 'mobile', redirect: 'exp://10.0.0.5:8092/--/auth/sso');
        $this->assertStringStartsWith('exp://10.0.0.5:8092/--/auth/sso?code=', $loc);
        $this->exchange($code, $v)->assertOk()->assertJson(['mode' => 'login']);
        [, , $loc] = $this->flow('login', 'sub-me', client: 'mobile', redirect: 'inventory://auth/sso', extra: ['amr' => ['pwd']]);
        $this->assertSame('inventory://auth/sso?error=mfa_required', $loc);
    }

    public function test_sso_only(): void
    {
        [$pwd] = $this->linked('me@test.local', 'sub-me');
        $this->user('other@test.local');
        $other = $this->passwordToken('other@test.local');
        [$code, $v] = $this->flow('login', 'sub-me');
        $sso = $this->exchange($code, $v)->json('token');

        $this->withToken($sso)->getJson('/api/me/identities')->assertJson(['login_method' => 'sso', 'sso_only' => false]);
        $this->flushHeaders();
        $this->withToken($pwd)->putJson('/api/me/sso-only', ['enabled' => true])->assertStatus(400);
        $this->flushHeaders();
        $this->withToken($other)->putJson('/api/me/sso-only', ['enabled' => true])->assertStatus(400);
        $this->flushHeaders();
        $this->withToken($sso)->putJson('/api/me/sso-only', ['enabled' => true])->assertOk()->assertJson(['sso_only' => true]);
        $this->flushHeaders();

        $this->postJson('/api/login', ['email' => 'me@test.local', 'password' => 'password-123'])->assertStatus(403)
            ->assertJsonFragment(['message' => 'このアカウントは SSO でのみログインできます。「SSO でログイン」を使ってください']);
        $this->postJson('/api/login', ['email' => 'me@test.local', 'password' => 'wrong'])->assertStatus(422);
        $this->withToken($pwd)->getJson('/api/me')->assertStatus(401);   // 既存のパスワードのトークン
        $this->flushHeaders();
        $this->withToken($sso)->getJson('/api/me')->assertOk();
        $this->withToken($sso)->getJson('/api/me/identities')->assertJson(['sso_only' => true]);

        // 非常用の切り替え
        config(['sso.allow_password_for_sso_only' => true]);
        $this->flushHeaders();
        $this->postJson('/api/login', ['email' => 'me@test.local', 'password' => 'password-123'])->assertOk();
        config(['sso.allow_password_for_sso_only' => false]);

        // 解除すると「SSO だけ」も外れる
        $this->withToken($sso)->deleteJson('/api/me/identities/sso')->assertOk()->assertJson(['unlinked' => true]);
        $this->flushHeaders();
        [, , $loc] = $this->flow('login', 'sub-me');
        $this->assertStringContainsString('error=not_linked', $loc);
        $this->postJson('/api/login', ['email' => 'me@test.local', 'password' => 'password-123'])->assertOk();
    }

    public function test_pure_helpers(): void
    {
        $this->assertSame('E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM', \App\Services\Sso\Oidc::pkceChallenge('dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk'));
        $p = ['inventory://', 'exp://'];
        $this->assertTrue(\App\Services\Sso\Oidc::mobileRedirectAllowed('inventory://auth/sso', $p));
        $this->assertFalse(\App\Services\Sso\Oidc::mobileRedirectAllowed('https://evil.example/', $p));
        $this->assertFalse(\App\Services\Sso\Oidc::mobileRedirectAllowed('inventory://auth/sso#x', $p));
        $this->assertFalse(\App\Services\Sso\Oidc::mobileRedirectAllowed('other://x', $p));
        $this->assertTrue(\App\Services\Sso\Oidc::linkDenied('Dad@EXAMPLE.com ', ['example.com']));
        $this->assertFalse(\App\Services\Sso\Oidc::linkDenied('me@gmail.com', ['example.com']));
        // HS256 と none は拒否
        $hs = JWT::encode(['sub' => 'x'], 'secret-secret-secret-secret-secret', 'HS256', 'rsa1');
        try {
            \App\Services\Sso\Oidc::verifyIdToken($hs, [], self::ISS, 'inventory', 'n', true);
            $this->fail('HS256 accepted');
        } catch (\App\Services\Sso\Rejected $e) {
            $this->assertSame('alg', $e->reason);
        }
    }
}
