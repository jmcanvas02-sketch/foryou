import {
  acceptAndProcessOrder,
  validateOrderIntakePayload,
} from "../../_lib/order-intake";
import type {
  OrderIntakeEnv,
  OrderIntakePayload,
} from "../../_lib/order-intake";

type PagesContext = {
  request: Request;
  env: OrderIntakeEnv;
};

function jsonResponse(
  body: Record<string, unknown>,
  status: number,
) {
  return Response.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
    },
  });
}

export async function onRequestPost(
  context: PagesContext,
) {
  const contentLength = Number(
    context.request.headers.get(
      "Content-Length",
    ) ?? "0",
  );

  if (
    Number.isFinite(contentLength) &&
    contentLength > 96_000
  ) {
    return jsonResponse(
      {
        success: false,
        accepted: false,
        message:
          "Dữ liệu đặt hàng vượt giới hạn cho phép.",
      },
      413,
    );
  }

  let payload: OrderIntakePayload;

  try {
    payload =
      validateOrderIntakePayload(
        await context.request.json(),
      );
  } catch (error) {
    return jsonResponse(
      {
        success: false,
        accepted: false,
        message:
          error instanceof Error
            ? error.message
            : "Dữ liệu đặt hàng không hợp lệ.",
      },
      400,
    );
  }

  try {
    const result =
      await acceptAndProcessOrder(
        context.env,
        payload,
      );

    return jsonResponse(
      result.body,
      result.status,
    );
  } catch (error) {
    console.error(
      "order-intake-failed",
      payload.requestId,
      error,
    );

    return jsonResponse(
      {
        success: false,
        accepted: false,
        message:
          "Điểm tiếp nhận dự phòng đang tạm gián đoạn.",
      },
      503,
    );
  }
}
