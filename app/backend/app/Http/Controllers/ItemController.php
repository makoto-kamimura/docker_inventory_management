<?php
namespace App\Http\Controllers;

use Illuminate\Http\Request;
use App\Models\Item;

class ItemController extends Controller
{
    public function index()
    {
        return Item::all();
    }

    public function store(Request $request)
    {
        $request->validate([
            'name' => 'required|string',
            'category' => 'required|string',
            'stock' => 'required|integer',
        ]);

        return Item::create($request->all());
    }

    public function decrement($id)
    {
        $item = Item::findOrFail($id);
        if ($item->stock > 0) {
            $item->stock -= 1;
            $item->save();

            // 在庫履歴追加
            $item->histories()->create(['change' => -1]);
        }
        return $item;
    }
}