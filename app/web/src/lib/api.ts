const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const TOKEN_KEY = "inventory_auth_token";

export type User = {
  id: number;
  name: string;
  email: string;
};

export type Category = {
  id: number;
  name: string;
  created_at?: string;
  updated_at?: string;
};

export type Item = {
  id: number;
  name: string;
  category_id: number;
  stock: number;
  barcode?: string | null;
  // 過去に単価入力のある履歴の平均金額 (円)。一度も入力がなければ null。
  // MySQL の DECIMAL は文字列で返るため number | string の両方を許容する。
  avg_amount?: number | string | null;
  created_at?: string;
  updated_at?: string;
  category?: Category;
};

export type StorageLocation = {
  id: number;
  category_id: number;
  description: string;
  created_at?: string;
  updated_at?: string;
  category?: Category;
};

export type ItemHistory = {
  id: number;
  item_id: number;
  user_id?: number | null;
  change: number;
  amount?: number | null;
  changed_at: string;
  created_at?: string;
  updated_at?: string;
  user?: { id: number; name: string } | null;
};

export type AnalyticsPeriod = "daily" | "monthly";
export type AnalyticsGroup = "total" | "category";
export type AnalyticsMetric = "stock" | "amount";

export type AnalyticsSeries = {
  name: string;
  values: number[];
};

export type AnalyticsTimeseries = {
  labels: string[]; // daily: "YYYY-MM-DD", monthly: "YYYY-MM"
  series: AnalyticsSeries[];
};

// --- 認証トークンの保持 (localStorage) -------------------------------------

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

// 401 を受けたときに UI 側へ通知してログイン画面へ戻すためのハンドラ
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
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

  if (!res.ok) {
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
    throw new Error(message);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const api = {
  // --- 認証 ---
  login: async (email: string, password: string): Promise<User> => {
    const data = await request<{ token: string; user: User }>("/api/login", {
      method: "POST",
      body: JSON.stringify({ email, password }),
    });
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

  // --- カテゴリ ---
  listCategories: () => request<Category[]>("/api/categories"),

  createCategory: (name: string) =>
    request<Category>("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  // --- 保管場所 ---
  listStorageLocations: () =>
    request<StorageLocation[]>("/api/storage-locations"),

  createStorageLocation: (input: {
    category_id: number;
    description: string;
  }) =>
    request<StorageLocation>("/api/storage-locations", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // --- 物品 ---
  listItems: () => request<Item[]>("/api/items"),

  createItem: (input: { name: string; category_id: number; stock: number }) =>
    request<Item>("/api/items", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  decrementItem: (id: number) =>
    request<Item>(`/api/items/${id}/decrement`, { method: "PUT" }),

  // amount は在庫0からの補充時のみ渡す (任意)。null/未指定なら金額なしで +1。
  incrementItem: (id: number, amount?: number | null) =>
    request<Item>(`/api/items/${id}/increment`, {
      method: "PUT",
      ...(amount != null
        ? { body: JSON.stringify({ amount }) }
        : {}),
    }),

  setItemName: (id: number, name: string) =>
    request<Item>(`/api/items/${id}/name`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    }),

  deleteItem: (id: number) =>
    request<void>(`/api/items/${id}`, { method: "DELETE" }),

  setItemBarcode: (id: number, barcode: string | null) =>
    request<Item>(`/api/items/${id}/barcode`, {
      method: "PUT",
      body: JSON.stringify({ barcode }),
    }),

  setItemCategory: (id: number, category_id: number) =>
    request<Item>(`/api/items/${id}/category`, {
      method: "PUT",
      body: JSON.stringify({ category_id }),
    }),

  listHistories: (id: number) =>
    request<ItemHistory[]>(`/api/items/${id}/histories`),

  listAnalyticsTimeseries: (
    period: AnalyticsPeriod,
    group: AnalyticsGroup,
    metric: AnalyticsMetric = "stock",
  ) =>
    request<AnalyticsTimeseries>(
      `/api/analytics/timeseries?period=${period}&group=${group}&metric=${metric}`,
    ),
};
