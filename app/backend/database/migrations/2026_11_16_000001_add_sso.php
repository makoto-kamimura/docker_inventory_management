<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

// SSO (OpenID Connect)。共通の仕様は認証サーバーのリポジトリの docs/runbooks/app-integration.md
return new class extends Migration {
    public function up(): void
    {
        // 連携。利用者の特定には認証サーバーの不変の ID (sub) だけを使い、メールアドレスは表示用
        Schema::create('user_identities', function (Blueprint $table) {
            $table->id();
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->string('provider', 32);
            $table->string('subject', 255);
            $table->string('email')->nullable();
            $table->timestamp('last_login_at')->nullable();
            $table->timestamps();
            $table->unique(['provider', 'subject']);
            $table->unique(['user_id', 'provider']);
        });

        // 途中の状態。どのトークンもハッシュで持ち、1 回使ったら消す
        //   連携: intent → state (認証サーバーへ) → result (アプリへ) / ログイン: state → result
        Schema::create('oauth_flows', function (Blueprint $table) {
            $table->id();
            $table->string('mode', 8);
            $table->foreignId('user_id')->nullable()->constrained()->cascadeOnDelete();
            $table->string('intent_hash', 64)->nullable()->unique();
            $table->string('state_hash', 64)->nullable()->unique();
            $table->string('nonce', 64)->nullable();
            $table->string('server_verifier', 64)->nullable();
            $table->string('client_challenge', 64)->nullable();
            $table->text('return_to')->nullable();
            $table->string('result_hash', 64)->nullable()->unique();
            $table->string('result_subject', 255)->nullable();
            $table->string('result_email')->nullable();
            $table->timestamp('expires_at')->index();
            $table->timestamp('created_at')->useCurrent();
        });

        // 「SSO だけでログインする」(本人が選ぶ。連携を解除すると false に戻す)
        Schema::table('users', function (Blueprint $table) {
            $table->boolean('sso_only')->default(false);
        });

        // トークンのログイン方法 (pwd / sso)。「SSO だけ」の人のパスワードのトークンを使えなくするため
        Schema::table('api_tokens', function (Blueprint $table) {
            $table->string('login_method', 8)->default('pwd');
        });
    }

    public function down(): void
    {
        Schema::table('api_tokens', fn (Blueprint $table) => $table->dropColumn('login_method'));
        Schema::table('users', fn (Blueprint $table) => $table->dropColumn('sso_only'));
        Schema::dropIfExists('oauth_flows');
        Schema::dropIfExists('user_identities');
    }
};
