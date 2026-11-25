<?php

use App\Http\Controllers\AnalyticsController;
use App\Http\Controllers\AuthController;
use App\Http\Controllers\CategoryController;
use App\Http\Controllers\ItemController;
use App\Http\Controllers\ItemGroupController;
use App\Http\Controllers\SsoController;
use App\Http\Controllers\StorageLocationController;
use Illuminate\Support\Facades\Route;

// 認証不要 (ログインのみ公開)
Route::post('/login', [AuthController::class, 'login']);

// SSO (OpenID Connect)。OIDC_ISSUER などが未設定なら 404 (providers は sso: false)
Route::get('/auth/providers', [SsoController::class, 'providers']);
Route::get('/auth/sso/start', [SsoController::class, 'start']);
Route::get('/auth/sso/callback', [SsoController::class, 'callback']);
Route::post('/auth/sso/exchange', [SsoController::class, 'exchange']);

// ここから先はすべてトークン認証必須
Route::middleware('auth.token')->group(function () {
    Route::get('/me', [AuthController::class, 'me']);
    Route::post('/logout', [AuthController::class, 'logout']);

    Route::get('/me/identities', [SsoController::class, 'identities']);
    Route::post('/me/identities/sso/intent', [SsoController::class, 'intent']);
    Route::delete('/me/identities/sso', [SsoController::class, 'unlink']);
    Route::put('/me/sso-only', [SsoController::class, 'setSsoOnly']);

    Route::get('/categories', [CategoryController::class, 'index']);
    Route::post('/categories', [CategoryController::class, 'store']);
    Route::delete('/categories/{category}', [CategoryController::class, 'destroy']);

    Route::get('/storage-locations', [StorageLocationController::class, 'index']);
    Route::post('/storage-locations', [StorageLocationController::class, 'store']);
    Route::delete('/storage-locations/{storageLocation}', [StorageLocationController::class, 'destroy']);

    Route::get('/item-groups', [ItemGroupController::class, 'index']);
    Route::post('/item-groups', [ItemGroupController::class, 'store']);
    Route::delete('/item-groups/{itemGroup}', [ItemGroupController::class, 'destroy']);

    // ability: を付けたルートだけ、用途を絞ったトークン (Alexa 用) でも使える (README の D13)
    Route::get('/items', [ItemController::class, 'index'])->middleware('ability:items:read');
    Route::post('/items', [ItemController::class, 'store']);
    Route::post('/items/scan', [ItemController::class, 'scan']);
    Route::put('/items/{item}/decrement', [ItemController::class, 'decrement'])->middleware('ability:items:decrement');
    Route::put('/items/{item}/increment', [ItemController::class, 'increment'])->middleware('ability:items:increment');
    Route::put('/items/{item}/name', [ItemController::class, 'updateName']);
    Route::put('/items/{item}/barcode', [ItemController::class, 'updateBarcode']);
    Route::put('/items/{item}/category', [ItemController::class, 'updateCategory']);
    Route::put('/items/{item}/storage-location', [ItemController::class, 'updateStorageLocation']);
    Route::put('/items/{item}/group', [ItemGroupController::class, 'updateItemGroup']);
    Route::delete('/items/{item}', [ItemController::class, 'destroy']);
    Route::get('/items/{item}/histories', [ItemController::class, 'histories']);

    Route::get('/analytics/timeseries', [AnalyticsController::class, 'timeseries']);
});
