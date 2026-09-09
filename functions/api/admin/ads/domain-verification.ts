import { requireAdmin } from "../../../_lib/ads-auth";
import {
  buildMetaDomainVerificationTag,
  loadMetaDomainVerificationCode,
  parseMetaDomainVerificationInput,
  saveMetaDomainVerificationCode,
} from "../../../_lib/meta-domain-verification";
import {
  errorResponse,
  jsonResponse,
  readJsonObject,
} from "../../../_lib/http";
import type { AdsFunctionEnv } from "../../../_lib/supabase-server";

type RouteContext = {
  request: Request;
  env: AdsFunctionEnv;
};

function responsePayload(
  code: string | null,
  message?: string,
) {
  return {
    success: true,
    configured: code !== null,
    code,
    tag:
      code === null
        ? null
        : buildMetaDomainVerificationTag(code),
    message,
  };
}

function inputFromBody(
  body: Record<string, unknown>,
) {
  if ("value" in body) {
    return body.value;
  }

  if ("tag" in body) {
    return body.tag;
  }

  return body.code;
}

export async function onRequestGet(
  context: RouteContext,
) {
  try {
    const admin = await requireAdmin(
      context.request,
      context.env,
    );
    const code =
      await loadMetaDomainVerificationCode(
        context.env,
        admin.accessToken,
      );

    return jsonResponse(responsePayload(code));
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestPut(
  context: RouteContext,
) {
  try {
    const admin = await requireAdmin(
      context.request,
      context.env,
    );
    const body = await readJsonObject(
      context.request,
    );
    const code = parseMetaDomainVerificationInput(
      inputFromBody(body),
    );
    const savedCode =
      await saveMetaDomainVerificationCode(
        context.env,
        admin.accessToken,
        code,
      );

    return jsonResponse(
      responsePayload(
        savedCode,
        "Đã lưu thẻ xác minh tên miền Meta.",
      ),
    );
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestDelete(
  context: RouteContext,
) {
  try {
    const admin = await requireAdmin(
      context.request,
      context.env,
    );

    await saveMetaDomainVerificationCode(
      context.env,
      admin.accessToken,
      null,
    );

    return jsonResponse(
      responsePayload(
        null,
        "Đã xóa thẻ xác minh tên miền Meta.",
      ),
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
