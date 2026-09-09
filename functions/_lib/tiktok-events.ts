import type {
  DeliveryResult,
} from "./meta-capi";

type TikTokEventInput = {
  pixelId: string;
  accessToken: string;
  testMode: boolean;
  testEventCode?: string;
  eventName: string;
  eventId: string;
  eventTime: number;
  pageUrl: string;
  referrer?: string | null;
  userData: Record<string, unknown>;
  customData: Record<string, unknown>;
};

function cleanMessage(value: unknown) {
  if (typeof value !== "string") {
    return "TikTok không chấp nhận sự kiện.";
  }

  return value.slice(0, 500);
}

export async function sendTikTokEvent(
  input: TikTokEventInput,
): Promise<DeliveryResult> {
  const body: Record<string, unknown> = {
    event_source: "web",
    event_source_id: input.pixelId,
    data: [
      {
        event: input.eventName,
        event_time: input.eventTime,
        event_id: input.eventId,
        user: input.userData,
        properties: input.customData,
        page: {
          url: input.pageUrl,
          ...(input.referrer
            ? { referrer: input.referrer }
            : {}),
        },
      },
    ],
  };

  if (
    input.testMode &&
    input.testEventCode?.trim()
  ) {
    body.test_event_code =
      input.testEventCode.trim();
  }

  try {
    const response = await fetch(
      "https://business-api.tiktok.com/open_api/v1.3/event/track/",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Access-Token": input.accessToken,
        },
        body: JSON.stringify(body),
      },
    );
    const payload = await response
      .json()
      .catch(() => ({})) as Record<string, unknown>;
    const code = String(
      payload.code ?? response.status,
    );
    const success =
      response.ok &&
      (
        payload.code === 0 ||
        payload.code === "0" ||
        payload.code === undefined
      );

    if (success) {
      return {
        ok: true,
        status: response.status,
        retryable: false,
        code: "",
        message: "",
        summary: {
          requestId:
            payload.request_id ?? null,
          code: payload.code ?? 0,
        },
      };
    }

    return {
      ok: false,
      status: response.status,
      retryable:
        response.status === 429 ||
        response.status >= 500,
      code,
      message: cleanMessage(
        payload.message,
      ),
      summary: {
        requestId:
          payload.request_id ?? null,
      },
    };
  } catch (error) {
    return {
      ok: false,
      status: 0,
      retryable: true,
      code: "NETWORK_ERROR",
      message:
        error instanceof Error
          ? error.message.slice(0, 500)
          : "Không thể kết nối TikTok.",
      summary: {},
    };
  }
}
