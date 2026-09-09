import type { AdEventName, AdPlatform, PurchaseTrigger } from "./ads";
import type { CartItem, SelectedVariant } from "./cart";
import type { Product } from "./product";

export type RuntimeAdSource = {
  id: string;
  platform: AdPlatform;
  pixelId: string;
  isDefault: boolean;
  testMode: boolean;
  purchaseTrigger: PurchaseTrigger;
  browserEvents: AdEventName[];
  serverEvents: AdEventName[];
};

export type RuntimeAdAssignment = {
  productId: string;
  platform: AdPlatform;
  sourceId: string;
};

export type AdRuntimeSnapshot = {
  sources: RuntimeAdSource[];
  assignments: RuntimeAdAssignment[];
};

export type TrackPageViewInput = {
  path: string;
  productId?: string;
};

export type TrackProductInput = {
  product: Product;
  quantity: number;
  unitPrice: number;
  selectedVariants?: SelectedVariant[];
};

export type TrackCheckoutInput = {
  items: CartItem[];
  subtotal: number;
};

export type TrackPurchaseInput = TrackCheckoutInput & {
  orderCode: string;
  discount: number;
  shipping: number;
  total: number;
};
