import type { SelectedCustomOptions } from "./customProductOptions";

export type UtmAttribution = {
  source?: string;
  medium?: string;
  campaign?: string;
  content?: string;
  term?: string;
  utmId?: string;
  campaignId?: string;
  adsetId?: string;
  adId?: string;
  campaignName?: string;
  adsetName?: string;
  adName?: string;
  placement?: string;
  siteSourceName?: string;
  fbclid?: string;
  capturedAt?: string;
};

export type SelectedVariant = {
  groupId: string;
  groupName: string;
  optionId: string;
  optionLabel: string;
  priceDelta: number;
  stock?: number;
  imageId?: string;
};

export type CartItem = {
  key: string;
  productId: string;
  slug: string;
  name: string;
  categoryName?: string;
  imageUrl?: string;
  emoji: string;
  background: string;
  unitPrice: number;
  quantity: number;
  stock: number;
  selectedVariants: SelectedVariant[];
  selectedCustomOptions?: SelectedCustomOptions;
};

export type CheckoutCustomer = {
  fullName: string;
  phone: string;
  email?: string;
  province: string;
  district: string;
  ward: string;
  addressDetail: string;
  note: string;
};

export type LocalOrder = {
  id?: string;
  code: string;
  createdAt: string;
  clientRequestId?: string;
  paymentMethod: "COD";
  customer: CheckoutCustomer;
  items: CartItem[];
  subtotal: number;
  discount: number;
  couponCode?: string;
  utmAttribution?: UtmAttribution;
  shipping: number;
  total: number;
};