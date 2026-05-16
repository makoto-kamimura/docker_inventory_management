<?php
use Illuminate\Support\Facades\Route;
// use App\Models\Equipment;
use App\Models\Category;
use App\Models\Equipment;
use Illuminate\Http\Request;

Route::get('/test', function() {
    return response()->json(['message' => 'API OK']);
});

// // 在庫確認API
// Route::get('/equipments/available', function() {
//     $equipments = Equipment::with('stock', 'category')
//         ->whereHas('stock', fn($q) => $q->where('stock', '>', 0))
//         ->get()
//         ->map(fn($e) => [
//             'id' => $e->id,
//             'name' => $e->name,
//             'category' => $e->category->name,
//             'stock' => $e->stock->stock
//         ]);
//     return response()->json($equipments);
// });

// // 在庫減少API
// Route::post('/equipments/{id}/decrease', function($id) {
//     $stock = \App\Models\EquipmentStock::where('equipment_id', $id)->first();
//     if(!$stock || $stock->stock <= 0){
//         return response()->json(['error'=>'在庫がありません'], 400);
//     }
//     $stock->stock -= 1;
//     $stock->save();
//     return response()->json(['message'=>'更新しました','stock'=>$stock->stock]);
// });

// カテゴリ一覧
Route::get('/categories', function() {
    return Category::all();
});

// 備品追加
Route::post('/equipments', function(Request $request) {
    $equipment = Equipment::create([
        'name' => $request->name,
        'category_id' => $request->category_id
    ]);
    \App\Models\EquipmentStock::create(['equipment_id' => $equipment->id, 'stock'=>0]);
    return response()->json($equipment);
});