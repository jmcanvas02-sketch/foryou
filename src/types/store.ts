import type { StoreSocialLinks } from "../utils/externalUrl";
import type { LocalOrder } from "./cart";

export type OrderStatus = "new" | "unreachable" | "confirmed" | "preparing" | "prepared" | "shipping" | "completed" | "cancelled";

export type OrderStatusHistory = {
  status: OrderStatus;
  changedAt: string;
};

export type NormalizedAddressStatus = "missing" | "ready" | "stale";

export type NormalizedOrderAddress = {
  province: string;
  district: string;
  ward: string;
  addressDetail: string;
  normalizedAt: string;
};

export type StoreOrder = LocalOrder & {
  status: OrderStatus;
  updatedAt: string;
  statusHistory: OrderStatusHistory[];
  inventoryReserved: boolean;
  duplicatePhone: boolean;
  normalizedAddress?: NormalizedOrderAddress;
  normalizedAddressStatus: NormalizedAddressStatus;
};

export type DuplicatePhoneOrderSummary = {
  id: string;
  code: string;
  customerName: string;
  phone: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
};

export type CouponType = "fixed" | "percentage";

export type Coupon = {
  id: string;
  code: string;
  type: CouponType;
  value: number;
  minOrder: number;
  maxDiscount?: number;
  usageLimit?: number;
  usedCount: number;
  startsAt?: string;
  endsAt?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type CouponInput = Omit<Coupon, "id" | "usedCount" | "createdAt" | "updatedAt">;

export type Banner = {
  id: string;
  internalName: string;
  badge: string;
  title: string;
  description: string;
  primaryLabel: string;
  primaryLink: string;
  secondaryLabel: string;
  secondaryLink: string;
  emoji: string;
  background: string;
  imageUrl?: string;
  imagePublicId?: string;
  imageAlt?: string;
  startsAt?: string;
  endsAt?: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type BannerInput = Omit<Banner, "id" | "createdAt" | "updatedAt">;

export type StoreSettings = {
  storeName: string;
  phone: string;
  email: string;
  address: string;
  legalBusinessName: string;
  businessOwnerName: string;
  taxCode: string;
  businessRegistrationNumber: string;
  businessRegistrationDate: string;
  businessRegistrationPlace: string;
  messengerUrl: string;
  socialLinks: StoreSocialLinks;
  footerDescription: string;
  shippingFee: number;
  freeShippingThreshold: number;
  couponEnabled: boolean;
  stockEnabled: boolean;
  customPrintTitle: string;
  customPrintDescription: string;
  customPrintButtonText: string;
  customPrintStep1Title: string;
  customPrintStep1Description: string;
  customPrintStep2Title: string;
  customPrintStep2Description: string;
  customPrintStep3Title: string;
  customPrintStep3Description: string;
  logoUrl: string;
  logoPublicId: string;
  faviconUrl: string;
  faviconPublicId: string;
  socialShareImageUrl: string;
  socialShareImagePublicId: string;
  socialShareTitle: string;
  socialShareDescription: string;
  currency: "VND";
};

