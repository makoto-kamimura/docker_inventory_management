<?php

namespace Tests\Feature;

use App\Models\Category;
use App\Models\Item;
use App\Models\ItemGroup;
use App\Models\StorageLocation;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Tests\TestCase;

/**
 * テナントの分離。ほかのテナントの行を ID で指定しても、見えない・変えられない (404) ことを確かめる。
 * 認証がルートのモデルの解決 (SubstituteBindings) より先に動くこと (README の D10) も、ここで守る。
 */
class TenantIsolationTest extends TestCase
{
    use RefreshDatabase;

    private array $victim;

    private string $attackerToken;

    private string $victimToken;

    private Category $attackerCategory;

    protected function setUp(): void
    {
        parent::setUp();

        // ログインしていない状態で作る (グローバルスコープは付かないので tenant_id を明示する)
        $victimTenant = Tenant::create(['name' => 'victim']);
        $attackerTenant = Tenant::create(['name' => 'attacker']);

        $victimUser = User::create(['name' => 'victim', 'email' => 'victim@test.local', 'password' => 'password-123', 'tenant_id' => $victimTenant->id]);
        $attackerUser = User::create(['name' => 'attacker', 'email' => 'attacker@test.local', 'password' => 'password-123', 'tenant_id' => $attackerTenant->id]);

        $category = Category::create(['name' => '食品', 'tenant_id' => $victimTenant->id]);
        $location = StorageLocation::create(['description' => '棚A', 'tenant_id' => $victimTenant->id]);
        $group = ItemGroup::create(['name' => '朝食', 'tenant_id' => $victimTenant->id]);
        $item = Item::create([
            'name' => '牛乳',
            'category_id' => $category->id,
            'storage_location_id' => $location->id,
            'group_id' => $group->id,
            'stock' => 5,
            'barcode' => '4900000000001',
            'tenant_id' => $victimTenant->id,
        ]);
        $item->histories()->create(['change' => 5, 'user_id' => $victimUser->id, 'tenant_id' => $victimTenant->id]);

        $this->attackerCategory = Category::create(['name' => '日用品', 'tenant_id' => $attackerTenant->id]);

        $this->victim = [
            'item' => $item->id,
            'category' => $category->id,
            'location' => $location->id,
            'group' => $group->id,
        ];
        $this->attackerToken = $attackerUser->issueApiToken('test');
        $this->victimToken = $victimUser->issueApiToken('test');
    }

    /** テストの中ではログイン中のユーザーが残るので、確かめるときはスコープを外して読む */
    private function victimItem(): Item
    {
        return Item::withoutGlobalScopes()->findOrFail($this->victim['item']);
    }

    public function test_other_tenants_item_cannot_be_changed_by_id(): void
    {
        $id = $this->victim['item'];
        $requests = [
            ['PUT', "/api/items/{$id}/decrement", []],
            ['PUT', "/api/items/{$id}/increment", []],
            ['PUT', "/api/items/{$id}/name", ['name' => '書き換え']],
            ['PUT', "/api/items/{$id}/barcode", ['barcode' => null]],
            ['PUT', "/api/items/{$id}/category", ['category_id' => $this->attackerCategory->id]],
            ['PUT', "/api/items/{$id}/storage-location", ['storage_location_id' => null]],
            ['PUT', "/api/items/{$id}/group", ['group_id' => null]],
            ['GET', "/api/items/{$id}/histories", []],
            ['DELETE', "/api/items/{$id}", []],
        ];

        foreach ($requests as [$method, $uri, $body]) {
            $this->withToken($this->attackerToken)->json($method, $uri, $body)
                ->assertNotFound();
        }

        $item = $this->victimItem();
        $this->assertSame(5, (int) $item->stock);
        $this->assertSame('牛乳', $item->name);
        $this->assertSame('4900000000001', $item->barcode);
        $this->assertSame($this->victim['category'], (int) $item->category_id);
        $this->assertSame($this->victim['location'], (int) $item->storage_location_id);
        $this->assertSame($this->victim['group'], (int) $item->group_id);
        $this->assertSame(1, $item->histories()->withoutGlobalScopes()->count());
    }

    public function test_other_tenants_category_location_and_group_cannot_be_deleted(): void
    {
        // 分類は品目があると 422 で断るので、品目のない分類も用意する
        $emptyCategory = Category::create(['name' => '空', 'tenant_id' => $this->victimItem()->tenant_id]);

        $this->withToken($this->attackerToken)->deleteJson("/api/categories/{$this->victim['category']}")->assertNotFound();
        $this->withToken($this->attackerToken)->deleteJson("/api/categories/{$emptyCategory->id}")->assertNotFound();
        $this->withToken($this->attackerToken)->deleteJson("/api/storage-locations/{$this->victim['location']}")->assertNotFound();
        $this->withToken($this->attackerToken)->deleteJson("/api/item-groups/{$this->victim['group']}")->assertNotFound();

        $this->assertTrue(Category::withoutGlobalScopes()->whereKey($emptyCategory->id)->exists());
        $this->assertTrue(Category::withoutGlobalScopes()->whereKey($this->victim['category'])->exists());
        $this->assertTrue(StorageLocation::withoutGlobalScopes()->whereKey($this->victim['location'])->exists());
        $this->assertTrue(ItemGroup::withoutGlobalScopes()->whereKey($this->victim['group'])->exists());
    }

    public function test_lists_show_only_own_tenant(): void
    {
        $this->withToken($this->attackerToken)->getJson('/api/items')->assertOk()->assertJsonCount(0);
        $this->withToken($this->attackerToken)->getJson('/api/categories')->assertOk()
            ->assertJsonCount(1)->assertJsonPath('0.name', '日用品');
    }

    public function test_owner_can_still_change_own_item(): void
    {
        $id = $this->victim['item'];
        $this->withToken($this->victimToken)->putJson("/api/items/{$id}/decrement")->assertOk()->assertJsonPath('stock', 4);
        $this->withToken($this->victimToken)->getJson("/api/items/{$id}/histories")->assertOk()->assertJsonCount(2);
        $this->assertSame(4, (int) $this->victimItem()->stock);
    }

    public function test_unauthenticated_request_is_rejected_before_model_lookup(): void
    {
        // 存在する ID でも、しない ID でも 401
        $this->getJson("/api/items/{$this->victim['item']}/histories")->assertUnauthorized();
        $this->getJson('/api/items/999999999/histories')->assertUnauthorized();
        $this->deleteJson('/api/categories/999999999')->assertUnauthorized();
    }
}
