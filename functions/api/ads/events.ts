import {
  parseEventEnvelope,
  processAdEvent,
} from "../../_lib/ad-events";
import {
  errorResponse,
  HttpError,
  jsonResponse,
  readJsonObject,
} from "../../_lib/http";
import type {
  AdsFunctionEnv,
} from "../../_lib/supabase-server";

type EventContext = {
  request: Request;
  env: AdsFunctionEnv;
  waitUntil: (
    promise: Promise<unknown>,
  ) => void;
};

export async function onRequestPost(
  context: EventContext,
) {
  try {
    const contentLength = Number(
      context.request.headers.get(
        "Content-Length",
      ) ?? 0,
    );

    if (
      Number.isFinite(contentLength) &&
      contentLength > 64_000
    ) {
      throw new HttpError(
        413,
        "Dữ liệu sự kiện quá lớn.",
      );
    }

    const body = await readJsonObject(
      context.request,
    );
    const envelope = parseEventEnvelope(body);

    context.waitUntil(
      processAdEvent(
        context.env,
        envelope,
        context.request,
      ).catch((error) => {
        console.error(
          "ads-event-processing-failed",
          error instanceof Error
            ? error.message
            : "unknown",
        );
      }),
    );

    return jsonResponse(
      {
        success: true,
        accepted: true,
        eventId: envelope.eventId,
      },
      202,
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
