<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void
    {
        // 保管場所をカテゴリではなく品目に紐づけるため category_id の外部キー制約を解除し nullable 化
        Schema::table('storage_locations', function (Blueprint $table) {
            $table->dropForeign(['category_id']);
            $table->unsignedBigInteger('category_id')->nullable()->change();
        });

        // 品目に保管場所を直接紐づける（保管場所が削除されても品目は残す）
        Schema::table('items', function (Blueprint $table) {
            $table->foreignId('storage_location_id')
                ->nullable()
                ->after('group_id')
                ->constrained('storage_locations')
                ->nullOnDelete();
        });
    }

    public function down(): void
    {
        Schema::table('items', function (Blueprint $table) {
            $table->dropForeign(['storage_location_id']);
            $table->dropColumn('storage_location_id');
        });

        Schema::table('storage_locations', function (Blueprint $table) {
            $table->unsignedBigInteger('category_id')->nullable(false)->change();
            $table->foreign('category_id')->references('id')->on('categories')->cascadeOnDelete();
        });
    }
};
