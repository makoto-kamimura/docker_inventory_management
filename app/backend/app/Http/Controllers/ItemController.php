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
        ]);

        $item = Item::create($data);

        if ($item->stock > 0) {
            $item->histories()->create(['change' => $item->stock]);
        }

        return $item->load('category');
    }

    public function decrement(Item $item)
    {
        if ($item->stock <= 0) {
            return response()->json(['error' => '在庫がありません'], 409);
        }

        $item->decrement('stock');
        $item->histories()->create(['change' => -1]);

        return $item->fresh('category');
    }

    public function histories(Item $item)
    {
        return $item->histories()->orderByDesc('id')->get();
    }
}
