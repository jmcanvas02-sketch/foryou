import type { RuntimeAdSource } from "../types/adTracking";
import type { AdEventName } from "../types/ads";
import {
  isAdsDebugEnabled,
  sourceSupportsEvent,
} from "./adRuntime";

const ANONYMOUS_ID_STORAGE_KEY =
  "ingiday-ads-anonymous-id-v1";
const SERVER_EVENT_QUEUE_STORAGE_KEY =
  "ingiday-ads-server-event-queue-v1";
const CHECKOUT_CUSTOMER_STORAGE_KEY =
  "ingiday-checkout-customer";
const SERVER_EVENT_QUEUE_MAX_ITEMS = 200;
const SERVER_EVENT_QUEUE_MAX_AGE_MS =
  7 * 24 * 60 * 60 * 1_000;
const SERVER_EVENT_RETRY_DELAY_MS = 5_000;

type SendServerAdEventInput = {
  source: RuntimeAdSource;
  eventName: AdEventName;
  eventId: string;
  payload: Record<string, unknown>;
  productIds?: string[];
  orderCode?: string;
};

type ServerAdEventEnvelope = {
  sourceId: string;
  platform: RuntimeAdSource["platform"];
  eventName: AdEventName;
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

type QueuedServerAdEvent = {
  key: string;
  queuedAt: number;
  envelope: ServerAdEventEnvelope;
};

type IntakeResponse = {
  accepted?: unknown;
  eventId?: unknown;
};

type QueueDeliveryResult =
  | "accepted"
  | "retry"
  | "discard";

let volatileQueue: QueuedServerAdEvent[] = [];
let flushPromise: Promise<void> | null = null;
let retryTimer: number | null = null;

function debugWarn(
  message: string,
  ...details: unknown[]
) {
  if (isAdsDebugEnabled()) {
    console.warn(message, ...details);
  }
}

function debugInfo(
  message: string,
  details: Record<string, unknown>,
) {
  if (isAdsDebugEnabled()) {
    console.info(message, details);
  }
}

function createAnonymousId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random()
    .toString(16)
    .slice(2)}`;
}

function anonymousId() {
  try {
    const existing = localStorage.getItem(
      ANONYMOUS_ID_STORAGE_KEY,
    );
    if (existing) {
      return existing;
    }

    const created = createAnonymousId();
    localStorage.setItem(
      ANONYMOUS_ID_STORAGE_KEY,
      created,
    );
    return created;
  } catch {
    return createAnonymousId();
  }
}

function readSavedCustomerPhone() {
  try {
    const raw = localStorage.getItem(
      CHECKOUT_CUSTOMER_STORAGE_KEY,
    );
    if (!raw) {
      return null;
    }

    const saved = JSON.parse(raw) as unknown;
    if (
      !saved ||
      typeof saved !== "object" ||
      Array.isArray(saved)
    ) {
      return null;
    }

    const phone = (
      saved as Record<string, unknown>
    ).phone;

    return typeof phone === "string" &&
      phone.trim()
      ? phone.trim()
      : null;
  } catch {
    return null;
  }
}

function readCookie(name: string) {
  const prefix = `${name}=`;
  const cookie = document.cookie
    .split(";")
    .map((item) => item.trim())
    .find((item) => item.startsWith(prefix));

  if (!cookie) {
    return "";
  }

  try {
    return decodeURIComponent(
      cookie.slice(prefix.length),
    );
  } catch {
    return cookie.slice(prefix.length);
  }
}

function queryValue(name: string) {
  try {
    return (
      new URL(window.location.href).searchParams.get(
        name,
      ) ?? ""
    );
  } catch {
    return "";
  }
}

function uniqueProductIds(productIds: string[]) {
  return Array.from(
    new Set(
      productIds
        .map((productId) => productId.trim())
        .filter(Boolean),
    ),
  );
}

function isRecord(
  value: unknown,
): value is Record<string, unknown> {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value),
  );
}

function isServerAdEventEnvelope(
  value: unknown,
): value is ServerAdEventEnvelope {
  if (!isRecord(value)) {
    return false;
  }

  return (
    typeof value.sourceId === "string" &&
    (value.platform === "meta" ||
      value.platform === "tiktok") &&
    typeof value.eventName === "string" &&
    typeof value.eventId === "string" &&
    Number.isInteger(value.eventTime) &&
    Array.isArray(value.productIds) &&
    (value.orderCode === null ||
      typeof value.orderCode === "string") &&
    typeof value.pageUrl === "string" &&
    (value.referrer === null ||
      typeof value.referrer === "string") &&
    typeof value.anonymousId === "string" &&
    typeof value.externalId === "string" &&
    (value.customerPhone === null ||
      typeof value.customerPhone === "string") &&
    isRecord(value.payload)
  );
}

function isQueuedServerAdEvent(
  value: unknown,
): value is QueuedServerAdEvent {
  return (
    isRecord(value) &&
    typeof value.key === "string" &&
    Number.isFinite(value.queuedAt) &&
    isServerAdEventEnvelope(value.envelope)
  );
}

function pruneQueue(
  queue: QueuedServerAdEvent[],
) {
  const cutoff =
    Date.now() - SERVER_EVENT_QUEUE_MAX_AGE_MS;
  const deduplicated = new Map<
    string,
    QueuedServerAdEvent
  >();

  for (const item of queue) {
    if (item.queuedAt < cutoff) {
      continue;
    }

    deduplicated.set(item.key, item);
  }

  return Array.from(deduplicated.values())
    .sort(
      (left, right) =>
        left.queuedAt - right.queuedAt,
    )
    .slice(-SERVER_EVENT_QUEUE_MAX_ITEMS);
}

function readPersistedQueue() {
  try {
    const raw = localStorage.getItem(
      SERVER_EVENT_QUEUE_STORAGE_KEY,
    );
    if (!raw) {
      return [];
    }

    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) {
      return [];
    }

    return parsed.filter(isQueuedServerAdEvent);
  } catch {
    return [];
  }
}

function readQueue() {
  return pruneQueue([
    ...readPersistedQueue(),
    ...volatileQueue,
  ]);
}

function writeQueue(
  queue: QueuedServerAdEvent[],
) {
  const normalized = pruneQueue(queue);
  volatileQueue = normalized;

  try {
    localStorage.setItem(
      SERVER_EVENT_QUEUE_STORAGE_KEY,
      JSON.stringify(normalized),
    );
  } catch (error) {
    debugWarn(
      "[InGiDay Ads Server] Không thể lưu hàng đợi CAPI",
      error,
    );
  }

  return normalized;
}

function queueKey(
  envelope: ServerAdEventEnvelope,
) {
  return [
    envelope.sourceId,
    envelope.eventName,
    envelope.eventId,
  ].join(":");
}

function enqueueServerAdEvent(
  envelope: ServerAdEventEnvelope,
) {
  const key = queueKey(envelope);
  const queue = readQueue().filter(
    (item) => item.key !== key,
  );

  queue.push({
    key,
    queuedAt: Date.now(),
    envelope,
  });

  writeQueue(queue);
  return key;
}

function removeQueuedServerAdEvent(key: string) {
  writeQueue(
    readQueue().filter(
      (item) => item.key !== key,
    ),
  );
}

function isRetryableIntakeStatus(status: number) {
  return (
    status === 408 ||
    status === 425 ||
    status === 429 ||
    status >= 500
  );
}

async function postQueuedServerAdEvent(
  item: QueuedServerAdEvent,
): Promise<QueueDeliveryResult> {
  try {
    const response = await fetch(
      "/api/ads/events",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify(item.envelope),
      },
    );

    let intake: IntakeResponse | null = null;

    try {
      const payload = (await response.json()) as unknown;
      if (isRecord(payload)) {
        intake = payload as IntakeResponse;
      }
    } catch {
      intake = null;
    }

    if (
      response.ok &&
      intake?.accepted === true &&
      intake.eventId === item.envelope.eventId
    ) {
      debugInfo(
        "[InGiDay Ads Server] Đã tiếp nhận",
        {
          platform: item.envelope.platform,
          sourceId: item.envelope.sourceId,
          eventName: item.envelope.eventName,
          eventId: item.envelope.eventId,
        },
      );
      return "accepted";
    }

    if (isRetryableIntakeStatus(response.status)) {
      debugWarn(
        "[InGiDay Ads Server] CAPI intake tạm thời thất bại",
        response.status,
        item.envelope.eventId,
      );
      return "retry";
    }

    debugWarn(
      "[InGiDay Ads Server] Loại sự kiện CAPI không hợp lệ khỏi hàng đợi",
      response.status,
      item.envelope.eventId,
    );
    return "discard";
  } catch (error) {
    debugWarn(
      "[InGiDay Ads Server] Lỗi mạng, giữ sự kiện trong hàng đợi",
      error,
    );
    return "retry";
  }
}

function scheduleServerAdEventFlush(
  delay = 0,
) {
  if (typeof window === "undefined") {
    return;
  }

  if (retryTimer !== null) {
    window.clearTimeout(retryTimer);
  }

  retryTimer = window.setTimeout(() => {
    retryTimer = null;
    void flushServerAdEventQueue();
  }, delay);
}

type QueueLockManager = {
  request<T>(
    name: string,
    options: {
      mode: "exclusive";
      ifAvailable: true;
    },
    callback: (lock: object | null) => Promise<T> | T,
  ): Promise<T>;
};

type ServerEventQueueLease = {
  ownerId: string;
  expiresAt: number;
};

const SERVER_EVENT_QUEUE_LOCK_NAME =
  "ingiday-ads-server-event-queue-flush-v1";
const SERVER_EVENT_QUEUE_LEASE_KEY =
  "ingiday-ads-server-event-queue-lease-v1";
const SERVER_EVENT_QUEUE_LEASE_DURATION_MS = 30_000;
const SERVER_EVENT_QUEUE_LEASE_REFRESH_MS = 10_000;
const SERVER_EVENT_QUEUE_LOCK_RETRY_DELAY_MS = 1_000;
const serverEventQueueLockOwnerId = createServerEventQueueLockOwnerId();

function createServerEventQueueLockOwnerId() {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readServerEventQueueLease(): ServerEventQueueLease | null {
  try {
    const raw = localStorage.getItem(SERVER_EVENT_QUEUE_LEASE_KEY);
    if (!raw) {
      return null;
    }

    const value = JSON.parse(raw) as Partial<ServerEventQueueLease>;
    if (
      typeof value.ownerId !== "string" ||
      typeof value.expiresAt !== "number"
    ) {
      return null;
    }

    return {
      ownerId: value.ownerId,
      expiresAt: value.expiresAt,
    };
  } catch {
    return null;
  }
}

function writeServerEventQueueLease(expiresAt: number) {
  localStorage.setItem(
    SERVER_EVENT_QUEUE_LEASE_KEY,
    JSON.stringify({
      ownerId: serverEventQueueLockOwnerId,
      expiresAt,
    } satisfies ServerEventQueueLease),
  );
}

function acquireServerEventQueueLease() {
  try {
    const now = Date.now();
    const existing = readServerEventQueueLease();
    if (
      existing &&
      existing.ownerId !== serverEventQueueLockOwnerId &&
      existing.expiresAt > now
    ) {
      return false;
    }

    writeServerEventQueueLease(
      now + SERVER_EVENT_QUEUE_LEASE_DURATION_MS,
    );

    return (
      readServerEventQueueLease()?.ownerId ===
      serverEventQueueLockOwnerId
    );
  } catch {
    return true;
  }
}

function refreshServerEventQueueLease() {
  try {
    if (
      readServerEventQueueLease()?.ownerId !==
      serverEventQueueLockOwnerId
    ) {
      return;
    }

    writeServerEventQueueLease(
      Date.now() + SERVER_EVENT_QUEUE_LEASE_DURATION_MS,
    );
  } catch {
    // Server dedup remains the final safety layer.
  }
}

function releaseServerEventQueueLease() {
  try {
    if (
      readServerEventQueueLease()?.ownerId ===
      serverEventQueueLockOwnerId
    ) {
      localStorage.removeItem(SERVER_EVENT_QUEUE_LEASE_KEY);
    }
  } catch {
    // Ignore storage failures during cleanup.
  }
}

async function runWithServerEventQueueLease(
  task: () => Promise<void>,
) {
  if (!acquireServerEventQueueLease()) {
    return false;
  }

  const refreshTimer = window.setInterval(
    refreshServerEventQueueLease,
    SERVER_EVENT_QUEUE_LEASE_REFRESH_MS,
  );

  try {
    await task();
    return true;
  } finally {
    window.clearInterval(refreshTimer);
    releaseServerEventQueueLease();
  }
}

async function withServerEventQueueCrossTabLock(
  task: () => Promise<void>,
) {
  const lockManager =
    typeof navigator === "undefined"
      ? undefined
      : (navigator as unknown as { locks?: QueueLockManager }).locks;

  if (lockManager) {
    try {
      return await lockManager.request(
        SERVER_EVENT_QUEUE_LOCK_NAME,
        {
          mode: "exclusive",
          ifAvailable: true,
        },
        async (lock) => {
          if (!lock) {
            return false;
          }

          await task();
          return true;
        },
      );
    } catch (error) {
      if (isAdsDebugEnabled()) {
        console.warn(
          "[InGiDay Ads Server] Navigator lock lỗi, dùng lease fallback",
          error,
        );
      }
    }
  }

  return runWithServerEventQueueLease(task);
}

function flushServerAdEventQueueWithinTab() {
  if (flushPromise) {
    return flushPromise;
  }

  flushPromise = (async () => {
    while (true) {
      const queue = readQueue();
      if (queue.length === 0) {
        return;
      }

      let retryNeeded = false;

      for (const item of queue) {
        const result =
          await postQueuedServerAdEvent(item);

        if (result === "retry") {
          retryNeeded = true;
          continue;
        }

        removeQueuedServerAdEvent(item.key);
      }

      if (retryNeeded) {
        scheduleServerAdEventFlush(
          SERVER_EVENT_RETRY_DELAY_MS,
        );
        return;
      }
    }
  })().finally(() => {
    flushPromise = null;
  });

  return flushPromise;
}

export function flushServerAdEventQueue() {
  return withServerEventQueueCrossTabLock(async () => {
    await flushServerAdEventQueueWithinTab();
  }).then((lockAcquired) => {
    if (!lockAcquired) {
      scheduleServerAdEventFlush(
        SERVER_EVENT_QUEUE_LOCK_RETRY_DELAY_MS,
      );
    }
  });
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => {
    scheduleServerAdEventFlush();
  });

  window.addEventListener("pageshow", () => {
    scheduleServerAdEventFlush();
  });

  document.addEventListener(
    "visibilitychange",
    () => {
      if (document.visibilityState === "visible") {
        scheduleServerAdEventFlush();
      }
    },
  );

  scheduleServerAdEventFlush();
}

export async function sendServerAdEvent(
  input: SendServerAdEventInput,
) {
  if (
    !sourceSupportsEvent(
      input.source,
      input.eventName,
      "server",
    )
  ) {
    return;
  }

  const visitorId = anonymousId();
  const envelope: ServerAdEventEnvelope = {
    sourceId: input.source.id,
    platform: input.source.platform,
    eventName: input.eventName,
    eventId: input.eventId,
    eventTime: Math.floor(Date.now() / 1_000),
    productIds: uniqueProductIds(
      input.productIds ?? [],
    ),
    orderCode: input.orderCode?.trim() || null,
    pageUrl: window.location.href,
    referrer: document.referrer || null,
    anonymousId: visitorId,
    externalId: visitorId,
    customerPhone: readSavedCustomerPhone(),
    fbp: readCookie("_fbp") || null,
    fbc: readCookie("_fbc") || null,
    fbclid: queryValue("fbclid") || null,
    ttp: readCookie("_ttp") || null,
    ttclid: queryValue("ttclid") || null,
    payload: input.payload,
  };

  enqueueServerAdEvent(envelope);

  await flushServerAdEventQueue();
}
