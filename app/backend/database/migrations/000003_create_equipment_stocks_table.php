<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

return new class extends Migration
{
    public function up(): void
    {
        // Schema::create('equipment_stocks', function (Blueprint $table) {
        //     $table->id();
        //     $table->foreignId('equipment_id')->constrained()->onDelete('cascade');
        //     $table->integer('stock')->default(0);
        //     $table->timestamps(); // updated_at で在庫更新日時を管理
        // });
        Schema::create('equipment_stocks', function (Blueprint $table) {
            $table->id();
            // テーブル名を明示的に指定
            $table->foreignId('equipment_id')->constrained('equipments')->onDelete('cascade');
            $table->integer('stock')->default(0);
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('equipment_stocks');
    }
};