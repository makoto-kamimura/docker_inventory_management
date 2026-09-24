<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    // 公開デモのログイン (admin@example.com など) から実運用アカウントのデータが
    // 見えてしまっていたのを防ぐため、テナントごとにデータを分離する。
    private const DEMO_EMAILS = ['admin@example.com', 'user@example.com', 'demo@example.com'];

    public function up(): void
    {
        $demoId = DB::table('tenants')->where('name', 'demo')->value('id');
        $mainId = DB::table('tenants')->where('name', 'main')->value('id');

        Schema::table('users', function (Blueprint $table) {
            $table->foreignId('tenant_id')->nullable()->after('id')->constrained()->cascadeOnDelete();
        });
        DB::table('users')->whereIn('email', self::DEMO_EMAILS)->update(['tenant_id' => $demoId]);
        DB::table('users')->whereNull('tenant_id')->update(['tenant_id' => $mainId]);
        Schema::table('users', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id')->nullable(false)->change();
        });

        Schema::table('categories', function (Blueprint $table) {
            $table->foreignId('tenant_id')->nullable()->after('id')->constrained()->cascadeOnDelete();
        });
        DB::table('categories')->update(['tenant_id' => $mainId]);
        Schema::table('categories', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id')->nullable(false)->change();
            $table->dropUnique(['name']);
            $table->unique(['tenant_id', 'name']);
        });

        Schema::table('item_groups', function (Blueprint $table) {
            $table->foreignId('tenant_id')->nullable()->after('id')->constrained()->cascadeOnDelete();
        });
        DB::table('item_groups')->update(['tenant_id' => $mainId]);
        Schema::table('item_groups', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id')->nullable(false)->change();
            $table->unique(['tenant_id', 'name']);
        });

        Schema::table('storage_locations', function (Blueprint $table) {
            $table->foreignId('tenant_id')->nullable()->after('id')->constrained()->cascadeOnDelete();
        });
        DB::table('storage_locations')->update(['tenant_id' => $mainId]);
        Schema::table('storage_locations', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id')->nullable(false)->change();
        });

        Schema::table('items', function (Blueprint $table) {
            $table->foreignId('tenant_id')->nullable()->after('id')->constrained()->cascadeOnDelete();
        });
        DB::table('items')->update(['tenant_id' => $mainId]);
        Schema::table('items', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id')->nullable(false)->change();
            $table->dropUnique(['barcode']);
            $table->unique(['tenant_id', 'barcode']);
        });

        Schema::table('item_histories', function (Blueprint $table) {
            $table->foreignId('tenant_id')->nullable()->after('id')->constrained()->cascadeOnDelete();
        });
        DB::table('item_histories')->update(['tenant_id' => $mainId]);
        Schema::table('item_histories', function (Blueprint $table) {
            $table->unsignedBigInteger('tenant_id')->nullable(false)->change();
        });
    }

    public function down(): void
    {
        foreach (['item_histories', 'items', 'storage_locations', 'item_groups', 'categories', 'users'] as $tableName) {
            Schema::table($tableName, function (Blueprint $table) use ($tableName) {
                if ($tableName === 'categories') {
                    $table->dropUnique(['tenant_id', 'name']);
                    $table->unique('name');
                }
                if ($tableName === 'item_groups') {
                    $table->dropUnique(['tenant_id', 'name']);
                }
                if ($tableName === 'items') {
                    $table->dropUnique(['tenant_id', 'barcode']);
                    $table->unique('barcode');
                }
                $table->dropConstrainedForeignId('tenant_id');
            });
        }
    }
};
