import { supabase } from "../lib/supabase";
import type {
  MetaAdsConnectionStatus,
  MetaAdsCostReport,
  MetaAdsCurrencyTotal,
  MetaAdsDailyCurrencyTotal,
  MetaAdsReportAccount,
  MetaAdsReportError,
} from "../types/metaAdsReport";

type ApiPayload = {
  success?: boolean;
  error?: string;
  message?: string;
};

type ConnectionPayload = ApiPayload & {
  connection?: MetaAdsConnectionStatus;
};

type AccountsPayload = ApiPayload & {
  accounts?: MetaAdsReportAccount[];
  account?: MetaAdsReportAccount;
};

type ReportPayload = ApiPayload & {
  report?: MetaAdsCostReport;
};

type DateChunk = {
  since: string;
  until: string;
};

async function adminAccessToken() {
  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error || !session?.access_token) {
    throw new Error(
      "Phiên đăng nhập quản trị đã hết hạn. Vui lòng đăng nhập lại.",
    );
  }

  return session.access_token;
}

async function requestJson<T extends ApiPayload>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const token = await adminAccessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  headers.set("Accept", "application/json");

  if (init.body) {
    headers.set("Content-Type", "application/json");
  }

  const response = await fetch(path, {
    ...init,
    headers,
    cache: "no-store",
  });

  let payload: T;
  try {
    payload = (await response.json()) as T;
  } catch {
    payload = {} as T;
  }

  if (!response.ok) {
    throw new Error(
      payload.error ||
        payload.message ||
        `Máy chủ trả về lỗi HTTP ${response.status}.`,
    );
  }

  return payload;
}

function parseDate(value: string, label: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Ngày ${label} không hợp lệ.`);
  }

  const date = new Date(`${value}T00:00:00Z`);
  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new Error(`Ngày ${label} không tồn tại.`);
  }

  return date;
}

function toDateInputUtc(date: Date) {
  return date.toISOString().slice(0, 10);
}

function splitDateRange(
  since: string,
  until: string,
  maxDays = 90,
): DateChunk[] {
  const start = parseDate(since, "bắt đầu");
  const end = parseDate(until, "kết thúc");

  if (start.getTime() > end.getTime()) {
    throw new Error(
      "Ngày bắt đầu không được lớn hơn ngày kết thúc.",
    );
  }

  const chunks: DateChunk[] = [];
  let cursor = new Date(start);

  while (cursor.getTime() <= end.getTime()) {
    const chunkStart = new Date(cursor);
    const chunkEnd = new Date(cursor);
    chunkEnd.setUTCDate(chunkEnd.getUTCDate() + maxDays - 1);

    if (chunkEnd.getTime() > end.getTime()) {
      chunkEnd.setTime(end.getTime());
    }

    chunks.push({
      since: toDateInputUtc(chunkStart),
      until: toDateInputUtc(chunkEnd),
    });

    cursor = new Date(chunkEnd);
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return chunks;
}

export async function loadMetaAdsConnection() {
  const payload = await requestJson<ConnectionPayload>(
    "/api/admin/meta-ads/connection",
  );

  if (!payload.connection) {
    throw new Error("Phản hồi kết nối Meta không hợp lệ.");
  }

  return payload.connection;
}

export async function saveMetaAdsConnection(accessToken: string) {
  const normalized = accessToken.trim();

  if (!normalized) {
    throw new Error("Vui lòng nhập Meta Access Token.");
  }

  const payload = await requestJson<ConnectionPayload>(
    "/api/admin/meta-ads/connection",
    {
      method: "PUT",
      body: JSON.stringify({ accessToken: normalized }),
    },
  );

  if (!payload.connection) {
    throw new Error("Phản hồi lưu kết nối Meta không hợp lệ.");
  }

  return {
    connection: payload.connection,
    message: payload.message || "Đã lưu kết nối Meta.",
  };
}

export async function testMetaAdsConnection() {
  const payload = await requestJson<ConnectionPayload>(
    "/api/admin/meta-ads/connection",
    {
      method: "POST",
    },
  );

  if (!payload.connection) {
    throw new Error("Phản hồi kiểm tra kết nối Meta không hợp lệ.");
  }

  return {
    connection: payload.connection,
    message: payload.message || "Kết nối Meta đang hoạt động.",
  };
}

export async function deleteMetaAdsConnection() {
  const payload = await requestJson<ConnectionPayload>(
    "/api/admin/meta-ads/connection",
    {
      method: "DELETE",
    },
  );

  return payload.message || "Đã xóa kết nối Meta.";
}

export async function listMetaAdsReportAccounts() {
  const payload = await requestJson<AccountsPayload>(
    "/api/admin/meta-ads/accounts",
  );

  return payload.accounts ?? [];
}

export async function addMetaAdsReportAccount(adAccountId: string) {
  const normalized = adAccountId.trim();

  if (!normalized) {
    throw new Error("Vui lòng nhập ID tài khoản quảng cáo.");
  }

  const payload = await requestJson<AccountsPayload>(
    "/api/admin/meta-ads/accounts",
    {
      method: "POST",
      body: JSON.stringify({ adAccountId: normalized }),
    },
  );

  if (!payload.account) {
    throw new Error("Phản hồi thêm tài khoản không hợp lệ.");
  }

  return {
    account: payload.account,
    message: payload.message || "Đã thêm tài khoản quảng cáo.",
  };
}

export async function setMetaAdsReportAccountEnabled(
  id: string,
  isEnabled: boolean,
) {
  const payload = await requestJson<AccountsPayload>(
    `/api/admin/meta-ads/accounts/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ isEnabled }),
    },
  );

  if (!payload.account) {
    throw new Error("Phản hồi cập nhật tài khoản không hợp lệ.");
  }

  return {
    account: payload.account,
    message: payload.message || "Đã cập nhật tài khoản.",
  };
}

export async function verifyMetaAdsReportAccount(id: string) {
  const payload = await requestJson<AccountsPayload>(
    `/api/admin/meta-ads/accounts/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ action: "verify" }),
    },
  );

  if (!payload.account) {
    throw new Error("Phản hồi kiểm tra tài khoản không hợp lệ.");
  }

  return {
    account: payload.account,
    message: payload.message || "Tài khoản đang hoạt động.",
  };
}

export async function deleteMetaAdsReportAccount(id: string) {
  const payload = await requestJson<AccountsPayload>(
    `/api/admin/meta-ads/accounts/${encodeURIComponent(id)}`,
    {
      method: "DELETE",
    },
  );

  return payload.message || "Đã xóa tài khoản quảng cáo.";
}

export async function loadMetaAdsCostReport(input: {
  since: string;
  until: string;
  accountId?: string;
  includeDaily?: boolean;
}) {
  const params = new URLSearchParams({
    since: input.since,
    until: input.until,
  });

  if (input.accountId && input.accountId !== "all") {
    params.set("accountId", input.accountId);
  }

  if (input.includeDaily) {
    params.set("daily", "1");
  }

  const payload = await requestJson<ReportPayload>(
    `/api/admin/meta-ads/report?${params.toString()}`,
  );

  if (!payload.report) {
    throw new Error("Phản hồi báo cáo chi phí Ads không hợp lệ.");
  }

  return payload.report;
}

export async function loadMetaAdsRevenueSummary(input: {
  since: string;
  until: string;
}) {
  const chunks = splitDateRange(input.since, input.until, 90);
  const totals = new Map<string, number>();
  const dailyTotals = new Map<string, number>();
  const errors = new Map<string, MetaAdsReportError>();

  for (const chunk of chunks) {
    const report = await loadMetaAdsCostReport({
      since: chunk.since,
      until: chunk.until,
      includeDaily: true,
    });

    for (const total of report.totalsByCurrency ?? []) {
      const currency = total.currency.trim().toUpperCase() || "UNKNOWN";
      totals.set(currency, (totals.get(currency) ?? 0) + total.spend);
    }

    for (const total of report.dailyTotalsByCurrency ?? []) {
      const currency = total.currency.trim().toUpperCase() || "UNKNOWN";
      const key = `${total.date}|${currency}`;
      dailyTotals.set(key, (dailyTotals.get(key) ?? 0) + total.spend);
    }

    for (const error of report.errors ?? []) {
      const key = `${error.accountId}|${error.message}`;
      if (!errors.has(key)) {
        errors.set(key, error);
      }
    }
  }

  const totalsByCurrency: MetaAdsCurrencyTotal[] = [...totals.entries()]
    .map(([currency, spend]) => ({ currency, spend }))
    .sort((left, right) => left.currency.localeCompare(right.currency));

  const dailyTotalsByCurrency: MetaAdsDailyCurrencyTotal[] = [
    ...dailyTotals.entries(),
  ]
    .map(([key, spend]) => {
      const [date, currency] = key.split("|");
      return { date, currency, spend };
    })
    .sort(
      (left, right) =>
        left.date.localeCompare(right.date) ||
        left.currency.localeCompare(right.currency),
    );

  return {
    since: input.since,
    until: input.until,
    totalsByCurrency,
    dailyTotalsByCurrency,
    errors: [...errors.values()],
  };
}