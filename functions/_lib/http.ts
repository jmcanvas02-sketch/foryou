export class HttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = "HttpError";
    this.status = status;
  }
}

const secureHeaders = {
  "Cache-Control": "no-store",
  "Content-Type": "application/json; charset=utf-8",
  "Referrer-Policy": "no-referrer",
  "X-Content-Type-Options": "nosniff",
};

export function jsonResponse(
  payload: unknown,
  status = 200,
) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: secureHeaders,
  });
}

export async function readJsonObject(
  request: Request,
): Promise<Record<string, unknown>> {
  try {
    const payload = (await request.json()) as unknown;

    if (
      !payload ||
      typeof payload !== "object" ||
      Array.isArray(payload)
    ) {
      throw new HttpError(
        400,
        "Dữ liệu gửi lên không hợp lệ.",
      );
    }

    return payload as Record<string, unknown>;
  } catch (error) {
    if (error instanceof HttpError) {
      throw error;
    }

    throw new HttpError(
      400,
      "Dữ liệu JSON không hợp lệ.",
    );
  }
}

export function errorResponse(error: unknown) {
  if (error instanceof HttpError) {
    return jsonResponse(
      {
        success: false,
        error: error.message,
      },
      error.status,
    );
  }

  return jsonResponse(
    {
      success: false,
      error:
        "Máy chủ không thể xử lý yêu cầu. Vui lòng thử lại.",
    },
    500,
  );
}
