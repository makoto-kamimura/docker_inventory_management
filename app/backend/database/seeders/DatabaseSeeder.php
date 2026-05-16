<?php

namespace Database\Seeders;

use App\Models\User;
use Illuminate\Database\Console\Seeds\WithoutModelEvents;
use Illuminate\Database\Seeder;

class DatabaseSeeder extends Seeder
{
    use WithoutModelEvents;

    /**
     * Seed the application's database.
     */
    // public function run(): void
    // {
    //     // User::factory(10)->create();

    //     User::factory()->create([
    //         'name' => 'Test User',
    //         'email' => 'test@example.com',
    //     ]);
    // }

    public function run(): void
    {
        $category = \App\Models\Category::create(['name' => '工具']);
        $equipment = \App\Models\Equipment::create([
            'name' => 'ハンマー',
            'category_id' => $category->id
        ]);
        \App\Models\EquipmentStock::create([
            'equipment_id' => $equipment->id,
            'stock' => 5
        ]);
    }
}
