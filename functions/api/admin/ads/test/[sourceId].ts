import {
  requireAdmin,
} from "../../../../_lib/ads-auth";
import {
  parseEventEnvelope,
  processAdEvent,
} from "../../../../_lib/ad-events";
import {
  errorResponse,
  HttpError,
  jsonResponse,
} from "../../../../_lib/http";
import type {
  DeliveryResult,
} from "../../../../_lib/meta-capi";
import {
  supabaseServerFetch,
} from "../../../../_lib/supabase-server";
import type {
  AdsFunctionEnv,
} from "../../../../_lib/supabase-server";

type RouteContext = {
  request: Request;
  env: AdsFunctionEnv;
  params: {
    sourceId?: string | string[];
  };
};

type SourceRow = {
  id: string;
  platform: "meta" | "tiktok";
};

type TestProcessResult = {
  accepted: boolean;
  status?: number;
  dryRun?: boolean;
  delivery?: DeliveryResult;
};

function sourceIdFromContext(
  context: RouteContext,
) {
  const raw = context.params.sourceId;
  const value = Array.isArray(raw)
    ? raw[0]
    : raw;

  if (
    !value ||
    !/^[0-9a-f-]{36}$/i.test(value)
  ) {
    throw new HttpError(
      400,
      "Mã cấu hình Pixel không hợp lệ.",
    );
  }

  return value;
}

async function testEventCodeFromRequest(
  request: Request,
) {
  const payload = await request
    .json()
    .catch(() => null) as Record<
      string,
      unknown
    > | null;
  const value = typeof payload?.testEventCode === "string"
    ? payload.testEventCode.trim().toUpperCase()
    : "";

  if (!/^TEST\d{1,20}$/.test(value)) {
    throw new HttpError(
      400,
      "Mã sự kiện thử nghiệm Meta phải có dạng TEST và các chữ số, ví dụ TEST78712.",
    );
  }

  return value;
}

async function loadSource(
  env: AdsFunctionEnv,
  sourceId: string,
) {
  const response = await supabaseServerFetch(
    env,
    "/rest/v1/ad_data_sources" +
      `?id=eq.${encodeURIComponent(sourceId)}` +
      "&select=id,platform" +
      "&limit=1",
  );

  if (!response.ok) {
    throw new HttpError(
      500,
      "Không thể đọc cấu hình Pixel.",
    );
  }

  const payload =
    (await response.json()) as unknown;
  const source = Array.isArray(payload)
    ? payload[0] as SourceRow | undefined
    : undefined;

  if (!source) {
    throw new HttpError(
      404,
      "Không tìm thấy cấu hình Pixel.",
    );
  }

  return source;
}

async function updateTestStatus(
  env: AdsFunctionEnv,
  sourceId: string,
  status: "success" | "failed",
  message: string,
) {
  const response = await supabaseServerFetch(
    env,
    "/rest/v1/ad_data_sources" +
      `?id=eq.${encodeURIComponent(sourceId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        last_tested_at:
          new Date().toISOString(),
        last_test_status: status,
        last_test_message:
          message.slice(0, 500),
      }),
    },
  );

  if (!response.ok) {
    console.error(
      "ad-source-test-status-failed",
      response.status,
    );
  }
}

function numberSummaryValue(
  value: unknown,
) {
  return typeof value === "number" &&
    Number.isFinite(value)
    ? value
    : null;
}

function stringSummaryValue(
  value: unknown,
) {
  return typeof value === "string" && value
    ? value
    : null;
}

export async function onRequestPost(
  context: RouteContext,
) {
  const sourceId =
    sourceIdFromContext(context);

  let adminAuthorized = false;

  try {
    await requireAdmin(
      context.request,
      context.env,
    );
    adminAuthorized = true;

    const source = await loadSource(
      context.env,
      sourceId,
    );

    if (source.platform !== "meta") {
      throw new HttpError(
        400,
        "Chức năng này chỉ dùng để kiểm tra Meta CAPI.",
      );
    }

    const testEventCode =
      await testEventCodeFromRequest(
        context.request,
      );
    const origin = new URL(
      context.request.url,
    ).origin;
    const envelope = parseEventEnvelope({
      sourceId,
      platform: source.platform,
      eventName: "PageView",
      eventId:
        `test:${crypto.randomUUID()}:${source.platform}:${sourceId}`,
      productIds: [],
      orderCode: null,
      pageUrl: origin,
      referrer: null,
      anonymousId:
        `admin-test-${crypto.randomUUID()}`,
      payload: {
        page_path: "/admin/pixel-quang-cao",
        currency: "VND",
        value: 0,
      },
    });
    const result = await processAdEvent(
      context.env,
      envelope,
      context.request,
      {
        force: true,
        skipSourceResolution: true,
        testEventCodeOverride: testEventCode,
        includeDeliveryDetails: true,
      },
    ) as TestProcessResult;

    if (result.dryRun) {
      throw new HttpError(
        409,
        "ADS_SERVER_DRY_RUN đang bật nên chưa thể kiểm tra phản hồi thật từ Meta.",
      );
    }

    const delivery = result.delivery;

    if (!delivery) {
      throw new HttpError(
        500,
        "Không nhận được chi tiết phản hồi từ Meta CAPI.",
      );
    }

    const eventsReceived = numberSummaryValue(
      delivery.summary.eventsReceived,
    );
    const traceId = stringSummaryValue(
      delivery.summary.traceId,
    );
    const errorType = stringSummaryValue(
      delivery.summary.type,
    );
    const errorSubcode =
      delivery.summary.subcode ?? null;
    const message = delivery.ok
      ? `Meta đã nhận ${eventsReceived ?? 1} sự kiện thử nghiệm.`
      : delivery.message ||
        "Meta không chấp nhận sự kiện kiểm tra.";

    await updateTestStatus(
      context.env,
      sourceId,
      delivery.ok ? "success" : "failed",
      message,
    );

    return jsonResponse({
      success: delivery.ok,
      testEventCode,
      result: {
        status: delivery.status,
        eventsReceived,
        metaErrorCode:
          delivery.code || null,
        metaErrorSubcode: errorSubcode,
        metaErrorType: errorType,
        message,
        fbtraceId: traceId,
        retryable: delivery.retryable,
      },
    });
  } catch (error) {
    if (adminAuthorized) {
      await updateTestStatus(
        context.env,
        sourceId,
        "failed",
        error instanceof Error
          ? error.message
          : "Kiểm tra kết nối thất bại.",
      );
    }

    return errorResponse(error);
  }
}
