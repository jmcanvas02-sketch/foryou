export type DeliveryResult = {
  ok: boolean;
  status: number;
  retryable: boolean;
  code: string;
  message: string;
  summary: Record<string, unknown>;
};

type MetaEventInput = {
  pixelId: string;
  accessToken: string;
  apiVersion?: string;
  testMode: boolean;
  testEventCode?: string;
  eventName: string;
  eventId: string;
  eventTime: number;
  pageUrl: string;
  userData: Record<string, unknown>;
  customData: Record<string, unknown>;
};

function apiVersion(value?: string) {
  const normalized = value?.trim() ?? "";

  if (/^v\d+\.\d+$/.test(normalized)) {
    return normalized;
  }

  return "v25.0";
}

function cleanMessage(value: unknown) {
  if (typeof value !== "string") {
    return "Meta không chấp nhận sự kiện.";
  }

  return value.slice(0, 500);
}

export async function sendMetaCapiEvent(
  input: MetaEventInput,
): Promise<DeliveryResult> {
  const endpoint = new URL(
    `https://graph.facebook.com/${apiVersion(input.apiVersion)}/${encodeURIComponent(input.pixelId)}/events`,
  );
  endpoint.searchParams.set(
    "access_token",
    input.accessToken,
  );

  const body: Record<string, unknown> = {
    data: [
      {
        event_name: input.eventName,
        event_time: input.eventTime,
        event_id: input.eventId,
        action_source: "website",
        event_source_url: input.pageUrl,
        user_data: input.userData,
        custom_data: input.customData,
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
      endpoint.toString(),
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      },
    );
    const payload = await response
      .json()
      .catch(() => ({})) as Record<string, unknown>;

    if (response.ok) {
      return {
        ok: true,
        status: response.status,
        retryable: false,
        code: "",
        message: "",
        summary: {
          eventsReceived:
            payload.events_received ?? 1,
          traceId:
            payload.fbtrace_id ?? null,
        },
      };
    }

    const error =
      payload.error &&
      typeof payload.error === "object"
        ? payload.error as Record<string, unknown>
        : {};
    const code = String(
      error.code ?? response.status,
    );

    return {
      ok: false,
      status: response.status,
      retryable:
        response.status === 429 ||
        response.status >= 500,
      code,
      message: cleanMessage(error.message),
      summary: {
        type: error.type ?? null,
        subcode:
          error.error_subcode ?? null,
        traceId:
          payload.fbtrace_id ?? null,
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
          : "Không thể kết nối Meta.",
      summary: {},
    };
  }
}
