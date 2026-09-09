import {
  requireAdmin,
} from "../../../_lib/ads-auth";
import {
  encryptAccessToken,
} from "../../../_lib/ads-crypto";
import {
  errorResponse,
  HttpError,
  jsonResponse,
  readJsonObject,
} from "../../../_lib/http";
import {
  requireEncryptionKey,
  supabaseServerFetch,
} from "../../../_lib/supabase-server";
import type {
  AdsFunctionEnv,
} from "../../../_lib/supabase-server";

type RouteContext = {
  request: Request;
  env: AdsFunctionEnv;
  params: {
    sourceId?: string | string[];
  };
};

function sourceIdFromContext(
  context: RouteContext,
) {
  const rawSourceId =
    context.params.sourceId;
  const sourceId = Array.isArray(rawSourceId)
    ? rawSourceId[0]
    : rawSourceId;

  if (
    !sourceId ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      sourceId,
    )
  ) {
    throw new HttpError(
      400,
      "Mã cấu hình Pixel không hợp lệ.",
    );
  }

  return sourceId;
}

async function saveEncryptedSecret(
  env: AdsFunctionEnv,
  accessToken: string,
  sourceId: string,
  ciphertext: string,
  initializationVector: string,
  algorithm: string,
) {
  const response =
    await supabaseServerFetch(
      env,
      "/rest/v1/rpc/admin_save_ad_secret",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          p_ad_data_source_id: sourceId,
          p_ciphertext: ciphertext,
          p_initialization_vector:
            initializationVector,
          p_algorithm: algorithm,
        }),
      },
      accessToken,
    );

  if (!response.ok) {
    console.error(
      "ad-secret-save-failed",
      response.status,
    );

    if (response.status === 403) {
      throw new HttpError(
        403,
        "Tài khoản không có quyền quản trị.",
      );
    }

    throw new HttpError(
      500,
      "Không thể lưu Access Token.",
    );
  }

  const updatedAt =
    (await response.json()) as unknown;

  if (typeof updatedAt !== "string") {
    throw new HttpError(
      500,
      "Phản hồi lưu Access Token không hợp lệ.",
    );
  }

  return updatedAt;
}

async function removeEncryptedSecret(
  env: AdsFunctionEnv,
  accessToken: string,
  sourceId: string,
) {
  const response =
    await supabaseServerFetch(
      env,
      "/rest/v1/rpc/admin_delete_ad_secret",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: JSON.stringify({
          p_ad_data_source_id: sourceId,
        }),
      },
      accessToken,
    );

  if (!response.ok) {
    console.error(
      "ad-secret-delete-failed",
      response.status,
    );

    if (response.status === 403) {
      throw new HttpError(
        403,
        "Tài khoản không có quyền quản trị.",
      );
    }

    throw new HttpError(
      500,
      "Không thể xóa Access Token.",
    );
  }
}

export async function onRequestPut(
  context: RouteContext,
) {
  try {
    const sourceId =
      sourceIdFromContext(context);
    const admin =
      await requireAdmin(
        context.request,
        context.env,
      );
    const body =
      await readJsonObject(context.request);
    const accessToken =
      typeof body.accessToken === "string"
        ? body.accessToken.trim()
        : "";

    if (accessToken.length < 8) {
      throw new HttpError(
        400,
        "Access Token không hợp lệ.",
      );
    }

    if (accessToken.length > 12000) {
      throw new HttpError(
        400,
        "Access Token vượt quá giới hạn cho phép.",
      );
    }

    const encrypted =
      await encryptAccessToken(
        accessToken,
        requireEncryptionKey(context.env),
      );

    const updatedAt =
      await saveEncryptedSecret(
        context.env,
        admin.accessToken,
        sourceId,
        encrypted.ciphertext,
        encrypted.initializationVector,
        encrypted.algorithm,
      );

    return jsonResponse({
      success: true,
      tokenConfigured: true,
      tokenUpdatedAt: updatedAt,
      message:
        "Access Token đã được mã hóa và lưu an toàn.",
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestDelete(
  context: RouteContext,
) {
  try {
    const sourceId =
      sourceIdFromContext(context);
    const admin =
      await requireAdmin(
        context.request,
        context.env,
      );

    await removeEncryptedSecret(
      context.env,
      admin.accessToken,
      sourceId,
    );

    return jsonResponse({
      success: true,
      tokenConfigured: false,
      message: "Đã xóa Access Token.",
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
