import { requireAdmin } from "../../../../_lib/ads-auth";
import {
  errorResponse,
  HttpError,
  jsonResponse,
  readJsonObject,
} from "../../../../_lib/http";
import {
  fetchMetaAdAccount,
  listMetaAdsAccounts,
  loadStoredMetaAccessToken,
  publicAccountRow,
} from "../../../../_lib/meta-ads-report";
import type { MetaAdsFunctionEnv } from "../../../../_lib/meta-ads-report";
import { supabaseServerFetch } from "../../../../_lib/supabase-server";

type RouteContext = {
  request: Request;
  env: MetaAdsFunctionEnv;
  params: {
    accountId?: string | string[];
  };
};

function accountIdFromContext(context: RouteContext) {
  const raw = context.params.accountId;
  const value = Array.isArray(raw) ? raw.at(0) : raw;

  if (
    !value ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new HttpError(400, "Mã tài khoản báo cáo không hợp lệ.");
  }

  return value;
}

async function loadAccount(context: RouteContext, id: string) {
  const rows = await listMetaAdsAccounts(context.env, { id });
  const account = rows.at(0);

  if (!account) {
    throw new HttpError(404, "Không tìm thấy tài khoản quảng cáo.");
  }

  return account;
}

export async function onRequestPatch(context: RouteContext) {
  try {
    await requireAdmin(context.request, context.env);
    const id = accountIdFromContext(context);
    const account = await loadAccount(context, id);
    const body = await readJsonObject(context.request);
    const action = typeof body.action === "string" ? body.action : "";
    let patch: Record<string, unknown> = {};
    let message = "Đã cập nhật tài khoản quảng cáo.";

    if (action === "verify") {
      const stored = await loadStoredMetaAccessToken(context.env);
      const verified = await fetchMetaAdAccount(
        context.env,
        stored.accessToken,
        account.ad_account_id,
      );

      patch = {
        ad_account_id: verified.adAccountId,
        account_name: verified.accountName,
        currency: verified.currency,
        timezone_name: verified.timezoneName,
        account_status: verified.accountStatus,
        last_verified_at: new Date().toISOString(),
        last_error: "",
      };
      message = "Tài khoản quảng cáo đang truy cập bình thường.";
    } else if (typeof body.isEnabled === "boolean") {
      patch = {
        is_enabled: body.isEnabled,
      };
      message = body.isEnabled
        ? "Đã đưa tài khoản vào báo cáo."
        : "Đã tạm loại tài khoản khỏi báo cáo.";
    } else {
      throw new HttpError(400, "Nội dung cập nhật tài khoản không hợp lệ.");
    }

    const response = await supabaseServerFetch(
      context.env,
      `/rest/v1/meta_ads_report_accounts?id=eq.${encodeURIComponent(id)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify(patch),
      },
    );

    if (!response.ok) {
      throw new HttpError(500, "Không thể cập nhật tài khoản quảng cáo.");
    }

    const payload = (await response.json()) as unknown;
    const row = Array.isArray(payload) ? payload.at(0) : null;

    if (!row || typeof row !== "object") {
      throw new HttpError(500, "Phản hồi cập nhật tài khoản không hợp lệ.");
    }

    return jsonResponse({
      success: true,
      account: publicAccountRow(
        row as Parameters<typeof publicAccountRow>[0],
      ),
      message,
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestDelete(context: RouteContext) {
  try {
    await requireAdmin(context.request, context.env);
    const id = accountIdFromContext(context);
    await loadAccount(context, id);
    const response = await supabaseServerFetch(
      context.env,
      `/rest/v1/meta_ads_report_accounts?id=eq.${encodeURIComponent(id)}`,
      {
        method: "DELETE",
        headers: {
          Prefer: "return=minimal",
        },
      },
    );

    if (!response.ok) {
      throw new HttpError(500, "Không thể xóa tài khoản quảng cáo.");
    }

    return jsonResponse({
      success: true,
      message: "Đã xóa tài khoản khỏi danh sách báo cáo.",
    });
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
