import { requireAdmin } from "../../../_lib/ads-auth";
import { encryptAccessToken } from "../../../_lib/ads-crypto";
import {
  errorResponse,
  HttpError,
  jsonResponse,
  readJsonObject,
} from "../../../_lib/http";
import {
  loadMetaAdsConnection,
  loadStoredMetaAccessToken,
  validateMetaAccessToken,
} from "../../../_lib/meta-ads-report";
import type {
  MetaAdsConnectionRow,
  MetaAdsFunctionEnv,
} from "../../../_lib/meta-ads-report";
import {
  requireEncryptionKey,
  supabaseServerFetch,
} from "../../../_lib/supabase-server";

type RouteContext = {
  request: Request;
  env: MetaAdsFunctionEnv;
};

function publicConnection(connection: MetaAdsConnectionRow | null) {
  if (!connection) {
    return {
      configured: false,
      tokenLastFour: null,
      status: "disconnected" as const,
      lastVerifiedAt: null,
      lastError: "",
      updatedAt: null,
    };
  }

  return {
    configured: true,
    tokenLastFour: connection.token_last_four,
    status: connection.token_status,
    lastVerifiedAt: connection.last_verified_at,
    lastError: connection.last_error,
    updatedAt: connection.updated_at,
  };
}

async function saveConnection(
  env: MetaAdsFunctionEnv,
  input: {
    ciphertext: string;
    initializationVector: string;
    tokenLastFour: string;
    verifiedAt: string;
  },
) {
  const response = await supabaseServerFetch(
    env,
    "/rest/v1/meta_ads_report_connections?on_conflict=singleton_key",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "resolution=merge-duplicates,return=representation",
      },
      body: JSON.stringify({
        singleton_key: "primary",
        ciphertext: input.ciphertext,
        initialization_vector: input.initializationVector,
        algorithm: "AES-GCM",
        token_last_four: input.tokenLastFour,
        token_status: "connected",
        last_verified_at: input.verifiedAt,
        last_error: "",
      }),
    },
  );

  if (!response.ok) {
    console.error("meta-ads-connection-save-failed", response.status);
    throw new HttpError(500, "Không thể lưu kết nối Meta.");
  }
}

async function updateVerification(
  env: MetaAdsFunctionEnv,
  input: {
    status: "connected" | "error";
    verifiedAt: string;
    error: string;
  },
) {
  const response = await supabaseServerFetch(
    env,
    "/rest/v1/meta_ads_report_connections?singleton_key=eq.primary",
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        token_status: input.status,
        last_verified_at: input.verifiedAt,
        last_error: input.error.slice(0, 500),
      }),
    },
  );

  if (!response.ok) {
    console.error("meta-ads-connection-status-failed", response.status);
  }
}

export async function onRequestGet(context: RouteContext) {
  try {
    await requireAdmin(context.request, context.env);
    const connection = await loadMetaAdsConnection(context.env);

    return jsonResponse({
      success: true,
      connection: publicConnection(connection),
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPut(context: RouteContext) {
  try {
    await requireAdmin(context.request, context.env);
    const body = await readJsonObject(context.request);
    const accessToken =
      typeof body.accessToken === "string" ? body.accessToken.trim() : "";
    const validation = await validateMetaAccessToken(
      context.env,
      accessToken,
    );
    const encrypted = await encryptAccessToken(
      accessToken,
      requireEncryptionKey(context.env),
    );
    const verifiedAt = new Date().toISOString();

    await saveConnection(context.env, {
      ciphertext: encrypted.ciphertext,
      initializationVector: encrypted.initializationVector,
      tokenLastFour: accessToken.slice(-4),
      verifiedAt,
    });

    const connection = await loadMetaAdsConnection(context.env);

    return jsonResponse({
      success: true,
      connection: publicConnection(connection),
      validation,
      message: "Meta Access Token đã được kiểm tra, mã hóa và lưu an toàn.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPost(context: RouteContext) {
  try {
    await requireAdmin(context.request, context.env);
    const stored = await loadStoredMetaAccessToken(context.env);
    const verifiedAt = new Date().toISOString();

    try {
      const validation = await validateMetaAccessToken(
        context.env,
        stored.accessToken,
      );

      await updateVerification(context.env, {
        status: "connected",
        verifiedAt,
        error: "",
      });

      const connection = await loadMetaAdsConnection(context.env);

      return jsonResponse({
        success: true,
        connection: publicConnection(connection),
        validation,
        message: "Kết nối Meta đang hoạt động bình thường.",
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Không thể kiểm tra token.";

      await updateVerification(context.env, {
        status: "error",
        verifiedAt,
        error: message,
      });

      throw error;
    }
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestDelete(context: RouteContext) {
  try {
    await requireAdmin(context.request, context.env);
    const response = await supabaseServerFetch(
      context.env,
      "/rest/v1/meta_ads_report_connections?singleton_key=eq.primary",
      {
        method: "DELETE",
        headers: {
          Prefer: "return=minimal",
        },
      },
    );

    if (!response.ok) {
      throw new HttpError(500, "Không thể xóa kết nối Meta.");
    }

    return jsonResponse({
      success: true,
      connection: publicConnection(null),
      message: "Đã xóa Meta Access Token.",
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
