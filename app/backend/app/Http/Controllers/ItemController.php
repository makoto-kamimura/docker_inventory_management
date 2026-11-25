<?php

namespace App\Http\Controllers;

use App\Models\Item;
use Illuminate\Http\Request;
use Illuminate\Validation\Rule;

class ItemController extends Controller
{
    public function index()
    {
        // 単価 (amount) 入力のある履歴の平均金額を avg_amount として付与する。
        // SQL の AVG は NULL を無視するため、明示の whereNotNull は冗長だが意図を示す。
        return Item::with(['category', 'group', 'storageLocation'])
            ->withAvg(
                ['histories as avg_amount' => fn ($q) => $q->whereNotNull('amount')],
                'amount'
            )
            ->withMin(
                ['histories as nearest_expires_at' => fn ($q) => $q->whereNotNull('expires_at')],
                'expires_at'
            )
            ->orderBy('name')
            ->get();
    }

    public function store(Request $request)
    {
        $tenantId = auth()->user()->tenant_id;

        $data = $request->validate([
            'name' => 'required|string|max:255',
            'category_id' => ['required', 'integer', Rule::exists('categories', 'id')->where('tenant_id', $tenantId)],
            'stock' => 'required|integer|min:0',
            'barcode' => ['nullable', 'string', 'max:64', Rule::unique('items', 'barcode')->where('tenant_id', $tenantId)],
            'group_id' => ['nullable', 'integer', Rule::exists('item_groups', 'id')->where('tenant_id', $tenantId)],
            'storage_location_id' => ['nullable', 'integer', Rule::exists('storage_locations', 'id')->where('tenant_id', $tenantId)],
            'amount' => 'nullable|integer|min:0',
            'expires_at' => 'nullable|date',
        ]);

        $item = Item::create($data);

        if ($item->stock > 0) {
            $item->histories()->create([
                'change' => $item->stock,
                'amount' => $data['amount'] ?? null,
                'expires_at' => $data['expires_at'] ?? null,
                'user_id' => auth()->id(),
            ]);
        }

        return $item->load(['category', 'group', 'storageLocation']);
    }

    /** 一度に増減できる個数の上限 (言い間違い・聞き間違いで大きく動かさないため) */
    private const MAX_QUANTITY = 99;

    public function decrement(Item $item, Request $request)
    {
        // quantity は省略時 1 (Web / モバイルの −1)。Alexa の「3 個払い出して」で使う
        $data = $request->validate([
            'quantity' => 'nullable|integer|min:1|max:'.self::MAX_QUANTITY,
        ]);
        $quantity = $data['quantity'] ?? 1;

        // 在庫の確認と減算を 1 つの UPDATE で行い、同時の払い出しで在庫が負にならないようにする
        $updated = Item::whereKey($item->id)
            ->where('stock', '>=', $quantity)
            ->decrement('stock', $quantity);

        if ($updated === 0) {
            return response()->json(['error' => '在庫がありません'], 409);
        }

        $item->histories()->create([
            'change' => -$quantity,
            'user_id' => auth()->id(),
            'source' => $this->historySource($request),
        ]);

        return $item->fresh('category');
    }

    public function increment(Item $item, Request $request)
    {
        // 在庫0からの補充時のみフロントが amount / expires_at を送る (任意)。
        // quantity は省略時 1。Alexa の「取り消して」で、払い出した個数を戻すのに使う
        $data = $request->validate([
            'amount' => 'nullable|integer|min:0',
            'expires_at' => 'nullable|date',
            'quantity' => 'nullable|integer|min:1|max:'.self::MAX_QUANTITY,
        ]);
        $quantity = $data['quantity'] ?? 1;

        $item->increment('stock', $quantity);
        $item->histories()->create([
            'change' => $quantity,
            'amount' => $data['amount'] ?? null,
            'expires_at' => $data['expires_at'] ?? null,
            'user_id' => auth()->id(),
            'source' => $this->historySource($request),
        ]);

        return $item->fresh('category');
    }

    /** 操作の経路 (Alexa 用のトークンなら alexa)。履歴に残す */
    private function historySource(Request $request): ?string
    {
        return $request->attributes->get('api_token')?->historySource();
    }

    public function histories(Item $item)
    {
        return $item->histories()->with('user:id,name')->orderByDesc('id')->get();
    }

    public function updateBarcode(Item $item, Request $request)
    {
        $data = $request->validate([
            // null を渡せば解除、文字列を渡せば設定 (自分自身を除いて unique)
            'barcode' => [
                'nullable', 'string', 'max:64',
                Rule::unique('items', 'barcode')->where('tenant_id', auth()->user()->tenant_id)->ignore($item->id),
            ],
        ]);

        $item->barcode = $data['barcode'] ?? null;
        $item->save();

        return $item->fresh('category');
    }

    public function updateCategory(Item $item, Request $request)
    {
        $data = $request->validate([
            'category_id' => [
                'required', 'integer',
                Rule::exists('categories', 'id')->where('tenant_id', auth()->user()->tenant_id),
            ],
        ]);

        $item->category_id = $data['category_id'];
        $item->save();

        return $item->fresh(['category', 'group', 'storageLocation']);
    }

    public function updateStorageLocation(Item $item, Request $request)
    {
        $data = $request->validate([
            'storage_location_id' => [
                'nullable', 'integer',
                Rule::exists('storage_locations', 'id')->where('tenant_id', auth()->user()->tenant_id),
            ],
        ]);

        $item->storage_location_id = $data['storage_location_id'];
        $item->save();

        return $item->fresh(['category', 'group', 'storageLocation']);
    }

    public function updateName(Item $item, Request $request)
    {
        $data = $request->validate([
            'name' => 'required|string|max:255',
        ]);

        $item->name = $data['name'];
        $item->save();

        return $item->fresh('category');
    }

    public function destroy(Item $item)
    {
        $item->delete();
        return response()->noContent();
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

        // 在庫0からの補充は金額入力が必要なので、ここでは加算せずフロントに委ねる。
        // フロントは金額モーダルを出してから PUT /items/{item}/increment を呼ぶ。
        if ($item->stock <= 0) {
            return response()->json([
                'action' => 'needs_amount',
                'item' => $item->load('category'),
            ]);
        }

        $item->increment('stock');
        $item->histories()->create(['change' => 1, 'user_id' => auth()->id()]);

        return response()->json([
            'action' => 'incremented',
            'item' => $item->fresh('category'),
        ]);
    }
}
