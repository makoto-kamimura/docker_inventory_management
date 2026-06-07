<?php

use App\Http\Controllers\AnalyticsController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\ItemController;
use Illuminate\Support\Facades\Route;

Route::get('/categories', [CategoryController::class, 'index']);
Route::post('/categories', [CategoryController::class, 'store']);

Route::get('/items', [ItemController::class, 'index']);
Route::post('/items', [ItemController::class, 'store']);
Route::post('/items/scan', [ItemController::class, 'scan']);
Route::put('/items/{item}/decrement', [ItemController::class, 'decrement']);
Route::put('/items/{item}/increment', [ItemController::class, 'increment']);
Route::put('/items/{item}/barcode', [ItemController::class, 'updateBarcode']);
Route::put('/items/{item}/category', [ItemController::class, 'updateCategory']);
Route::get('/items/{item}/histories', [ItemController::class, 'histories']);

Route::get('/analytics/timeseries', [AnalyticsController::class, 'timeseries']);
