import {
  decryptAccessToken,
} from "./ads-crypto";
import {
  buildMatchingData,
} from "./ad-matching";
import {
  claimServerLog,
  finishServerLog,
} from "./ad-event-log";
import type {
  StoredEventEnvelope,
} from "./ad-event-log";
import {
  HttpError,
} from "./http";
import {
  sendMetaCapiEvent,
} from "./meta-capi";
import type {
  DeliveryResult,
} from "./meta-capi";
import {
  requireEncryptionKey,
  supabaseServerFetch,
} from "./supabase-server";
import type {
  AdsFunctionEnv,
} from "./supabase-server";
import {
  sendTikTokEvent,
} from "./tiktok-events";

const EVENT_NAMES = [
  "PageView",
  "ViewContent",
  "Search",
  "AddToCart",
  "InitiateCheckout",
  "Purchase",
] as const;

type EventName =
  (typeof EVENT_NAMES)[number];
type Platform = "meta" | "tiktok";

type SourceRow = {
  id: string;
  platform: Platform;
  pixel_id: string;
  is_default: boolean;
  is_active: boolean;
  server_enabled: boolean;
  test_mode: boolean;
  test_event_code: string;
  api_version: string;
  purchase_trigger:
    | "order_created"
    | "order_confirmed"
    | "order_completed";
};

type SecretRow = {
  ciphertext: string;
  initialization_vector: string;
  algorithm: string;
};

type EventSettingRow = {
  ad_data_source_id: string;
  event_name: string;
  server_enabled: boolean;
};

type AssignmentRow = {
  product_id: string;
  ad_data_source_id: string;
};

type OrderRow = {
  id: string;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  province: string;
  subtotal: number | string;
  discount_amount: number | string;
  shipping_fee: number | string;
  total_amount: number | string;
};

type OrderItemRow = {
  product_id: string | null;
  product_name: string;
  unit_price: number | string;
  quantity: number;
  line_total: number | string;
};

type ProcessingOptions = {
  force?: boolean;
  skipSourceResolution?: boolean;
  clientIp?: string;
  userAgent?: string;
  testEventCodeOverride?: string;
  includeDeliveryDetails?: boolean;
};

type PreparedEvent = {
  source: SourceRow;
  customData: Record<string, unknown>;
  customerName?: string;
  customerPhone?: string;
  province?: string;
  orderId?: string;
  firstProductId?: string;
};

function numberValue(value: unknown) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function wait(ms: number) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function encode(value: string) {
  return encodeURIComponent(value);
}

function isEventName(
  value: unknown,
): value is EventName {
  return EVENT_NAMES.includes(
    value as EventName,
  );
}

function isPlatform(
  value: unknown,
): value is Platform {
  return value === "meta" || value === "tiktok";
}

function cleanNullableString(value: unknown) {
  return typeof value === "string" && value.trim()
    ? value.trim()
    : null;
}

function cleanProductIds(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return Array.from(
    new Set(
      value
        .filter(
          (item): item is string =>
            typeof item === "string" &&
            /^[0-9a-f-]{36}$/i.test(item),
        )
        .map((item) => item.toLowerCase()),
    ),
  ).slice(0, 50);
}

function cleanPayload(value: unknown) {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    return {};
  }

  const payload = value as Record<string, unknown>;
  const allowedKeys = [
    "content_ids",
    "content_name",
    "content_category",
    "content_type",
    "contents",
    "currency",
    "value",
    "num_items",
    "order_id",
    "shipping",
    "discount",
    "search_string",
    "query",
    "page_path",
  ];
  const cleaned: Record<string, unknown> = {};

  for (const key of allowedKeys) {
    if (key in payload) {
      cleaned[key] = payload[key];
    }
  }

  if (JSON.stringify(cleaned).length > 24_000) {
    throw new HttpError(
      413,
      "Dữ liệu sự kiện quảng cáo quá lớn.",
    );
  }

  return cleaned;
}

export function parseEventEnvelope(
  value: unknown,
): StoredEventEnvelope {
  if (
    !value ||
    typeof value !== "object" ||
    Array.isArray(value)
  ) {
    throw new HttpError(
      400,
      "Dữ liệu sự kiện không hợp lệ.",
    );
  }

  const row = value as Record<string, unknown>;
  const sourceId = cleanNullableString(
    row.sourceId,
  );
  const platform = row.platform;
  const eventName = row.eventName;
  const eventId = cleanNullableString(
    row.eventId,
  );
  const eventTime = Math.round(Number(row.eventTime));
  const pageUrl = cleanNullableString(
    row.pageUrl,
  );
  const anonymousId = cleanNullableString(
    row.anonymousId,
  );
  const externalId =
    cleanNullableString(row.externalId) ?? anonymousId;
  const customerPhone = cleanNullableString(
    row.customerPhone,
  );
  const now = Math.floor(Date.now() / 1_000);

  if (
    !sourceId ||
    !/^[0-9a-f-]{36}$/i.test(sourceId) ||
    !isPlatform(platform) ||
    !isEventName(eventName) ||
    !eventId ||
    eventId.length > 300 ||
    !Number.isInteger(eventTime) ||
    eventTime <
      now - 7 * 24 * 60 * 60 ||
    eventTime > now + 5 * 60 ||
    !pageUrl ||
    pageUrl.length > 2000 ||
    !anonymousId ||
    anonymousId.length > 200 ||
    !externalId ||
    externalId.length > 200 ||
    (customerPhone?.length ?? 0) > 50
  ) {
    throw new HttpError(
      400,
      "Thiếu dữ liệu sự kiện quảng cáo bắt buộc.",
    );
  }

  return {
    sourceId,
    platform,
    eventName,
    eventId,
    eventTime,
    productIds: cleanProductIds(
      row.productIds,
    ),
    orderCode: cleanNullableString(
      row.orderCode,
    ),
    pageUrl,
    referrer: cleanNullableString(
      row.referrer,
    ),
    anonymousId,
    externalId,
    customerPhone,
    fbp: cleanNullableString(row.fbp),
    fbc: cleanNullableString(row.fbc),
    fbclid: cleanNullableString(row.fbclid),
    ttp: cleanNullableString(row.ttp),
    ttclid: cleanNullableString(row.ttclid),
    payload: cleanPayload(row.payload),
  };
}

async function rows<T>(
  env: AdsFunctionEnv,
  path: string,
) {
  const response =
    await supabaseServerFetch(env, path);

  if (!response.ok) {
    console.error(
      "ads-db-read-failed",
      response.status,
      path.split("?")[0],
    );
    throw new HttpError(
      500,
      "Không thể đọc cấu hình sự kiện quảng cáo.",
    );
  }

  const payload =
    (await response.json()) as unknown;

  if (!Array.isArray(payload)) {
    throw new HttpError(
      500,
      "Phản hồi cấu hình quảng cáo không hợp lệ.",
    );
  }

  return payload as T[];
}

async function loadSource(
  env: AdsFunctionEnv,
  sourceId: string,
) {
  const result = await rows<SourceRow>(
    env,
    "/rest/v1/ad_data_sources" +
      `?id=eq.${encode(sourceId)}` +
      "&select=id,platform,pixel_id,is_default,is_active,server_enabled,test_mode,test_event_code,api_version,purchase_trigger" +
      "&limit=1",
  );
  const source = result[0];

  if (!source) {
    throw new HttpError(
      404,
      "Không tìm thấy cấu hình Pixel.",
    );
  }

  return source;
}

async function loadSecret(
  env: AdsFunctionEnv,
  sourceId: string,
) {
  const result = await rows<SecretRow>(
    env,
    "/rest/v1/ad_data_source_secrets" +
      `?ad_data_source_id=eq.${encode(sourceId)}` +
      "&select=ciphertext,initialization_vector,algorithm" +
      "&limit=1",
  );

  return result[0] ?? null;
}

async function eventServerEnabled(
  env: AdsFunctionEnv,
  sourceId: string,
  eventName: string,
) {
  const result = await rows<EventSettingRow>(
    env,
    "/rest/v1/ad_event_settings" +
      `?ad_data_source_id=eq.${encode(sourceId)}` +
      `&event_name=eq.${encode(eventName)}` +
      "&server_enabled=eq.true" +
      "&select=ad_data_source_id,event_name,server_enabled" +
      "&limit=1",
  );

  return Boolean(result[0]);
}

async function eligibleSources(
  env: AdsFunctionEnv,
  platform: Platform,
  eventName: EventName,
) {
  const sources = await rows<SourceRow>(
    env,
    "/rest/v1/ad_data_sources" +
      `?platform=eq.${platform}` +
      "&is_active=eq.true" +
      "&server_enabled=eq.true" +
      "&select=id,platform,pixel_id,is_default,is_active,server_enabled,test_mode,test_event_code,api_version,purchase_trigger",
  );

  if (sources.length === 0) {
    return [];
  }

  const ids = sources.map((source) => source.id);
  const settings = await rows<EventSettingRow>(
    env,
    "/rest/v1/ad_event_settings" +
      `?ad_data_source_id=in.(${ids.map(encode).join(",")})` +
      `&event_name=eq.${encode(eventName)}` +
      "&server_enabled=eq.true" +
      "&select=ad_data_source_id,event_name,server_enabled",
  );
  const allowedIds = new Set(
    settings.map(
      (setting) => setting.ad_data_source_id,
    ),
  );

  return sources.filter(
    (source) =>
      allowedIds.has(source.id) &&
      (
        eventName !== "Purchase" ||
        source.purchase_trigger === "order_created"
      ),
  );
}

async function loadAssignments(
  env: AdsFunctionEnv,
  platform: Platform,
  productIds: string[],
) {
  if (productIds.length === 0) {
    return [];
  }

  return rows<AssignmentRow>(
    env,
    "/rest/v1/product_ad_assignments" +
      `?platform=eq.${platform}` +
      `&product_id=in.(${productIds.map(encode).join(",")})` +
      "&select=product_id,ad_data_source_id",
  );
}

async function sourceForProducts(
  env: AdsFunctionEnv,
  platform: Platform,
  eventName: EventName,
  productIds: string[],
) {
  const sources = await eligibleSources(
    env,
    platform,
    eventName,
  );
  const sourceIds = new Set(
    sources.map((source) => source.id),
  );
  const defaultSource = sources.find(
    (source) => source.is_default,
  );
  const assignments = await loadAssignments(
    env,
    platform,
    productIds,
  );
  const assignmentMap = new Map(
    assignments.map((assignment) => [
      assignment.product_id,
      assignment.ad_data_source_id,
    ]),
  );
  const mapping = new Map<string, string>();

  for (const productId of productIds) {
    const assigned = assignmentMap.get(productId);

    if (assigned && sourceIds.has(assigned)) {
      mapping.set(productId, assigned);
    } else if (defaultSource) {
      mapping.set(productId, defaultSource.id);
    }
  }

  return {
    sources,
    mapping,
    defaultSource,
  };
}

function allocateAmount(
  total: number,
  weights: number[],
) {
  if (weights.length === 0) {
    return [];
  }

  const safeTotal = Math.max(
    0,
    Math.round(total),
  );
  const weightTotal = weights.reduce(
    (sum, weight) =>
      sum + Math.max(0, weight),
    0,
  );

  if (weightTotal <= 0) {
    return weights.map((_weight, index) =>
      index === weights.length - 1
        ? safeTotal
        : 0,
    );
  }

  let allocated = 0;

  return weights.map((weight, index) => {
    if (index === weights.length - 1) {
      return safeTotal - allocated;
    }

    const part = Math.round(
      safeTotal * Math.max(0, weight) /
        weightTotal,
    );
    allocated += part;
    return part;
  });
}

function normalizedContents(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.slice(0, 50).flatMap((item) => {
    if (
      !item ||
      typeof item !== "object" ||
      Array.isArray(item)
    ) {
      return [];
    }

    const row = item as Record<string, unknown>;
    const id = String(
      row.id ?? row.content_id ?? "",
    ).trim();

    if (!id) {
      return [];
    }

    return [
      {
        id,
        content_id: id,
        content_name:
          typeof row.content_name === "string"
            ? row.content_name.slice(0, 500)
            : undefined,
        quantity: Math.max(
          1,
          Math.round(numberValue(row.quantity)),
        ),
        item_price: Math.max(
          0,
          numberValue(
            row.item_price ?? row.price,
          ),
        ),
        price: Math.max(
          0,
          numberValue(
            row.price ?? row.item_price,
          ),
        ),
      },
    ];
  });
}

function cleanCustomData(
  payload: Record<string, unknown>,
) {
  const contents = normalizedContents(
    payload.contents,
  );
  const customData: Record<string, unknown> = {
    ...payload,
    contents,
  };

  if (Array.isArray(payload.content_ids)) {
    customData.content_ids = payload.content_ids
      .filter(
        (value): value is string =>
          typeof value === "string",
      )
      .slice(0, 50);
  }

  customData.currency = "VND";
  customData.value = Math.max(
    0,
    numberValue(payload.value),
  );

  return customData;
}

async function preparePurchase(
  env: AdsFunctionEnv,
  envelope: StoredEventEnvelope,
  source: SourceRow,
): Promise<PreparedEvent> {
  if (!envelope.orderCode) {
    throw new HttpError(
      400,
      "Thiếu mã đơn hàng cho Purchase.",
    );
  }

  const orders = await rows<OrderRow>(
    env,
    "/rest/v1/orders" +
      `?order_code=eq.${encode(envelope.orderCode)}` +
      "&select=id,order_code,customer_name,customer_phone,province,subtotal,discount_amount,shipping_fee,total_amount" +
      "&limit=1",
  );
  const order = orders[0];

  if (!order) {
    throw new HttpError(
      404,
      "Không tìm thấy đơn hàng để gửi Purchase.",
    );
  }

  const items = await rows<OrderItemRow>(
    env,
    "/rest/v1/order_items" +
      `?order_id=eq.${encode(order.id)}` +
      "&select=product_id,product_name,unit_price,quantity,line_total" +
      "&order=created_at.asc",
  );

  if (items.length === 0) {
    throw new HttpError(
      409,
      "Đơn hàng chưa có sản phẩm.",
    );
  }

  const productIds = Array.from(
    new Set(
      items
        .map((item) => item.product_id)
        .filter(
          (value): value is string =>
            Boolean(value),
        ),
    ),
  );
  const resolution = await sourceForProducts(
    env,
    source.platform,
    "Purchase",
    productIds,
  );
  const groups = new Map<
    string,
    OrderItemRow[]
  >();

  for (const item of items) {
    const sourceId = item.product_id
      ? resolution.mapping.get(item.product_id)
      : resolution.defaultSource?.id;

    if (!sourceId) {
      continue;
    }

    const group = groups.get(sourceId) ?? [];
    group.push(item);
    groups.set(sourceId, group);
  }

  const entries = Array.from(groups.entries())
    .sort(([left], [right]) =>
      left.localeCompare(right),
    );
  const subtotals = entries.map(([, group]) =>
    group.reduce(
      (sum, item) =>
        sum + numberValue(item.line_total),
      0,
    ),
  );
  const discounts = allocateAmount(
    numberValue(order.discount_amount),
    subtotals,
  );
  const shippingParts = allocateAmount(
    numberValue(order.shipping_fee),
    subtotals,
  );
  const index = entries.findIndex(
    ([sourceId]) => sourceId === source.id,
  );

  if (index < 0) {
    throw new HttpError(
      409,
      "Pixel không thuộc nhóm sản phẩm của đơn hàng.",
    );
  }

  const groupItems = entries[index][1];
  const value = Math.max(
    0,
    subtotals[index] - discounts[index],
  ) + shippingParts[index];

  return {
    source,
    orderId: order.id,
    firstProductId:
      groupItems.find((item) => item.product_id)
        ?.product_id ?? undefined,
    customerName: order.customer_name,
    customerPhone: order.customer_phone,
    province: order.province,
    customData: {
      content_ids: groupItems
        .map((item) => item.product_id)
        .filter(Boolean),
      content_type: "product",
      contents: groupItems.map((item) => ({
        id: item.product_id ?? item.product_name,
        content_id:
          item.product_id ?? item.product_name,
        content_name: item.product_name,
        quantity: item.quantity,
        item_price: numberValue(item.unit_price),
        price: numberValue(item.unit_price),
      })),
      currency: "VND",
      num_items: groupItems.reduce(
        (sum, item) => sum + item.quantity,
        0,
      ),
      order_id: order.order_code,
      shipping: shippingParts[index],
      discount: discounts[index],
      value,
    },
  };
}

async function prepareEvent(
  env: AdsFunctionEnv,
  envelope: StoredEventEnvelope,
  options: ProcessingOptions,
): Promise<PreparedEvent> {
  const source = await loadSource(
    env,
    envelope.sourceId,
  );

  if (
    source.platform !== envelope.platform ||
    !source.is_active ||
    !source.server_enabled
  ) {
    throw new HttpError(
      409,
      "Pixel không còn hoạt động cho sự kiện Server.",
    );
  }

  if (
    envelope.eventName === "Purchase" &&
    source.purchase_trigger !== "order_created"
  ) {
    throw new HttpError(
      409,
      "Pixel chưa được cấu hình gửi Purchase khi tạo đơn.",
    );
  }

  const serverEnabled = await eventServerEnabled(
    env,
    source.id,
    envelope.eventName,
  );

  if (!serverEnabled) {
    throw new HttpError(
      409,
      "Sự kiện Server đang bị tắt trong quản trị Pixel.",
    );
  }

  if (envelope.eventName === "Purchase") {
    return preparePurchase(
      env,
      envelope,
      source,
    );
  }

  if (!options.skipSourceResolution) {
    if (envelope.productIds.length > 0) {
      const resolution = await sourceForProducts(
        env,
        source.platform,
        envelope.eventName as EventName,
        envelope.productIds,
      );

      if (
        envelope.productIds.some(
          (productId) =>
            resolution.mapping.get(productId) !== source.id,
        )
      ) {
        throw new HttpError(
          409,
          "Pixel không khớp với sản phẩm của sự kiện.",
        );
      }
    } else if (!source.is_default) {
      throw new HttpError(
        409,
        "Sự kiện toàn website phải dùng Pixel mặc định.",
      );
    }
  }

  return {
    source,
    firstProductId:
      envelope.productIds[0],
    customData: cleanCustomData(
      envelope.payload,
    ),
  };
}

function clientIp(
  request: Request,
) {
  return (
    request.headers.get("CF-Connecting-IP") ??
    request.headers.get("X-Forwarded-For")
      ?.split(",")[0]
      ?.trim() ??
    ""
  );
}

async function deliverWithRetry(
  task: () => Promise<DeliveryResult>,
) {
  let lastResult: DeliveryResult | null = null;

  for (
    let attempt = 1;
    attempt <= 3;
    attempt += 1
  ) {
    const result = await task();
    lastResult = result;

    if (result.ok || !result.retryable) {
      return {
        result,
        attempts: attempt,
      };
    }

    if (attempt < 3) {
      await wait(attempt * 300);
    }
  }

  return {
    result: lastResult as DeliveryResult,
    attempts: 3,
  };
}

export async function processAdEvent(
  env: AdsFunctionEnv,
  envelope: StoredEventEnvelope,
  request?: Request,
  options: ProcessingOptions = {},
) {
  const prepared = await prepareEvent(
    env,
    envelope,
    options,
  );
  const claimed = await claimServerLog(
    env,
    {
      sourceId: prepared.source.id,
      platform: prepared.source.platform,
      eventName: envelope.eventName,
      eventId: envelope.eventId,
      productId: prepared.firstProductId,
      orderId: prepared.orderId,
      envelope,
      force: options.force,
    },
  );

  if (!claimed.shouldSend || !claimed.log) {
    return {
      accepted: true,
      duplicate: true,
    };
  }

  const dryRun =
    env.ADS_SERVER_DRY_RUN === "true";

  try {
    const matching = await buildMatchingData({
      anonymousId: envelope.anonymousId,
      externalId: envelope.externalId,
      customerName: prepared.customerName,
      customerPhone:
        prepared.customerPhone ??
        envelope.customerPhone ??
        undefined,
      province: prepared.province,
      country: "vn",
      clientIp:
        options.clientIp ??
        (request ? clientIp(request) : ""),
      userAgent:
        options.userAgent ??
        request?.headers.get("User-Agent") ??
        "",
      fbp: envelope.fbp,
      fbc: envelope.fbc,
      fbclid: envelope.fbclid,
      ttp: envelope.ttp,
      ttclid: envelope.ttclid,
    });

    if (dryRun) {
      await finishServerLog(
        env,
        claimed.log.id,
        {
          status: "success",
          attemptCount: 1,
          responseSummary: {
            dryRun: true,
            platform:
              prepared.source.platform,
            eventName: envelope.eventName,
            matchedKeys:
              Object.keys(
                prepared.source.platform === "meta"
                  ? matching.meta
                  : matching.tiktok,
              ),
          },
        },
      );

      return {
        accepted: true,
        dryRun: true,
      };
    }

    const secret = await loadSecret(
      env,
      prepared.source.id,
    );

    if (!secret) {
      await finishServerLog(
        env,
        claimed.log.id,
        {
          status: "failed",
          attemptCount: 1,
          errorCode: "TOKEN_NOT_CONFIGURED",
          errorMessage:
            "Pixel chưa có Access Token.",
        },
      );

      return {
        accepted: false,
        error: "TOKEN_NOT_CONFIGURED",
      };
    }

    const accessToken =
      await decryptAccessToken(
        secret.ciphertext,
        secret.initialization_vector,
        requireEncryptionKey(env),
      );
    const eventTime = envelope.eventTime;
    const delivery = await deliverWithRetry(
      () =>
        prepared.source.platform === "meta"
          ? sendMetaCapiEvent({
              pixelId:
                prepared.source.pixel_id,
              accessToken,
              apiVersion:
                prepared.source.api_version,
              testMode:
                options.testEventCodeOverride !==
                undefined
                  ? true
                  : prepared.source.test_mode,
              testEventCode:
                options.testEventCodeOverride ??
                prepared.source.test_event_code,
              eventName:
                envelope.eventName,
              eventId: envelope.eventId,
              eventTime,
              pageUrl: envelope.pageUrl,
              userData: matching.meta,
              customData:
                prepared.customData,
            })
          : sendTikTokEvent({
              pixelId:
                prepared.source.pixel_id,
              accessToken,
              testMode:
                prepared.source.test_mode,
              testEventCode:
                prepared.source.test_event_code,
              eventName:
                envelope.eventName,
              eventId: envelope.eventId,
              eventTime,
              pageUrl: envelope.pageUrl,
              referrer: envelope.referrer,
              userData: matching.tiktok,
              customData:
                prepared.customData,
            }),
    );

    await finishServerLog(
      env,
      claimed.log.id,
      delivery.result.ok
        ? {
            status: "success",
            attemptCount:
              delivery.attempts,
            responseSummary:
              delivery.result.summary,
          }
        : {
            status: "failed",
            attemptCount:
              delivery.attempts,
            errorCode:
              delivery.result.code,
            errorMessage:
              delivery.result.message,
            responseSummary:
              delivery.result.summary,
          },
    );

    return {
      accepted: delivery.result.ok,
      status: delivery.result.status,
      ...(options.includeDeliveryDetails
        ? { delivery: delivery.result }
        : {}),
    };
  } catch (error) {
    await finishServerLog(
      env,
      claimed.log.id,
      {
        status: "failed",
        attemptCount:
          claimed.log.attempt_count + 1,
        errorCode: "PROCESSING_ERROR",
        errorMessage:
          error instanceof Error
            ? error.message.slice(0, 500)
            : "Không thể xử lý sự kiện.",
      },
    );

    throw error;
  }
}
