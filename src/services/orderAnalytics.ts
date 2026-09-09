import { supabase } from "../lib/supabase";
import type {
  OrderAnalyticsData,
  OrderAnalyticsRequest,
} from "../types/orderAnalytics";

type OrderAnalyticsResult =
  | {
      success: true;
      data: OrderAnalyticsData;
    }
  | {
      success: false;
      message: string;
    };

export async function getOrderAnalytics(
  request: OrderAnalyticsRequest,
): Promise<OrderAnalyticsResult> {
  const { data, error } = await supabase.rpc(
    "get_order_analytics",
    {
      p_start_at: request.startAt,
      p_end_at: request.endAt,
      p_status: request.status || null,
    },
  );

  if (error) {
    return {
      success: false,
      message: error.message,
    };
  }

  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return {
      success: false,
      message: "Dữ liệu phân tích trả về không hợp lệ.",
    };
  }

  return {
    success: true,
    data: data as unknown as OrderAnalyticsData,
  };
}
