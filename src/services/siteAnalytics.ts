import Clarity from "@microsoft/clarity";

import type { CartItem, SelectedVariant } from "../types/cart";
import type { Product } from "../types/product";

const CLARITY_PROJECT_ID = import.meta.env.VITE_CLARITY_PROJECT_ID?.trim() ?? "";
const GA_MEASUREMENT_ID = import.meta.env.VITE_GA_MEASUREMENT_ID?.trim() ?? "";
const CHECKOUT_SENT_STORAGE_PREFIX =
  "ingiday-site-analytics-checkout-sent-v1";
const PURCHASE_SENT_STORAGE_PREFIX =
  "ingiday-site-analytics-purchase-sent-v1";

type Gtag = (...args: unknown[]) => void;

type ProductAnalyticsInput = {
  product: Product;
  quantity: number;
  unitPrice: number;
  selectedVariants?: SelectedVariant[];
};

type CheckoutAnalyticsInput = {
  items: CartItem[];
  subtotal: number;
};

type PurchaseAnalyticsInput = {
  orderCode: string;
  items: CartItem[];
  subtotal: number;
  discount: number;
  shipping: number;
};

type GaItem = {
  item_id: string;
  item_name: string;
  item_category?: string;
  item_variant?: string;
  discount?: number;
  price: number;
  quantity: number;
};

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
  }
}

let clarityInitializationAttempted = false;
let clarityReady = false;
let gaInitializationAttempted = false;
let gaReady = false;
let previousPageLocation = "";
const volatileSentKeys = new Set<string>();

function validClarityProjectId(value: string) {
  return /^[a-z0-9]+$/i.test(value);
}

function validGaMeasurementId(value: string) {
  return /^G-[A-Z0-9]+$/i.test(value);
}

function safeMoney(value: number) {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

function ensureClarity() {
  if (clarityReady) {
    return true;
  }

  if (clarityInitializationAttempted) {
    return false;
  }

  clarityInitializationAttempted = true;

  if (!validClarityProjectId(CLARITY_PROJECT_ID)) {
    return false;
  }

  try {
    Clarity.init(CLARITY_PROJECT_ID);
    clarityReady = true;
    return true;
  } catch (error) {
    console.warn("Không thể khởi tạo Microsoft Clarity:", error);
    return false;
  }
}

function ensureGa() {
  if (gaReady) {
    return true;
  }

  if (gaInitializationAttempted) {
    return false;
  }

  gaInitializationAttempted = true;

  if (!validGaMeasurementId(GA_MEASUREMENT_ID)) {
    return false;
  }

  try {
    window.dataLayer = window.dataLayer ?? [];
    window.gtag = window.gtag ?? function gtag() {
      // Google gtag.js requires the native Arguments object here.
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer?.push(arguments);
    };

    window.gtag("js", new Date());
    window.gtag("config", GA_MEASUREMENT_ID, {
      send_page_view: false,
    });

    if (!document.getElementById("ingiday-google-tag")) {
      const script = document.createElement("script");
      script.id = "ingiday-google-tag";
      script.async = true;
      script.src =
        "https://www.googletagmanager.com/gtag/js?id=" +
        encodeURIComponent(GA_MEASUREMENT_ID);
      document.head.appendChild(script);
    }

    gaReady = true;
    return true;
  } catch (error) {
    console.warn("Không thể khởi tạo Google Analytics:", error);
    return false;
  }
}

function sendClarityEvent(eventName: string) {
  if (!ensureClarity()) {
    return false;
  }

  try {
    Clarity.event(eventName);
    return true;
  } catch (error) {
    console.warn(`Không thể gửi Clarity ${eventName}:`, error);
    return false;
  }
}

function sendGaEvent(
  eventName: string,
  parameters: Record<string, unknown>,
) {
  if (!ensureGa() || !window.gtag) {
    return false;
  }

  try {
    window.gtag("event", eventName, parameters);
    return true;
  } catch (error) {
    console.warn(`Không thể gửi GA4 ${eventName}:`, error);
    return false;
  }
}

function variantLabel(variants: SelectedVariant[] = []) {
  const labels = variants
    .map((variant) => variant.optionLabel.trim())
    .filter(Boolean);

  return labels.length > 0 ? labels.join(" / ") : undefined;
}

function productItem(input: ProductAnalyticsInput): GaItem {
  return {
    item_id: input.product.id,
    item_name: input.product.name,
    item_category: input.product.categoryName || undefined,
    item_variant: variantLabel(input.selectedVariants),
    price: input.unitPrice,
    quantity: input.quantity,
  };
}

function cartItem(item: CartItem): GaItem {
  return {
    item_id: item.productId,
    item_name: item.name,
    item_category: item.categoryName || undefined,
    item_variant: variantLabel(item.selectedVariants),
    price: item.unitPrice,
    quantity: item.quantity,
  };
}

function allocateAmount(total: number, weights: number[]) {
  if (weights.length === 0) {
    return [];
  }

  const safeTotal = safeMoney(total);
  const safeWeights = weights.map((weight) => safeMoney(weight));
  const weightTotal = safeWeights.reduce((sum, weight) => sum + weight, 0);

  if (weightTotal <= 0) {
    return safeWeights.map((_weight, index) =>
      index === safeWeights.length - 1 ? safeTotal : 0,
    );
  }

  let allocated = 0;

  return safeWeights.map((weight, index) => {
    if (index === safeWeights.length - 1) {
      return safeTotal - allocated;
    }

    const amount = Math.round((safeTotal * weight) / weightTotal);
    allocated += amount;
    return amount;
  });
}

function purchaseItems(input: PurchaseAnalyticsInput) {
  const lineSubtotals = input.items.map((item) =>
    safeMoney(item.unitPrice * item.quantity),
  );
  const merchandiseValue = Math.max(
    0,
    safeMoney(input.subtotal) - safeMoney(input.discount),
  );
  const discountedLineTotals = allocateAmount(
    merchandiseValue,
    lineSubtotals,
  );

  return input.items.map((item, index): GaItem => {
    const quantity = Math.max(1, item.quantity);
    const discountedUnitPrice = discountedLineTotals[index] / quantity;
    const unitDiscount = Math.max(0, item.unitPrice - discountedUnitPrice);

    return {
      ...cartItem(item),
      ...(unitDiscount > 0 ? { discount: unitDiscount } : {}),
      price: discountedUnitPrice,
    };
  });
}

function cartFingerprint(items: CartItem[]) {
  return items
    .map((item) => `${item.key}:${item.quantity}:${item.unitPrice}`)
    .sort()
    .join("|");
}

function wasSent(key: string) {
  if (volatileSentKeys.has(key)) {
    return true;
  }

  try {
    return sessionStorage.getItem(key) === "1";
  } catch {
    return false;
  }
}

function markSent(key: string) {
  volatileSentKeys.add(key);

  try {
    sessionStorage.setItem(key, "1");
  } catch {
    // Analytics must never block the storefront.
  }
}

function sendOnce(key: string, task: () => boolean) {
  if (wasSent(key)) {
    return;
  }

  if (task()) {
    markSent(key);
  }
}

function runSafely(eventName: string, task: () => void) {
  try {
    task();
  } catch (error) {
    console.warn(`Không thể xử lý analytics ${eventName}:`, error);
  }
}

export function trackSitePageView(input: { path: string }) {
  runSafely("PageView", () => {
    const path = input.path.trim();

    if (!path) {
      return;
    }

    sendClarityEvent("PageView");

    const pageLocation = new URL(path, window.location.origin).href;
    const pageReferrer = previousPageLocation || document.referrer;
    const parameters: Record<string, unknown> = {
      page_location: pageLocation,
      page_path: path,
      page_title: document.title,
    };

    if (pageReferrer) {
      parameters.page_referrer = pageReferrer;
    }

    if (sendGaEvent("page_view", parameters)) {
      previousPageLocation = pageLocation;
    }
  });
}

export function trackSiteViewContent(input: ProductAnalyticsInput) {
  runSafely("ViewContent", () => {
    sendClarityEvent("ViewContent");
    sendGaEvent("view_item", {
      currency: "VND",
      value: input.unitPrice * input.quantity,
      items: [productItem(input)],
    });
  });
}

export function trackSiteSearch(query: string) {
  runSafely("Search", () => {
    const searchTerm = query.trim();

    if (!searchTerm) {
      return;
    }

    sendClarityEvent("Search");
    sendGaEvent("search", {
      search_term: searchTerm,
    });
  });
}

export function trackSiteAddToCart(input: ProductAnalyticsInput) {
  runSafely("AddToCart", () => {
    sendClarityEvent("AddToCart");
    sendGaEvent("add_to_cart", {
      currency: "VND",
      value: input.unitPrice * input.quantity,
      items: [productItem(input)],
    });
  });
}

export function trackSiteInitiateCheckout(input: CheckoutAnalyticsInput) {
  runSafely("InitiateCheckout", () => {
    const fingerprint = cartFingerprint(input.items);

    sendOnce(
      `${CHECKOUT_SENT_STORAGE_PREFIX}:clarity:${fingerprint}`,
      () => sendClarityEvent("InitiateCheckout"),
    );
    sendOnce(
      `${CHECKOUT_SENT_STORAGE_PREFIX}:ga4:${fingerprint}`,
      () =>
        sendGaEvent("begin_checkout", {
          currency: "VND",
          value: input.subtotal,
          items: input.items.map(cartItem),
        }),
    );
  });
}

export function trackSitePurchase(input: PurchaseAnalyticsInput) {
  runSafely("Purchase", () => {
    const orderCode = input.orderCode.trim();

    if (!orderCode) {
      return;
    }

    const items = purchaseItems(input);
    const value = items.reduce(
      (sum, item) => sum + item.price * item.quantity,
      0,
    );

    sendOnce(
      `${PURCHASE_SENT_STORAGE_PREFIX}:clarity:${orderCode}`,
      () => sendClarityEvent("Purchase"),
    );
    sendOnce(
      `${PURCHASE_SENT_STORAGE_PREFIX}:ga4:${orderCode}`,
      () =>
        sendGaEvent("purchase", {
          transaction_id: orderCode,
          currency: "VND",
          value,
          shipping: safeMoney(input.shipping),
          items,
        }),
    );
  });
}