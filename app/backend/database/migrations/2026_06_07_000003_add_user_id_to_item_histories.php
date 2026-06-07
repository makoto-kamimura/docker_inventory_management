<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('item_histories', function (Blueprint $table) {
            // 更新を行ったユーザー (既存行や未認証ぶんは null = 不明)
            $table->foreignId('user_id')->nullable()->after('item_id')
                ->constrained()->nullOnDelete();
        });
    }

    public function down(): void {
        Schema::table('item_histories', function (Blueprint $table) {
            $table->dropConstrainedForeignId('user_id');
        });
    }
};
