<?php

namespace App\Console\Commands;

use App\Models\ApiToken;
use App\Models\User;
use Illuminate\Console\Command;
use Illuminate\Support\Str;

/**
 * Alexa スキル用の、用途を絞ったトークンを発行する (README の D13)。
 * 同じ利用者の Alexa 用トークンは発行のたびに作り直す (古いトークンは使えなくなる)
 */
class AlexaToken extends Command
{
    protected $signature = 'inventory:alexa-token
        {email : トークンの持ち主 (この人のテナントの品目を扱い、履歴の記録者になる)}
        {--days=365 : 有効期限の日数 (0 で無期限)}
        {--revoke : 発行せず、この人の Alexa 用トークンを取り消すだけにする}';

    protected $description = 'Alexa スキル用のトークン (品目の参照と増減だけができる) を発行・取り消す';

    public function handle(): int
    {
        $user = User::where('email', $this->argument('email'))->first();
        if ($user === null) {
            $this->error('その利用者は見つかりません');

            return self::FAILURE;
        }

        $days = (int) $this->option('days');
        if ($days < 0) {
            $this->error('--days は 0 以上にしてください');

            return self::FAILURE;
        }

        $revoked = $user->apiTokens()->where('name', ApiToken::ALEXA)->delete();
        if ($this->option('revoke')) {
            $this->info("Alexa 用トークンを {$revoked} 件取り消しました");

            return self::SUCCESS;
        }

        $plain = Str::random(64);
        $user->apiTokens()->create([
            'name' => ApiToken::ALEXA,
            'token' => ApiToken::hash($plain),
            'login_method' => 'cli',
            'abilities' => ApiToken::ALEXA_ABILITIES,
            'expires_at' => $days > 0 ? now()->addDays($days) : null,
        ]);

        $this->info('Alexa 用トークンを発行しました (この表示のあとは確かめられません)');
        if ($revoked > 0) {
            $this->line("古い Alexa 用トークン {$revoked} 件は使えなくなりました");
        }
        $this->line('期限: '.($days > 0 ? now()->addDays($days)->toDateString() : 'なし'));
        $this->newLine();
        $this->line($plain);

        return self::SUCCESS;
    }
}
