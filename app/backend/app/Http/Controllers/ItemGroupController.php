<?php

namespace App\Http\Controllers;

use App\Models\Item;
use App\Models\ItemGroup;
use Illuminate\Http\Request;
use Illuminate\Http\Response;

class ItemGroupController extends Controller
{
    public function index()
    {
        return ItemGroup::withCount('items')->orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255|unique:item_groups,name',
        ]);

        return ItemGroup::create($data);
    }

    public function destroy(ItemGroup $itemGroup)
    {
        // group_id は nullOnDelete で自動 null 化されるため物品は残る
        $itemGroup->delete();
        return response()->noContent();
    }

    public function updateItemGroup(Request $request, Item $item)
    {
        $data = $request->validate([
            'group_id' => 'nullable|integer|exists:item_groups,id',
        ]);

        $item->update(['group_id' => $data['group_id']]);
        return $item->load(['category', 'group']);
    }
}
