/* eslint-disable react-hooks/set-state-in-effect */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { Link } from "react-router-dom";
import { supabase } from "../../lib/supabase";
import { loadMetaAdsRevenueSummary } from "../../services/metaAdsReport";
import type {
  MetaAdsCurrencyTotal,
  MetaAdsReportError,
} from "../../types/metaAdsReport";
import { formatCurrency } from "../../utils/currency";

const PAGE_SIZE = 50;
const DAILY_QUERY_SIZE = 1000;
const PRODUCT_COST_RATE = 0.15;

type DatePreset = "last10" | "last30" | "thisMonth" | "custom";

type DateRange = {
  start: string;
  end: string;
};

type RevenueSummaryRow = {
  completed_orders: number | string;
  total_revenue: number | string;
};

type RevenueDailyRow = {
  total_amount: number | string;
  created_at: string;
};

type RevenueOrderRow = {
  id: string;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  subtotal: number | string;
  discount_amount: number | string;
  shipping_fee: number | string;
  total_amount: number | string;
  created_at: string;
  order_items:
    | Array<{
        quantity: number;
      }>
    | null;
};

type RevenueOrder = {
  id: string;
  code: string;
  customerName: string;
  customerPhone: string;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  itemQuantity: number;
  createdAt: string;
};

type RevenueChartPoint = {
  date: string;
  revenue: number;
  profit: number | null;
};

type StatCardProps = {
  label: string;
  value: string;
  note: string;
  icon: string;
  iconClass: string;
  valueClass?: string;
};

function toDateInput(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function getPresetRange(
  preset: Exclude<DatePreset, "custom">,
): DateRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (preset === "last30") {
    return {
      start: toDateInput(addDays(today, -29)),
      end: toDateInput(today),
    };
  }

  if (preset === "thisMonth") {
    return {
      start: toDateInput(
        new Date(today.getFullYear(), today.getMonth(), 1),
      ),
      end: toDateInput(today),
    };
  }

  return {
    start: toDateInput(addDays(today, -9)),
    end: toDateInput(today),
  };
}

function dateRangeToIso(range: DateRange) {
  const startDate = new Date(`${range.start}T00:00:00`);
  const endExclusive = new Date(`${range.end}T00:00:00`);
  endExclusive.setDate(endExclusive.getDate() + 1);

  return {
    startIso: startDate.toISOString(),
    endExclusiveIso: endExclusive.toISOString(),
  };
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
  }).format(new Date(`${value}T00:00:00`));
}

function formatPercent(value: number | null) {
  if (value === null || !Number.isFinite(value)) {
    return "—";
  }

  return `${value.toLocaleString("vi-VN", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  })}%`;
}

function formatCompactCurrency(value: number) {
  return new Intl.NumberFormat("vi-VN", {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(value);
}

function formatForeignSpend(total: MetaAdsCurrencyTotal) {
  return `${total.spend.toLocaleString("vi-VN", {
    maximumFractionDigits: 2,
  })} ${total.currency}`;
}

function vietnamDateKey(value: string) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value));

  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((item) => item.type === type)?.value ?? "";

  return `${part("year")}-${part("month")}-${part("day")}`;
}

function listDateKeys(range: DateRange) {
  const start = new Date(`${range.start}T00:00:00Z`);
  const end = new Date(`${range.end}T00:00:00Z`);
  const result: string[] = [];
  const cursor = new Date(start);

  while (cursor.getTime() <= end.getTime()) {
    result.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return result;
}

function orderFromRow(row: RevenueOrderRow): RevenueOrder {
  return {
    id: row.id,
    code: row.order_code,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    subtotal: Number(row.subtotal),
    discount: Number(row.discount_amount),
    shipping: Number(row.shipping_fee),
    total: Number(row.total_amount),
    itemQuantity: (row.order_items ?? []).reduce(
      (sum, item) => sum + Number(item.quantity),
      0,
    ),
    createdAt: row.created_at,
  };
}

async function loadAllRevenueRows(
  startIso: string,
  endExclusiveIso: string,
) {
  const rows: RevenueDailyRow[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("orders")
      .select("total_amount,created_at")
      .eq("status", "completed")
      .gte("created_at", startIso)
      .lt("created_at", endExclusiveIso)
      .order("created_at", { ascending: true })
      .range(from, from + DAILY_QUERY_SIZE - 1);

    if (error) {
      throw error;
    }

    const pageRows = (data ?? []) as unknown as RevenueDailyRow[];
    rows.push(...pageRows);

    if (pageRows.length < DAILY_QUERY_SIZE) {
      break;
    }

    from += DAILY_QUERY_SIZE;
  }

  return rows;
}

function StatCard({
  label,
  value,
  note,
  icon,
  iconClass,
  valueClass = "text-[#172033]",
}: StatCardProps) {
  return (
    <article className="rounded-2xl border border-[#e7eaf0] bg-white p-5 shadow-[0_3px_12px_rgba(16,24,40,0.035)]">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-bold text-[#667085]">{label}</p>
        <span
          className={`grid h-9 w-9 place-items-center rounded-xl text-sm font-black ${iconClass}`}
        >
          {icon}
        </span>
      </div>
      <p
        className={`mt-4 text-2xl font-black tracking-[-0.035em] ${valueClass}`}
      >
        {value}
      </p>
      <p className="mt-1.5 min-h-5 text-xs text-[#8790a2]">{note}</p>
    </article>
  );
}

function RevenueTrendChart({
  points,
  financialReady,
}: {
  points: RevenueChartPoint[];
  financialReady: boolean;
}) {
  const width = 760;
  const height = 280;
  const left = 54;
  const right = 14;
  const top = 20;
  const bottom = 32;
  const plotWidth = width - left - right;
  const plotHeight = height - top - bottom;

  const values = points.flatMap((point) => {
    if (financialReady && point.profit !== null) {
      return [point.revenue, point.profit];
    }
    return [point.revenue];
  });

  const maxValue = Math.max(1, ...values);
  const minValue = Math.min(0, ...values);
  const valueRange = Math.max(1, maxValue - minValue);

  const xFor = (index: number) =>
    left +
    (points.length <= 1
      ? plotWidth / 2
      : (index / (points.length - 1)) * plotWidth);
  const yFor = (value: number) =>
    top + ((maxValue - value) / valueRange) * plotHeight;

  const revenuePoints = points
    .map(
      (point, index) =>
        `${xFor(index).toFixed(2)},${yFor(point.revenue).toFixed(2)}`,
    )
    .join(" ");

  const profitPoints = financialReady
    ? points
        .filter((point) => point.profit !== null)
        .map(
          (point, index) =>
            `${xFor(index).toFixed(2)},${yFor(point.profit ?? 0).toFixed(2)}`,
        )
        .join(" ")
    : "";

  const zeroY = yFor(0);
  const areaPoints =
    points.length > 0
      ? `${revenuePoints} ${xFor(points.length - 1)},${zeroY} ${xFor(0)},${zeroY}`
      : "";

  const labelIndexes = [
    0,
    Math.round((points.length - 1) * 0.25),
    Math.round((points.length - 1) * 0.5),
    Math.round((points.length - 1) * 0.75),
    Math.max(0, points.length - 1),
  ].filter((value, index, array) => array.indexOf(value) === index);

  if (points.length === 0) {
    return (
      <div className="grid h-[280px] place-items-center text-sm text-[#8790a2]">
        Chưa có dữ liệu để vẽ biểu đồ.
      </div>
    );
  }

  return (
    <svg
      className="h-[280px] w-full overflow-visible"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      role="img"
      aria-label="Biểu đồ doanh thu và lợi nhuận"
    >
      <defs>
        <linearGradient id="revenueArea" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="#3975ea" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#3975ea" stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {[top, top + plotHeight / 2, zeroY].map((y, index) => (
        <line
          key={`${y}-${index}`}
          x1={left}
          x2={width - right}
          y1={y}
          y2={y}
          stroke="#edf0f4"
          strokeWidth="1"
        />
      ))}

      <text x="4" y={top + 4} fill="#8a93a4" fontSize="10">
        {formatCompactCurrency(maxValue)}
      </text>
      <text x="18" y={zeroY + 4} fill="#8a93a4" fontSize="10">
        0
      </text>
      {minValue < 0 && (
        <text
          x="4"
          y={height - bottom + 4}
          fill="#8a93a4"
          fontSize="10"
        >
          {formatCompactCurrency(minValue)}
        </text>
      )}

      <polygon points={areaPoints} fill="url(#revenueArea)" />
      <polyline
        points={revenuePoints}
        fill="none"
        stroke="#3975ea"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      />

      {financialReady && profitPoints && (
        <polyline
          points={profitPoints}
          fill="none"
          stroke="#169b62"
          strokeWidth="2.5"
          strokeDasharray="6 5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      )}

      {points.map((point, index) => (
        <g key={point.date}>
          <circle
            cx={xFor(index)}
            cy={yFor(point.revenue)}
            r="3.5"
            fill="white"
            stroke="#3975ea"
            strokeWidth="2"
          />
          {financialReady && point.profit !== null && (
            <circle
              cx={xFor(index)}
              cy={yFor(point.profit)}
              r="3"
              fill="white"
              stroke={point.profit >= 0 ? "#169b62" : "#d84a4a"}
              strokeWidth="2"
            />
          )}
        </g>
      ))}

      {labelIndexes.map((index) => (
        <text
          key={points[index].date}
          x={xFor(index)}
          y={height - 8}
          fill="#8a93a4"
          fontSize="10"
          textAnchor={
            index === 0
              ? "start"
              : index === points.length - 1
                ? "end"
                : "middle"
          }
        >
          {formatDateOnly(points[index].date)}
        </text>
      ))}
    </svg>
  );
}

export default function RevenueAdminPage() {
  const initialRange = useMemo(() => getPresetRange("last10"), []);

  const [preset, setPreset] = useState<DatePreset>("last10");
  const [dateRange, setDateRange] = useState<DateRange>(initialRange);
  const [draftStart, setDraftStart] = useState(initialRange.start);
  const [draftEnd, setDraftEnd] = useState(initialRange.end);

  const [completedOrders, setCompletedOrders] = useState(0);
  const [totalRevenue, setTotalRevenue] = useState(0);
  const [dailyRevenue, setDailyRevenue] = useState<Record<string, number>>(
    {},
  );

  const [adsCost, setAdsCost] = useState<number | null>(null);
  const [dailyAds, setDailyAds] = useState<Record<string, number>>({});
  const [foreignAdsTotals, setForeignAdsTotals] = useState<
    MetaAdsCurrencyTotal[]
  >([]);
  const [adsReportErrors, setAdsReportErrors] = useState<
    MetaAdsReportError[]
  >([]);

  const [orders, setOrders] = useState<RevenueOrder[]>([]);
  const [page, setPage] = useState(1);

  const [metricsLoading, setMetricsLoading] = useState(true);
  const [ordersLoading, setOrdersLoading] = useState(true);
  const [revenueError, setRevenueError] = useState("");
  const [ordersError, setOrdersError] = useState("");
  const [adsError, setAdsError] = useState("");

  const totalPages = Math.max(
    1,
    Math.ceil(completedOrders / PAGE_SIZE),
  );

  const loadMetrics = useCallback(async () => {
    if (!dateRange.start || !dateRange.end) {
      setRevenueError(
        "Vui lòng chọn đủ ngày bắt đầu và ngày kết thúc.",
      );
      return;
    }

    if (dateRange.start > dateRange.end) {
      setRevenueError(
        "Ngày bắt đầu không được lớn hơn ngày kết thúc.",
      );
      return;
    }

    setMetricsLoading(true);
    setRevenueError("");
    setAdsError("");
    setAdsCost(null);
    setDailyAds({});
    setForeignAdsTotals([]);
    setAdsReportErrors([]);

    const { startIso, endExclusiveIso } =
      dateRangeToIso(dateRange);

    const adsPromise = loadMetaAdsRevenueSummary({
      since: dateRange.start,
      until: dateRange.end,
    })
      .then((data) => ({ data, error: "" }))
      .catch((cause: unknown) => ({
        data: null,
        error:
          cause instanceof Error
            ? cause.message
            : "Không thể tải chi phí Ads.",
      }));

    try {
      const [summaryResult, dailyRows, adsResult] =
        await Promise.all([
          supabase.rpc("get_revenue_summary", {
            p_start_at: startIso,
            p_end_at: endExclusiveIso,
          }),
          loadAllRevenueRows(startIso, endExclusiveIso),
          adsPromise,
        ]);

      if (summaryResult.error) {
        throw summaryResult.error;
      }

      const summaryRows =
        (summaryResult.data ?? []) as RevenueSummaryRow[];
      const summary = summaryRows[0];

      setCompletedOrders(
        Number(summary?.completed_orders ?? 0),
      );
      setTotalRevenue(Number(summary?.total_revenue ?? 0));

      const revenueByDate: Record<string, number> = {};
      for (const row of dailyRows) {
        const date = vietnamDateKey(row.created_at);
        revenueByDate[date] =
          (revenueByDate[date] ?? 0) + Number(row.total_amount);
      }
      setDailyRevenue(revenueByDate);

      if (!adsResult.data) {
        setAdsError(adsResult.error);
      } else {
        const vndSpend =
          adsResult.data.totalsByCurrency.find(
            (total) => total.currency.toUpperCase() === "VND",
          )?.spend ?? 0;

        const foreign = adsResult.data.totalsByCurrency.filter(
          (total) =>
            total.currency.toUpperCase() !== "VND" &&
            total.spend > 0,
        );

        const adsByDate: Record<string, number> = {};
        for (const total of adsResult.data.dailyTotalsByCurrency) {
          if (total.currency.toUpperCase() !== "VND") {
            continue;
          }

          adsByDate[total.date] =
            (adsByDate[total.date] ?? 0) + total.spend;
        }

        setAdsCost(vndSpend);
        setDailyAds(adsByDate);
        setForeignAdsTotals(foreign);
        setAdsReportErrors(adsResult.data.errors);

        if (adsResult.data.errors.length > 0) {
          setAdsError(
            "Một số tài khoản Ads không trả được dữ liệu. ROI và lãi/lỗ tạm ẩn để tránh hiển thị sai.",
          );
        }
      }
    } catch (cause) {
      setCompletedOrders(0);
      setTotalRevenue(0);
      setDailyRevenue({});
      setRevenueError(
        cause instanceof Error
          ? cause.message
          : "Không thể tải dữ liệu doanh thu.",
      );
    } finally {
      setMetricsLoading(false);
    }
  }, [dateRange]);

  const loadOrders = useCallback(async () => {
    if (
      !dateRange.start ||
      !dateRange.end ||
      dateRange.start > dateRange.end
    ) {
      return;
    }

    setOrdersLoading(true);
    setOrdersError("");

    const { startIso, endExclusiveIso } =
      dateRangeToIso(dateRange);
    const firstRow = (page - 1) * PAGE_SIZE;
    const lastRow = firstRow + PAGE_SIZE - 1;

    const { data, error } = await supabase
      .from("orders")
      .select(`
        id,
        order_code,
        customer_name,
        customer_phone,
        subtotal,
        discount_amount,
        shipping_fee,
        total_amount,
        created_at,
        order_items (
          quantity
        )
      `)
      .eq("status", "completed")
      .gte("created_at", startIso)
      .lt("created_at", endExclusiveIso)
      .order("created_at", { ascending: false })
      .range(firstRow, lastRow);

    if (error) {
      setOrders([]);
      setOrdersError(error.message);
      setOrdersLoading(false);
      return;
    }

    setOrders(
      ((data ?? []) as unknown as RevenueOrderRow[]).map(
        orderFromRow,
      ),
    );
    setOrdersLoading(false);
  }, [dateRange, page]);

  useEffect(() => {
    void loadMetrics();
  }, [loadMetrics]);

  useEffect(() => {
    void loadOrders();
  }, [loadOrders]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  function applyPreset(
    nextPreset: Exclude<DatePreset, "custom">,
  ) {
    const nextRange = getPresetRange(nextPreset);
    setPreset(nextPreset);
    setDateRange(nextRange);
    setDraftStart(nextRange.start);
    setDraftEnd(nextRange.end);
    setPage(1);
  }

  function openCustomRange() {
    setPreset("custom");
  }

  function applyCustomRange() {
    if (!draftStart || !draftEnd) {
      setRevenueError(
        "Vui lòng chọn đủ ngày bắt đầu và ngày kết thúc.",
      );
      return;
    }

    if (draftStart > draftEnd) {
      setRevenueError(
        "Ngày bắt đầu không được lớn hơn ngày kết thúc.",
      );
      return;
    }

    setPreset("custom");
    setDateRange({
      start: draftStart,
      end: draftEnd,
    });
    setPage(1);
  }

  const productCost = totalRevenue * PRODUCT_COST_RATE;
  const hasForeignCurrency = foreignAdsTotals.length > 0;
  const financialReady =
    adsCost !== null &&
    !adsError &&
    !hasForeignCurrency &&
    adsReportErrors.length === 0;

  const totalCost = financialReady
    ? (adsCost ?? 0) + productCost
    : null;
  const profit =
    totalCost === null ? null : totalRevenue - totalCost;
  const roi =
    totalCost !== null && totalCost > 0 && profit !== null
      ? (profit / totalCost) * 100
      : totalCost === 0 && profit === 0
        ? 0
        : null;
  const margin =
    profit !== null && totalRevenue > 0
      ? (profit / totalRevenue) * 100
      : totalRevenue === 0 && profit === 0
        ? 0
        : null;
  const averageOrder =
    completedOrders > 0 ? totalRevenue / completedOrders : 0;

  const adsCostShare =
    totalCost !== null && totalCost > 0 && adsCost !== null
      ? (adsCost / totalCost) * 100
      : 0;
  const productCostShare =
    totalCost !== null && totalCost > 0
      ? (productCost / totalCost) * 100
      : 0;

  const profitPositive = profit === null || profit >= 0;
  const profitValueClass =
    profit === null
      ? "text-[#8790a2]"
      : profitPositive
        ? "text-[#169b62]"
        : "text-[#d84a4a]";

  const dailySeries = useMemo<RevenueChartPoint[]>(() => {
    return listDateKeys(dateRange).map((date) => {
      const revenue = dailyRevenue[date] ?? 0;
      const ads = dailyAds[date] ?? 0;
      const dailyProductCost = revenue * PRODUCT_COST_RATE;

      return {
        date,
        revenue,
        profit: financialReady
          ? revenue - ads - dailyProductCost
          : null,
      };
    });
  }, [dateRange, dailyRevenue, dailyAds, financialReady]);

  const foreignWarning = hasForeignCurrency
    ? `Có chi phí Ads ngoài VND (${foreignAdsTotals
        .map(formatForeignSpend)
        .join(", ")}). Hệ thống không tự quy đổi nên ROI và lãi/lỗ được ẩn.`
    : "";

  const financialWarning = adsError || foreignWarning;
  const loading = metricsLoading || ordersLoading;

  const presetButtons: Array<{
    id: Exclude<DatePreset, "custom">;
    label: string;
  }> = [
    { id: "last10", label: "10 ngày" },
    { id: "last30", label: "30 ngày" },
    { id: "thisMonth", label: "Tháng này" },
  ];

  return (
    <section>
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#006397]">
            Tài chính
          </p>
          <h1 className="mt-2 text-3xl font-black tracking-[-0.03em] sm:text-4xl">
            Doanh thu
          </h1>
          <p className="mt-2 text-sm leading-6 text-[#707881]">
            Theo dõi doanh thu, chi phí Ads, cost sản phẩm và hiệu quả
            thực tế trong cùng một khoảng thời gian.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void loadMetrics();
            void loadOrders();
          }}
          disabled={loading}
          className="rounded-xl bg-[#edf4ff] px-4 py-3 text-sm font-bold text-[#006397] transition hover:bg-[#e2edff] disabled:opacity-60"
        >
          {loading ? "Đang tải..." : "Làm mới"}
        </button>
      </div>

      <div className="mt-6 rounded-2xl border border-[#e7eaf0] bg-white p-2 shadow-sm">
        <div className="flex flex-wrap items-center gap-2">
          {presetButtons.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => applyPreset(item.id)}
              className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                preset === item.id
                  ? "bg-[#172033] text-white"
                  : "text-[#596175] hover:bg-[#f4f6f8]"
              }`}
            >
              {item.label}
            </button>
          ))}

          <button
            type="button"
            onClick={openCustomRange}
            className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              preset === "custom"
                ? "bg-[#172033] text-white"
                : "text-[#596175] hover:bg-[#f4f6f8]"
            }`}
          >
            Chọn khoảng
          </button>

          <p className="ml-auto px-2 text-xs font-semibold text-[#667085]">
            {formatDateOnly(dateRange.start)} –{" "}
            {formatDateOnly(dateRange.end)}
          </p>
        </div>

        {preset === "custom" && (
          <div className="mt-2 grid gap-3 rounded-xl bg-[#f7f8fa] p-3 md:grid-cols-[1fr_1fr_auto]">
            <label className="text-xs font-bold text-[#596175]">
              Từ ngày
              <input
                type="date"
                value={draftStart}
                onChange={(event) =>
                  setDraftStart(event.target.value)
                }
                className="mt-1.5 h-10 w-full rounded-lg border border-[#d7dee6] bg-white px-3 text-sm font-normal outline-none focus:border-[#3975ea]"
              />
            </label>

            <label className="text-xs font-bold text-[#596175]">
              Đến ngày
              <input
                type="date"
                value={draftEnd}
                onChange={(event) =>
                  setDraftEnd(event.target.value)
                }
                className="mt-1.5 h-10 w-full rounded-lg border border-[#d7dee6] bg-white px-3 text-sm font-normal outline-none focus:border-[#3975ea]"
              />
            </label>

            <button
              type="button"
              onClick={applyCustomRange}
              className="min-h-10 self-end rounded-lg bg-[#3975ea] px-5 text-sm font-bold text-white transition hover:bg-[#2e67d5]"
            >
              Áp dụng
            </button>
          </div>
        )}
      </div>

      {revenueError && (
        <p className="mt-4 rounded-2xl bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[#a43c12]">
          {revenueError}
        </p>
      )}

      {financialWarning && (
        <p className="mt-4 rounded-2xl border border-[#f3d7a4] bg-[#fff8e9] px-4 py-3 text-sm font-semibold text-[#8a5a12]">
          {financialWarning}
        </p>
      )}

      <div className="relative mt-5 overflow-hidden rounded-[20px] bg-gradient-to-br from-[#151a25] via-[#232b3a] to-[#182334] p-6 text-white shadow-[0_10px_28px_rgba(16,24,40,0.08)]">
        <div className="pointer-events-none absolute -right-24 -top-32 h-72 w-72 rounded-full bg-[#3975ea]/20 blur-3xl" />

        <div className="relative grid gap-5 lg:grid-cols-[1.2fr_0.8fr]">
          <div>
            <p className="text-xs font-black uppercase tracking-[0.12em] text-[#c6cedb]">
              Doanh thu sau chi phí
            </p>
            <p
              className={`mt-2 text-4xl font-black tracking-[-0.045em] ${
                profit === null
                  ? "text-[#c6cedb]"
                  : profit >= 0
                    ? "text-[#72e2a8]"
                    : "text-[#ff8f8f]"
              }`}
            >
              {metricsLoading
                ? "…"
                : profit === null
                  ? "Chưa đủ dữ liệu"
                  : formatCurrency(profit)}
            </p>
            <p className="mt-2 text-sm text-[#c7ced9]">
              Doanh thu gộp − Chi phí Ads − Cost sản phẩm 15%
            </p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
              <p className="text-xs text-[#b9c2d0]">
                Tỷ suất lợi nhuận
              </p>
              <p className="mt-2 text-xl font-black">
                {metricsLoading ? "…" : formatPercent(margin)}
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/[0.055] p-4">
              <p className="text-xs text-[#b9c2d0]">ROI</p>
              <p
                className={`mt-2 text-xl font-black ${
                  roi === null
                    ? ""
                    : roi >= 0
                      ? "text-[#72e2a8]"
                      : "text-[#ff8f8f]"
                }`}
              >
                {metricsLoading ? "…" : formatPercent(roi)}
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <StatCard
          label="Doanh thu gộp"
          value={metricsLoading ? "…" : formatCurrency(totalRevenue)}
          note="Đơn hàng đã hoàn thành"
          icon="₫"
          iconClass="bg-[#edf4ff] text-[#3975ea]"
        />

        <StatCard
          label="Tổng chi phí"
          value={
            metricsLoading
              ? "…"
              : totalCost === null
                ? "—"
                : formatCurrency(totalCost)
          }
          note={
            totalCost === null || totalRevenue <= 0
              ? "Ads + Cost SP 15%"
              : `${formatPercent((totalCost / totalRevenue) * 100)} doanh thu gộp`
          }
          icon="↘"
          iconClass="bg-[#fff7e8] text-[#e59b25]"
        />

        <StatCard
          label="Lãi / Lỗ"
          value={
            metricsLoading
              ? "…"
              : profit === null
                ? "—"
                : formatCurrency(profit)
          }
          note={
            profit === null
              ? "Chờ đủ dữ liệu Ads"
              : profit >= 0
                ? "Đang có lãi"
                : "Đang bị lỗ"
          }
          icon={profit !== null && profit < 0 ? "↓" : "↑"}
          iconClass={
            profit !== null && profit < 0
              ? "bg-[#fff0f0] text-[#d84a4a]"
              : "bg-[#eaf8f1] text-[#169b62]"
          }
          valueClass={profitValueClass}
        />

        <StatCard
          label="ROI"
          value={metricsLoading ? "…" : formatPercent(roi)}
          note="Lợi nhuận ÷ Tổng chi phí"
          icon="%"
          iconClass={
            roi !== null && roi < 0
              ? "bg-[#fff0f0] text-[#d84a4a]"
              : "bg-[#eaf8f1] text-[#169b62]"
          }
          valueClass={
            roi === null
              ? "text-[#8790a2]"
              : roi >= 0
                ? "text-[#169b62]"
                : "text-[#d84a4a]"
          }
        />

        <StatCard
          label="Đơn hoàn thành"
          value={metricsLoading ? "…" : String(completedOrders)}
          note={`TB ${formatCurrency(averageOrder)} / đơn`}
          icon="✓"
          iconClass="bg-[#edf4ff] text-[#3975ea]"
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(320px,0.75fr)]">
        <article className="rounded-2xl border border-[#e7eaf0] bg-white p-5 shadow-sm">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-base font-black">
                Xu hướng doanh thu & lợi nhuận
              </h2>
              <p className="mt-1 text-xs text-[#667085]">
                Theo từng ngày trong khoảng thời gian đã chọn
              </p>
            </div>

            <div className="flex flex-wrap gap-4 text-xs font-semibold text-[#667085]">
              <span>
                <i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#3975ea]" />
                Doanh thu
              </span>
              <span>
                <i className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#169b62]" />
                Lợi nhuận
              </span>
            </div>
          </div>

          <div className="mt-4">
            {metricsLoading ? (
              <div className="grid h-[280px] place-items-center text-sm text-[#8790a2]">
                Đang tải dữ liệu biểu đồ...
              </div>
            ) : (
              <RevenueTrendChart
                points={dailySeries}
                financialReady={financialReady}
              />
            )}
          </div>
        </article>

        <aside className="rounded-2xl border border-[#e7eaf0] bg-white p-5 shadow-sm">
          <div>
            <h2 className="text-base font-black">Cơ cấu chi phí</h2>
            <p className="mt-1 text-xs text-[#667085]">
              Cùng khoảng thời gian với doanh thu
            </p>
          </div>

          <div className="mt-5 rounded-2xl border border-[#e7eaf0] bg-[#f8fafc] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.08em] text-[#667085]">
              Tổng chi phí
            </p>
            <p className="mt-2 text-3xl font-black tracking-[-0.04em]">
              {metricsLoading
                ? "…"
                : totalCost === null
                  ? "—"
                  : formatCurrency(totalCost)}
            </p>
          </div>

          <div className="mt-3 rounded-2xl border border-[#e7eaf0] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#fff7e8] text-xs font-black text-[#e59b25]">
                  A
                </span>
                <p className="text-sm font-black">Chi phí Ads</p>
              </div>
              <p className="text-sm font-black">
                {metricsLoading
                  ? "…"
                  : adsCost === null
                    ? "—"
                    : formatCurrency(adsCost)}
              </p>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eef1f5]">
              <div
                className="h-full rounded-full bg-[#e59b25]"
                style={{
                  width: `${Math.min(100, Math.max(0, adsCostShare))}%`,
                }}
              />
            </div>

            <div className="mt-2 flex justify-between gap-3 text-xs text-[#667085]">
              <span>Meta Ads</span>
              <span>
                {totalCost === null
                  ? "Chưa đủ dữ liệu"
                  : `${formatPercent(adsCostShare)} tổng chi phí`}
              </span>
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-[#e7eaf0] p-4">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-xl bg-[#edf4ff] text-[11px] font-black text-[#3975ea]">
                  SP
                </span>
                <p className="text-sm font-black">Cost sản phẩm</p>
              </div>
              <p className="text-sm font-black">
                {metricsLoading ? "…" : formatCurrency(productCost)}
              </p>
            </div>

            <div className="mt-3 h-2 overflow-hidden rounded-full bg-[#eef1f5]">
              <div
                className="h-full rounded-full bg-[#3975ea]"
                style={{
                  width: `${Math.min(
                    100,
                    Math.max(0, productCostShare),
                  )}%`,
                }}
              />
            </div>

            <div className="mt-2 flex justify-between gap-3 text-xs text-[#667085]">
              <span>15% doanh thu gộp</span>
              <span>
                {totalCost === null
                  ? "—"
                  : `${formatPercent(productCostShare)} tổng chi phí`}
              </span>
            </div>
          </div>

          <div className="mt-3 rounded-2xl border border-[#d2efdf] bg-[#eaf8f1] p-4 text-xs leading-5 text-[#3d6955]">
            <p className="font-black text-[#147a4f]">Cách tính</p>
            <p className="mt-1">
              Lãi/Lỗ = Doanh thu gộp − Ads − Cost SP
              <br />
              ROI = Lãi/Lỗ ÷ Tổng chi phí × 100%
            </p>
          </div>
        </aside>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <article className="rounded-2xl border border-[#e7eaf0] bg-white p-5 shadow-sm">
          <h2 className="text-base font-black">Tóm tắt hiệu quả</h2>

          <div className="mt-3 divide-y divide-[#edf0f3] text-sm">
            <div className="flex items-center justify-between gap-4 py-3">
              <span className="text-[#667085]">Doanh thu gộp</span>
              <strong>{formatCurrency(totalRevenue)}</strong>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <span className="text-[#667085]">− Chi phí Ads</span>
              <strong>
                {adsCost === null ? "—" : formatCurrency(adsCost)}
              </strong>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <span className="text-[#667085]">
                − Cost sản phẩm (15%)
              </span>
              <strong>{formatCurrency(productCost)}</strong>
            </div>
            <div className="flex items-center justify-between gap-4 py-3">
              <span className="font-bold text-[#3f4850]">
                = Doanh thu sau chi phí
              </span>
              <strong className={profitValueClass}>
                {profit === null ? "—" : formatCurrency(profit)}
              </strong>
            </div>
          </div>
        </article>

        <article className="rounded-2xl border border-[#e7eaf0] bg-white p-5 shadow-sm">
          <h2 className="text-base font-black">Nhìn nhanh</h2>

          <div className="mt-3 flex gap-3 rounded-2xl border border-[#e7eaf0] bg-[#f7f9fc] p-4">
            <span
              className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl font-black ${
                profit !== null && profit < 0
                  ? "bg-[#fff0f0] text-[#d84a4a]"
                  : "bg-[#eaf8f1] text-[#169b62]"
              }`}
            >
              {profit !== null && profit < 0 ? "!" : "✓"}
            </span>
            <div>
              <p className="text-sm font-black">
                {profit === null
                  ? "Chưa đủ dữ liệu để chốt hiệu quả"
                  : profit >= 0
                    ? "Kỳ này đang có lãi"
                    : "Kỳ này đang bị lỗ"}
              </p>
              <p className="mt-1 text-xs leading-5 text-[#667085]">
                {profit === null
                  ? "Cần dữ liệu Ads đầy đủ bằng VND trước khi tính lãi và ROI."
                  : `Bạn giữ lại ${formatPercent(
                      margin,
                    )} doanh thu sau khi trừ Ads và cost sản phẩm.`}
              </p>
            </div>
          </div>

          <div className="mt-3 flex gap-3 rounded-2xl border border-[#e7eaf0] bg-[#f7f9fc] p-4">
            <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[#fff7e8] font-black text-[#e59b25]">
              A
            </span>
            <div>
              <p className="text-sm font-black">Tỷ trọng chi phí Ads</p>
              <p className="mt-1 text-xs leading-5 text-[#667085]">
                {totalCost === null
                  ? "Chưa thể xác định tỷ trọng Ads vì dữ liệu chi phí chưa hoàn chỉnh."
                  : `Ads đang chiếm ${formatPercent(
                      adsCostShare,
                    )} tổng chi phí trong kỳ này.`}
              </p>
            </div>
          </div>
        </article>
      </div>

      {ordersError && (
        <p className="mt-5 rounded-2xl bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[#a43c12]">
          {ordersError}
        </p>
      )}

      <div className="mt-5 overflow-hidden rounded-3xl bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f3] p-5">
          <div>
            <h2 className="text-xl font-black">
              Các đơn tạo ra doanh thu
            </h2>
            <p className="mt-1 text-sm text-[#707881]">
              Chỉ hiển thị đơn Thành công · Tối đa {PAGE_SIZE} đơn mỗi
              trang.
            </p>
          </div>
          <p className="text-sm font-bold text-[#3f4850]">
            Trang {page}/{totalPages}
          </p>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#edf4ff] text-[#3f4850]">
              <tr>
                <th className="px-5 py-4">Mã đơn</th>
                <th className="px-5 py-4">Khách hàng</th>
                <th className="px-5 py-4">Số lượng</th>
                <th className="px-5 py-4">Tiền hàng</th>
                <th className="px-5 py-4">Giảm giá</th>
                <th className="px-5 py-4">Phí ship</th>
                <th className="px-5 py-4">Doanh thu</th>
                <th className="px-5 py-4">Ngày tạo</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#edf0f3]">
              {ordersLoading && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-12 text-center text-[#707881]"
                  >
                    Đang tải dữ liệu...
                  </td>
                </tr>
              )}

              {!ordersLoading &&
                orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-[#fafcff]"
                  >
                    <td className="px-5 py-4 font-black text-[#006397]">
                      {order.code}
                    </td>
                    <td className="px-5 py-4">
                      <p className="font-bold text-[#091d2e]">
                        {order.customerName}
                      </p>
                      <p className="mt-1 text-xs text-[#707881]">
                        {order.customerPhone}
                      </p>
                    </td>
                    <td className="px-5 py-4 font-bold">
                      {order.itemQuantity}
                    </td>
                    <td className="px-5 py-4">
                      {formatCurrency(order.subtotal)}
                    </td>
                    <td className="px-5 py-4 text-[#a43c12]">
                      {order.discount > 0
                        ? `−${formatCurrency(order.discount)}`
                        : "0 ₫"}
                    </td>
                    <td className="px-5 py-4">
                      {order.shipping > 0
                        ? formatCurrency(order.shipping)
                        : "Miễn phí"}
                    </td>
                    <td className="px-5 py-4 font-black text-[#14633d]">
                      {formatCurrency(order.total)}
                    </td>
                    <td className="whitespace-nowrap px-5 py-4 text-[#3f4850]">
                      {formatDateTime(order.createdAt)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link
                        to={`/admin/don-hang/${order.code}`}
                        className="font-bold text-[#006397]"
                      >
                        Mở đơn
                      </Link>
                    </td>
                  </tr>
                ))}

              {!ordersLoading && orders.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-12 text-center text-[#707881]"
                  >
                    Không có đơn Thành công trong khoảng thời gian này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!ordersLoading && completedOrders > PAGE_SIZE && (
          <div className="flex items-center justify-between gap-4 border-t border-[#edf0f3] p-5">
            <button
              type="button"
              disabled={page <= 1}
              onClick={() =>
                setPage((current) => Math.max(1, current - 1))
              }
              className="rounded-xl bg-[#edf4ff] px-4 py-2.5 text-sm font-bold text-[#006397] disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Trang trước
            </button>

            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() =>
                setPage((current) =>
                  Math.min(totalPages, current + 1),
                )
              }
              className="rounded-xl bg-[#006397] px-4 py-2.5 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              Trang sau →
            </button>
          </div>
        )}
      </div>
    </section>
  );
}