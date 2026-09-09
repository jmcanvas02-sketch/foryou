import {
  supabaseServerFetch,
} from "./supabase-server";
import type {
  AdsFunctionEnv,
} from "./supabase-server";

export type D1PreparedStatementLike = {
  bind(...values: unknown[]): D1PreparedStatementLike;
  run(): Promise<unknown>;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<{
    results?: T[];
  }>;
};

export type D1DatabaseLike = {
  prepare(query: string): D1PreparedStatementLike;
  batch(
    statements: D1PreparedStatementLike[],
  ): Promise<unknown[]>;
};

export type QueueProducerLike<T> = {
  send(message: T): Promise<void>;
};

export type OrderIntakeEnv = AdsFunctionEnv & {
  ORDER_INTAKE_DB?: D1DatabaseLike;
  ORDER_INTAKE_QUEUE?: QueueProducerLike<OrderQueueMessage>;
};

export type OrderQueueMessage = {
  requestId: string;
};

export type OrderIntakePayload = {
  requestId: string;
  customer: {
    fullName: string;
    phone: string;
    province?: string;
    district?: string;
    ward?: string;
    addressDetail: string;
    note?: string;
  };
  items: Array<{
    productId: string;
    quantity: number;
    selectedVariants?: unknown[];
    selectedCustomOptions?: unknown;
  }>;
  couponCode?: string;
  attribution?: Record<string, unknown>;
};

export type OrderRpcResult = {
  id: string;
  order_code: string;
  created_at: string;
  subtotal: number | string;
  discount_amount: number | string;
  shipping_fee: number | string;
  total_amount: number | string;
  inventory_reserved: boolean;
  client_request_id?: string;
  replayed?: boolean;
};

type IntakeRow = {
  request_id: string;
  payload_json: string;
  payload_hash: string;
  status: string;
  result_json: string | null;
  attempt_count: number;
};

export type ProcessStoredResult =
  | {
      success: true;
      data: OrderRpcResult;
    }
  | {
      success: false;
      transient: boolean;
      message: string;
    };

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const PHONE_PATTERN = /^0(3|5|7|8|9)\d{8}$/;
const MAX_ITEMS = 50;
const MAX_PAYLOAD_BYTES = 96_000;

function normalizeText(
  value: unknown,
  maxLength: number,
) {
  return typeof value === "string"
    ? value.trim().slice(0, maxLength)
    : "";
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (
    value &&
    typeof value === "object"
  ) {
    return Object.fromEntries(
      Object.entries(
        value as Record<string, unknown>,
      )
        .sort(([left], [right]) =>
          left.localeCompare(right),
        )
        .map(([key, child]) => [
          key,
          canonicalize(child),
        ]),
    );
  }

  return value;
}

async function sha256(value: string) {
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest(
    "SHA-256",
    bytes,
  );

  return Array.from(
    new Uint8Array(digest),
    (item) => item.toString(16).padStart(2, "0"),
  ).join("");
}

function nowIso() {
  return new Date().toISOString();
}

function isTransientStatus(status: number) {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

async function readJsonMessage(
  response: Response,
) {
  try {
    const payload = (await response.json()) as {
      message?: string;
      details?: string;
      hint?: string;
    };

    return (
      payload.message ||
      payload.details ||
      payload.hint ||
      `Supabase HTTP ${response.status}`
    );
  } catch {
    return `Supabase HTTP ${response.status}`;
  }
}

export function validateOrderIntakePayload(
  input: unknown,
): OrderIntakePayload {
  if (
    !input ||
    typeof input !== "object"
  ) {
    throw new Error(
      "Dữ liệu đặt hàng không hợp lệ.",
    );
  }

  const raw =
    input as Record<string, unknown>;
  const requestId = normalizeText(
    raw.requestId,
    64,
  );

  if (!UUID_PATTERN.test(requestId)) {
    throw new Error(
      "Mã yêu cầu đặt hàng không hợp lệ.",
    );
  }

  if (
    !raw.customer ||
    typeof raw.customer !== "object"
  ) {
    throw new Error(
      "Thiếu thông tin khách hàng.",
    );
  }

  const customerInput =
    raw.customer as Record<string, unknown>;
  const customer = {
    fullName: normalizeText(
      customerInput.fullName,
      120,
    ),
    phone: normalizeText(
      customerInput.phone,
      20,
    ),
    province: normalizeText(
      customerInput.province,
      120,
    ),
    district: normalizeText(
      customerInput.district,
      120,
    ),
    ward: normalizeText(
      customerInput.ward,
      120,
    ),
    addressDetail: normalizeText(
      customerInput.addressDetail,
      500,
    ),
    note: normalizeText(
      customerInput.note,
      1_000,
    ),
  };

  if (customer.fullName.length < 2) {
    throw new Error(
      "Họ tên khách hàng chưa hợp lệ.",
    );
  }

  if (!PHONE_PATTERN.test(customer.phone)) {
    throw new Error(
      "Số điện thoại chưa hợp lệ.",
    );
  }

  if (!customer.addressDetail) {
    throw new Error(
      "Thiếu địa chỉ nhận hàng.",
    );
  }

  if (
    !Array.isArray(raw.items) ||
    raw.items.length === 0 ||
    raw.items.length > MAX_ITEMS
  ) {
    throw new Error(
      "Danh sách sản phẩm chưa hợp lệ.",
    );
  }

  const items = raw.items.map(
    (item, index) => {
      if (
        !item ||
        typeof item !== "object"
      ) {
        throw new Error(
          `Sản phẩm thứ ${index + 1} chưa hợp lệ.`,
        );
      }

      const record =
        item as Record<string, unknown>;
      const productId = normalizeText(
        record.productId,
        64,
      );
      const quantity = Number(
        record.quantity,
      );

      if (
        !UUID_PATTERN.test(productId) ||
        !Number.isInteger(quantity) ||
        quantity < 1 ||
        quantity > 100
      ) {
        throw new Error(
          `Sản phẩm thứ ${index + 1} chưa hợp lệ.`,
        );
      }

      return {
        productId,
        quantity,
        selectedVariants:
          Array.isArray(record.selectedVariants)
            ? record.selectedVariants
            : [],
        selectedCustomOptions:
          record.selectedCustomOptions,
      };
    },
  );

  const payload: OrderIntakePayload = {
    requestId,
    customer,
    items,
    couponCode:
      normalizeText(raw.couponCode, 80) ||
      undefined,
    attribution:
      raw.attribution &&
      typeof raw.attribution === "object" &&
      !Array.isArray(raw.attribution)
        ? (raw.attribution as Record<
            string,
            unknown
          >)
        : undefined,
  };

  const serialized = JSON.stringify(payload);

  if (
    new TextEncoder().encode(serialized)
      .byteLength > MAX_PAYLOAD_BYTES
  ) {
    throw new Error(
      "Dữ liệu đặt hàng vượt giới hạn cho phép.",
    );
  }

  return payload;
}

async function payloadRecord(
  payload: OrderIntakePayload,
) {
  const payloadJson = JSON.stringify(
    canonicalize(payload),
  );

  return {
    payloadJson,
    payloadHash: await sha256(payloadJson),
  };
}

async function loadRow(
  db: D1DatabaseLike,
  requestId: string,
) {
  return db
    .prepare(
      `select
        request_id,
        payload_json,
        payload_hash,
        status,
        result_json,
        attempt_count
      from order_intake_requests
      where request_id = ?
      limit 1`,
    )
    .bind(requestId)
    .first<IntakeRow>();
}

export async function persistOrderIntake(
  env: OrderIntakeEnv,
  payload: OrderIntakePayload,
) {
  if (!env.ORDER_INTAKE_DB) {
    return {
      persisted: false,
      completed: null as OrderRpcResult | null,
    };
  }

  const db = env.ORDER_INTAKE_DB;
  const record = await payloadRecord(payload);
  const timestamp = nowIso();

  await db
    .prepare(
      `insert or ignore into order_intake_requests (
        request_id,
        payload_json,
        payload_hash,
        status,
        attempt_count,
        received_at,
        updated_at
      ) values (?, ?, ?, 'received', 0, ?, ?)`,
    )
    .bind(
      payload.requestId,
      record.payloadJson,
      record.payloadHash,
      timestamp,
      timestamp,
    )
    .run();

  const stored = await loadRow(
    db,
    payload.requestId,
  );

  if (!stored) {
    throw new Error(
      "Không thể lưu biên nhận đặt hàng dự phòng.",
    );
  }

  if (
    stored.payload_hash !==
    record.payloadHash
  ) {
    throw new Error(
      "Mã yêu cầu đã được dùng cho một đơn hàng khác.",
    );
  }

  if (
    stored.status === "completed" &&
    stored.result_json
  ) {
    return {
      persisted: true,
      completed: JSON.parse(
        stored.result_json,
      ) as OrderRpcResult,
    };
  }

  await db
    .prepare(
      `update order_intake_requests
      set updated_at = ?
      where request_id = ?`,
    )
    .bind(
      timestamp,
      payload.requestId,
    )
    .run();

  return {
    persisted: true,
    completed: null,
  };
}

async function updateFailure(
  env: OrderIntakeEnv,
  requestId: string,
  status: "queued" | "retrying" | "failed",
  message: string,
) {
  if (!env.ORDER_INTAKE_DB) {
    return;
  }

  await env.ORDER_INTAKE_DB
    .prepare(
      `update order_intake_requests
      set
        status = ?,
        attempt_count = attempt_count + 1,
        last_error = ?,
        updated_at = ?
      where request_id = ?`,
    )
    .bind(
      status,
      message.slice(0, 2_000),
      nowIso(),
      requestId,
    )
    .run();
}

async function updateCompleted(
  env: OrderIntakeEnv,
  requestId: string,
  result: OrderRpcResult,
) {
  if (!env.ORDER_INTAKE_DB) {
    return;
  }

  const timestamp = nowIso();

  await env.ORDER_INTAKE_DB
    .prepare(
      `update order_intake_requests
      set
        status = 'completed',
        result_json = ?,
        supabase_order_id = ?,
        order_code = ?,
        last_error = null,
        completed_at = ?,
        updated_at = ?
      where request_id = ?`,
    )
    .bind(
      JSON.stringify(result),
      result.id,
      result.order_code,
      timestamp,
      timestamp,
      requestId,
    )
    .run();
}

export async function callSupabaseOrderRpc(
  env: OrderIntakeEnv,
  payload: OrderIntakePayload,
): Promise<ProcessStoredResult> {
  let response: Response;

  try {
    response = await supabaseServerFetch(
      env,
      "/rest/v1/rpc/create_store_order_idempotent",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Prefer: "return=representation",
        },
        body: JSON.stringify({
          p_client_request_id:
            payload.requestId,
          p_customer: payload.customer,
          p_items: payload.items,
          p_coupon_code:
            payload.couponCode ?? null,
          p_attribution:
            payload.attribution ?? null,
        }),
      },
    );
  } catch (error) {
    return {
      success: false,
      transient: true,
      message:
        error instanceof Error
          ? error.message
          : "Không kết nối được Supabase.",
    };
  }

  if (!response.ok) {
    return {
      success: false,
      transient: isTransientStatus(
        response.status,
      ),
      message: await readJsonMessage(
        response,
      ),
    };
  }

  const result =
    (await response.json()) as
      | OrderRpcResult
      | null;

  if (!result?.id || !result.order_code) {
    return {
      success: false,
      transient: true,
      message:
        "Supabase chưa trả về mã đơn hàng hợp lệ.",
    };
  }

  return {
    success: true,
    data: result,
  };
}

export async function enqueueOrderIntake(
  env: OrderIntakeEnv,
  requestId: string,
) {
  if (!env.ORDER_INTAKE_QUEUE) {
    return false;
  }

  await env.ORDER_INTAKE_QUEUE.send({
    requestId,
  });

  return true;
}

export async function acceptAndProcessOrder(
  env: OrderIntakeEnv,
  payload: OrderIntakePayload,
) {
  const persisted = await persistOrderIntake(
    env,
    payload,
  );

  if (persisted.completed) {
    return {
      status: 200,
      body: {
        success: true,
        accepted: true,
        message:
          "Đã tìm thấy đơn hàng vừa tạo.",
        data: persisted.completed,
      },
    };
  }

  const result =
    await callSupabaseOrderRpc(
      env,
      payload,
    );

  if ("data" in result) {
    await updateCompleted(
      env,
      payload.requestId,
      result.data,
    );

    return {
      status: 200,
      body: {
        success: true,
        accepted:
          persisted.persisted,
        message: result.data.replayed
          ? "Đã tìm thấy đơn hàng vừa tạo."
          : "Đã tạo đơn hàng.",
        data: result.data,
      },
    };
  }

  let queued = false;

  if (persisted.persisted) {
    try {
      queued = await enqueueOrderIntake(
        env,
        payload.requestId,
      );
    } catch {
      queued = false;
    }

    await updateFailure(
      env,
      payload.requestId,
      result.transient
        ? queued
          ? "queued"
          : "retrying"
        : "failed",
      result.message,
    );
  }

  return {
    status: result.transient ? 503 : 400,
    body: {
      success: false,
      accepted:
        persisted.persisted,
      queued,
      message: result.transient
        ? persisted.persisted
          ? "Yêu cầu đặt hàng đã được lưu dự phòng. Hệ thống đang tiếp tục thử lại."
          : result.message
        : result.message,
    },
  };
}

export async function processStoredOrder(
  env: OrderIntakeEnv,
  requestId: string,
): Promise<ProcessStoredResult> {
  if (!env.ORDER_INTAKE_DB) {
    return {
      success: false,
      transient: true,
      message:
        "Thiếu binding ORDER_INTAKE_DB.",
    };
  }

  const row = await loadRow(
    env.ORDER_INTAKE_DB,
    requestId,
  );

  if (!row) {
    return {
      success: false,
      transient: false,
      message:
        "Không tìm thấy yêu cầu đặt hàng dự phòng.",
    };
  }

  if (
    row.status === "completed" &&
    row.result_json
  ) {
    return {
      success: true,
      data: JSON.parse(
        row.result_json,
      ) as OrderRpcResult,
    };
  }

  let payload: OrderIntakePayload;

  try {
    payload = validateOrderIntakePayload(
      JSON.parse(row.payload_json),
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Payload dự phòng không hợp lệ.";

    await updateFailure(
      env,
      requestId,
      "failed",
      message,
    );

    return {
      success: false,
      transient: false,
      message,
    };
  }

  await env.ORDER_INTAKE_DB
    .prepare(
      `update order_intake_requests
      set status = 'processing', updated_at = ?
      where request_id = ?`,
    )
    .bind(nowIso(), requestId)
    .run();

  const result =
    await callSupabaseOrderRpc(
      env,
      payload,
    );

  if ("data" in result) {
    await updateCompleted(
      env,
      requestId,
      result.data,
    );

    return result;
  }

  await updateFailure(
    env,
    requestId,
    result.transient
      ? "retrying"
      : "failed",
    result.message,
  );

  return result;
}

export async function listRetryableRequests(
  env: OrderIntakeEnv,
  limit = 25,
) {
  if (!env.ORDER_INTAKE_DB) {
    return [];
  }

  const cutoff = new Date(
    Date.now() - 60_000,
  ).toISOString();

  const response =
    await env.ORDER_INTAKE_DB
      .prepare(
        `select request_id
        from order_intake_requests
        where
          status in ('received', 'queued', 'retrying')
          or (
            status = 'processing'
            and updated_at < ?
          )
        order by updated_at asc
        limit ?`,
      )
      .bind(
        cutoff,
        Math.max(
          1,
          Math.min(limit, 100),
        ),
      )
      .all<{
        request_id: string;
      }>();

  return (response.results ?? []).map(
    (item) => item.request_id,
  );
}
