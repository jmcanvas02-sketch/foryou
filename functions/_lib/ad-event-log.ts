import {
  HttpError,
} from "./http";
import {
  supabaseServerFetch,
} from "./supabase-server";
import type {
  AdsFunctionEnv,
} from "./supabase-server";

export type AdEventLogStatus =
  | "pending"
  | "success"
  | "failed"
  | "ignored";

export type StoredEventEnvelope = {
  sourceId: string;
  platform: "meta" | "tiktok";
  eventName: string;
  eventId: string;
  eventTime: number;
  productIds: string[];
  orderCode: string | null;
  pageUrl: string;
  referrer: string | null;
  anonymousId: string;
  externalId: string;
  customerPhone: string | null;
  fbp: string | null;
  fbc: string | null;
  fbclid: string | null;
  ttp: string | null;
  ttclid: string | null;
  payload: Record<string, unknown>;
};

type LogRow = {
  id: string;
  status: AdEventLogStatus;
  attempt_count: number;
  request_payload?: unknown;
};

function queryValue(value: string) {
  return encodeURIComponent(value);
}

async function parseRows(
  response: Response,
): Promise<LogRow[]> {
  const payload =
    (await response.json()) as unknown;

  if (!Array.isArray(payload)) {
    throw new HttpError(
      500,
      "Phản hồi nhật ký quảng cáo không hợp lệ.",
    );
  }

  return payload as LogRow[];
}

export async function findServerLog(
  env: AdsFunctionEnv,
  sourceId: string,
  eventName: string,
  eventId: string,
) {
  const path =
    "/rest/v1/ad_event_logs" +
    `?ad_data_source_id=eq.${queryValue(sourceId)}` +
    `&event_name=eq.${queryValue(eventName)}` +
    `&event_id=eq.${queryValue(eventId)}` +
    "&channel=eq.server" +
    "&select=id,status,attempt_count,request_payload" +
    "&limit=1";
  const response =
    await supabaseServerFetch(env, path);

  if (!response.ok) {
    throw new HttpError(
      500,
      "Không thể đọc nhật ký sự kiện quảng cáo.",
    );
  }

  const rows = await parseRows(response);
  return rows[0] ?? null;
}

export async function claimServerLog(
  env: AdsFunctionEnv,
  input: {
    sourceId: string;
    platform: "meta" | "tiktok";
    eventName: string;
    eventId: string;
    productId?: string;
    orderId?: string;
    envelope: StoredEventEnvelope;
    force?: boolean;
  },
) {
  const existing = await findServerLog(
    env,
    input.sourceId,
    input.eventName,
    input.eventId,
  );

  if (
    existing &&
    !input.force &&
    (
      existing.status === "pending" ||
      existing.status === "success"
    )
  ) {
    return {
      log: existing,
      shouldSend: false,
    };
  }

  if (existing) {
    const response = await supabaseServerFetch(
      env,
      `/rest/v1/ad_event_logs?id=eq.${queryValue(existing.id)}`,
      {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          status: "pending",
          error_code: "",
          error_message: "",
          response_summary: null,
          request_payload: input.envelope,
          product_id: input.productId ?? null,
          order_id: input.orderId ?? null,
          last_attempt_at: new Date().toISOString(),
        }),
      },
    );

    if (!response.ok) {
      throw new HttpError(
        500,
        "Không thể cập nhật nhật ký sự kiện quảng cáo.",
      );
    }

    const rows = await parseRows(response);
    return {
      log: rows[0] ?? existing,
      shouldSend: true,
    };
  }

  const response = await supabaseServerFetch(
    env,
    "/rest/v1/ad_event_logs",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        ad_data_source_id: input.sourceId,
        platform: input.platform,
        event_name: input.eventName,
        event_id: input.eventId,
        channel: "server",
        status: "pending",
        product_id: input.productId ?? null,
        order_id: input.orderId ?? null,
        request_payload: input.envelope,
        attempt_count: 0,
        last_attempt_at: new Date().toISOString(),
      }),
    },
  );

  if (response.status === 409) {
    const conflicted = await findServerLog(
      env,
      input.sourceId,
      input.eventName,
      input.eventId,
    );

    return {
      log: conflicted,
      shouldSend: false,
    };
  }

  if (!response.ok) {
    throw new HttpError(
      500,
      "Không thể tạo nhật ký sự kiện quảng cáo.",
    );
  }

  const rows = await parseRows(response);
  const created = rows[0];

  if (!created) {
    throw new HttpError(
      500,
      "Không nhận được mã nhật ký sự kiện.",
    );
  }

  return {
    log: created,
    shouldSend: true,
  };
}

export async function finishServerLog(
  env: AdsFunctionEnv,
  logId: string,
  input: {
    status: AdEventLogStatus;
    attemptCount: number;
    errorCode?: string;
    errorMessage?: string;
    responseSummary?: Record<string, unknown>;
  },
) {
  const response = await supabaseServerFetch(
    env,
    `/rest/v1/ad_event_logs?id=eq.${queryValue(logId)}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        status: input.status,
        attempt_count: input.attemptCount,
        error_code: input.errorCode ?? "",
        error_message: input.errorMessage ?? "",
        response_summary:
          input.responseSummary ?? null,
        sent_at:
          input.status === "success"
            ? new Date().toISOString()
            : null,
        last_attempt_at:
          new Date().toISOString(),
      }),
    },
  );

  if (!response.ok) {
    console.error(
      "ad-event-log-finish-failed",
      response.status,
    );
  }
}

export async function readServerLogForRetry(
  env: AdsFunctionEnv,
  logId: string,
) {
  const path =
    "/rest/v1/ad_event_logs" +
    `?id=eq.${queryValue(logId)}` +
    "&channel=eq.server" +
    "&select=id,status,attempt_count,request_payload" +
    "&limit=1";
  const response =
    await supabaseServerFetch(env, path);

  if (!response.ok) {
    throw new HttpError(
      500,
      "Không thể đọc sự kiện cần gửi lại.",
    );
  }

  const rows = await parseRows(response);
  return rows[0] ?? null;
}
