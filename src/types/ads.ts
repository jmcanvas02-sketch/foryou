export const AD_EVENT_NAMES = [
  "PageView",
  "ViewContent",
  "Search",
  "AddToCart",
  "InitiateCheckout",
  "Purchase",
] as const;

export type AdEventName =
  (typeof AD_EVENT_NAMES)[number];

export type AdPlatform = "meta" | "tiktok";

export type PurchaseTrigger =
  | "order_created"
  | "order_confirmed"
  | "order_completed";

export type AdEventSetting = {
  eventName: AdEventName;
  browserEnabled: boolean;
  serverEnabled: boolean;
};

export type AdDataSource = {
  id: string;
  platform: AdPlatform;
  name: string;
  pixelId: string;
  isDefault: boolean;
  isActive: boolean;
  browserEnabled: boolean;
  serverEnabled: boolean;
  testMode: boolean;
  testEventCode: string;
  apiVersion: string;
  purchaseTrigger: PurchaseTrigger;
  lastTestedAt?: string;
  lastTestStatus?: "success" | "failed";
  lastTestMessage: string;
  tokenConfigured: boolean;
  tokenUpdatedAt?: string;
  eventSettings: AdEventSetting[];
  createdAt: string;
  updatedAt: string;
};

export type AdDataSourceInput = Omit<
  AdDataSource,
  | "id"
  | "lastTestedAt"
  | "lastTestStatus"
  | "lastTestMessage"
  | "tokenConfigured"
  | "tokenUpdatedAt"
  | "createdAt"
  | "updatedAt"
>;

export type ProductAdAssignments = {
  meta: string | null;
  tiktok: string | null;
};
export type MetaDomainVerificationConfig = {
  configured: boolean;
  code: string | null;
  tag: string | null;
  message?: string;
};

export type MetaDomainVerificationCheck = {
  verified: boolean;
  foundCode: string | null;
  message: string;
};
