<?php

namespace App\Http\Controllers;

use App\Http\Middleware\AuthenticateToken;
use App\Models\User;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Hash;
use Illuminate\Validation\ValidationException;

class AuthController extends Controller
{
    public function login(Request $request)
    {
        $data = $request->validate([
            'email' => 'required|email',
            'password' => 'required|string',
        ]);

        $user = User::where('email', $data['email'])->first();

        if ($user === null || ! Hash::check($data['password'], $user->password)) {
            throw ValidationException::withMessages([
                'email' => ['メールアドレスまたはパスワードが正しくありません。'],
            ]);
        }

        // 「SSO だけ」にした人は、パスワードが正しくても SSO へ案内する
        // (パスワードを確かめたあとに判定するので、パスワードを知らない人には設定が分からない)
        if (! AuthenticateToken::loginMethodAllowed($user, 'pwd')) {
            return response()->json([
                'message' => 'このアカウントは SSO でのみログインできます。「SSO でログイン」を使ってください',
            ], 403);
        }

        $token = $user->issueApiToken('api', 'pwd');

        return response()->json([
            'token' => $token,
            'user' => self::userPayload($user),
        ]);
    }

    public static function userPayload(User $user): array
    {
        return [
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'tenant' => $user->tenant->name,
        ];
    }

    public function me(Request $request)
    {
        $user = $request->user();

        return response()->json([
            'id' => $user->id,
            'name' => $user->name,
            'email' => $user->email,
            'tenant' => $user->tenant->name,
        ]);
    }

    public function logout(Request $request)
    {
        // 現在のトークンのみ失効させる (他端末のセッションは維持)
        $token = $request->attributes->get('api_token');
        $token?->delete();

        return response()->noContent();
    }
}
