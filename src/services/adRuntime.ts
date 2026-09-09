import { supabase } from "../lib/supabase";
import type {
  AdRuntimeSnapshot,
  RuntimeAdAssignment,
  RuntimeAdSource,
} from "../types/adTracking";
import type { AdEventName, AdPlatform, PurchaseTrigger } from "../types/ads";

const RUNTIME_CACHE_TTL_MS = 60_000;
const DEBUG_ENABLED = import.meta.env.VITE_ADS_DEBUG === "true";

type RuntimeRpcSource = {
  id?: unknown;
  platform?: unknown;
  pixelId?: unknown;
  isDefault?: unknown;
  testMode?: unknown;
  purchaseTrigger?: unknown;
  browserEvents?: unknown;
  serverEvents?: unknown;
};

type RuntimeRpcAssignment = {
  productId?: unknown;
  platform?: unknown;
  sourceId?: unknown;
};

type RuntimeRpcPayload = {
  sources?: unknown;
  assignments?: unknown;
};

type CachedAssignment = {
  assignments: RuntimeAdAssignment[];
  expiresAt: number;
};

type MetaPixelFunction = {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue?: unknown[][];
  loaded?: boolean;
  version?: string;
  push?: (...args: unknown[]) => void;
};

type TikTokQueue = unknown[] & {
  page: (...args: unknown[]) => void;
  track: (...args: unknown[]) => void;
};

declare global {
  interface Window {
    fbq?: MetaPixelFunction;
    _fbq?: MetaPixelFunction;
    TiktokAnalyticsObject?: string;
  }
}

let sourceCache: {
  sources: RuntimeAdSource[];
  expiresAt: number;
} | null = null;

const assignmentCache = new Map<string, CachedAssignment>();
const initializedMetaPixels = new Set<string>();
const META_BROWSER_EVENT_DEDUP_LIMIT = 2_000;
const sentMetaBrowserEventKeys = new Set<string>();
const tikTokQueues = new Map<string, TikTokQueue>();
let metaBootstrapReady = false;

function isAdPlatform(value: unknown): value is AdPlatform {
  return value === "meta" || value === "tiktok";
}

function isPurchaseTrigger(value: unknown): value is PurchaseTrigger {
  return (
    value === "order_created" ||
    value === "order_confirmed" ||
    value === "order_completed"
  );
}

function isAdEventName(value: unknown): value is AdEventName {
  return [
    "PageView",
    "ViewContent",
    "Search",
    "AddToCart",
    "InitiateCheckout",
    "Purchase",
  ].includes(String(value));
}

function parseSource(value: unknown): RuntimeAdSource | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as RuntimeRpcSource;

  if (
    typeof row.id !== "string" ||
    !isAdPlatform(row.platform) ||
    typeof row.pixelId !== "string" ||
    typeof row.isDefault !== "boolean" ||
    typeof row.testMode !== "boolean" ||
    !isPurchaseTrigger(row.purchaseTrigger) ||
    !Array.isArray(row.browserEvents) ||
    !Array.isArray(row.serverEvents)
  ) {
    return null;
  }

  return {
    id: row.id,
    platform: row.platform,
    pixelId: row.pixelId,
    isDefault: row.isDefault,
    testMode: row.testMode,
    purchaseTrigger: row.purchaseTrigger,
    browserEvents: row.browserEvents.filter(isAdEventName),
    serverEvents: row.serverEvents.filter(isAdEventName),
  };
}

function parseAssignment(value: unknown): RuntimeAdAssignment | null {
  if (!value || typeof value !== "object") {
    return null;
  }

  const row = value as RuntimeRpcAssignment;

  if (
    typeof row.productId !== "string" ||
    !isAdPlatform(row.platform) ||
    typeof row.sourceId !== "string"
  ) {
    return null;
  }

  return {
    productId: row.productId,
    platform: row.platform,
    sourceId: row.sourceId,
  };
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

function cachedAssignmentsFor(productIds: string[]) {
  const now = Date.now();
  const assignments: RuntimeAdAssignment[] = [];
  const missing: string[] = [];

  for (const productId of productIds) {
    const cached = assignmentCache.get(productId);

    if (!cached || cached.expiresAt <= now) {
      missing.push(productId);
      continue;
    }

    assignments.push(...cached.assignments);
  }

  return {
    assignments,
    missing,
  };
}

export function isAdsDebugEnabled() {
  return DEBUG_ENABLED;
}

export function createAdEventId(prefix: string) {
  if (
    typeof crypto !== "undefined" &&
    typeof crypto.randomUUID === "function"
  ) {
    return `${prefix}:${crypto.randomUUID()}`;
  }

  return `${prefix}:${Date.now()}:${Math.random().toString(16).slice(2)}`;
}

export async function getAdRuntimeSnapshot(
  productIds: string[] = [],
  force = false,
): Promise<AdRuntimeSnapshot> {
  const normalizedIds = uniqueProductIds(productIds);
  const now = Date.now();
  const sourceCacheValid =
    !force && sourceCache && sourceCache.expiresAt > now;
  const cached = force
    ? { assignments: [], missing: normalizedIds }
    : cachedAssignmentsFor(normalizedIds);
  const needsRequest = !sourceCacheValid || cached.missing.length > 0;

  if (needsRequest) {
    const requestIds = force ? normalizedIds : cached.missing;
    const { data, error } = await supabase.rpc(
      "get_public_ad_runtime_config",
      {
        p_product_ids: requestIds,
      },
    );

    if (error) {
      throw new Error(error.message);
    }

    const payload = (data ?? {}) as RuntimeRpcPayload;
    const sources = Array.isArray(payload.sources)
      ? payload.sources
          .map(parseSource)
          .filter((source): source is RuntimeAdSource => Boolean(source))
      : [];
    const assignments = Array.isArray(payload.assignments)
      ? payload.assignments
          .map(parseAssignment)
          .filter(
            (assignment): assignment is RuntimeAdAssignment =>
              Boolean(assignment),
          )
      : [];
    const expiresAt = Date.now() + RUNTIME_CACHE_TTL_MS;

    sourceCache = {
      sources,
      expiresAt,
    };

    for (const productId of requestIds) {
      assignmentCache.set(productId, {
        assignments: assignments.filter(
          (assignment) => assignment.productId === productId,
        ),
        expiresAt,
      });
    }
  }

  const freshAssignments = cachedAssignmentsFor(normalizedIds).assignments;

  return {
    sources: sourceCache?.sources ?? [],
    assignments: freshAssignments,
  };
}

export async function warmAdRuntime() {
  try {
    await getAdRuntimeSnapshot();
  } catch (error) {
    console.warn("Không thể tải cấu hình quảng cáo:", error);
  }
}

export type AdDeliveryChannel =
  | "browser"
  | "server"
  | "any";

export function sourceSupportsEvent(
  source: RuntimeAdSource,
  eventName: AdEventName,
  channel: AdDeliveryChannel = "any",
) {
  const browserEnabled =
    source.browserEvents.includes(eventName);
  const serverEnabled =
    source.serverEvents.includes(eventName);

  if (channel === "browser") {
    return browserEnabled;
  }

  if (channel === "server") {
    return serverEnabled;
  }

  return browserEnabled || serverEnabled;
}

export function resolveAdSource(
  snapshot: AdRuntimeSnapshot,
  platform: AdPlatform,
  eventName: AdEventName,
  productId?: string,
  channel: AdDeliveryChannel = "any",
) {
  const platformSources = snapshot.sources.filter(
    (source) =>
      source.platform === platform &&
      sourceSupportsEvent(source, eventName, channel) &&
      (eventName !== "Purchase" ||
        source.purchaseTrigger === "order_created"),
  );

  if (productId) {
    const assignment = snapshot.assignments.find(
      (item) =>
        item.productId === productId &&
        item.platform === platform,
    );
    const assignedSource = assignment
      ? platformSources.find((source) => source.id === assignment.sourceId)
      : undefined;

    if (assignedSource) {
      return assignedSource;
    }
  }

  return platformSources.find((source) => source.isDefault);
}

function ensureMetaBootstrap() {
  if (metaBootstrapReady && window.fbq) {
    return window.fbq;
  }

  const fbq: MetaPixelFunction =
    window.fbq ??
    function metaPixelQueue(...args: unknown[]) {
      if (fbq.callMethod) {
        fbq.callMethod(...args);
        return;
      }

      fbq.queue = fbq.queue ?? [];
      fbq.queue.push(args);
    };

  if (!window._fbq) {
    window._fbq = fbq;
  }

  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = fbq.queue ?? [];
  window.fbq = fbq;

  if (!document.querySelector('script[data-ingiday-meta-pixel="true"]')) {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.dataset.ingidayMetaPixel = "true";
    document.head.appendChild(script);
  }

  metaBootstrapReady = true;
  return fbq;
}

const TIKTOK_METHODS = [
  "page",
  "track",
  "identify",
  "instances",
  "debug",
  "on",
  "off",
  "once",
  "ready",
  "alias",
  "group",
  "enableCookie",
  "disableCookie",
  "holdConsent",
  "revokeConsent",
  "grantConsent",
] as const;

function createTikTokQueue(source: RuntimeAdSource) {
  const existing = tikTokQueues.get(source.pixelId);

  if (existing) {
    return existing;
  }

  const queue = [] as unknown as TikTokQueue &
    Record<string, (...args: unknown[]) => void>;

  for (const method of TIKTOK_METHODS) {
    queue[method] = (...args: unknown[]) => {
      queue.push([method, ...args]);
    };
  }

  const libraryName = `ttq_${source.id.replaceAll("-", "_")}`;
  const globalWindow = window as unknown as Record<string, unknown>;
  globalWindow[libraryName] = queue;
  window.TiktokAnalyticsObject = libraryName;

  const script = document.createElement("script");
  script.type = "text/javascript";
  script.async = true;
  script.dataset.ingidayTiktokPixel = source.pixelId;
  script.src =
    "https://analytics.tiktok.com/i18n/pixel/events.js" +
    `?sdkid=${encodeURIComponent(source.pixelId)}` +
    `&lib=${encodeURIComponent(libraryName)}`;
  document.head.appendChild(script);

  tikTokQueues.set(source.pixelId, queue);
  return queue;
}

function initializeSource(source: RuntimeAdSource) {
  if (DEBUG_ENABLED) {
    return;
  }

  if (source.platform === "meta") {
    const fbq = ensureMetaBootstrap();

    if (!initializedMetaPixels.has(source.pixelId)) {
      fbq("init", source.pixelId);
      initializedMetaPixels.add(source.pixelId);
    }

    return;
  }

  createTikTokQueue(source);
}

function metaBrowserEventKey(
  source: RuntimeAdSource,
  eventName: AdEventName,
  eventId: string,
) {
  return [source.pixelId, eventName, eventId].join(":");
}

function claimMetaBrowserEvent(
  source: RuntimeAdSource,
  eventName: AdEventName,
  eventId: string,
) {
  const key = metaBrowserEventKey(source, eventName, eventId);
  if (sentMetaBrowserEventKeys.has(key)) {
    return null;
  }

  sentMetaBrowserEventKeys.add(key);
  if (sentMetaBrowserEventKeys.size > META_BROWSER_EVENT_DEDUP_LIMIT) {
    const oldestKey = sentMetaBrowserEventKeys.values().next().value;
    if (typeof oldestKey === "string" && oldestKey !== key) {
      sentMetaBrowserEventKeys.delete(oldestKey);
    }
  }

  return key;
}

function releaseMetaBrowserEvent(key: string) {
  sentMetaBrowserEventKeys.delete(key);
}

export function sendBrowserAdEvent(
  source: RuntimeAdSource,
  eventName: AdEventName,
  eventId: string,
  payload: Record<string, unknown>,
) {
  if (!sourceSupportsEvent(source, eventName, "browser")) {
    return;
  }

  if (DEBUG_ENABLED) {
    console.info("[InGiDay Ads Debug]", {
      platform: source.platform,
      pixelId: source.pixelId,
      sourceId: source.id,
      eventName,
      eventId,
      payload,
    });
    return;
  }

  try {
    initializeSource(source);

    if (source.platform === "meta") {
      const dedupKey = claimMetaBrowserEvent(source, eventName, eventId);
      if (!dedupKey) {
        if (DEBUG_ENABLED) {
          console.info("[InGiDay Ads Debug] Bỏ qua browser event trùng", {
            pixelId: source.pixelId,
            eventName,
            eventId,
          });
        }
        return;
      }

      try {
        const fbq = window.fbq;
        if (!fbq) {
          throw new Error("Meta Pixel chưa sẵn sàng.");
        }

        fbq(
          "trackSingle",
          source.pixelId,
          eventName,
          payload,
          {
            eventID: eventId,
          },
        );
      } catch (error) {
        releaseMetaBrowserEvent(dedupKey);
        throw error;
      }

      return;
    }

    const queue = createTikTokQueue(source);

    if (eventName === "PageView") {
      queue.page();
      return;
    }

    queue.track(eventName, payload, {
      event_id: eventId,
    });
  } catch (error) {
    console.warn("Không thể gửi sự kiện quảng cáo:", error);
  }
}
