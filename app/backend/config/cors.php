<?php

return [

    'paths' => ['api/*', 'up'],

    'allowed_methods' => ['*'],

    // 開発時の Web (Next.js) / Mobile (Expo Web) を許可。
    // 本番では公開 URL に絞ること。
    'allowed_origins' => [
        'http://localhost',        // nginx (port 80) 経由
        'http://127.0.0.1',
        'http://localhost:3000',   // Next.js production (docker-compose)
        'http://127.0.0.1:3000',
        'http://localhost:3001',   // Next.js dev (直接接続)
        'http://127.0.0.1:3001',
        'http://localhost:8081',   // Expo Web
        'http://127.0.0.1:8081',
        'http://localhost:19006',
    ],

    'allowed_origins_patterns' => [],

    'allowed_headers' => ['*'],

    'exposed_headers' => [],

    'max_age' => 0,

    'supports_credentials' => false,

];
