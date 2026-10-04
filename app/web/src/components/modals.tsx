"use client";

import { useEffect, useState } from "react";
import { api, type Item, type ItemHistory } from "@/lib/api";
import {
  errorMessage,
  formatChange,
  formatYen,
  isValidAmount,
  parseAmount,
} from "@/lib/inventory";
import { ArrowDownToLine, ArrowUpFromLine, Barcode, TriangleAlert } from "lucide-react";
import { Badge, Callout, Hint, Modal, ModalActions, cls, useBusy } from "./ui";

export function NameEditModal({
  item,
  onClose,
  onSave,
}: {
  item: Item;
  onClose: () => void;
  onSave: (name: string) => Promise<void>;
}) {
  const [value, setValue] = useState(item.name);
  const [saving, run] = useBusy();
  const trimmed = value.trim();
  const canSave = !saving && trimmed !== "" && trimmed !== item.name;

  const submit = () => {
    if (canSave) void run(() => onSave(trimmed));
  };

  return (
    <Modal title="品目名の編集" onClose={onClose}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        maxLength={255}
        className={cls.input}
        autoFocus
        onKeyDown={(e) => {
          if (e.key === "Enter") submit();
        }}
      />
      <ModalActions>
        <button type="button" onClick={onClose} disabled={saving} className={cls.secondaryButton}>
          キャンセル
        </button>
        <button type="button" disabled={!canSave} onClick={submit} className={cls.primaryButton}>
          保存
        </button>
      </ModalActions>
    </Modal>
  );
}

export function BarcodeEditModal({
  item,
  onClose,
  onSave,
}: {
  item: Item;
  onClose: () => void;
  onSave: (barcode: string | null) => Promise<void>;
}) {
  const [value, setValue] = useState(item.barcode ?? "");
  const [saving, run] = useBusy();
  const trimmed = value.trim();

  return (
    <Modal title={`${item.name} のバーコード`} onClose={onClose}>
      <input
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="例: 4901234567890"
        maxLength={64}
        className={`${cls.input} font-mono tabular-nums`}
        autoFocus
      />
      <ModalActions>
        {item.barcode && (
          <button
            type="button"
            disabled={saving}
            onClick={() => run(() => onSave(null))}
            className={cls.dangerOutlineButton}
          >
            解除
          </button>
        )}
        <button type="button" onClick={onClose} disabled={saving} className={cls.secondaryButton}>
          キャンセル
        </button>
        <button
          type="button"
          disabled={saving || trimmed === (item.barcode ?? "")}
          onClick={() => run(() => onSave(trimmed === "" ? null : trimmed))}
          className={cls.primaryButton}
        >
          保存
        </button>
      </ModalActions>
    </Modal>
  );
}

/** カテゴリ / グループ / 保管場所の付け替え。noneLabel を渡すと「なし」を選べる */
export function SelectEditModal({
  title,
  options,
  current,
  noneLabel,
  onClose,
  onSave,
}: {
  title: string;
  options: { id: number; label: string }[];
  current: number | null;
  noneLabel?: string;
  onClose: () => void;
  onSave: (id: number | null) => Promise<void>;
}) {
  const [value, setValue] = useState<number | null>(current);
  const [saving, run] = useBusy();

  return (
    <Modal title={title} onClose={onClose}>
      <select
        value={value ?? ""}
        onChange={(e) => setValue(e.target.value === "" ? null : Number(e.target.value))}
        className={cls.input}
        autoFocus
      >
        {noneLabel != null && <option value="">{noneLabel}</option>}
        {options.map((o) => (
          <option key={o.id} value={o.id}>{o.label}</option>
        ))}
      </select>
      <ModalActions>
        <button type="button" onClick={onClose} disabled={saving} className={cls.secondaryButton}>
          キャンセル
        </button>
        <button
          type="button"
          disabled={saving || value === current || (noneLabel == null && value == null)}
          onClick={() => run(() => onSave(value))}
          className={cls.primaryButton}
        >
          保存
        </button>
      </ModalActions>
    </Modal>
  );
}

export function ConfirmDeleteModal({
  title,
  message,
  onClose,
  onConfirm,
}: {
  title: string;
  message: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
}) {
  const [deleting, run] = useBusy();

  return (
    <Modal title={title} onClose={onClose}>
      <div className="flex items-start gap-3">
        <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/60 dark:text-red-300">
          <TriangleAlert aria-hidden className="h-5 w-5" />
        </span>
        <p className="text-sm text-zinc-700 dark:text-zinc-300">{message}</p>
      </div>
      <ModalActions>
        <button type="button" onClick={onClose} disabled={deleting} className={cls.secondaryButton}>
          キャンセル
        </button>
        <button type="button" disabled={deleting} onClick={() => run(onConfirm)} className={cls.dangerButton}>
          削除する
        </button>
      </ModalActions>
    </Modal>
  );
}

/** 在庫0からの補充 (+1)。金額と期限を任意で記録する */
export function AmountModal({
  item,
  onClose,
  onConfirm,
}: {
  item: Item;
  onClose: () => void;
  onConfirm: (amount: number | null, expiresAt: string | null) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, run] = useBusy();
  const amount = parseAmount(value);

  const submit = (withAmount: boolean) =>
    run(() => onConfirm(withAmount ? amount : null, expiresAt.trim() || null));

  return (
    <Modal title={`${item.name} の補充 (+1)`} onClose={onClose}>
      <Callout tone="success">
        在庫切れからの補充です。金額と期限を入れておくと、平均単価や期限の表示に使われます（どちらも任意）。
      </Callout>
      <label className={`block ${cls.label}`}>金額</label>
      <div className="flex items-center gap-2">
        <span className="text-zinc-500">¥</span>
        <input
          type="number"
          min={0}
          step={1}
          inputMode="numeric"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="例: 1200"
          className={`${cls.input} tabular-nums`}
          autoFocus
        />
      </div>
      <div className="space-y-1">
        <label className={cls.label}>期限</label>
        <input
          type="date"
          value={expiresAt}
          onChange={(e) => setExpiresAt(e.target.value)}
          className={cls.input}
        />
        <Hint>1ヶ月以内になると、在庫一覧で「期限間近」と表示されます。</Hint>
      </div>
      <ModalActions>
        <button type="button" onClick={onClose} disabled={saving} className={cls.secondaryButton}>
          キャンセル
        </button>
        <button type="button" onClick={() => submit(false)} disabled={saving} className={cls.secondaryButton}>
          金額なしで +1
        </button>
        <button
          type="button"
          onClick={() => submit(true)}
          disabled={saving || !isValidAmount(amount)}
          className={cls.primaryButton}
        >
          +1 して記録
        </button>
      </ModalActions>
    </Modal>
  );
}

export function HistoryModal({ item, onClose }: { item: Item; onClose: () => void }) {
  const [histories, setHistories] = useState<ItemHistory[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api.listHistories(item.id).then(
      (hs) => active && setHistories(hs),
      (e) => active && setError(errorMessage(e)),
    );
    return () => {
      active = false;
    };
  }, [item.id]);

  return (
    <Modal title={`${item.name} の履歴`} onClose={onClose}>
      {error ? (
        <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
      ) : histories == null ? (
        <p className="text-sm text-zinc-500">読み込み中...</p>
      ) : histories.length === 0 ? (
        <p className="text-sm text-zinc-500">履歴がありません</p>
      ) : (
        <ul className="max-h-80 space-y-1 overflow-y-auto text-sm">
          {histories.map((h) => (
            <li
              key={h.id}
              className="flex items-center justify-between gap-3 border-b border-zinc-100 py-1.5 dark:border-zinc-800"
            >
              <span className="flex flex-col gap-0.5">
                <span className="flex items-baseline gap-2">
                  <span
                    className={
                      "font-semibold tabular-nums " +
                      (h.change > 0 ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600 dark:text-amber-400")
                    }
                  >
                    {formatChange(h.change)}
                  </span>
                  {h.amount != null && (
                    <span className="text-xs text-emerald-600 tabular-nums dark:text-emerald-400">
                      {formatYen(h.amount)}
                    </span>
                  )}
                </span>
                {h.expires_at != null && (
                  <span className="text-xs text-amber-600 dark:text-amber-400">期限 {h.expires_at}</span>
                )}
              </span>
              <span className="flex flex-col items-end text-right leading-tight">
                <span className="text-zinc-500">{new Date(h.changed_at).toLocaleString("ja-JP")}</span>
                <span className="text-xs text-zinc-400">{h.user?.name ?? "不明"}</span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </Modal>
  );
}

/**
 * バーコード読取 (モバイルのカメラスキャンに相当)。
 * USB / Bluetooth のバーコードリーダーはキーボード入力 + Enter として動作する。
 */
export function BarcodeScanModal({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (barcode: string) => Promise<void>;
}) {
  const [value, setValue] = useState("");
  const [processing, run] = useBusy();
  const trimmed = value.trim();

  return (
    <Modal title="バーコードをスキャン" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (trimmed && !processing) void run(() => onSubmit(trimmed));
        }}
        className="space-y-4"
      >
        <p className="text-sm text-zinc-500">
          バーコードを入力するか、バーコードリーダーで読み取ってください。登録済みなら入庫・払い出しを選択、未登録なら物品追加に進みます。
        </p>
        <input
          type="text"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          placeholder="例: 4901234567890"
          maxLength={64}
          className={`${cls.input} font-mono tabular-nums`}
          autoFocus
        />
        <ModalActions>
          <button type="button" onClick={onClose} disabled={processing} className={cls.secondaryButton}>
            キャンセル
          </button>
          <button type="submit" disabled={processing || !trimmed} className={cls.primaryButton}>
            {processing ? "処理中..." : "読み取る"}
          </button>
        </ModalActions>
      </form>
    </Modal>
  );
}

/** スキャンした品目が登録済みのとき、入庫 (+1) か払い出し (-1) かを選ぶ */
export function ScanActionModal({
  item,
  onClose,
  onIncrement,
  onDecrement,
}: {
  item: Item;
  onClose: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}) {
  const canDecrement = item.stock > 0;

  return (
    <Modal title="入庫 / 払い出し" onClose={onClose}>
      <div className="space-y-1 rounded-xl bg-zinc-50 p-3 dark:bg-zinc-900/60">
        <p className="font-semibold break-words">{item.name}</p>
        <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-500">
          {item.barcode && (
            <span className="inline-flex items-center gap-1 font-mono text-xs tabular-nums">
              <Barcode aria-hidden className="h-3.5 w-3.5" />
              {item.barcode}
            </span>
          )}
          <Badge tone={canDecrement ? "info" : "danger"}>
            {canDecrement ? `現在の在庫 ${item.stock}` : "在庫切れ"}
          </Badge>
        </div>
      </div>
      <p className="text-sm text-zinc-500">買ってきたら「入庫」、使ったら「払い出し」を選んでください。</p>
      <div className="grid grid-cols-2 gap-3">
        <button
          type="button"
          onClick={onIncrement}
          autoFocus
          className="flex flex-col items-center gap-1 rounded-xl bg-emerald-600 py-4 font-bold text-white shadow-sm hover:bg-emerald-700"
        >
          <ArrowDownToLine aria-hidden className="h-6 w-6" />
          入庫 (+1)
        </button>
        <button
          type="button"
          onClick={onDecrement}
          disabled={!canDecrement}
          className="flex flex-col items-center gap-1 rounded-xl bg-amber-500 py-4 font-bold text-white shadow-sm hover:bg-amber-600 disabled:opacity-40"
        >
          <ArrowUpFromLine aria-hidden className="h-6 w-6" />
          払い出し (-1)
        </button>
      </div>
      {!canDecrement && <Hint>在庫が 0 のため、払い出しはできません。入庫すると金額と期限を入力できます。</Hint>}
      <ModalActions>
        <button type="button" onClick={onClose} className={cls.secondaryButton}>
          キャンセル
        </button>
      </ModalActions>
    </Modal>
  );
}
