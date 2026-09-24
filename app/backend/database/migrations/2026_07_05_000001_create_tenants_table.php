<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        Schema::create('tenants', function (Blueprint $table) {
            $table->id();
            $table->string('name')->unique();
            $table->timestamps();
        });

        // demo: 公開デモサイトの既存データ用。main: 実運用アカウント用。
        // どちらも構造上必須のマスタデータのため、seeder ではなくマイグレーションで作成する。
        DB::table('tenants')->insert([
            ['name' => 'demo', 'created_at' => now(), 'updated_at' => now()],
            ['name' => 'main', 'created_at' => now(), 'updated_at' => now()],
        ]);
    }

    public function down(): void
    {
        Schema::dropIfExists('tenants');
    }
};
