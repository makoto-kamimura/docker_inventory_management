<?php

namespace App\Services\Sso;

use Exception;

/** ID トークンを受け入れない理由。mfa_required だけは画面で別の案内を出す */
class Rejected extends Exception
{
    public function __construct(public readonly string $reason)
    {
        parent::__construct($reason);
    }
}
