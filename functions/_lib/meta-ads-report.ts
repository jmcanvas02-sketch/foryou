import { decryptAccessToken } from "./ads-crypto";
import { HttpError } from "./http";
import {
  requireEncryptionKey,
  supabaseServerFetch,
} from "./supabase-server";
import type { AdsFunctionEnv } from "./supabase-server";

export type MetaAdsFunctionEnv = AdsFunctionEnv & {
  META_GRAPH_API_VERSION?: string;
};

const CONNECTION_KEY = "primary";
const MAX_GRAPH_PAGES = 50;

export type MetaAdsConnectionRow = {
  singleton_key: string;
  ciphertext: string;
  initialization_vector: string;
  algorithm: string;
  token_last_four: string;
  token_status: "connected" | "error";
  last_verified_at: string | null;
  last_error: string;
  created_at: string;
  updated_at: string;
};

export type MetaAdsAccountRow = {
  id: string;
  ad_account_id: string;
  account_name: string;
  currency: string;
  timezone_name: string;
  account_status: number | null;
  is_enabled: boolean;
  last_verified_at: string | null;
  last_error: string;
  created_at: string;
  updated_at: string;
};

export type MetaAdsAccountDetails = {
  adAccountId: string;
  accountName: string;
  currency: string;
  timezoneName: string;
  accountStatus: number | null;
};

export type MetaAdsReportCampaign = {
  campaignId: string;
  campaignName: string;
  spend: number;
};

type MetaPermission = {
  permission?: unknown;
  status?: unknown;
};

type MetaGraphError = {
  message?: unknown;
  type?: unknown;
  code?: unknown;
  error_subcode?: unknown;
  fbtrace_id?: unknown;
};

type MetaInsightsRow = {
  campaign_id?: unknown;
  campaign_name?: unknown;
  spend?: unknown;
  date_start?: unknown;
};

function cleanString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function cleanNumber(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  return null;
}

function graphApiBase(_env: MetaAdsFunctionEnv) {
  void _env;
  return "https://graph.facebook.com/v24.0";
}
function graphUrl(
  env: MetaAdsFunctionEnv,
  path: string,
  accessToken: string,
  params: Record<string, string> = {},
) {
  const base = graphApiBase(env).replace(/\/+$/, "");
  const normalizedPath = path.replace(/^\/+/, "");
  const url = new URL(`${base}/${normalizedPath}`);

  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }

  url.searchParams.set("access_token", accessToken);
  return url;
}

function graphErrorMessage(
  responseStatus: number,
  error: MetaGraphError | undefined,
) {
  const code = cleanNumber(error?.code);
  const message = cleanString(error?.message);

  if (code === 190 || responseStatus === 401) {
    return "Meta Access Token đã hết hạn hoặc không hợp lệ.";
  }

  if (code === 10 || code === 200 || responseStatus === 403) {
    return "Token không có quyền đọc tài khoản quảng cáo này.";
  }

  if (code === 17 || code === 80004 || responseStatus === 429) {
    return "Meta đang giới hạn tần suất truy vấn. Vui lòng thử lại sau.";
  }

  return message || `Meta API trả về lỗi HTTP ${responseStatus}.`;
}

async function fetchGraphObject(
  url: URL,
): Promise<Record<string, unknown>> {
  if (
    url.protocol !== "https:" ||
    url.hostname !== "graph.facebook.com"
  ) {
    throw new HttpError(500, "Địa chỉ Meta API không hợp lệ.");
  }

  let response: Response;

  try {
    response = await fetch(url.toString(), {
      method: "GET",
      headers: {
        Accept: "application/json",
      },
    });
  } catch {
    throw new HttpError(
      502,
      "Không thể kết nối Meta API. Vui lòng thử lại.",
    );
  }

  const payload: unknown = await response.json().catch(() => ({}));

  const objectPayload =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};

  if (!response.ok || objectPayload.error) {
    const error =
      objectPayload.error &&
      typeof objectPayload.error === "object" &&
      !Array.isArray(objectPayload.error)
        ? (objectPayload.error as MetaGraphError)
        : undefined;

    throw new HttpError(
      response.status >= 400 ? response.status : 502,
      graphErrorMessage(response.status, error),
    );
  }

  return objectPayload;
}

async function readRows<T>(
  env: MetaAdsFunctionEnv,
  path: string,
): Promise<T[]> {
  const response = await supabaseServerFetch(env, path);

  if (!response.ok) {
    console.error("meta-campaigns-supabase-read-failed", response.status);
    throw new HttpError(500, "Không thể đọc dữ liệu báo cáo Ads.");
  }

  const payload = (await response.json()) as unknown;
  return Array.isArray(payload) ? (payload as T[]) : [];
}

export function normalizeAdAccountId(value: unknown) {
  const raw = cleanString(value).replace(/^act_/i, "");

  if (!/^\d{5,30}$/.test(raw)) {
    throw new HttpError(
      400,
      "ID tài khoản quảng cáo không hợp lệ. Hãy nhập dạng act_123456789 hoặc dãy số.",
    );
  }

  return `act_${raw}`;
}

export function publicAccountRow(row: MetaAdsAccountRow) {
  return {
    id: row.id,
    adAccountId: row.ad_account_id,
    accountName: row.account_name,
    currency: row.currency,
    timezoneName: row.timezone_name,
    accountStatus: row.account_status,
    isEnabled: row.is_enabled,
    lastVerifiedAt: row.last_verified_at,
    lastError: row.last_error,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function loadMetaAdsConnection(
  env: MetaAdsFunctionEnv,
): Promise<MetaAdsConnectionRow | null> {
  const rows = await readRows<MetaAdsConnectionRow>(
    env,
    "/rest/v1/meta_ads_report_connections" +
      `?singleton_key=eq.${CONNECTION_KEY}` +
      "&select=singleton_key,ciphertext,initialization_vector,algorithm,token_last_four,token_status,last_verified_at,last_error,created_at,updated_at" +
      "&limit=1",
  );

  return rows.at(0) ?? null;
}

export async function loadStoredMetaAccessToken(
  env: MetaAdsFunctionEnv,
) {
  const connection = await loadMetaAdsConnection(env);

  if (!connection) {
    throw new HttpError(
      409,
      "Chưa kết nối Meta. Hãy lưu Access Token trước.",
    );
  }

  const accessToken = await decryptAccessToken(
    connection.ciphertext,
    connection.initialization_vector,
    requireEncryptionKey(env),
  );

  if (!accessToken.trim()) {
    throw new HttpError(500, "Meta Access Token đang lưu không hợp lệ.");
  }

  return {
    connection,
    accessToken,
  };
}

export async function validateMetaAccessToken(
  env: MetaAdsFunctionEnv,
  accessToken: string,
) {
  const normalized = accessToken.trim();

  if (normalized.length < 20 || normalized.length > 12000) {
    throw new HttpError(400, "Meta Access Token không hợp lệ.");
  }

  const profile = await fetchGraphObject(
    graphUrl(env, "me", normalized, {
      fields: "id,name",
    }),
  );
  const permissions = await fetchGraphObject(
    graphUrl(env, "me/permissions", normalized),
  );
  const permissionRows = Array.isArray(permissions.data)
    ? (permissions.data as MetaPermission[])
    : [];
  const grantedScopes = permissionRows
    .filter((row) => cleanString(row.status).toLowerCase() === "granted")
    .map((row) => cleanString(row.permission))
    .filter(Boolean);
  const canReadAds =
    grantedScopes.includes("ads_read") ||
    grantedScopes.includes("ads_management");

  if (!canReadAds) {
    throw new HttpError(
      403,
      "Token chưa được cấp quyền ads_read hoặc ads_management.",
    );
  }

  return {
    metaUserId: cleanString(profile.id),
    metaUserName: cleanString(profile.name),
    grantedScopes,
  };
}

export async function fetchMetaAdAccount(
  env: MetaAdsFunctionEnv,
  accessToken: string,
  adAccountId: string,
): Promise<MetaAdsAccountDetails> {
  const normalizedId = normalizeAdAccountId(adAccountId);
  const payload = await fetchGraphObject(
    graphUrl(env, normalizedId, accessToken, {
      fields:
        "id,account_id,name,currency,timezone_name,account_status",
    }),
  );
  const returnedId = normalizeAdAccountId(
    cleanString(payload.id) || cleanString(payload.account_id),
  );

  return {
    adAccountId: returnedId,
    accountName:
      cleanString(payload.name) || `Tài khoản ${returnedId.slice(4)}`,
    currency: cleanString(payload.currency) || "VND",
    timezoneName:
      cleanString(payload.timezone_name) || "Asia/Ho_Chi_Minh",
    accountStatus: cleanNumber(payload.account_status),
  };
}

export async function listMetaAdsAccounts(
  env: MetaAdsFunctionEnv,
  options: {
    enabledOnly?: boolean;
    id?: string;
  } = {},
) {
  const filters: string[] = [];

  if (options.enabledOnly) {
    filters.push("is_enabled=eq.true");
  }

  if (options.id) {
    filters.push(`id=eq.${encodeURIComponent(options.id)}`);
  }

  const query = filters.length ? `&${filters.join("&")}` : "";

  return readRows<MetaAdsAccountRow>(
    env,
    "/rest/v1/meta_ads_report_accounts" +
      "?select=id,ad_account_id,account_name,currency,timezone_name,account_status,is_enabled,last_verified_at,last_error,created_at,updated_at" +
      query +
      "&order=created_at.asc",
  );
}

type MetaAdsInsightsResult = {
  campaigns: MetaAdsReportCampaign[];
  dailySpend: Array<{
    date: string;
    spend: number;
  }>;
};

async function fetchMetaAdsInsightsResult(
  env: MetaAdsFunctionEnv,
  accessToken: string,
  account: MetaAdsAccountRow,
  since: string,
  until: string,
  includeDaily: boolean,
): Promise<MetaAdsInsightsResult> {
  const params: Record<string, string> = {
    fields:
      "account_id,account_name,campaign_id,campaign_name,spend",
    level: "campaign",
    time_range: JSON.stringify({ since, until }),
    limit: "500",
  };

  if (includeDaily) {
    params.time_increment = "1";
  }

  let nextUrl: URL | null = graphUrl(
    env,
    `${account.ad_account_id}/insights`,
    accessToken,
    params,
  );

  const byCampaign = new Map<string, MetaAdsReportCampaign>();
  const byDate = new Map<string, number>();
  let pageCount = 0;

  while (nextUrl) {
    pageCount += 1;

    if (pageCount > MAX_GRAPH_PAGES) {
      throw new HttpError(
        502,
        `Meta trả về quá nhiều trang dữ liệu cho ${account.account_name}.`,
      );
    }

    const payload = await fetchGraphObject(nextUrl);
    const rows = Array.isArray(payload.data)
      ? (payload.data as MetaInsightsRow[])
      : [];

    for (const row of rows) {
      const spend = cleanNumber(row.spend) ?? 0;

      if (spend <= 0) {
        continue;
      }

      const campaignId =
        cleanString(row.campaign_id) ||
        `unknown-${byCampaign.size + 1}`;
      const current = byCampaign.get(campaignId);

      if (current) {
        current.spend += spend;
      } else {
        byCampaign.set(campaignId, {
          campaignId,
          campaignName:
            cleanString(row.campaign_name) || "Chiến dịch không tên",
          spend,
        });
      }

      if (includeDaily) {
        const date = cleanString(row.date_start);
        if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
          byDate.set(date, (byDate.get(date) ?? 0) + spend);
        }
      }
    }

    const paging =
      payload.paging &&
      typeof payload.paging === "object" &&
      !Array.isArray(payload.paging)
        ? (payload.paging as Record<string, unknown>)
        : {};
    const next = cleanString(paging.next);

    if (!next) {
      nextUrl = null;
      continue;
    }

    const parsed = new URL(next);
    if (
      parsed.protocol !== "https:" ||
      parsed.hostname !== "graph.facebook.com"
    ) {
      throw new HttpError(
        502,
        "Meta trả về liên kết phân trang không hợp lệ.",
      );
    }

    nextUrl = parsed;
  }

  return {
    campaigns: [...byCampaign.values()].sort(
      (left, right) => right.spend - left.spend,
    ),
    dailySpend: [...byDate.entries()]
      .map(([date, spend]) => ({ date, spend }))
      .sort((left, right) => left.date.localeCompare(right.date)),
  };
}

export async function fetchMetaAdsInsights(
  env: MetaAdsFunctionEnv,
  accessToken: string,
  account: MetaAdsAccountRow,
  since: string,
  until: string,
) {
  const result = await fetchMetaAdsInsightsResult(
    env,
    accessToken,
    account,
    since,
    until,
    false,
  );

  return result.campaigns;
}

export async function fetchMetaAdsInsightsDaily(
  env: MetaAdsFunctionEnv,
  accessToken: string,
  account: MetaAdsAccountRow,
  since: string,
  until: string,
) {
  return fetchMetaAdsInsightsResult(
    env,
    accessToken,
    account,
    since,
    until,
    true,
  );
}
