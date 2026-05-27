const BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

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
  created_at?: string;
  updated_at?: string;
  category?: Category;
};

export type ItemHistory = {
  id: number;
  item_id: number;
  change: number;
  changed_at: string;
  created_at?: string;
  updated_at?: string;
};

export type AnalyticsPeriod = "daily" | "monthly";
export type AnalyticsGroup = "total" | "category";

export type AnalyticsSeries = {
  name: string;
  values: number[];
};

export type AnalyticsTimeseries = {
  labels: string[]; // daily: "YYYY-MM-DD", monthly: "YYYY-MM"
  series: AnalyticsSeries[];
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

  createItem: (input: { name: string; category_id: number; stock: number }) =>
    request<Item>("/api/items", {
      method: "POST",
      body: JSON.stringify(input),
    }),

  decrementItem: (id: number) =>
    request<Item>(`/api/items/${id}/decrement`, { method: "PUT" }),

  incrementItem: (id: number) =>
    request<Item>(`/api/items/${id}/increment`, { method: "PUT" }),

  setItemBarcode: (id: number, barcode: string | null) =>
    request<Item>(`/api/items/${id}/barcode`, {
      method: "PUT",
      body: JSON.stringify({ barcode }),
    }),

  listHistories: (id: number) =>
    request<ItemHistory[]>(`/api/items/${id}/histories`),

  listAnalyticsTimeseries: (period: AnalyticsPeriod, group: AnalyticsGroup) =>
    request<AnalyticsTimeseries>(
      `/api/analytics/timeseries?period=${period}&group=${group}`,
    ),
};
