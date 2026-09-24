<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Item;
use App\Models\StorageLocation;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;
use Illuminate\Support\Facades\Hash;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
        // demo/main テナントは 2026_07_05_000001_create_tenants_table マイグレーションで作成済み。
        // 以下のサンプルデータは公開デモ用アカウントからのみ見える demo テナントに紐づける
        // (実運用の main テナントのデータと混ざらないようにするため)。
        $demoTenant = Tenant::where('name', 'demo')->firstOrFail();

        // ログイン用サンプルユーザー (本番では必ずパスワードを変更すること)
        User::firstOrCreate(
            ['email' => 'admin@example.com'],
            ['name' => '管理者', 'password' => Hash::make('password'), 'tenant_id' => $demoTenant->id],
        );
        User::firstOrCreate(
            ['email' => 'user@example.com'],
            ['name' => '一般ユーザー', 'password' => Hash::make('password'), 'tenant_id' => $demoTenant->id],
        );

        $tools = Category::firstOrCreate(['name' => '工具', 'tenant_id' => $demoTenant->id]);
        $stationery = Category::firstOrCreate(['name' => '文房具', 'tenant_id' => $demoTenant->id]);

        Item::firstOrCreate(
            ['name' => 'ハンマー', 'category_id' => $tools->id, 'tenant_id' => $demoTenant->id],
            ['stock' => 5],
        );
        Item::firstOrCreate(
            ['name' => 'ドライバー', 'category_id' => $tools->id, 'tenant_id' => $demoTenant->id],
            ['stock' => 10],
        );
        Item::firstOrCreate(
            ['name' => 'ボールペン', 'category_id' => $stationery->id, 'tenant_id' => $demoTenant->id],
            ['stock' => 50],
        );

        StorageLocation::firstOrCreate(
            ['category_id' => $tools->id, 'description' => '2F 倉庫 棚A-3', 'tenant_id' => $demoTenant->id],
        );
        StorageLocation::firstOrCreate(
            ['category_id' => $stationery->id, 'description' => '1F 事務室 引き出し左', 'tenant_id' => $demoTenant->id],
        );
    }
}
