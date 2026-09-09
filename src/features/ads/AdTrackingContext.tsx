/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
} from "react";
import type { ReactNode } from "react";

import {
  createAdEventId,
  getAdRuntimeSnapshot,
  resolveAdSource,
  sendBrowserAdEvent,
  warmAdRuntime,
} from "../../services/adRuntime";
import {
  sendServerAdEvent,
} from "../../services/adServerEvents";
import {
  trackSiteAddToCart,
  trackSiteInitiateCheckout,
  trackSitePageView,
  trackSitePurchase,
  trackSiteSearch,
  trackSiteViewContent,
} from "../../services/siteAnalytics";
import type {
  TrackCheckoutInput,
  TrackPageViewInput,
  TrackProductInput,
  TrackPurchaseInput,
  RuntimeAdSource,
} from "../../types/adTracking";
import type { AdPlatform } from "../../types/ads";
import type { CartItem } from "../../types/cart";

const PLATFORMS: AdPlatform[] = ["meta", "tiktok"];
const CHECKOUT_EVENT_STORAGE_PREFIX = "ingiday-ads-checkout-event-v1";
const PURCHASE_SENT_STORAGE_PREFIX = "ingiday-ads-purchase-sent-v1";

type AdTrackingContextValue = {
  trackPageView: (input: TrackPageViewInput) => Promise<void>;
  trackViewContent: (input: TrackProductInput) => Promise<void>;
  trackSearch: (query: string) => Promise<void>;
  trackAddToCart: (input: TrackProductInput) => Promise<void>;
  trackInitiateCheckout: (input: TrackCheckoutInput) => Promise<void>;
  trackPurchase: (input: TrackPurchaseInput) => Promise<void>;
};

type GroupedItems = {
  sourceId: string;
  platform: AdPlatform;
  items: CartItem[];
};

const AdTrackingContext = createContext<AdTrackingContextValue | null>(null);

function variantDescription(item: CartItem) {
  const labels = item.selectedVariants.map((variant) => variant.optionLabel);
  return labels.length > 0 ? `${item.name} - ${labels.join(" / ")}` : item.name;
}

function contentFromItem(item: CartItem) {
  return {
    id: item.productId,
    content_id: item.productId,
    content_name: variantDescription(item),
    quantity: item.quantity,
    price: item.unitPrice,
    item_price: item.unitPrice,
  };
}

function dispatchAdEvent(
  source: RuntimeAdSource,
  eventName: Parameters<typeof sendBrowserAdEvent>[1],
  eventId: string,
  payload: Record<string, unknown>,
  productIds: string[] = [],
  orderCode?: string,
) {
  sendBrowserAdEvent(
    source,
    eventName,
    eventId,
    payload,
  );

  void sendServerAdEvent({
    source,
    eventName,
    eventId,
    payload,
    productIds,
    orderCode,
  });
}

function cartFingerprint(items: CartItem[]) {
  return items
    .map((item) => `${item.key}:${item.quantity}:${item.unitPrice}`)
    .sort()
    .join("|");
}

function getOrCreateStoredEventId(key: string, prefix: string) {
  try {
    const existing = sessionStorage.getItem(key);

    if (existing) {
      return existing;
    }

    const eventId = createAdEventId(prefix);
    sessionStorage.setItem(key, eventId);
    return eventId;
  } catch {
    return createAdEventId(prefix);
  }
}

function wasPurchaseSent(orderCode: string) {
  try {
    return (
      sessionStorage.getItem(
        `${PURCHASE_SENT_STORAGE_PREFIX}:${orderCode}`,
      ) === "1"
    );
  } catch {
    return false;
  }
}

function markPurchaseSent(orderCode: string) {
  try {
    sessionStorage.setItem(
      `${PURCHASE_SENT_STORAGE_PREFIX}:${orderCode}`,
      "1",
    );
  } catch {
    // Tracking must never block checkout.
  }
}

function allocateAmount(total: number, weights: number[]) {
  if (weights.length === 0) {
    return [];
  }

  const safeTotal = Math.max(0, Math.round(total));
  const weightTotal = weights.reduce(
    (sum, value) => sum + Math.max(0, value),
    0,
  );

  if (weightTotal <= 0) {
    return weights.map((_value, index) =>
      index === weights.length - 1 ? safeTotal : 0,
    );
  }

  let allocated = 0;

  return weights.map((weight, index) => {
    if (index === weights.length - 1) {
      return safeTotal - allocated;
    }

    const value = Math.round(
      (safeTotal * Math.max(0, weight)) / weightTotal,
    );
    allocated += value;
    return value;
  });
}

async function groupItemsByPixel(items: CartItem[]) {
  const productIds = Array.from(
    new Set(items.map((item) => item.productId)),
  );
  const snapshot = await getAdRuntimeSnapshot(productIds);
  const groups: GroupedItems[] = [];

  for (const platform of PLATFORMS) {
    for (const item of items) {
      const source = resolveAdSource(
        snapshot,
        platform,
        "InitiateCheckout",
        item.productId,
      );

      if (!source) {
        continue;
      }

      const existing = groups.find(
        (group) =>
          group.sourceId === source.id &&
          group.platform === platform,
      );

      if (existing) {
        existing.items.push(item);
      } else {
        groups.push({
          sourceId: source.id,
          platform,
          items: [item],
        });
      }
    }
  }

  return {
    snapshot,
    groups,
  };
}

export function AdTrackingProvider({ children }: { children: ReactNode }) {
  const sentKeysRef = useRef(new Set<string>());

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void warmAdRuntime();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, []);

  const runOnce = useCallback(
    async (key: string, task: () => Promise<void>) => {
      if (sentKeysRef.current.has(key)) {
        return;
      }

      sentKeysRef.current.add(key);

      try {
        await task();
      } catch (error) {
        sentKeysRef.current.delete(key);
        console.warn("Không thể xử lý sự kiện quảng cáo:", error);
      }
    },
    [],
  );

  const trackPageView = useCallback(
    async (input: TrackPageViewInput) => {
      trackSitePageView(input);

      try {
        const snapshot = await getAdRuntimeSnapshot(
          input.productId ? [input.productId] : [],
        );
        const baseEventId = createAdEventId("pageview");

        for (const platform of PLATFORMS) {
          const source = resolveAdSource(
            snapshot,
            platform,
            "PageView",
            input.productId,
          );

          if (!source) {
            continue;
          }

          dispatchAdEvent(
            source,
            "PageView",
            `${baseEventId}:${platform}:${source.id}`,
            {
              page_path: input.path,
            },
            input.productId ? [input.productId] : [],
          );
        }
      } catch (error) {
        console.warn("Không thể gửi PageView:", error);
      }
    },
    [],
  );

  const trackViewContent = useCallback(
    async (input: TrackProductInput) => {
      trackSiteViewContent(input);

      try {
        const snapshot = await getAdRuntimeSnapshot([input.product.id]);
        const baseEventId = createAdEventId("viewcontent");
        const contents = [
          {
            id: input.product.id,
            content_id: input.product.id,
            content_name: input.product.name,
            quantity: input.quantity,
            price: input.unitPrice,
            item_price: input.unitPrice,
          },
        ];

        for (const platform of PLATFORMS) {
          const source = resolveAdSource(
            snapshot,
            platform,
            "ViewContent",
            input.product.id,
          );

          if (!source) {
            continue;
          }

          dispatchAdEvent(
            source,
            "ViewContent",
            `${baseEventId}:${platform}:${source.id}`,
            {
              content_ids: [input.product.id],
              content_name: input.product.name,
              content_category: input.product.categoryName,
              content_type: "product",
              contents,
              currency: "VND",
              value: input.unitPrice * input.quantity,
            },
            [input.product.id],
          );
        }
      } catch (error) {
        console.warn("Không thể gửi ViewContent:", error);
      }
    },
    [],
  );

  const trackSearch = useCallback(async (query: string) => {
    const normalizedQuery = query.trim();

    if (normalizedQuery.length < 2) {
      return;
    }

    trackSiteSearch(normalizedQuery);

    try {
      const snapshot = await getAdRuntimeSnapshot();
      const baseEventId = createAdEventId("search");

      for (const platform of PLATFORMS) {
        const source = resolveAdSource(snapshot, platform, "Search");

        if (!source) {
          continue;
        }

        dispatchAdEvent(
          source,
          "Search",
          `${baseEventId}:${platform}:${source.id}`,
          {
            search_string: normalizedQuery,
            query: normalizedQuery,
          },
        );
      }
    } catch (error) {
      console.warn("Không thể gửi Search:", error);
    }
  }, []);

  const trackAddToCart = useCallback(
    async (input: TrackProductInput) => {
      trackSiteAddToCart(input);

      try {
        const snapshot = await getAdRuntimeSnapshot([input.product.id]);
        const baseEventId = createAdEventId("addtocart");
        const selectedLabels = (input.selectedVariants ?? []).map(
          (variant) => variant.optionLabel,
        );
        const contentName =
          selectedLabels.length > 0
            ? `${input.product.name} - ${selectedLabels.join(" / ")}`
            : input.product.name;

        for (const platform of PLATFORMS) {
          const source = resolveAdSource(
            snapshot,
            platform,
            "AddToCart",
            input.product.id,
          );

          if (!source) {
            continue;
          }

          dispatchAdEvent(
            source,
            "AddToCart",
            `${baseEventId}:${platform}:${source.id}`,
            {
              content_ids: [input.product.id],
              content_name: contentName,
              content_category: input.product.categoryName,
              content_type: "product",
              contents: [
                {
                  id: input.product.id,
                  content_id: input.product.id,
                  content_name: contentName,
                  quantity: input.quantity,
                  price: input.unitPrice,
                  item_price: input.unitPrice,
                },
              ],
              currency: "VND",
              value: input.unitPrice * input.quantity,
            },
            [input.product.id],
          );
        }
      } catch (error) {
        console.warn("Không thể gửi AddToCart:", error);
      }
    },
    [],
  );

  const trackInitiateCheckout = useCallback(
    async (input: TrackCheckoutInput) => {
      if (input.items.length === 0) {
        return;
      }

      const fingerprint = cartFingerprint(input.items);
      const storageKey = `${CHECKOUT_EVENT_STORAGE_PREFIX}:${fingerprint}`;
      const baseEventId = getOrCreateStoredEventId(storageKey, "checkout");

      await runOnce(`checkout:${fingerprint}`, async () => {
        trackSiteInitiateCheckout(input);

        const { snapshot, groups } = await groupItemsByPixel(input.items);

        for (const group of groups) {
          const source = snapshot.sources.find(
            (item) => item.id === group.sourceId,
          );

          if (!source) {
            continue;
          }

          const groupValue = group.items.reduce(
            (sum, item) => sum + item.unitPrice * item.quantity,
            0,
          );

          dispatchAdEvent(
            source,
            "InitiateCheckout",
            `${baseEventId}:${group.platform}:${source.id}`,
            {
              content_ids: group.items.map((item) => item.productId),
              content_type: "product",
              contents: group.items.map(contentFromItem),
              currency: "VND",
              num_items: group.items.reduce(
                (sum, item) => sum + item.quantity,
                0,
              ),
              value: groupValue,
            },
            group.items.map((item) => item.productId),
          );
        }
      });
    },
    [runOnce],
  );

  const trackPurchase = useCallback(
    async (input: TrackPurchaseInput) => {
      if (input.items.length === 0 || wasPurchaseSent(input.orderCode)) {
        return;
      }

      trackSitePurchase(input);

      try {
        const productIds = Array.from(
          new Set(input.items.map((item) => item.productId)),
        );
        const snapshot = await getAdRuntimeSnapshot(productIds);

        for (const platform of PLATFORMS) {
          const platformGroups = new Map<string, CartItem[]>();

          for (const item of input.items) {
            const source = resolveAdSource(
              snapshot,
              platform,
              "Purchase",
              item.productId,
            );

            if (!source) {
              continue;
            }

            const groupItems = platformGroups.get(source.id) ?? [];
            groupItems.push(item);
            platformGroups.set(source.id, groupItems);
          }

          const entries = Array.from(
            platformGroups.entries(),
          ).sort(([left], [right]) =>
            left.localeCompare(right),
          );
          const groupSubtotals = entries.map(([, items]) =>
            items.reduce(
              (sum, item) => sum + item.unitPrice * item.quantity,
              0,
            ),
          );
          const discounts = allocateAmount(input.discount, groupSubtotals);
          const shippingParts = allocateAmount(input.shipping, groupSubtotals);

          entries.forEach(([sourceId, items], index) => {
            const source = snapshot.sources.find((item) => item.id === sourceId);

            if (!source) {
              return;
            }

            const groupValue =
              Math.max(0, groupSubtotals[index] - discounts[index]) +
              shippingParts[index];
            const eventId = `purchase:${input.orderCode}:${platform}:${source.id}`;

            dispatchAdEvent(source, "Purchase", eventId, {
              content_ids: items.map((item) => item.productId),
              content_type: "product",
              contents: items.map(contentFromItem),
              currency: "VND",
              num_items: items.reduce(
                (sum, item) => sum + item.quantity,
                0,
              ),
              order_id: input.orderCode,
              shipping: shippingParts[index],
              discount: discounts[index],
              value: groupValue,
            }, items.map((item) => item.productId), input.orderCode);
          });
        }

        markPurchaseSent(input.orderCode);
      } catch (error) {
        console.warn("Không thể gửi Purchase:", error);
      }
    },
    [],
  );

  const value = useMemo<AdTrackingContextValue>(
    () => ({
      trackPageView,
      trackViewContent,
      trackSearch,
      trackAddToCart,
      trackInitiateCheckout,
      trackPurchase,
    }),
    [
      trackAddToCart,
      trackInitiateCheckout,
      trackPageView,
      trackPurchase,
      trackSearch,
      trackViewContent,
    ],
  );

  return (
    <AdTrackingContext.Provider value={value}>
      {children}
    </AdTrackingContext.Provider>
  );
}

export function useAdTracking() {
  const context = useContext(AdTrackingContext);

  if (!context) {
    throw new Error(
      "useAdTracking phải được sử dụng bên trong AdTrackingProvider.",
    );
  }

  return context;
}
