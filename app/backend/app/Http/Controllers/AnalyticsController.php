<?php

namespace App\Http\Controllers;

use App\Models\Category;
use App\Models\Item;
use App\Models\ItemHistory;
use Illuminate\Http\Request;
use Illuminate\Support\Carbon;

class AnalyticsController extends Controller
{
    public function timeseries(Request $request)
    {
        $period = $request->query('period', 'daily');
        $group = $request->query('group', 'total');

        if (!in_array($period, ['daily', 'monthly'], true)) {
            $period = 'daily';
        }
        if (!in_array($group, ['total', 'category'], true)) {
            $group = 'total';
        }

        if ($period === 'daily') {
            $bucketCount = 30;
            $now = Carbon::now();
            $labels = [];
            for ($i = $bucketCount - 1; $i >= 0; $i--) {
                $labels[] = $now->copy()->subDays($i)->format('Y-m-d');
            }
            $bucketOf = fn (string $ts) => Carbon::parse($ts)->format('Y-m-d');
        } else {
            $bucketCount = 12;
            $now = Carbon::now();
            $labels = [];
            for ($i = $bucketCount - 1; $i >= 0; $i--) {
                $labels[] = $now->copy()->subMonthsNoOverflow($i)->format('Y-m');
            }
            $bucketOf = fn (string $ts) => Carbon::parse($ts)->format('Y-m');
        }

        $items = Item::all();
        $itemCategory = [];
        foreach ($items as $it) {
            $itemCategory[$it->id] = $it->category_id;
        }

        $histories = ItemHistory::query()
            ->orderBy('changed_at')
            ->get(['item_id', 'change', 'changed_at']);

        $n = count($labels);
        $lastLabel = $labels[$n - 1];

        if ($group === 'total') {
            $currentTotal = (int) $items->sum('stock');

            $changes = array_fill_keys($labels, 0);
            // Count changes that happened strictly AFTER the displayed window's last bucket
            // (e.g. future-dated history rows) so we can pin "current total" to the right slot.
            $changesAfterWindow = 0;
            foreach ($histories as $h) {
                $bucket = $bucketOf((string) $h->changed_at);
                if (isset($changes[$bucket])) {
                    $changes[$bucket] += (int) $h->change;
                } elseif ($bucket > $lastLabel) {
                    $changesAfterWindow += (int) $h->change;
                }
            }

            $endOfBucket = [];
            $endOfBucket[$lastLabel] = $currentTotal - $changesAfterWindow;
            for ($i = $n - 2; $i >= 0; $i--) {
                $endOfBucket[$labels[$i]] = $endOfBucket[$labels[$i + 1]] - $changes[$labels[$i + 1]];
            }

            $values = [];
            foreach ($labels as $l) {
                $values[] = $endOfBucket[$l];
            }

            return [
                'labels' => $labels,
                'series' => [
                    ['name' => '総合計', 'values' => $values],
                ],
            ];
        }

        // group === 'category'
        $categories = Category::orderBy('id')->get();

        $stockByCategory = [];
        foreach ($categories as $c) {
            $stockByCategory[$c->id] = 0;
        }
        $orphanStock = 0;
        foreach ($items as $it) {
            if (isset($stockByCategory[$it->category_id])) {
                $stockByCategory[$it->category_id] += (int) $it->stock;
            } else {
                $orphanStock += (int) $it->stock;
            }
        }

        $changesByCategory = [];
        foreach ($categories as $c) {
            $changesByCategory[$c->id] = array_fill_keys($labels, 0);
        }
        $changesOrphan = array_fill_keys($labels, 0);
        $changesAfterByCategory = [];
        foreach ($categories as $c) {
            $changesAfterByCategory[$c->id] = 0;
        }
        $changesAfterOrphan = 0;

        foreach ($histories as $h) {
            $cid = $itemCategory[$h->item_id] ?? null;
            $bucket = $bucketOf((string) $h->changed_at);
            $inWindow = isset($changesOrphan[$bucket]);
            $afterWindow = $bucket > $lastLabel;

            if ($cid !== null && isset($changesByCategory[$cid])) {
                if ($inWindow) {
                    $changesByCategory[$cid][$bucket] += (int) $h->change;
                } elseif ($afterWindow) {
                    $changesAfterByCategory[$cid] += (int) $h->change;
                }
            } else {
                if ($inWindow) {
                    $changesOrphan[$bucket] += (int) $h->change;
                } elseif ($afterWindow) {
                    $changesAfterOrphan += (int) $h->change;
                }
            }
        }

        $series = [];
        foreach ($categories as $c) {
            $cid = $c->id;
            $endOfBucket = [];
            $endOfBucket[$lastLabel] = $stockByCategory[$cid] - $changesAfterByCategory[$cid];
            for ($i = $n - 2; $i >= 0; $i--) {
                $endOfBucket[$labels[$i]] = $endOfBucket[$labels[$i + 1]] - $changesByCategory[$cid][$labels[$i + 1]];
            }
            $values = [];
            foreach ($labels as $l) {
                $values[] = $endOfBucket[$l];
            }
            $series[] = ['name' => $c->name, 'values' => $values];
        }

        $hasOrphan = $orphanStock !== 0 || array_sum($changesOrphan) !== 0 || $changesAfterOrphan !== 0;
        if ($hasOrphan) {
            $endOfBucket = [];
            $endOfBucket[$lastLabel] = $orphanStock - $changesAfterOrphan;
            for ($i = $n - 2; $i >= 0; $i--) {
                $endOfBucket[$labels[$i]] = $endOfBucket[$labels[$i + 1]] - $changesOrphan[$labels[$i + 1]];
            }
            $values = [];
            foreach ($labels as $l) {
                $values[] = $endOfBucket[$l];
            }
            $series[] = ['name' => '(未分類)', 'values' => $values];
        }

        return [
            'labels' => $labels,
            'series' => $series,
        ];
    }
}
