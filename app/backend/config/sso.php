<?php

// SSO (OpenID Connect)。共通の仕様は認証サーバーのリポジトリ (docker_auth_server) の
// docs/runbooks/app-integration.md。発行元・クライアント ID・秘密がそろったときだけ有効。

$list = fn (string $name, string $default) => array_values(array_filter(array_map(
    'trim',
    explode(',', (string) env($name, $default))
), fn ($v) => $v !== ''));

$bool = fn (string $name, bool $default) => match (strtolower(trim((string) env($name, $default ? 'true' : 'false')))) {
    'true', '1', 'yes' => true,
    default => false,
};

return [
    'issuer' => trim((string) env('OIDC_ISSUER', '')),
    'client_id' => trim((string) env('OIDC_CLIENT_ID', '')),
    'client_secret' => trim((string) env('OIDC_CLIENT_SECRET', '')),
    // 外から見えるアプリの URL。認証サーバーに登録するリダイレクト URI は {public_base_url}/api/auth/sso/callback
    'public_base_url' => rtrim(trim((string) env('PUBLIC_BASE_URL', '')), '/'),
    'display_name' => trim((string) env('OIDC_DISPLAY_NAME', 'SSO')) ?: 'SSO',
    'scope' => trim((string) env('OIDC_SCOPE', 'openid email profile')) ?: 'openid email profile',
    // 2 段階認証 (ID トークンの amr に mfa) でログインした人だけを通す
    'require_mfa' => $bool('OIDC_REQUIRE_MFA', true),
    // モバイルの戻り先として許す URL の先頭
    'mobile_redirect_prefixes' => $list('OIDC_MOBILE_REDIRECT_PREFIXES', 'inventory://,exp://'),
    // このドメインのメールアドレスの利用者には連携させない (誰でも入れるデモ用アカウント)
    'link_deny_email_domains' => array_map('strtolower', $list('OIDC_LINK_DENY_EMAIL_DOMAINS', 'example.com')),
    // 非常用: true なら「SSO だけ」の人にもパスワードのログインを許す
    'allow_password_for_sso_only' => $bool('OIDC_ALLOW_PASSWORD_FOR_SSO_ONLY', false),
];
