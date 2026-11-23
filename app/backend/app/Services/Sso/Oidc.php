<?php

namespace App\Services\Sso;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

/**
 * SSO (OpenID Connect) のクライアント。接続先は設定の発行元 (OIDC_ISSUER) だけで決まり、
 * エンドポイントと公開鍵は /.well-known/openid-configuration から読む。
 *
 * 乗っ取りを防ぐ要 (docker_auth_server の docs/runbooks/app-integration.md の 2.2):
 * - ID トークンは公開鍵 (JWKS) で署名を確かめ、iss・aud・exp・nonce も確かめる
 * - 利用者の特定には sub だけを使う
 * - 戻ったあとは使い捨ての結果コードを返し、開始したクライアントの code_verifier と引き換える
 */
class Oidc
{
    public const PROVIDER = 'sso';

    /** 設定の公開と公開鍵を読み直す間隔 (秒) */
    private const CACHE_TTL = 3600;

    /** 知らない kid のときに公開鍵を読み直してよい最短の間隔 (秒) */
    private const JWKS_FORCE_REFRESH_MIN = 10;

    /** 時計のずれの許容 (秒) */
    private const LEEWAY = 60;

    /** ID トークンの署名に許す方式。共通鍵 (HS*) と none は許さない */
    private const ALLOWED_ALGS = ['RS256', 'RS384', 'RS512', 'PS256', 'PS384', 'PS512', 'ES256', 'EdDSA'];

    public static function enabled(): bool
    {
        return config('sso.issuer') !== '' && config('sso.client_id') !== '' && config('sso.client_secret') !== '';
    }

    public static function displayName(): string
    {
        return (string) config('sso.display_name', 'SSO');
    }

    public static function callbackUrl(): string
    {
        return config('sso.public_base_url').'/api/auth/sso/callback';
    }

    public static function webReturnUrl(): string
    {
        return config('sso.public_base_url').'/auth/sso/complete';
    }

    // ---------------------------------------------------------------------
    // 乱数・PKCE・戻り先
    // ---------------------------------------------------------------------

    public static function b64url(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }

    /** 推測できない 32 バイトの乱数 (base64url、43 文字) */
    public static function randomToken(): string
    {
        return self::b64url(random_bytes(32));
    }

    /** DB に保存するためのハッシュ。トークンそのものは保存しない */
    public static function hashToken(string $token): string
    {
        return self::b64url(hash('sha256', $token, true));
    }

    public static function pkceChallenge(string $verifier): string
    {
        return self::b64url(hash('sha256', $verifier, true));
    }

    public static function isValidVerifier(string $v): bool
    {
        return (bool) preg_match('/^[A-Za-z0-9\-._~]{43,128}$/', $v);
    }

    public static function isValidChallenge(string $c): bool
    {
        return (bool) preg_match('/^[A-Za-z0-9\-_]{43}$/', $c);
    }

    public static function verifyPkce(string $verifier, string $challenge): bool
    {
        return self::isValidVerifier($verifier) && hash_equals($challenge, self::pkceChallenge($verifier));
    }

    /** モバイルの戻り先が許可リストの先頭に一致するか (http・https・フラグメント付きは拒否) */
    public static function mobileRedirectAllowed(string $uri, array $prefixes): bool
    {
        $scheme = parse_url($uri, PHP_URL_SCHEME);
        if (! is_string($scheme) || in_array(strtolower($scheme), ['http', 'https'], true) || str_contains($uri, '#')) {
            return false;
        }
        foreach ($prefixes as $p) {
            if ($p !== '' && str_starts_with($uri, $p)) {
                return true;
            }
        }

        return false;
    }

    /** 戻り先の URL にクエリを 1 つ足す */
    public static function withQuery(string $base, string $key, string $value): string
    {
        $sep = str_contains($base, '?') ? '&' : '?';

        return $base.$sep.rawurlencode($key).'='.rawurlencode($value);
    }

    /** このメールアドレスの利用者に連携させないか (デモ用アカウント) */
    public static function linkDenied(string $email, array $denyDomains): bool
    {
        $email = strtolower(trim($email));
        $at = strrpos($email, '@');
        if ($at === false) {
            return true;
        }

        return in_array(substr($email, $at + 1), $denyDomains, true);
    }

    // ---------------------------------------------------------------------
    // ID トークンの確認
    // ---------------------------------------------------------------------

    /** 公開鍵の一覧 (JWKS) から、読めた鍵だけを kid => Key にする (知らない種類の鍵が混じっていても全体を捨てない) */
    public static function parseJwks(array $jwks): array
    {
        $keys = [];
        foreach ($jwks['keys'] ?? [] as $jwk) {
            if (! is_array($jwk) || empty($jwk['kid']) || empty($jwk['alg'])) {
                continue;
            }
            try {
                $key = JWK::parseKey($jwk);
                if ($key instanceof Key) {
                    $keys[$jwk['kid']] = $key;
                }
            } catch (Throwable) {
                // 使えない鍵は飛ばす
            }
        }

        return $keys;
    }

    /** ID トークンのヘッダー (署名を確かめる前に、方式と kid を見るため) */
    public static function header(string $jwt): ?array
    {
        $parts = explode('.', $jwt);
        if (count($parts) !== 3) {
            return null;
        }
        $json = base64_decode(strtr($parts[0], '-_', '+/'), true);
        $h = $json === false ? null : json_decode($json, true);

        return is_array($h) ? $h : null;
    }

    /**
     * ID トークンの署名と中身を確かめる。成功なら claims、失敗なら理由 (例外) を返す。
     *
     * @param  array<string, Key>  $keys
     *
     * @throws Rejected
     */
    public static function verifyIdToken(string $jwt, array $keys, string $issuer, string $clientId, string $nonce, bool $requireMfa): array
    {
        $h = self::header($jwt) ?? throw new Rejected('header');
        $alg = (string) ($h['alg'] ?? '');
        if (! in_array($alg, self::ALLOWED_ALGS, true)) {
            throw new Rejected('alg');
        }
        $kid = (string) ($h['kid'] ?? '');
        if ($kid === '') {
            throw new Rejected('kid');
        }
        if (! isset($keys[$kid])) {
            throw new Rejected('unknown_kid');
        }
        // 鍵の方式とトークンの方式が一致すること (RS 鍵で別の方式を名乗らせない)
        if ($keys[$kid]->getAlgorithm() !== $alg) {
            throw new Rejected('alg_mismatch');
        }

        JWT::$leeway = self::LEEWAY;
        try {
            $claims = (array) JWT::decode($jwt, $keys);
        } catch (\Firebase\JWT\ExpiredException) {
            throw new Rejected('exp');
        } catch (\Firebase\JWT\SignatureInvalidException) {
            throw new Rejected('signature');
        } catch (Throwable) {
            throw new Rejected('claims');
        }

        if (! isset($claims['exp'])) {
            throw new Rejected('exp');
        }
        // 設定の公開に書かれた発行元と完全に一致すること
        if (($claims['iss'] ?? null) !== $issuer) {
            throw new Rejected('iss');
        }
        $aud = $claims['aud'] ?? null;
        $auds = is_array($aud) ? $aud : [$aud];
        if (! in_array($clientId, $auds, true)) {
            throw new Rejected('aud');
        }
        if (count($auds) > 1 && ($claims['azp'] ?? null) !== $clientId) {
            throw new Rejected('azp');
        }
        if (! is_string($claims['nonce'] ?? null) || ! hash_equals($nonce, $claims['nonce'])) {
            throw new Rejected('nonce');
        }
        $sub = $claims['sub'] ?? '';
        if (! is_string($sub) || $sub === '' || strlen($sub) > 255) {
            throw new Rejected('sub');
        }
        $amr = is_array($claims['amr'] ?? null) ? $claims['amr'] : [];
        if ($requireMfa && ! in_array('mfa', $amr, true)) {
            throw new Rejected('mfa_required');
        }

        return $claims;
    }

    /** 末尾の / だけが違う発行元は同じとみなす (設定の書き方の揺れ) */
    public static function sameIssuer(string $a, string $b): bool
    {
        return rtrim($a, '/') === rtrim($b, '/');
    }

    // ---------------------------------------------------------------------
    // 認証サーバーとの通信 (起動時には取りに行かない)
    // ---------------------------------------------------------------------

    private static function getJson(string $url): array
    {
        $res = Http::timeout(10)->withOptions(['allow_redirects' => false])->acceptJson()->get($url);
        if (! $res->successful()) {
            throw new RuntimeException("GET {$url} returned {$res->status()}");
        }
        $json = $res->json();
        if (! is_array($json)) {
            throw new RuntimeException("GET {$url}: not JSON");
        }

        return $json;
    }

    /** 設定の公開を読む。発行元が設定と違う、エンドポイントが発行元と別のオリジン、なら使わない */
    public static function metadata(): array
    {
        return Cache::remember('sso:metadata', self::CACHE_TTL, function () {
            $issuer = (string) config('sso.issuer');
            $meta = self::getJson(rtrim($issuer, '/').'/.well-known/openid-configuration');
            foreach (['issuer', 'authorization_endpoint', 'token_endpoint', 'jwks_uri'] as $k) {
                if (! is_string($meta[$k] ?? null) || $meta[$k] === '') {
                    throw new RuntimeException("discovery document has no {$k}");
                }
            }
            if (! self::sameIssuer($meta['issuer'], $issuer)) {
                throw new RuntimeException("discovery issuer {$meta['issuer']} does not match OIDC_ISSUER");
            }
            $origin = self::origin($meta['issuer']);
            foreach (['authorization_endpoint', 'token_endpoint', 'jwks_uri'] as $k) {
                if (self::origin($meta[$k]) !== $origin) {
                    throw new RuntimeException("{$k} is not on the issuer's origin");
                }
            }

            return $meta;
        });
    }

    private static function origin(string $url): string
    {
        $p = parse_url($url);

        return strtolower(($p['scheme'] ?? '').'://'.($p['host'] ?? '').(isset($p['port']) ? ':'.$p['port'] : ''));
    }

    /** @return array<string, Key> */
    private static function jwks(bool $force): array
    {
        $cached = Cache::get('sso:jwks');
        $fetchedAt = (int) Cache::get('sso:jwks_at', 0);
        $age = now()->getTimestamp() - $fetchedAt;
        if (is_array($cached) && (($age < self::CACHE_TTL && ! $force) || ($force && $age < self::JWKS_FORCE_REFRESH_MIN))) {
            return self::parseJwks($cached);
        }
        $raw = self::getJson(self::metadata()['jwks_uri']);
        if (self::parseJwks($raw) === []) {
            throw new RuntimeException('JWKS has no usable keys');
        }
        Cache::put('sso:jwks', $raw, self::CACHE_TTL);
        Cache::put('sso:jwks_at', now()->getTimestamp(), self::CACHE_TTL);

        return self::parseJwks($raw);
    }

    public static function authorizationUrl(string $state, string $nonce, string $serverChallenge): string
    {
        $q = http_build_query([
            'client_id' => config('sso.client_id'),
            'redirect_uri' => self::callbackUrl(),
            'response_type' => 'code',
            'scope' => config('sso.scope'),
            'state' => $state,
            'nonce' => $nonce,
            'code_challenge' => $serverChallenge,
            'code_challenge_method' => 'S256',
        ], '', '&', PHP_QUERY_RFC3986);
        $endpoint = self::metadata()['authorization_endpoint'];

        return $endpoint.(str_contains($endpoint, '?') ? '&' : '?').$q;
    }

    /** 認可コードを交換して ID トークンを返す */
    public static function exchangeCode(string $code, string $serverVerifier): string
    {
        $res = Http::timeout(10)->withOptions(['allow_redirects' => false])->asForm()->acceptJson()
            ->post(self::metadata()['token_endpoint'], [
                'grant_type' => 'authorization_code',
                'code' => $code,
                'redirect_uri' => self::callbackUrl(),
                'client_id' => config('sso.client_id'),
                'client_secret' => config('sso.client_secret'),
                'code_verifier' => $serverVerifier,
            ]);
        if (! $res->successful()) {
            // 応答には秘密は含まれない (error と error_description だけ)
            throw new RuntimeException('token endpoint returned '.$res->status().': '.substr($res->body(), 0, 200));
        }
        $idToken = $res->json('id_token');
        if (! is_string($idToken) || $idToken === '') {
            throw new RuntimeException('token response has no id_token');
        }

        return $idToken;
    }

    /**
     * ID トークンを確かめる。知らない鍵 (鍵の入れ替え直後) なら、公開鍵を 1 回だけ読み直す
     *
     * @throws Rejected
     */
    public static function verify(string $idToken, string $nonce): array
    {
        $issuer = self::metadata()['issuer'];
        $check = fn (array $keys) => self::verifyIdToken(
            $idToken, $keys, $issuer, (string) config('sso.client_id'), $nonce, (bool) config('sso.require_mfa')
        );
        try {
            return $check(self::jwks(false));
        } catch (Rejected $e) {
            if ($e->reason !== 'unknown_kid') {
                throw $e;
            }

            return $check(self::jwks(true));
        }
    }
}
