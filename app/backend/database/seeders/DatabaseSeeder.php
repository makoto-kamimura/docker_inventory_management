<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Item;
use App\Models\StorageLocation;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        // ログイン用サンプルユーザー (本番では必ずパスワードを変更すること)
        User::firstOrCreate(
            ['email' => 'admin@example.com'],
            ['name' => '管理者', 'password' => Hash::make('password')],
        );
        User::firstOrCreate(
            ['email' => 'user@example.com'],
            ['name' => '一般ユーザー', 'password' => Hash::make('password')],
        );

        $tools = Category::firstOrCreate(['name' => '工具']);
        $stationery = Category::firstOrCreate(['name' => '文房具']);

        Item::firstOrCreate(
            ['name' => 'ハンマー', 'category_id' => $tools->id],
            ['stock' => 5],
        );
        Item::firstOrCreate(
            ['name' => 'ドライバー', 'category_id' => $tools->id],
            ['stock' => 10],
        );
        Item::firstOrCreate(
            ['name' => 'ボールペン', 'category_id' => $stationery->id],
            ['stock' => 50],
        );

        StorageLocation::firstOrCreate(
            ['category_id' => $tools->id, 'description' => '2F 倉庫 棚A-3'],
        );
        StorageLocation::firstOrCreate(
            ['category_id' => $stationery->id, 'description' => '1F 事務室 引き出し左'],
        );
    }
}
