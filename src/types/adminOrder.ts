import type { SelectedVariant } from "./cart";
import type { SelectedCustomOptions } from "./customProductOptions";
import type { OrderStatus } from "./store";

export type NormalizedAddressSaveInput = {
  orderId: string;
  province: string;
  district: string;
  ward: string;
  addressDetail: string;
};

export type AdminOrderItemInput = {
  sourceItemId?: string;
  productId?: string;
  productName: string;
  productSlug?: string;
  productImageUrl?: string;
  productBackground?: string;
  productEmoji?: string;
  unitPrice: number;
  quantity: number;
  selectedVariants: SelectedVariant[];
  customOptions?: SelectedCustomOptions;
};

export type AdminOrderUpdateInput = {
  orderId: string;
  customerName: string;
  customerPhone: string;
  customerEmail?: string;
  province: string;
  district: string;
  ward: string;
  addressDetail: string;
  note: string;
  discount: number;
  shipping: number;
  status: OrderStatus;
  items: AdminOrderItemInput[];
};
