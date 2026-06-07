<?php
use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration {
    public function up(): void {
        Schema::table('item_histories', function (Blueprint $table) {
            // 在庫0からの補充時に入力する金額 (円, 任意)。未入力は null。
            $table->unsignedInteger('amount')->nullable()->after('change');
        });
    }

    public function down(): void {
        Schema::table('item_histories', function (Blueprint $table) {
            $table->dropColumn('amount');
        });
    }
};
