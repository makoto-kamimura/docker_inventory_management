<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // 用途を絞ったトークン (Alexa など)。abilities が null のトークンは、今までどおりすべての API を使える
        Schema::table('api_tokens', function (Blueprint $table) {
            $table->json('abilities')->nullable();
            $table->timestamp('expires_at')->nullable();
        });

        // 増減がどこから行われたか (alexa など)。null は Web / モバイル (区別しない)
        Schema::table('item_histories', function (Blueprint $table) {
            $table->string('source', 16)->nullable();
        });
    }

    public function down(): void
    {
        Schema::table('item_histories', fn (Blueprint $table) => $table->dropColumn('source'));
        Schema::table('api_tokens', fn (Blueprint $table) => $table->dropColumn(['abilities', 'expires_at']));
    }
};
