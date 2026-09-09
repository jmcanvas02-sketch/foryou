import {
  requireAdmin,
} from "../../../../_lib/ads-auth";
import {
  parseEventEnvelope,
  processAdEvent,
} from "../../../../_lib/ad-events";
import {
  readServerLogForRetry,
} from "../../../../_lib/ad-event-log";
import {
  errorResponse,
  HttpError,
  jsonResponse,
} from "../../../../_lib/http";
import type {
  AdsFunctionEnv,
} from "../../../../_lib/supabase-server";

type RouteContext = {
  request: Request;
  env: AdsFunctionEnv;
  params: {
    logId?: string | string[];
  };
};

function logIdFromContext(
  context: RouteContext,
) {
  const raw = context.params.logId;
  const value = Array.isArray(raw)
    ? raw[0]
    : raw;

  if (
    !value ||
    !/^[0-9a-f-]{36}$/i.test(value)
  ) {
    throw new HttpError(
      400,
      "Mã nhật ký không hợp lệ.",
    );
  }

  return value;
}

export async function onRequestPost(
  context: RouteContext,
) {
  try {
    await requireAdmin(
      context.request,
      context.env,
    );
    const logId = logIdFromContext(context);
    const log = await readServerLogForRetry(
      context.env,
      logId,
    );

    if (!log?.request_payload) {
      throw new HttpError(
        404,
        "Không tìm thấy dữ liệu để gửi lại.",
      );
    }

    const envelope = parseEventEnvelope(
      log.request_payload,
    );
    const result = await processAdEvent(
      context.env,
      envelope,
      undefined,
      {
        force: true,
        clientIp: "",
        userAgent: "",
      },
    );

    return jsonResponse({
      success: result.accepted,
      result,
    });
  } catch (error) {
    return errorResponse(error);
  }
}
