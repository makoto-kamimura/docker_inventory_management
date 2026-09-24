// API クライアント。app/mobile/src/api.ts とは「認証トークンの保持」部分以外を同一に保つこと。

const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type User = {
  id: number;
  name: string;
  email: string;
  tenant: string;
};

export type Category = {
  id: number;
  name: string;
  created_at?: string;
  updated_at?: string;
};

export type ItemGroup = {
  id: number;
  name: string;
  items_count?: number;
  created_at?: string;
  updated_at?: string;
};

export type StorageLocation = {
  id: number;
  description: string;
  created_at?: string;
  updated_at?: string;
};

export type Item = {
  id: number;
  name: string;
  category_id: number;
  group_id?: number | null;
  storage_location_id?: number | null;
  stock: number;
  barcode?: string | null;
  // 過去に単価入力のある履歴の平均金額 (円)。一度も入力がなければ null。
  // MySQL の DECIMAL は文字列で返るため number | string の両方を許容する。
  avg_amount?: number | string | null;
  nearest_expires_at?: string | null;
  created_at?: string;
  updated_at?: string;
  category?: Category;
  group?: ItemGroup | null;
  storage_location?: StorageLocation | null;
};

export type CreateItemInput = {
  name: string;
  category_id: number;
  stock: number;
  barcode?: string | null;
  group_id?: number | null;
  storage_location_id?: number | null;
  amount?: number | null;
  expires_at?: string | null;
};

export type ItemHistory = {
  id: number;
  item_id: number;
  user_id?: number | null;
  change: number;
  amount?: number | null;
  expires_at?: string | null;
  changed_at: string;
  created_at?: string;
  updated_at?: string;
  user?: { id: number; name: string } | null;
};

export type ScanResult =
  | { action: "incremented"; item: Item }
  | { action: "needs_amount"; item: Item }
  | { action: "not_found"; barcode: string };

export type Inventory = {
  items: Item[];
  categories: Category[];
  storageLocations: StorageLocation[];
  itemGroups: ItemGroup[];
};

export type AnalyticsPeriod = "daily" | "monthly";
export type AnalyticsGroup = "total" | "category";
export type AnalyticsMetric = "stock" | "amount";

export type AnalyticsQuery = {
  period: AnalyticsPeriod;
  group: AnalyticsGroup;
  metric: AnalyticsMetric;
};

export type AnalyticsSeries = {
  name: string;
  values: number[];
};

export type AnalyticsTimeseries = {
  labels: string[]; // daily: "YYYY-MM-DD", monthly: "YYYY-MM"
  series: AnalyticsSeries[];
};

// --- 認証トークンの保持 (localStorage) -------------------------------------

const TOKEN_KEY = "inventory_auth_token";

export function getToken(): string | null {
  if (typeof window === "undefined") return null;
  return window.localStorage.getItem(TOKEN_KEY);
}

function setToken(token: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(TOKEN_KEY, token);
}

function clearToken(): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(TOKEN_KEY);
}

// --- 以下 Web / モバイル共通 -------------------------------------------------

// 401 を受けたときに UI 側へ通知してログイン画面へ戻すためのハンドラ
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

// 401 のみ共通処理し、それ以外のステータスの扱いは呼び出し側に委ねる
async function send(path: string, init?: RequestInit): Promise<Response> {
  const token = getToken();
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    clearToken();
    onUnauthorized?.();
    throw new Error("認証が切れました。再度ログインしてください。");
  }
  return res;
}

async function errorFrom(res: Response): Promise<Error> {
  let message = `${res.status} ${res.statusText}`;
  try {
    const data = (await res.json()) as {
      message?: string;
      error?: string;
      errors?: Record<string, string[]>;
    };
    message =
      (data.errors && Object.values(data.errors)[0]?.[0]) ??
      data.message ??
      data.error ??
      message;
  } catch {
    // ignore parse error
  }
  return new Error(message);
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await send(path, init);
  if (!res.ok) throw await errorFrom(res);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

function withBody(method: string, body: unknown): RequestInit {
  return { method, body: JSON.stringify(body) };
}

export const api = {
  // --- 認証 ---
  login: async (email: string, password: string): Promise<User> => {
    const data = await request<{ token: string; user: User }>(
      "/api/login",
      withBody("POST", { email, password }),
    );
    setToken(data.token);
    return data.user;
  },

  me: () => request<User>("/api/me"),

  logout: async (): Promise<void> => {
    try {
      await request<void>("/api/logout", { method: "POST" });
    } finally {
      clearToken();
    }
  },

  // 一覧画面で使うマスタと物品をまとめて取得する
  loadInventory: async (): Promise<Inventory> => {
    const [items, categories, storageLocations, itemGroups] = await Promise.all([
      api.listItems(),
      api.listCategories(),
      api.listStorageLocations(),
      api.listItemGroups(),
    ]);
    return { items, categories, storageLocations, itemGroups };
  },

  // --- カテゴリ ---
  listCategories: () => request<Category[]>("/api/categories"),

  createCategory: (name: string) =>
    request<Category>("/api/categories", withBody("POST", { name })),

  deleteCategory: (id: number) =>
    request<void>(`/api/categories/${id}`, { method: "DELETE" }),

  // --- 保管場所 ---
  listStorageLocations: () =>
    request<StorageLocation[]>("/api/storage-locations"),

  createStorageLocation: (description: string) =>
    request<StorageLocation>(
      "/api/storage-locations",
      withBody("POST", { description }),
    ),

  deleteStorageLocation: (id: number) =>
    request<void>(`/api/storage-locations/${id}`, { method: "DELETE" }),

  // --- グループ ---
  listItemGroups: () => request<ItemGroup[]>("/api/item-groups"),

  createItemGroup: (name: string) =>
    request<ItemGroup>("/api/item-groups", withBody("POST", { name })),

  deleteItemGroup: (id: number) =>
    request<void>(`/api/item-groups/${id}`, { method: "DELETE" }),

  // --- 物品 ---
  listItems: () => request<Item[]>("/api/items"),

  createItem: (input: CreateItemInput) =>
    request<Item>("/api/items", withBody("POST", input)),

  // 登録済みなら在庫 +1 (在庫0なら金額入力が必要なので加算しない)、未登録なら not_found
  scanBarcode: async (barcode: string): Promise<ScanResult> => {
    const res = await send("/api/items/scan", withBody("POST", { barcode }));
    if (res.status === 404) return { action: "not_found", barcode };
    if (!res.ok) throw await errorFrom(res);
    return (await res.json()) as ScanResult;
  },

  decrementItem: (id: number) =>
    request<Item>(`/api/items/${id}/decrement`, { method: "PUT" }),

  // amount / expiresAt は在庫0からの補充時のみ渡す (任意)
  incrementItem: (id: number, amount?: number | null, expiresAt?: string | null) => {
    const body: Record<string, unknown> = {};
    if (amount != null) body.amount = amount;
    if (expiresAt != null) body.expires_at = expiresAt;
    return request<Item>(
      `/api/items/${id}/increment`,
      Object.keys(body).length > 0 ? withBody("PUT", body) : { method: "PUT" },
    );
  },

  setItemName: (id: number, name: string) =>
    request<Item>(`/api/items/${id}/name`, withBody("PUT", { name })),

  setItemBarcode: (id: number, barcode: string | null) =>
    request<Item>(`/api/items/${id}/barcode`, withBody("PUT", { barcode })),

  setItemCategory: (id: number, category_id: number) =>
    request<Item>(`/api/items/${id}/category`, withBody("PUT", { category_id })),

  setItemGroup: (id: number, group_id: number | null) =>
    request<Item>(`/api/items/${id}/group`, withBody("PUT", { group_id })),

  setItemStorageLocation: (id: number, storage_location_id: number | null) =>
    request<Item>(
      `/api/items/${id}/storage-location`,
      withBody("PUT", { storage_location_id }),
    ),

  deleteItem: (id: number) =>
    request<void>(`/api/items/${id}`, { method: "DELETE" }),

  listHistories: (id: number) =>
    request<ItemHistory[]>(`/api/items/${id}/histories`),

  // --- 分析 ---
  listAnalyticsTimeseries: ({ period, group, metric }: AnalyticsQuery) =>
    request<AnalyticsTimeseries>(
      `/api/analytics/timeseries?period=${period}&group=${group}&metric=${metric}`,
    ),
};
