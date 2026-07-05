<?php

namespace App\Http\Controllers;

use App\Models\Category;
use Illuminate\Http\Request;

class CategoryController extends Controller
{
    public function index()
    {
        return Category::orderBy('name')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255|unique:categories,name',
        ]);

        return Category::create($data);
    }

    public function destroy(Category $category)
    {
        if ($category->items()->exists()) {
            return response()->json(['message' => 'このカテゴリには物品が登録されています。先に物品を移動または削除してください。'], 422);
        }
        $category->delete();
        return response()->noContent();
    }
}
