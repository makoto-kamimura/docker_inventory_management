const BASE_URL =
  process.env.EXPO_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

export type Category = {
  id: number;
  name: string;
};

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
      ...init?.headers,
    },
  });

  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`;
    try {
      const data = (await res.json()) as { message?: string; error?: string };
      message = data.message ?? data.error ?? message;
    } catch {
      // ignore parse error
    }
    throw new Error(message);
  }

  return (await res.json()) as T;
}

export const api = {
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
