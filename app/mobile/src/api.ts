const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type User = {
  id: number;
  name: string;
  email: string;
};

export type Category = {
  id: number;
  name: string;
};

export type StorageLocation = {
  id: number;
  description: string;
  created_at?: string;
  updated_at?: string;
};

export type ItemGroup = {
  id: number;
  name: string;
  items_count?: number;
};

// トークンはメモリ保持 (アプリ再起動で再ログイン)
let authToken: string | null = null;

export function getToken(): string | null {
  return authToken;
}

let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export type Item = {
  id: number;
  name: string;
  category_id: number;
  group_id?: number | null;
  storage_location_id?: number | null;
  stock: number;
  barcode?: string | null;
  category?: Category;
  group?: ItemGroup | null;
  storage_location?: StorageLocation | null;
  // MySQL の DECIMAL は文字列で返るため number | string の両方を許容する
  avg_amount?: number | string | null;
  nearest_expires_at?: string | null;
};

export type ScanResult =
  | { action: "incremented"; item: Item }
  | { action: "needs_amount"; item: Item }
  | { action: "not_found"; barcode: string };

export type ItemHistory = {
  id: number;
  item_id: number;
  user_id?: number | null;
  change: number;
  amount?: number | null;
  expires_at?: string | null;
  changed_at: string;
  user?: { id: number; name: string } | null;
};

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      ...init?.headers,
    },
  });

  if (res.status === 401) {
    authToken = null;
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
    authToken = data.token;
    return data.user;
  },

  me: () => request<User>("/api/me"),

  logout: async (): Promise<void> => {
    try {
      await request<void>("/api/logout", { method: "POST" });
    } finally {
      authToken = null;
    }
  },

  // --- カテゴリ ---
  listCategories: () => request<Category[]>("/api/categories"),

  createCategory: (name: string) =>
    request<Category>("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  deleteCategory: (id: number) =>
    request<void>(`/api/categories/${id}`, { method: "DELETE" }),

  // --- 保管場所 ---
  listStorageLocations: () =>
    request<StorageLocation[]>("/api/storage-locations"),

  createStorageLocation: (description: string) =>
    request<StorageLocation>("/api/storage-locations", {
      method: "POST",
      body: JSON.stringify({ description }),
    }),

  setItemStorageLocation: (id: number, storage_location_id: number | null) =>
    request<Item>(`/api/items/${id}/storage-location`, {
      method: "PUT",
      body: JSON.stringify({ storage_location_id }),
    }),

  deleteStorageLocation: (id: number) =>
    request<void>(`/api/storage-locations/${id}`, { method: "DELETE" }),

  // --- グループ ---
  listItemGroups: () => request<ItemGroup[]>("/api/item-groups"),

  createItemGroup: (name: string) =>
    request<ItemGroup>("/api/item-groups", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  deleteItemGroup: (id: number) =>
    request<void>(`/api/item-groups/${id}`, { method: "DELETE" }),

  setItemGroup: (id: number, group_id: number | null) =>
    request<Item>(`/api/items/${id}/group`, {
      method: "PUT",
      body: JSON.stringify({ group_id }),
    }),

  // --- 物品 ---
  listItems: () => request<Item[]>("/api/items"),

  createItem: (input: {
    name: string;
    category_id: number;
    stock: number;
    barcode?: string | null;
    group_id?: number | null;
    storage_location_id?: number | null;
    amount?: number | null;
    expires_at?: string | null;
  }) =>
    request<Item>("/api/items", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  scanBarcode: async (barcode: string): Promise<ScanResult> => {
    const res = await fetch(`${BASE_URL}/api/items/scan`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
      },
      body: JSON.stringify({ barcode }),
    });
    if (res.status === 404) {
      const data = (await res.json()) as { barcode: string };
      return { action: "not_found", barcode: data.barcode };
    }
    if (!res.ok) {
      const data = (await res
        .json()
        .catch(() => ({}))) as { message?: string; error?: string };
      throw new Error(
        data.message ?? data.error ?? `${res.status} ${res.statusText}`,
      );
    }
    const data = (await res.json()) as
      | { action: "incremented"; item: Item }
      | { action: "needs_amount"; item: Item };
    return data;
  },

  decrementItem: (id: number) =>
    request<Item>(`/api/items/${id}/decrement`, { method: "PUT" }),

  // amount / expiresAt は在庫0からの補充時のみ渡す (任意)
  incrementItem: (id: number, amount?: number | null, expiresAt?: string | null) => {
    const body: Record<string, unknown> = {};
    if (amount != null) body.amount = amount;
    if (expiresAt != null) body.expires_at = expiresAt;
    return request<Item>(`/api/items/${id}/increment`, {
      method: "PUT",
      ...(Object.keys(body).length > 0 ? { body: JSON.stringify(body) } : {}),
    });
  },

  setItemBarcode: (id: number, barcode: string | null) =>
    request<Item>(`/api/items/${id}/barcode`, {
      method: "PUT",
      body: JSON.stringify({ barcode }),
    }),

  setItemName: (id: number, name: string) =>
    request<Item>(`/api/items/${id}/name`, {
      method: "PUT",
      body: JSON.stringify({ name }),
    }),

  deleteItem: (id: number) =>
    request<void>(`/api/items/${id}`, { method: "DELETE" }),

  setItemCategory: (id: number, category_id: number) =>
    request<Item>(`/api/items/${id}/category`, {
      method: "PUT",
      body: JSON.stringify({ category_id }),
    }),

  listHistories: (id: number) =>
    request<ItemHistory[]>(`/api/items/${id}/histories`),
};

export const apiBaseUrl = BASE_URL;
