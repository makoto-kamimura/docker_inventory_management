<?php

namespace App\Http\Controllers;

use App\Models\StorageLocation;
use Illuminate\Http\Request;

class StorageLocationController extends Controller
{
    public function index()
    {
        return StorageLocation::with('category')->orderByDesc('id')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'category_id' => 'required|integer|exists:categories,id',
            'description' => 'required|string|max:2000',
        ]);

        $location = StorageLocation::create($data);

        return $location->load('category');
    }
}
