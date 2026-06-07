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
  category_id: number;
  description: string;
  category?: Category;
};

// トークンはメモリ保持 (アプリ再起動で再ログイン)。永続化したい場合は
// expo-secure-store を導入して get/set を差し替える。
let authToken: string | null = null;

export function getToken(): string | null {
  return authToken;
}

// 401 を受けたとき UI 側へ通知してログイン画面へ戻すためのハンドラ
let onUnauthorized: (() => void) | null = null;
export function setUnauthorizedHandler(handler: (() => void) | null): void {
  onUnauthorized = handler;
}

export type Item = {
  id: number;
  name: string;
  category_id: number;
  stock: number;
  barcode?: string | null;
  category?: Category;
};

export type ScanResult =
  | { action: "incremented"; item: Item }
  | { action: "not_found"; barcode: string };

export type ItemHistory = {
  id: number;
  item_id: number;
  change: number;
  changed_at: string;
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

  listCategories: () => request<Category[]>("/api/categories"),

  createCategory: (name: string) =>
    request<Category>("/api/categories", {
      method: "POST",
      body: JSON.stringify({ name }),
    }),

  listItems: () => request<Item[]>("/api/items"),

  createItem: (input: {
    name: string;
    category_id: number;
    stock: number;
    barcode?: string | null;
  }) =>
    request<Item>("/api/items", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  // バーコードを送ると、見つかれば +1 してアイテムを返し、見つからなければ 404 で
  // not_found を返す。404 もボディを取り出したいので、ここは fetch を直接使う。
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
    const data = (await res.json()) as { action: "incremented"; item: Item };
    return data;
  },

  decrementItem: (id: number) =>
    request<Item>(`/api/items/${id}/decrement`, { method: "PUT" }),

  incrementItem: (id: number) =>
    request<Item>(`/api/items/${id}/increment`, { method: "PUT" }),

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
};

export const apiBaseUrl = BASE_URL;
