<?php

namespace App\Http\Controllers;

use App\Models\Item;
use Illuminate\Http\Request;

class ItemController extends Controller
{
    public function index()
    {
        return Item::with('category')->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
            'category_id' => 'required|integer|exists:categories,id',
            'stock' => 'required|integer|min:0',
            'barcode' => 'nullable|string|max:64|unique:items,barcode',
        ]);

        $item = Item::create($data);

        if ($item->stock > 0) {
            $item->histories()->create([
                'change' => $item->stock,
                'user_id' => auth()->id(),
            ]);
        }

        return $item->load('category');
    }

    public function decrement(Item $item)
    {
        if ($item->stock <= 0) {
            return response()->json(['error' => '在庫がありません'], 409);
        }

        $item->decrement('stock');
        $item->histories()->create(['change' => -1, 'user_id' => auth()->id()]);

        return $item->fresh('category');
    }

    public function increment(Item $item)
    {
        $item->increment('stock');
        $item->histories()->create(['change' => 1, 'user_id' => auth()->id()]);

        return $item->fresh('category');
    }

    public function histories(Item $item)
    {
        return $item->histories()->with('user:id,name')->orderByDesc('id')->get();
    }

    public function updateBarcode(Item $item, Request $request)
    {
        $data = $request->validate([
            // null を渡せば解除、文字列を渡せば設定 (自分自身を除いて unique)
            'barcode' => 'nullable|string|max:64|unique:items,barcode,' . $item->id,
        ]);

        $item->barcode = $data['barcode'] ?? null;
        $item->save();

        return $item->fresh('category');
    }

    public function updateCategory(Item $item, Request $request)
    {
        $data = $request->validate([
            'category_id' => 'required|integer|exists:categories,id',
        ]);

        $item->category_id = $data['category_id'];
        $item->save();

        return $item->fresh('category');
    }

    public function scan(Request $request)
    {
        $data = $request->validate([
            'barcode' => 'required|string|max:64',
        ]);

        $item = Item::where('barcode', $data['barcode'])->first();

        if ($item === null) {
            return response()->json([
                'action' => 'not_found',
                'barcode' => $data['barcode'],
            ], 404);
        }

        $item->increment('stock');
        $item->histories()->create(['change' => 1, 'user_id' => auth()->id()]);

        return response()->json([
            'action' => 'incremented',
            'item' => $item->fresh('category'),
        ]);
    }
}
