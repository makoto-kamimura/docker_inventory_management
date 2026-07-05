<?php

namespace App\Http\Controllers;

use App\Models\StorageLocation;
use Illuminate\Http\Request;

class StorageLocationController extends Controller
{
    public function index()
    {
        return StorageLocation::orderBy('description')->get();
    }

    public function store(Request $request)
    {
        $data = $request->validate([
            'description' => 'required|string|max:2000',
        ]);

        return StorageLocation::create($data);
    }

    public function destroy(StorageLocation $storageLocation)
    {
        $storageLocation->delete();
        return response()->noContent();
    }
}
