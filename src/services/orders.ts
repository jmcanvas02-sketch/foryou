import { supabase } from "../lib/supabase";
import type { LocalOrder } from "../types/cart";

const PENDING_ORDER_STORAGE_KEY =
  "ingiday-pending-order-requests-v2";
const LEGACY_PENDING_ORDER_STORAGE_KEY =
  "ingiday-pending-order-request-v1";
const PENDING_ORDER_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const COMPLETED_REPLAY_MAX_AGE_MS = 24 * 60 * 60 * 1000;
const MAX_PENDING_ORDER_REQUESTS = 20;
const REQUEST_TIMEOUT_MS = 12_000;
const MAX_ATTEMPTS = 3;
const ORDER_INTAKE_ENDPOINT = "/api/orders/intake";

export type IdempotentOrderRpcResult = {
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

export type SubmitStoreOrderResult =
  | {
      success: true;
      message: string;
      data: IdempotentOrderRpcResult;
      requestId: string;
    }
  | {
      success: false;
      message: string;
      requestId: string;
    };

type PendingOrderRequest = {
  requestId: string;
  fingerprint: string;
  createdAt: string;
  completedResult?: IdempotentOrderRpcResult;
  orderSnapshot: {
    customer: LocalOrder["customer"];
    items: Array<{
      productId: string;
      quantity: number;
      selectedVariants: LocalOrder["items"][number]["selectedVariants"];
      selectedCustomOptions?: LocalOrder["items"][number]["selectedCustomOptions"];
    }>;
    couponCode?: string;
    utmAttribution?: LocalOrder["utmAttribution"];
  };
};

type RpcError = {
  message?: string;
  code?: string;
  details?: string;
  hint?: string;
};

type DeliveryResult =
  | {
      success: true;
      message: string;
      data: IdempotentOrderRpcResult;
    }
  | {
      success: false;
      message: string;
      transient: boolean;
      accepted?: boolean;
    };

type IntakeApiResponse = {
  success?: boolean;
  message?: string;
  accepted?: boolean;
  data?: IdempotentOrderRpcResult;
};

let recoveryStarted = false;
let recoveryRunning = false;

function createRequestId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  const hex = Array.from(bytes, (value) =>
    value.toString(16).padStart(2, "0"),
  ).join("");

  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20),
  ].join("-");
}

function buildOrderSnapshot(
  order: LocalOrder,
): PendingOrderRequest["orderSnapshot"] {
  return {
    customer: {
      fullName: order.customer.fullName.trim(),
      phone: order.customer.phone.trim(),
      province: order.customer.province.trim(),
      district: order.customer.district.trim(),
      ward: order.customer.ward.trim(),
      addressDetail: order.customer.addressDetail.trim(),
      note: order.customer.note.trim(),
    },
    items: order.items.map((item) => {
      const selectedText = item.selectedCustomOptions?.text;
      const selectedColor = item.selectedCustomOptions?.color;

      return {
        productId: item.productId,
        quantity: item.quantity,
        selectedVariants: item.selectedVariants
          .map((variant) => ({
            groupId: variant.groupId,
            groupName: variant.groupName,
            optionId: variant.optionId,
            optionLabel: variant.optionLabel,
            priceDelta: variant.priceDelta,
            stock: variant.stock,
          }))
          .sort((left, right) =>
            (left.groupId + ":" + left.optionId).localeCompare(
              right.groupId + ":" + right.optionId,
            ),
          ),
        selectedCustomOptions: selectedText
          ? {
              text: {
                label: selectedText.label,
                value: selectedText.value.trim(),
                priceDelta: selectedText.priceDelta,
              },
              color: selectedColor
                ? {
                    id: selectedColor.id,
                    name: selectedColor.name,
                    imageUrl: selectedColor.imageUrl,
                    colorHex: selectedColor.colorHex,
                  }
                : undefined,
            }
          : undefined,
      };
    }),
    couponCode: order.couponCode?.trim().toUpperCase(),
    utmAttribution: order.utmAttribution,
  };
}

function buildFingerprint(order: LocalOrder) {
  return JSON.stringify(buildOrderSnapshot(order));
}

function isPendingOrderRequest(
  value: unknown,
): value is PendingOrderRequest {
  if (!value || typeof value !== "object") {
    return false;
  }

  const candidate =
    value as Partial<PendingOrderRequest>;

  if (
    typeof candidate.requestId !== "string" ||
    typeof candidate.fingerprint !== "string" ||
    typeof candidate.createdAt !== "string" ||
    !candidate.orderSnapshot
  ) {
    return false;
  }

  const createdAt = new Date(
    candidate.createdAt,
  ).getTime();

  return (
    Number.isFinite(createdAt) &&
    Date.now() - createdAt <=
      PENDING_ORDER_MAX_AGE_MS
  );
}

function writePendingOrderRequests(
  requests: PendingOrderRequest[],
) {
  const normalized = requests
    .filter(isPendingOrderRequest)
    .sort(
      (left, right) =>
        new Date(left.createdAt).getTime() -
        new Date(right.createdAt).getTime(),
    )
    .slice(-MAX_PENDING_ORDER_REQUESTS);

  try {
    if (normalized.length === 0) {
      localStorage.removeItem(
        PENDING_ORDER_STORAGE_KEY,
      );
      return true;
    }

    localStorage.setItem(
      PENDING_ORDER_STORAGE_KEY,
      JSON.stringify(normalized),
    );
    return true;
  } catch {
    return false;
  }
}

function readPendingOrderRequests() {
  const requests: PendingOrderRequest[] = [];

  try {
    const raw = localStorage.getItem(
      PENDING_ORDER_STORAGE_KEY,
    );

    if (raw) {
      const parsed = JSON.parse(raw) as unknown;

      if (Array.isArray(parsed)) {
        requests.push(
          ...parsed.filter(isPendingOrderRequest),
        );
      }
    }

    const legacyRaw = localStorage.getItem(
      LEGACY_PENDING_ORDER_STORAGE_KEY,
    );

    if (legacyRaw) {
      const legacy = JSON.parse(legacyRaw) as unknown;

      if (isPendingOrderRequest(legacy)) {
        requests.push(legacy);
      }

      localStorage.removeItem(
        LEGACY_PENDING_ORDER_STORAGE_KEY,
      );
    }
  } catch {
    try {
      localStorage.removeItem(
        PENDING_ORDER_STORAGE_KEY,
      );
      localStorage.removeItem(
        LEGACY_PENDING_ORDER_STORAGE_KEY,
      );
    } catch {
      return [];
    }
  }

  const byRequestId = new Map<
    string,
    PendingOrderRequest
  >();

  for (const request of requests) {
    byRequestId.set(
      request.requestId,
      request,
    );
  }

  const normalized = Array.from(
    byRequestId.values(),
  );

  writePendingOrderRequests(normalized);
  return normalized;
}

function upsertPendingOrderRequest(
  pending: PendingOrderRequest,
) {
  const requests =
    readPendingOrderRequests().filter(
      (item) =>
        item.requestId !== pending.requestId,
    );

  requests.push(pending);
  writePendingOrderRequests(requests);
}

function rememberRecoveredOrder(
  pending: PendingOrderRequest,
  result: IdempotentOrderRpcResult,
) {
  upsertPendingOrderRequest({
    ...pending,
    completedResult: result,
  });
}

function getOrCreatePendingOrderRequest(
  order: LocalOrder,
) {
  const fingerprint = buildFingerprint(order);
  const existing = readPendingOrderRequests()
    .filter(
      (item) => item.fingerprint === fingerprint,
    )
    .sort(
      (left, right) =>
        new Date(right.createdAt).getTime() -
        new Date(left.createdAt).getTime(),
    )[0];

  if (existing) {
    const createdAt = new Date(
      existing.createdAt,
    ).getTime();

    if (
      !existing.completedResult ||
      Date.now() - createdAt <=
        COMPLETED_REPLAY_MAX_AGE_MS
    ) {
      return existing;
    }

    clearPendingOrderRequest(
      existing.requestId,
    );
  }

  const pending: PendingOrderRequest = {
    requestId:
      order.clientRequestId ?? createRequestId(),
    fingerprint,
    createdAt: new Date().toISOString(),
    orderSnapshot: buildOrderSnapshot(order),
  };

  upsertPendingOrderRequest(pending);
  return pending;
}

function clearPendingOrderRequest(
  requestId: string,
) {
  writePendingOrderRequests(
    readPendingOrderRequests().filter(
      (item) => item.requestId !== requestId,
    ),
  );
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function withTimeout<T>(
  task: PromiseLike<T>,
): Promise<T> {
  let timer = 0;

  const timeout = new Promise<never>((_resolve, reject) => {
    timer = window.setTimeout(() => {
      reject(
        new Error(
          "Yêu cầu tạo đơn đã quá thời gian chờ.",
        ),
      );
    }, REQUEST_TIMEOUT_MS);
  });

  try {
    return await Promise.race([
      Promise.resolve(task),
      timeout,
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

function errorMessage(error: unknown) {
  if (error instanceof Error) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error &&
    typeof (error as RpcError).message === "string"
  ) {
    return (error as RpcError).message as string;
  }

  return "Không thể tạo đơn hàng.";
}

function isTransientError(error: unknown) {
  const message = errorMessage(error).toLowerCase();
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof (error as RpcError).code === "string"
      ? ((error as RpcError).code as string)
      : "";

  return (
    message.includes("network") ||
    message.includes("failed to fetch") ||
    message.includes("fetch failed") ||
    message.includes("load failed") ||
    message.includes("kết nối") ||
    message.includes("connection") ||
    message.includes("timeout") ||
    message.includes("quá thời gian") ||
    message.includes("timed out") ||
    message.includes("gateway") ||
    code === "429" ||
    code === "502" ||
    code === "503" ||
    code === "504"
  );
}

function buildRpcArguments(pending: PendingOrderRequest) {
  return {
    p_client_request_id: pending.requestId,
    p_customer: pending.orderSnapshot.customer,
    p_items: pending.orderSnapshot.items,
    p_coupon_code: pending.orderSnapshot.couponCode ?? null,
    p_attribution: pending.orderSnapshot.utmAttribution ?? null,
  };
}

async function submitDirectlyToSupabase(
  pending: PendingOrderRequest,
): Promise<DeliveryResult> {
  try {
    const response = await withTimeout(
      supabase.rpc(
        "create_store_order_idempotent",
        buildRpcArguments(pending),
      ),
    );

    if (response.error) {
      return {
        success: false,
        transient: isTransientError(response.error),
        message:
          response.error.message ||
          "Không thể tạo đơn hàng.",
      };
    }

    const result =
      response.data as IdempotentOrderRpcResult | null;

    if (!result?.id || !result.order_code) {
      return {
        success: false,
        transient: true,
        message:
          "Chưa xác nhận được mã đơn. Hệ thống sẽ tiếp tục dùng cùng mã yêu cầu và không tạo đơn trùng.",
      };
    }

    return {
      success: true,
      message: result.replayed
        ? "Đã tìm thấy đơn hàng vừa tạo."
        : "Đã tạo đơn hàng.",
      data: result,
    };
  } catch (error) {
    return {
      success: false,
      transient: isTransientError(error),
      message: errorMessage(error),
    };
  }
}

async function submitThroughOrderIntake(
  pending: PendingOrderRequest,
): Promise<DeliveryResult | null> {
  try {
    const response = await withTimeout(
      fetch(ORDER_INTAKE_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
        },
        body: JSON.stringify({
          requestId: pending.requestId,
          customer: pending.orderSnapshot.customer,
          items: pending.orderSnapshot.items,
          couponCode: pending.orderSnapshot.couponCode,
          attribution: pending.orderSnapshot.utmAttribution,
        }),
      }),
    );

    const contentType =
      response.headers.get("Content-Type")?.toLowerCase() ?? "";

    if (
      response.status === 404 ||
      response.status === 405 ||
      !contentType.includes("application/json")
    ) {
      return null;
    }

    const payload = (await response.json()) as IntakeApiResponse;

    if (
      response.ok &&
      payload.success &&
      payload.data?.id &&
      payload.data.order_code
    ) {
      return {
        success: true,
        message:
          payload.message ??
          (payload.data.replayed
            ? "Đã tìm thấy đơn hàng vừa tạo."
            : "Đã tạo đơn hàng."),
        data: payload.data,
      };
    }

    if (response.status >= 400 && response.status < 500) {
      return {
        success: false,
        transient: false,
        accepted: Boolean(payload.accepted),
        message:
          payload.message ??
          "Thông tin đơn hàng chưa hợp lệ.",
      };
    }

    return {
      success: false,
      transient: true,
      accepted: Boolean(payload.accepted),
      message:
        payload.message ??
        (payload.accepted
          ? "Yêu cầu đặt hàng đã được lưu dự phòng và đang được hệ thống thử lại."
          : "Kết nối tạo đơn chưa ổn định."),
    };
  } catch {
    return null;
  }
}

async function deliverPendingOrder(
  pending: PendingOrderRequest,
): Promise<DeliveryResult> {
  const intakeResult =
    await submitThroughOrderIntake(pending);

  if (intakeResult && "data" in intakeResult) {
    return intakeResult;
  }

  if (
    intakeResult &&
    "transient" in intakeResult &&
    (!intakeResult.transient || intakeResult.accepted)
  ) {
    return intakeResult;
  }

  const directResult =
    await submitDirectlyToSupabase(pending);

  if ("data" in directResult) {
    return directResult;
  }

  if (!directResult.transient) {
    return directResult;
  }

  return intakeResult ?? directResult;
}

async function recoverPendingOrder() {
  if (
    recoveryRunning ||
    !navigator.onLine
  ) {
    return;
  }

  const pendingRequests =
    readPendingOrderRequests().filter(
      (pending) => !pending.completedResult,
    );

  if (pendingRequests.length === 0) {
    return;
  }

  recoveryRunning = true;

  try {
    for (const pending of pendingRequests) {
      if (!navigator.onLine) {
        break;
      }

      const result =
        await deliverPendingOrder(pending);

      if ("data" in result) {
        rememberRecoveredOrder(
          pending,
          result.data,
        );
      } else if (
        "transient" in result &&
        !result.transient
      ) {
        clearPendingOrderRequest(
          pending.requestId,
        );
      }
    }
  } finally {
    recoveryRunning = false;
  }
}

export function startPendingOrderRecovery() {
  if (recoveryStarted) {
    return () => undefined;
  }

  recoveryStarted = true;

  const resume = () => {
    void recoverPendingOrder();
  };

  window.addEventListener("online", resume);
  window.setTimeout(resume, 1_500);

  return () => {
    window.removeEventListener("online", resume);
    recoveryStarted = false;
  };
}

export async function submitStoreOrder(
  order: LocalOrder,
): Promise<SubmitStoreOrderResult> {
  const pending = getOrCreatePendingOrderRequest(order);

  if (pending.completedResult) {
    clearPendingOrderRequest(
      pending.requestId,
    );

    return {
      success: true,
      requestId: pending.requestId,
      message:
        "Đã tìm thấy đơn hàng được hệ thống gửi lại.",
      data: pending.completedResult,
    };
  }

  if (!navigator.onLine) {
    return {
      success: false,
      requestId: pending.requestId,
      message:
        "Thiết bị đang mất mạng. Thông tin đơn đã được giữ lại và hệ thống sẽ tự gửi lại khi có mạng.",
    };
  }

  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS;
    attempt += 1
  ) {
    const result = await deliverPendingOrder(pending);

    if ("data" in result) {
      clearPendingOrderRequest(pending.requestId);

      return {
        success: true,
        requestId: pending.requestId,
        message: result.message,
        data: result.data,
      };
    }

    if ("transient" in result && !result.transient) {
      clearPendingOrderRequest(pending.requestId);

      return {
        success: false,
        requestId: pending.requestId,
        message: result.message,
      };
    }

    if (attempt < MAX_ATTEMPTS) {
      await wait(500 * attempt);
      continue;
    }

    return {
      success: false,
      requestId: pending.requestId,
      message:
        "Kết nối chưa ổn định. Thông tin đơn đã được giữ lại và hệ thống sẽ tiếp tục thử lại, không tạo đơn trùng.",
    };
  }

  return {
    success: false,
    requestId: pending.requestId,
    message:
      "Chưa xác nhận được đơn hàng. Thông tin đơn vẫn được giữ lại để thử lại an toàn.",
  };
}
