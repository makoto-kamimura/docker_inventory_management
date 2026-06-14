<?php

use App\Http\Controllers\AnalyticsController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\ItemController;
use App\Http\Controllers\StorageLocationController;
use Illuminate\Support\Facades\Route;

// 認証不要 (ログインのみ公開)
Route::post('/login', [AuthController::class, 'login']);

// ここから先はすべてトークン認証必須
Route::middleware('auth.token')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/categories', [CategoryController::class, 'index']);
    Route::post('/categories', [CategoryController::class, 'store']);

    Route::get('/storage-locations', [StorageLocationController::class, 'index']);
    Route::post('/storage-locations', [StorageLocationController::class, 'store']);

    Route::get('/items', [ItemController::class, 'index']);
    Route::post('/items', [ItemController::class, 'store']);
    Route::post('/items/scan', [ItemController::class, 'scan']);
    Route::put('/items/{item}/decrement', [ItemController::class, 'decrement']);
    Route::put('/items/{item}/increment', [ItemController::class, 'increment']);
    Route::put('/items/{item}/name', [ItemController::class, 'updateName']);
    Route::put('/items/{item}/barcode', [ItemController::class, 'updateBarcode']);
    Route::put('/items/{item}/category', [ItemController::class, 'updateCategory']);
    Route::delete('/items/{item}', [ItemController::class, 'destroy']);
    Route::get('/items/{item}/histories', [ItemController::class, 'histories']);

    Route::get('/analytics/timeseries', [AnalyticsController::class, 'timeseries']);
});
