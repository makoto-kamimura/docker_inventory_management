<?php

namespace Tests\Feature;

use App\Models\ApiToken;
use App\Models\Category;
use App\Models\Item;
use App\Models\Tenant;
use App\Models\User;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Artisan;
use Tests\TestCase;

/**
 * Alexa 用の、用途を絞ったトークン (README の D13) と、個数を指定した増減。
 */
class AlexaTokenTest extends TestCase
{
    use RefreshDatabase;

    private User $user;

    private Item $item;

    protected function setUp(): void
    {
        parent::setUp();

        $tenant = Tenant::create(['name' => 'alexa-test']);
        $this->user = User::create(['name' => 'owner', 'email' => 'owner@test.local', 'password' => 'password-123', 'tenant_id' => $tenant->id]);
        $category = Category::create(['name' => '文具', 'tenant_id' => $tenant->id]);
        $this->item = Item::create(['name' => 'ボールペン', 'category_id' => $category->id, 'stock' => 5, 'tenant_id' => $tenant->id]);
    }

    /** コマンドで Alexa 用トークンを発行し、平文を返す */
    private function issueAlexaToken(array $options = []): string
    {
        Artisan::call('inventory:alexa-token', ['email' => 'owner@test.local'] + $options);
        $lines = array_values(array_filter(array_map('trim', explode("\n", Artisan::output()))));

        return end($lines);
    }

    private function stock(): int
    {
        return Item::withoutGlobalScopes()->findOrFail($this->item->id)->stock;
    }

    public function test_command_issues_scoped_token_and_replaces_older_one(): void
    {
        $first = $this->issueAlexaToken();
        $second = $this->issueAlexaToken(['--days' => 30]);

        $this->assertSame(64, strlen($second));
        $this->assertSame(1, ApiToken::where('name', ApiToken::ALEXA)->count());
        $token = ApiToken::where('name', ApiToken::ALEXA)->first();
        $this->assertSame(ApiToken::ALEXA_ABILITIES, $token->abilities);
        $this->assertTrue($token->expires_at->between(now()->addDays(29), now()->addDays(31)));

        $this->withToken($first)->getJson('/api/items')->assertStatus(401);
        $this->withToken($second)->getJson('/api/items')->assertOk()->assertJsonPath('0.name', 'ボールペン');
    }

    public function test_revoke_option_removes_token(): void
    {
        $plain = $this->issueAlexaToken();
        Artisan::call('inventory:alexa-token', ['email' => 'owner@test.local', '--revoke' => true]);

        $this->withToken($plain)->getJson('/api/items')->assertStatus(401);
    }

    public function test_scoped_token_is_limited_to_declared_routes(): void
    {
        $plain = $this->issueAlexaToken();
        $id = $this->item->id;

        $this->withToken($plain)->putJson("/api/items/{$id}/decrement")->assertOk();
        $this->withToken($plain)->putJson("/api/items/{$id}/increment")->assertOk();

        $denied = [
            ['GET', '/api/me'],
            ['GET', '/api/categories'],
            ['GET', "/api/items/{$id}/histories"],
            ['PUT', "/api/items/{$id}/name"],
            ['DELETE', "/api/items/{$id}"],
            ['POST', '/api/items/scan'],
            ['POST', '/api/logout'],
            ['GET', '/api/me/identities'],
        ];
        foreach ($denied as [$method, $uri]) {
            $this->withToken($plain)->json($method, $uri, ['name' => 'x'])
                ->assertStatus(403, "{$method} {$uri}");
        }
        $this->assertSame('ボールペン', Item::withoutGlobalScopes()->findOrFail($id)->name);
    }

    public function test_route_ability_is_checked_against_token(): void
    {
        $plain = 'read-only-token-'.str_repeat('a', 48);
        $this->user->apiTokens()->create([
            'name' => 'readonly',
            'token' => ApiToken::hash($plain),
            'abilities' => ['items:read'],
        ]);

        $this->withToken($plain)->getJson('/api/items')->assertOk();
        $this->withToken($plain)->putJson("/api/items/{$this->item->id}/decrement")->assertStatus(403);
        $this->assertSame(5, $this->stock());
    }

    public function test_expired_token_is_rejected(): void
    {
        $plain = $this->issueAlexaToken();
        ApiToken::where('name', ApiToken::ALEXA)->update(['expires_at' => now()->subMinute()]);

        $this->withToken($plain)->getJson('/api/items')->assertStatus(401);
    }

    public function test_regular_token_keeps_full_access(): void
    {
        $plain = $this->user->issueApiToken('api');

        $this->withToken($plain)->getJson('/api/me')->assertOk();
        $this->withToken($plain)->getJson('/api/categories')->assertOk();
        $this->withToken($plain)->getJson('/api/items')->assertOk();
    }

    public function test_decrement_and_increment_accept_quantity(): void
    {
        $plain = $this->user->issueApiToken('api');
        $id = $this->item->id;

        $this->withToken($plain)->putJson("/api/items/{$id}/decrement", ['quantity' => 3])
            ->assertOk()->assertJsonPath('stock', 2);
        $this->withToken($plain)->putJson("/api/items/{$id}/decrement", ['quantity' => 3])
            ->assertStatus(409);
        $this->assertSame(2, $this->stock());

        $this->withToken($plain)->putJson("/api/items/{$id}/increment", ['quantity' => 2])
            ->assertOk()->assertJsonPath('stock', 4);
        $this->withToken($plain)->putJson("/api/items/{$id}/decrement")
            ->assertOk()->assertJsonPath('stock', 3);

        $this->withToken($plain)->putJson("/api/items/{$id}/decrement", ['quantity' => 0])->assertStatus(422);
        $this->withToken($plain)->putJson("/api/items/{$id}/decrement", ['quantity' => 100])->assertStatus(422);

        $changes = $this->withToken($plain)->getJson("/api/items/{$id}/histories")->json('*.change');
        $this->assertSame([-1, 2, -3], $changes);
    }

    public function test_history_records_alexa_as_source(): void
    {
        $alexa = $this->issueAlexaToken();
        $regular = $this->user->issueApiToken('api');
        $id = $this->item->id;

        $this->withToken($alexa)->putJson("/api/items/{$id}/decrement", ['quantity' => 2])->assertOk();
        $this->withToken($regular)->putJson("/api/items/{$id}/decrement")->assertOk();

        $histories = $this->withToken($regular)->getJson("/api/items/{$id}/histories")->json();
        $this->assertSame([null, 'alexa'], array_column($histories, 'source'));
        $this->assertSame('owner', $histories[1]['user']['name']);
    }

    public function test_alexa_token_survives_sso_only_setting(): void
    {
        config([
            'sso.issuer' => 'https://idp.test/auth/v1/',
            'sso.client_id' => 'inventory',
            'sso.client_secret' => 'secret',
            'sso.allow_password_for_sso_only' => false,
        ]);
        $alexa = $this->issueAlexaToken();
        $password = $this->user->issueApiToken('api', 'pwd');
        $this->user->forceFill(['sso_only' => true])->save();

        $this->withToken($password)->getJson('/api/items')->assertStatus(401);
        $this->withToken($alexa)->getJson('/api/items')->assertOk();
    }
}
