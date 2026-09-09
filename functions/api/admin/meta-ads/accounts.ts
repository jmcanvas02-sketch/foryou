import { requireAdmin } from "../../../_lib/ads-auth";
import {
  errorResponse,
  HttpError,
  jsonResponse,
  readJsonObject,
} from "../../../_lib/http";
import {
  fetchMetaAdAccount,
  listMetaAdsAccounts,
  loadStoredMetaAccessToken,
  normalizeAdAccountId,
  publicAccountRow,
} from "../../../_lib/meta-ads-report";
import type { MetaAdsFunctionEnv } from "../../../_lib/meta-ads-report";
import { supabaseServerFetch } from "../../../_lib/supabase-server";

type RouteContext = {
  request: Request;
  env: MetaAdsFunctionEnv;
};

export async function onRequestGet(context: RouteContext) {
  try {
    await requireAdmin(context.request, context.env);
    const accounts = await listMetaAdsAccounts(context.env);

    return jsonResponse({
      success: true,
      accounts: accounts.map(publicAccountRow),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost(context: RouteContext) {
  try {
    await requireAdmin(context.request, context.env);
    const body = await readJsonObject(context.request);
    const normalizedId = normalizeAdAccountId(body.adAccountId);
    const existing = await supabaseServerFetch(
      context.env,
      "/rest/v1/meta_ads_report_accounts" +
        `?ad_account_id=eq.${encodeURIComponent(normalizedId)}` +
        "&select=id&limit=1",
    );

    if (!existing.ok) {
      throw new HttpError(500, "Không thể kiểm tra tài khoản quảng cáo.");
    }

    const existingRows = (await existing.json()) as unknown;

    if (Array.isArray(existingRows) && existingRows.length > 0) {
      throw new HttpError(409, "Tài khoản quảng cáo này đã có trong danh sách.");
    }

    const stored = await loadStoredMetaAccessToken(context.env);
    const account = await fetchMetaAdAccount(
      context.env,
      stored.accessToken,
      normalizedId,
    );
    const verifiedAt = new Date().toISOString();
    const response = await supabaseServerFetch(
      context.env,
      "/rest/v1/meta_ads_report_accounts",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          ad_account_id: account.adAccountId,
          account_name: account.accountName,
          currency: account.currency,
          timezone_name: account.timezoneName,
          account_status: account.accountStatus,
          is_enabled: true,
          last_verified_at: verifiedAt,
          last_error: "",
        }),
      },
    );

    if (!response.ok) {
      console.error("meta-ads-account-insert-failed", response.status);
      throw new HttpError(500, "Không thể thêm tài khoản quảng cáo.");
    }

    const payload = (await response.json()) as unknown;
    const row = Array.isArray(payload) ? payload.at(0) : null;

    if (!row || typeof row !== "object") {
      throw new HttpError(500, "Phản hồi thêm tài khoản không hợp lệ.");
    }

    return jsonResponse(
      {
        success: true,
        account: publicAccountRow(
          row as Parameters<typeof publicAccountRow>[0],
        ),
        message: "Đã thêm tài khoản quảng cáo vào báo cáo.",
      },
      201,
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
