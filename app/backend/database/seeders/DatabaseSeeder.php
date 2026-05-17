<?php

namespace Database\Seeders;

use App\Models\Category;
use App\Models\Item;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    public function run(): void
    {
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
    }
}
