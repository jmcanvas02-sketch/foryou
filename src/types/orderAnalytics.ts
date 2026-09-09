import type { OrderStatus } from "./store";

export type OrderAnalyticsPreset =
  | "today"
  | "last7"
  | "last30"
  | "thisMonth"
  | "custom";

export type OrderAnalyticsSummary = {
  totalOrders: number;
  totalItems: number;
  completedOrders: number;
  cancelledOrders: number;
  unreachableOrders: number;
  averageOrdersPerDay: number;
  completionRate: number;
  cancellationRate: number;
  ordersChangePercent: number;
  itemsChangePercent: number;
  completionRateChange: number;
  cancellationRateChange: number;
  averageOrdersChange: number;
};

export type OrderAnalyticsStatus = {
  status: OrderStatus;
  label: string;
  color: string;
  orderCount: number;
  percentage: number;
};

export type OrderAnalyticsTrendPoint = {
  date: string;
  label: string;
  orderCount: number;
  previousOrderCount: number;
};

export type OrderAnalyticsHeatmapCell = {
  weekday: number;
  weekdayLabel: string;
  slot: number;
  slotLabel: string;
  orderCount: number;
};

export type OrderAnalyticsWeekday = {
  weekday: number;
  label: string;
  totalOrders: number;
  averageOrders: number;
};

export type OrderAnalyticsProduct = {
  productKey: string;
  productId: string | null;
  productName: string;
  productSku: string;
  variantName: string;
  productImageUrl: string;
  productBackground: string;
  productEmoji: string;
  orderCount: number;
  quantity: number;
  sharePercent: number;
  previousQuantity: number;
  trendPercent: number;
};

export type OrderAnalyticsInsights = {
  peakTimeLabel: string;
  peakTimeOrders: number;
  peakTimeShare: number;
  peakWeekdayLabel: string;
  peakWeekdayAverage: number;
  topProductName: string;
  topProductQuantity: number;
  newOrders: number;
  staleNewOrders: number;
};

export type OrderAnalyticsData = {
  generatedAt: string;
  timezone: string;
  period: {
    startAt: string;
    endAt: string;
    days: number;
    previousStartAt: string;
    previousEndAt: string;
    status: OrderStatus | null;
    productExcludesCancelled: boolean;
  };
  summary: OrderAnalyticsSummary;
  statuses: OrderAnalyticsStatus[];
  trend: OrderAnalyticsTrendPoint[];
  heatmap: OrderAnalyticsHeatmapCell[];
  weekdays: OrderAnalyticsWeekday[];
  topProducts: OrderAnalyticsProduct[];
  insights: OrderAnalyticsInsights;
};

export type OrderAnalyticsRequest = {
  startAt: string;
  endAt: string;
  status?: OrderStatus | "";
};
