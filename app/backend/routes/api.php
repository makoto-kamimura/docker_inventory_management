<?php
use Illuminate\Support\Facades\Route;
use App\Http\Controllers\ItemController;

Route::get('/items', [ItemController::class, 'index']);        // 取得
Route::post('/items', [ItemController::class, 'store']);       // 追加
Route::put('/items/{id}/decrement', [ItemController::class, 'decrement']); // 在庫 -1