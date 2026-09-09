/* eslint-disable react-hooks/set-state-in-effect */
import type { ChangeEvent, ReactNode } from "react";
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import { getOrderAnalytics } from "../../services/orderAnalytics";
import type {
  OrderAnalyticsData,
  OrderAnalyticsHeatmapCell,
  OrderAnalyticsPreset,
  OrderAnalyticsProduct,
  OrderAnalyticsStatus,
  OrderAnalyticsTrendPoint,
} from "../../types/orderAnalytics";
import type { OrderStatus } from "../../types/store";

type DateRange = {
  start: string;
  end: string;
};

type IconName =
  | "analytics"
  | "calendar"
  | "cancelled"
  | "check"
  | "clock"
  | "download"
  | "orders"
  | "package"
  | "refresh"
  | "search"
  | "trend"
  | "warning";

type ProductSort = "quantity" | "orders" | "share";

const STATUS_OPTIONS: Array<{
  value: OrderStatus | "";
  label: string;
}> = [
  { value: "", label: "Tất cả trạng thái" },
  { value: "new", label: "Đơn mới" },
  { value: "unreachable", label: "Không gọi được" },
  { value: "confirmed", label: "Đã xác nhận" },
  { value: "preparing", label: "Đang chuẩn bị" },
  { value: "prepared", label: "Đã chuẩn bị" },
  { value: "shipping", label: "Đang giao" },
  { value: "completed", label: "Hoàn thành" },
  { value: "cancelled", label: "Đã hủy" },
];

const PRESET_BUTTONS: Array<{
  id: OrderAnalyticsPreset;
  label: string;
}> = [
  { id: "today", label: "Hôm nay" },
  { id: "last7", label: "7 ngày" },
  { id: "last30", label: "30 ngày" },
  { id: "thisMonth", label: "Tháng này" },
  { id: "custom", label: "Tùy chọn" },
];

function Icon({
  name,
  className = "h-5 w-5",
}: {
  name: IconName;
  className?: string;
}) {
  const common = {
    className,
    fill: "none",
    stroke: "currentColor",
    viewBox: "0 0 24 24",
    "aria-hidden": true,
  };

  if (name === "analytics") {
    return (
      <svg {...common}>
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth="1.8"
          d="M4 19V9m5 10V5m5 14v-7m5 7V3M4 7l5-4 5 6 5-7"
        />
      </svg>
    );
  }

  if (name === "calendar") {
    return (
      <svg {...common}>
        <rect x="3" y="5" width="18" height="16" rx="2" strokeWidth="1.8" />
        <path strokeWidth="1.8" d="M7 3v4m10-4v4M3 10h18" />
      </svg>
    );
  }

  if (name === "cancelled") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" strokeWidth="1.8" />
        <path strokeLinecap="round" strokeWidth="1.8" d="m9 9 6 6m0-6-6 6" />
      </svg>
    );
  }

  if (name === "check") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" strokeWidth="1.8" />
        <path strokeLinecap="round" strokeWidth="1.8" d="m8 12 2.5 2.5L16.5 9" />
      </svg>
    );
  }

  if (name === "clock") {
    return (
      <svg {...common}>
        <circle cx="12" cy="12" r="9" strokeWidth="1.8" />
        <path strokeLinecap="round" strokeWidth="1.8" d="M12 7v5l3 2" />
      </svg>
    );
  }

  if (name === "download") {
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeWidth="1.8" d="M12 3v12m0 0 4-4m-4 4-4-4M5 18v3h14v-3" />
      </svg>
    );
  }

  if (name === "orders") {
    return (
      <svg {...common}>
        <path strokeWidth="1.8" d="M6 3h12l2 5-2 13H6L4 8zM4 8h16" />
      </svg>
    );
  }

  if (name === "package") {
    return (
      <svg {...common}>
        <path strokeWidth="1.8" d="M5 7.5 12 4l7 3.5v9L12 20l-7-3.5zM5 7.5 12 11l7-3.5M12 11v9" />
      </svg>
    );
  }

  if (name === "refresh") {
    return (
      <svg {...common}>
        <path strokeLinecap="round" strokeWidth="1.8" d="M20 12a8 8 0 1 1-2.3-5.7M20 4v6h-6" />
      </svg>
    );
  }

  if (name === "search") {
    return (
      <svg {...common}>
        <circle cx="11" cy="11" r="7" strokeWidth="1.8" />
        <path strokeLinecap="round" strokeWidth="1.8" d="m16 16 4 4" />
      </svg>
    );
  }

  if (name === "warning") {
    return (
      <svg {...common}>
        <path strokeWidth="1.8" d="M12 3 2 21h20z" />
        <path strokeLinecap="round" strokeWidth="1.8" d="M12 9v5m0 3h.01" />
      </svg>
    );
  }

  return (
    <svg {...common}>
      <path strokeWidth="1.8" d="M4 19V9m5 10V5m5 14v-7m5 7V3" />
    </svg>
  );
}

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

function addDateInputDays(value: string, amount: number) {
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + amount);

  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
  ].join("-");
}

function getPresetRange(
  preset: Exclude<OrderAnalyticsPreset, "custom">,
): DateRange {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (preset === "last7") {
    return {
      start: toDateInput(addDays(today, -6)),
      end: toDateInput(today),
    };
  }

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
    start: toDateInput(today),
    end: toDateInput(today),
  };
}

function dateRangeToIso(range: DateRange) {
  return {
    startAt: new Date(`${range.start}T00:00:00+07:00`).toISOString(),
    endAt: new Date(
      `${addDateInputDays(range.end, 1)}T00:00:00+07:00`,
    ).toISOString(),
  };
}

function formatDateOnly(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(`${value}T00:00:00+07:00`));
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    hour: "2-digit",
    minute: "2-digit",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function formatNumber(value: number, maximumFractionDigits = 0) {
  return new Intl.NumberFormat("vi-VN", {
    maximumFractionDigits,
    minimumFractionDigits: maximumFractionDigits,
  }).format(Number(value) || 0);
}

function formatChange(value: number, suffix = "%") {
  const normalized = Number(value) || 0;
  const arrow = normalized > 0 ? "↗" : normalized < 0 ? "↘" : "→";

  return `${arrow} ${formatNumber(Math.abs(normalized), 1)}${suffix}`;
}

function csvCell(value: string | number) {
  const text = String(value ?? "");
  return `"${text.replaceAll('"', '""')}"`;
}

function downloadCsv(data: OrderAnalyticsData, dateRange: DateRange) {
  const rows: Array<Array<string | number>> = [
    ["PHÂN TÍCH ĐƠN HÀNG INGIDAY"],
    ["Khoảng thời gian", `${formatDateOnly(dateRange.start)} - ${formatDateOnly(dateRange.end)}`],
    ["Trạng thái", data.period.status ?? "Tất cả trạng thái"],
    [],
    ["CHỈ SỐ TỔNG QUAN"],
    ["Tổng số đơn", data.summary.totalOrders],
    ["Sản phẩm đã đặt", data.summary.totalItems],
    ["Tỷ lệ hoàn thành", `${formatNumber(data.summary.completionRate, 1)}%`],
    ["Tỷ lệ hủy", `${formatNumber(data.summary.cancellationRate, 1)}%`],
    ["Đơn trung bình/ngày", formatNumber(data.summary.averageOrdersPerDay, 1)],
    [],
    ["PHÂN BỔ TRẠNG THÁI"],
    ["Trạng thái", "Số đơn", "Tỷ lệ"],
    ...data.statuses.map((item) => [
      item.label,
      item.orderCount,
      `${formatNumber(item.percentage, 1)}%`,
    ]),
    [],
    ["SẢN PHẨM ĐƯỢC ĐẶT NHIỀU NHẤT"],
    ["Sản phẩm", "Biến thể", "SKU", "Số đơn", "Số lượng", "Tỷ trọng", "Xu hướng"],
    ...data.topProducts.map((item) => [
      item.productName,
      item.variantName,
      item.productSku || "—",
      item.orderCount,
      item.quantity,
      `${formatNumber(item.sharePercent, 1)}%`,
      `${formatNumber(item.trendPercent, 1)}%`,
    ]),
  ];

  const csv = `\ufeff${rows
    .map((row) => row.map(csvCell).join(","))
    .join("\r\n")}`;
  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `phan-tich-don-hang-${dateRange.start}-${dateRange.end}.csv`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 0);
}

function KpiCard({
  icon,
  iconClass,
  label,
  value,
  unit,
  change,
  changeSuffix = "%",
  note,
  lowerIsBetter = false,
}: {
  icon: IconName;
  iconClass: string;
  label: string;
  value: string;
  unit: string;
  change: number;
  changeSuffix?: string;
  note: string;
  lowerIsBetter?: boolean;
}) {
  const isGood = lowerIsBetter ? change <= 0 : change >= 0;

  return (
    <article className="rounded-[22px] border border-[#e8edf3] bg-white p-5 shadow-[0_8px_28px_rgba(20,48,73,0.07)] transition hover:-translate-y-0.5 hover:shadow-[0_16px_38px_rgba(20,48,73,0.11)]">
      <div className="flex items-center justify-between gap-3">
        <span className={`grid h-10 w-10 place-items-center rounded-[13px] ${iconClass}`}>
          <Icon name={icon} className="h-[18px] w-[18px]" />
        </span>
        <span
          className={`rounded-full px-2 py-1 text-[10px] font-black ${
            isGood
              ? "bg-[#eaf9f3] text-[#24a775]"
              : "bg-[#fff0f1] text-[#e85d64]"
          }`}
        >
          {formatChange(change, changeSuffix)}
        </span>
      </div>
      <p className="mt-4 text-[11px] font-bold text-[#718296]">
        {label}
      </p>
      <p className="mt-1 flex items-baseline gap-1.5 text-[28px] font-black tracking-[-0.04em] text-[#0b2132]">
        {value}
        <span className="text-[11px] font-bold tracking-normal text-[#94a2b2]">
          {unit}
        </span>
      </p>
      <p className="mt-1.5 text-[10px] leading-4 text-[#94a2b2]">
        {note}
      </p>
    </article>
  );
}

function TrendChart({ data }: { data: OrderAnalyticsTrendPoint[] }) {
  const width = 700;
  const height = 230;
  const padding = 12;
  const maxValue = Math.max(
    5,
    ...data.flatMap((point) => [
      Number(point.orderCount) || 0,
      Number(point.previousOrderCount) || 0,
    ]),
  );

  const pointsFor = (key: "orderCount" | "previousOrderCount") =>
    data.map((point, index) => {
      const x =
        padding +
        (index * (width - padding * 2)) /
          Math.max(1, data.length - 1);
      const y =
        height -
        ((Number(point[key]) || 0) / maxValue) *
          (height - padding * 2) -
        padding;

      return { x, y };
    });

  const currentPoints = pointsFor("orderCount");
  const previousPoints = pointsFor("previousOrderCount");
  const pathFor = (points: Array<{ x: number; y: number }>) =>
    points
      .map(
        (point, index) =>
          `${index === 0 ? "M" : "L"} ${point.x.toFixed(1)} ${point.y.toFixed(1)}`,
      )
      .join(" ");
  const currentPath = pathFor(currentPoints);
  const previousPath = pathFor(previousPoints);
  const areaPath = currentPoints.length
    ? `M ${currentPoints[0].x} ${height} ${currentPoints
        .map((point) => `L ${point.x} ${point.y}`)
        .join(" ")} L ${currentPoints.at(-1)?.x ?? width} ${height} Z`
    : "";

  const labelCount = Math.min(data.length, 7);
  const labelIndexes = Array.from(
    { length: labelCount },
    (_, index) =>
      Math.round(
        (index * Math.max(0, data.length - 1)) /
          Math.max(1, labelCount - 1),
      ),
  );
  const yLabels = [maxValue, maxValue * 0.75, maxValue * 0.5, maxValue * 0.25, 0];

  if (data.length === 0) {
    return (
      <div className="grid h-[278px] place-items-center text-sm text-[#718296]">
        Chưa có dữ liệu xu hướng.
      </div>
    );
  }

  return (
    <div className="relative h-[278px] pl-10">
      <div className="absolute inset-y-6 left-0 flex w-8 flex-col justify-between text-right text-[9px] text-[#a0adba]">
        {yLabels.map((value) => (
          <span key={value}>{formatNumber(value)}</span>
        ))}
      </div>
      <div
        className="h-full overflow-hidden rounded-2xl"
        style={{
          backgroundImage:
            "repeating-linear-gradient(to bottom, transparent 0, transparent calc(25% - 1px), #edf1f5 calc(25% - 1px), #edf1f5 25%)",
        }}
      >
        <svg
          viewBox={`0 0 ${width} ${height}`}
          preserveAspectRatio="none"
          className="h-[252px] w-full overflow-visible"
          aria-label="Biểu đồ xu hướng đơn hàng"
        >
          <defs>
            <linearGradient id="orderAnalyticsArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fe7e4f" stopOpacity="0.24" />
              <stop offset="100%" stopColor="#fe7e4f" stopOpacity="0.015" />
            </linearGradient>
          </defs>
          <path d={areaPath} fill="url(#orderAnalyticsArea)" />
          <path
            d={previousPath}
            fill="none"
            stroke="#cbd4dd"
            strokeWidth="2"
            strokeDasharray="5 6"
            vectorEffect="non-scaling-stroke"
          />
          <path
            d={currentPath}
            fill="none"
            stroke="#fe7e4f"
            strokeWidth="3"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
          {currentPoints.map((point, index) => {
            const isPeak =
              Number(data[index].orderCount) ===
              Math.max(...data.map((item) => Number(item.orderCount) || 0));
            const isLast = index === currentPoints.length - 1;

            if (!isPeak && !isLast) return null;

            return (
              <circle
                key={`${point.x}-${point.y}`}
                cx={point.x}
                cy={point.y}
                r="5"
                fill="#fff"
                stroke="#fe7e4f"
                strokeWidth="3"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </svg>
        <div className="flex h-[26px] items-start justify-between px-1 pt-1.5 text-[9px] text-[#9aa7b5]">
          {labelIndexes.map((index) => (
            <span key={`${data[index]?.date}-${index}`}>
              {data[index]?.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

function StatusDistribution({
  statuses,
  totalOrders,
}: {
  statuses: OrderAnalyticsStatus[];
  totalOrders: number;
}) {
  const visibleStatuses = statuses.filter((item) => item.orderCount > 0);
  const segments = visibleStatuses.map((item, index) => {
    const start = visibleStatuses
      .slice(0, index)
      .reduce((total, status) => total + status.percentage, 0);
    const end = start + item.percentage;

    return `${item.color} ${start}% ${end}%`;
  });
  const background = segments.length
    ? `conic-gradient(${segments.join(",")})`
    : "#edf1f5";

  return (
    <div className="grid items-center gap-6 sm:grid-cols-[150px_minmax(0,1fr)]">
      <div className="relative mx-auto h-[145px] w-[145px]">
        <div className="absolute inset-0 rounded-full" style={{ background }} />
        <div className="absolute inset-[22px] rounded-full border border-[#f0f3f7] bg-white" />
        <div className="absolute inset-0 grid place-content-center text-center">
          <strong className="text-[25px] font-black tracking-[-0.04em] text-[#10283b]">
            {formatNumber(totalOrders)}
          </strong>
          <span className="mt-1 text-[10px] text-[#718296]">
            Tổng đơn
          </span>
        </div>
      </div>

      <div className="grid gap-3">
        {statuses.map((item) => (
          <div key={item.status} className="grid gap-1.5">
            <div className="flex items-center justify-between gap-3 text-[10px]">
              <span className="flex min-w-0 items-center gap-2 font-semibold text-[#718296]">
                <span
                  className="h-2 w-2 shrink-0 rounded-full"
                  style={{ backgroundColor: item.color }}
                />
                {item.label}
              </span>
              <strong className="whitespace-nowrap text-[#10283b]">
                {formatNumber(item.orderCount)}{" "}
                <span className="font-semibold text-[#9ba8b5]">
                  ({formatNumber(item.percentage, 1)}%)
                </span>
              </strong>
            </div>
            <div className="h-[5px] overflow-hidden rounded-full bg-[#edf1f5]">
              <span
                className="block h-full rounded-full"
                style={{
                  width: `${Math.min(100, item.percentage)}%`,
                  backgroundColor: item.color,
                }}
              />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function Heatmap({ cells }: { cells: OrderAnalyticsHeatmapCell[] }) {
  const weekdays = Array.from(
    new Map(cells.map((cell) => [cell.weekday, cell.weekdayLabel])).entries(),
  ).sort((left, right) => left[0] - right[0]);
  const slots = Array.from(
    new Map(cells.map((cell) => [cell.slot, cell.slotLabel])).entries(),
  ).sort((left, right) => left[0] - right[0]);
  const lookup = new Map(
    cells.map((cell) => [`${cell.weekday}-${cell.slot}`, cell.orderCount]),
  );
  const maxValue = Math.max(1, ...cells.map((cell) => cell.orderCount));

  return (
    <div className="overflow-x-auto pb-1">
      <div
        className="grid min-w-[620px] items-center gap-2"
        style={{
          gridTemplateColumns: "38px repeat(8, minmax(50px, 1fr))",
        }}
      >
        <span />
        {slots.map(([slot, label]) => (
          <span key={slot} className="text-center text-[9px] text-[#97a4b1]">
            {label}
          </span>
        ))}

        {weekdays.flatMap(([weekday, weekdayLabel]) => [
          <span
            key={`label-${weekday}`}
            className="text-[10px] font-bold text-[#718296]"
          >
            {weekdayLabel}
          </span>,
          ...slots.map(([slot]) => {
            const value = lookup.get(`${weekday}-${slot}`) ?? 0;
            const opacity = 0.07 + (value / maxValue) * 0.72;

            return (
              <div
                key={`${weekday}-${slot}`}
                title={`${weekdayLabel} · ${slots.find(([id]) => id === slot)?.[1]}: ${formatNumber(value)} đơn`}
                className="group relative h-7 rounded-lg transition hover:scale-105 hover:outline hover:outline-2 hover:outline-[#fe7e4f]/15"
                style={{
                  backgroundColor: `rgba(254, 126, 79, ${opacity})`,
                }}
              >
                <span className="pointer-events-none absolute bottom-[calc(100%_+_7px)] left-1/2 z-10 -translate-x-1/2 translate-y-1 rounded-lg bg-[#0c263a] px-2 py-1 text-[9px] font-bold whitespace-nowrap text-white opacity-0 shadow-lg transition group-hover:translate-y-0 group-hover:opacity-100">
                  {formatNumber(value)} đơn
                </span>
              </div>
            );
          }),
        ])}
      </div>
      <div className="mt-3 flex items-center justify-end gap-1.5 text-[9px] text-[#94a2b2]">
        <span>Ít</span>
        {[0.12, 0.28, 0.48, 0.72].map((opacity) => (
          <span
            key={opacity}
            className="h-2 w-[18px] rounded"
            style={{
              backgroundColor: `rgba(254, 126, 79, ${opacity})`,
            }}
          />
        ))}
        <span>Nhiều</span>
      </div>
    </div>
  );
}

function InsightCard({
  icon,
  iconClass,
  title,
  children,
}: {
  icon: IconName;
  iconClass: string;
  title: string;
  children: ReactNode;
}) {
  return (
    <div className="flex gap-3 rounded-2xl border border-[#edf1f5] bg-[#fbfcfe] p-3.5">
      <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${iconClass}`}>
        <Icon name={icon} className="h-4 w-4" />
      </span>
      <div>
        <strong className="block text-[11px] text-[#10283b]">
          {title}
        </strong>
        <p className="mt-1 text-[10px] leading-5 text-[#718296]">
          {children}
        </p>
      </div>
    </div>
  );
}

function ProductThumbnail({ product }: { product: OrderAnalyticsProduct }) {
  if (product.productImageUrl) {
    return (
      <img
        src={product.productImageUrl}
        alt=""
        className="h-11 w-11 shrink-0 rounded-xl border border-[#ffeadf] object-cover"
      />
    );
  }

  return (
    <span
      className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[#ffeadf] text-xl"
      style={{ backgroundColor: product.productBackground || "#fff1ea" }}
    >
      {product.productEmoji || "📦"}
    </span>
  );
}

export default function OrderAnalyticsAdminPage() {
  const initialRange = useMemo(() => getPresetRange("last30"), []);
  const [preset, setPreset] =
    useState<OrderAnalyticsPreset>("last30");
  const [dateRange, setDateRange] = useState<DateRange>(initialRange);
  const [draftStart, setDraftStart] = useState(initialRange.start);
  const [draftEnd, setDraftEnd] = useState(initialRange.end);
  const [status, setStatus] = useState<OrderStatus | "">("");
  const [data, setData] = useState<OrderAnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<ProductSort>("quantity");

  const loadAnalytics = useCallback(async () => {
    if (!dateRange.start || !dateRange.end) {
      setError("Vui lòng chọn đủ ngày bắt đầu và ngày kết thúc.");
      return;
    }

    if (dateRange.start > dateRange.end) {
      setError("Ngày bắt đầu không được lớn hơn ngày kết thúc.");
      return;
    }

    const dayCount = Math.round(
      (new Date(`${dateRange.end}T00:00:00+07:00`).getTime() -
        new Date(`${dateRange.start}T00:00:00+07:00`).getTime()) /
        86_400_000,
    ) + 1;

    if (dayCount > 370) {
      setError("Khoảng phân tích tối đa là 370 ngày.");
      return;
    }

    setLoading(true);
    setError("");

    const isoRange = dateRangeToIso(dateRange);
    const result = await getOrderAnalytics({
      startAt: isoRange.startAt,
      endAt: isoRange.endAt,
      status,
    });

    if (!result.success) {
      setData(null);
      setError(result.message);
      setLoading(false);
      return;
    }

    setData(result.data);
    setLoading(false);
  }, [dateRange, status]);

  useEffect(() => {
    void loadAnalytics();
  }, [loadAnalytics]);

  const filteredProducts = useMemo(() => {
    const keyword = search.trim().toLocaleLowerCase("vi-VN");
    const nextProducts = (data?.topProducts ?? []).filter((product) => {
      if (!keyword) return true;

      return [
        product.productName,
        product.productSku,
        product.variantName,
      ]
        .join(" ")
        .toLocaleLowerCase("vi-VN")
        .includes(keyword);
    });

    return [...nextProducts].sort((left, right) => {
      if (sort === "orders") return right.orderCount - left.orderCount;
      if (sort === "share") return right.sharePercent - left.sharePercent;
      return right.quantity - left.quantity;
    });
  }, [data?.topProducts, search, sort]);

  function applyPreset(
    nextPreset: Exclude<OrderAnalyticsPreset, "custom">,
  ) {
    const nextRange = getPresetRange(nextPreset);
    setPreset(nextPreset);
    setDateRange(nextRange);
    setDraftStart(nextRange.start);
    setDraftEnd(nextRange.end);
  }

  function openCustomRange() {
    setPreset("custom");
  }

  function applyCustomRange() {
    if (!draftStart || !draftEnd) {
      setError("Vui lòng chọn đủ ngày bắt đầu và ngày kết thúc.");
      return;
    }

    if (draftStart > draftEnd) {
      setError("Ngày bắt đầu không được lớn hơn ngày kết thúc.");
      return;
    }

    setDateRange({
      start: draftStart,
      end: draftEnd,
    });
  }

  const summary = data?.summary;
  const peakDayOrders = Math.max(
    0,
    ...(data?.trend.map((item) => item.orderCount) ?? []),
  );
  const selectedStatusLabel =
    STATUS_OPTIONS.find((item) => item.value === status)?.label ??
    "Tất cả trạng thái";

  return (
    <section className="mx-auto w-full max-w-[1580px]">
      <div className="flex flex-col justify-between gap-5 xl:flex-row xl:items-start">
        <div>
          <p className="flex items-center gap-2 text-[11px] font-black tracking-[0.1em] text-[#ea6739] uppercase">
            <span className="h-2 w-2 rounded-full bg-[#fe7e4f] shadow-[0_0_0_5px_#fff1ea]" />
            Trung tâm dữ liệu đơn hàng
          </p>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.04em] text-[#0b2132] sm:text-4xl">
            Phân tích đơn hàng
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-[#718296]">
            Theo dõi trạng thái xử lý, xu hướng đặt hàng và hiệu suất từng sản phẩm trong một màn hình trực quan.
          </p>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => void loadAnalytics()}
            disabled={loading}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[13px] border border-[#e8edf3] bg-white px-4 text-xs font-bold text-[#10283b] shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
          >
            <Icon
              name="refresh"
              className={`h-4 w-4 ${loading ? "animate-spin" : ""}`}
            />
            {loading ? "Đang tải" : "Làm mới"}
          </button>
          <button
            type="button"
            onClick={() => data && downloadCsv(data, dateRange)}
            disabled={!data || loading}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-[13px] bg-[#0c263a] px-4 text-xs font-bold text-white shadow-[0_9px_18px_rgba(12,38,58,0.14)] transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-60 sm:flex-none"
          >
            <Icon name="download" className="h-4 w-4" />
            Xuất báo cáo
          </button>
        </div>
      </div>

      <div className="mt-6 rounded-[18px] border border-[#e8edf3] bg-white p-3 shadow-[0_4px_18px_rgba(20,48,73,0.04)]">
        <div className="flex flex-col justify-between gap-3 xl:flex-row xl:items-center">
          <div className="flex flex-wrap gap-1.5">
            {PRESET_BUTTONS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() =>
                  item.id === "custom"
                    ? openCustomRange()
                    : applyPreset(item.id)
                }
                className={`min-h-10 rounded-xl px-4 text-[11px] font-black transition ${
                  preset === item.id
                    ? "bg-[#fe7e4f] text-white shadow-[0_7px_16px_rgba(254,126,79,0.22)]"
                    : "text-[#718296] hover:bg-[#f4f7fb] hover:text-[#10283b]"
                }`}
              >
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
            <div className="flex min-h-10 items-center justify-center gap-2 rounded-xl bg-[#f7f9fc] px-3 text-[10px] font-semibold text-[#718296]">
              <Icon name="calendar" className="h-4 w-4 text-[#10283b]" />
              {formatDateOnly(dateRange.start)} – {formatDateOnly(dateRange.end)}
            </div>
            <select
              value={status}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setStatus(event.target.value as OrderStatus | "")
              }
              className="min-h-10 min-w-44 rounded-xl border border-[#e8edf3] bg-white px-3 text-[11px] font-bold text-[#10283b] outline-none focus:border-[#fe7e4f]"
            >
              {STATUS_OPTIONS.map((item) => (
                <option key={item.value || "all"} value={item.value}>
                  {item.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        {preset === "custom" && (
          <div className="mt-3 grid gap-3 border-t border-[#eef2f6] pt-3 sm:grid-cols-[1fr_1fr_auto]">
            <label className="text-[11px] font-bold text-[#3f4850]">
              Từ ngày
              <input
                type="date"
                value={draftStart}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setDraftStart(event.target.value)
                }
                className="mt-1.5 h-10 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none focus:border-[#fe7e4f]"
              />
            </label>
            <label className="text-[11px] font-bold text-[#3f4850]">
              Đến ngày
              <input
                type="date"
                value={draftEnd}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setDraftEnd(event.target.value)
                }
                className="mt-1.5 h-10 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none focus:border-[#fe7e4f]"
              />
            </label>
            <button
              type="button"
              onClick={applyCustomRange}
              className="min-h-10 self-end rounded-xl bg-[#203243] px-5 text-xs font-bold text-white"
            >
              Áp dụng
            </button>
          </div>
        )}
      </div>

      {error && (
        <p className="mt-5 rounded-2xl bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[#a43c12]">
          {error}
        </p>
      )}

      <div className="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        <KpiCard
          icon="orders"
          iconClass="bg-[#fff1ea] text-[#ea6739]"
          label="Tổng số đơn hàng"
          value={loading ? "…" : formatNumber(summary?.totalOrders ?? 0)}
          unit="đơn"
          change={summary?.ordersChangePercent ?? 0}
          note={`So với ${data?.period.days ?? 0} ngày liền trước`}
        />
        <KpiCard
          icon="package"
          iconClass="bg-[#edf4ff] text-[#4388f5]"
          label="Sản phẩm đã đặt"
          value={loading ? "…" : formatNumber(summary?.totalItems ?? 0)}
          unit="sản phẩm"
          change={summary?.itemsChangePercent ?? 0}
          note={`Trung bình ${formatNumber(
            summary?.totalOrders
              ? (summary.totalItems ?? 0) / summary.totalOrders
              : 0,
            1,
          )} sản phẩm/đơn`}
        />
        <KpiCard
          icon="check"
          iconClass="bg-[#eaf9f3] text-[#24a775]"
          label="Tỷ lệ hoàn thành"
          value={loading ? "…" : formatNumber(summary?.completionRate ?? 0, 1)}
          unit="%"
          change={summary?.completionRateChange ?? 0}
          changeSuffix=" điểm"
          note={`${formatNumber(summary?.completedOrders ?? 0)} đơn đã hoàn thành`}
        />
        <KpiCard
          icon="cancelled"
          iconClass="bg-[#fff0f1] text-[#e85d64]"
          label="Tỷ lệ hủy đơn"
          value={loading ? "…" : formatNumber(summary?.cancellationRate ?? 0, 1)}
          unit="%"
          change={summary?.cancellationRateChange ?? 0}
          changeSuffix=" điểm"
          note={`${formatNumber(summary?.cancelledOrders ?? 0)} đơn đã bị hủy`}
          lowerIsBetter
        />
        <KpiCard
          icon="trend"
          iconClass="bg-[#f3edff] text-[#865bd7]"
          label="Đơn trung bình/ngày"
          value={loading ? "…" : formatNumber(summary?.averageOrdersPerDay ?? 0, 1)}
          unit="đơn"
          change={summary?.averageOrdersChange ?? 0}
          changeSuffix=""
          note={`Ngày cao nhất đạt ${formatNumber(peakDayOrders)} đơn`}
        />
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.65fr)_minmax(340px,0.85fr)]">
        <article className="rounded-[24px] border border-[#e8edf3] bg-white p-5 shadow-[0_8px_28px_rgba(20,48,73,0.07)]">
          <div className="mb-5 flex flex-col justify-between gap-3 sm:flex-row sm:items-start">
            <div>
              <h2 className="text-base font-black tracking-[-0.02em] text-[#10283b]">
                Xu hướng đơn hàng
              </h2>
              <p className="mt-1 text-[10px] leading-5 text-[#718296]">
                Số đơn phát sinh theo ngày và so sánh kỳ trước
              </p>
            </div>
            <div className="flex items-center gap-3 text-[9px] font-semibold text-[#718296]">
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#fe7e4f]" />
                Kỳ hiện tại
              </span>
              <span className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full bg-[#c9d3de]" />
                Kỳ trước
              </span>
            </div>
          </div>
          {loading ? (
            <div className="h-[278px] animate-pulse rounded-2xl bg-[#f4f7fb]" />
          ) : (
            <TrendChart data={data?.trend ?? []} />
          )}
        </article>

        <article className="rounded-[24px] border border-[#e8edf3] bg-white p-5 shadow-[0_8px_28px_rgba(20,48,73,0.07)]">
          <div className="mb-5">
            <h2 className="text-base font-black tracking-[-0.02em] text-[#10283b]">
              Phân bổ trạng thái
            </h2>
            <p className="mt-1 text-[10px] leading-5 text-[#718296]">
              Tỷ trọng đơn theo quy trình xử lý
            </p>
          </div>
          {loading ? (
            <div className="h-[278px] animate-pulse rounded-2xl bg-[#f4f7fb]" />
          ) : (
            <StatusDistribution
              statuses={data?.statuses ?? []}
              totalOrders={summary?.totalOrders ?? 0}
            />
          )}
        </article>
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(340px,0.85fr)]">
        <article className="rounded-[24px] border border-[#e8edf3] bg-white p-5 shadow-[0_8px_28px_rgba(20,48,73,0.07)]">
          <div className="mb-5">
            <h2 className="text-base font-black tracking-[-0.02em] text-[#10283b]">
              Thời gian khách đặt hàng
            </h2>
            <p className="mt-1 text-[10px] leading-5 text-[#718296]">
              Mật độ đơn theo thứ trong tuần và khung giờ Việt Nam
            </p>
          </div>
          {loading ? (
            <div className="h-64 animate-pulse rounded-2xl bg-[#f4f7fb]" />
          ) : (
            <Heatmap cells={data?.heatmap ?? []} />
          )}
        </article>

        <article className="rounded-[24px] border border-[#e8edf3] bg-white p-5 shadow-[0_8px_28px_rgba(20,48,73,0.07)]">
          <div className="mb-4">
            <h2 className="text-base font-black tracking-[-0.02em] text-[#10283b]">
              Điểm đáng chú ý
            </h2>
            <p className="mt-1 text-[10px] leading-5 text-[#718296]">
              Gợi ý nhanh được rút ra từ dữ liệu
            </p>
          </div>
          <div className="grid gap-2.5">
            <InsightCard
              icon="clock"
              iconClass="bg-[#fff1ea] text-[#ea6739]"
              title="Khung giờ hiệu quả nhất"
            >
              <b className="text-[#10283b]">
                {data?.insights.peakTimeLabel ?? "Chưa có dữ liệu"}
              </b>{" "}
              chiếm {formatNumber(data?.insights.peakTimeShare ?? 0, 1)}% tổng đơn trong khoảng đang xem.
            </InsightCard>
            <InsightCard
              icon="trend"
              iconClass="bg-[#eaf9f3] text-[#24a775]"
              title="Ngày có lượng đặt cao nhất"
            >
              <b className="text-[#10283b]">
                {data?.insights.peakWeekdayLabel ?? "Chưa có dữ liệu"}
              </b>{" "}
              đạt trung bình {formatNumber(data?.insights.peakWeekdayAverage ?? 0, 1)} đơn mỗi ngày.
            </InsightCard>
            <InsightCard
              icon="package"
              iconClass="bg-[#edf4ff] text-[#4388f5]"
              title="Sản phẩm dẫn đầu"
            >
              <b className="text-[#10283b]">
                {data?.insights.topProductName ?? "Chưa có dữ liệu"}
              </b>{" "}
              đứng đầu với {formatNumber(data?.insights.topProductQuantity ?? 0)} sản phẩm.
            </InsightCard>
            <InsightCard
              icon="warning"
              iconClass="bg-[#fff0f1] text-[#e85d64]"
              title="Cần theo dõi đơn mới"
            >
              Hiện có <b className="text-[#10283b]">{formatNumber(data?.insights.newOrders ?? 0)} đơn mới</b>, trong đó {formatNumber(data?.insights.staleNewOrders ?? 0)} đơn đã chờ xác nhận quá 6 giờ.
            </InsightCard>
          </div>
        </article>
      </div>

      <article className="mt-4 overflow-hidden rounded-[24px] border border-[#e8edf3] bg-white shadow-[0_8px_28px_rgba(20,48,73,0.07)]">
        <div className="flex flex-col justify-between gap-4 p-5 lg:flex-row lg:items-start">
          <div>
            <h2 className="text-base font-black tracking-[-0.02em] text-[#10283b]">
              Sản phẩm được đặt nhiều nhất
            </h2>
            <p className="mt-1 text-[10px] leading-5 text-[#718296]">
              {data?.period.productExcludesCancelled
                ? "Không tính đơn đã hủy"
                : `Đang lọc: ${selectedStatusLabel}`} · Xếp hạng theo tổng số lượng
            </p>
          </div>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label className="relative">
              <Icon
                name="search"
                className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-[#94a2b2]"
              />
              <input
                value={search}
                onChange={(event: ChangeEvent<HTMLInputElement>) =>
                  setSearch(event.target.value)
                }
                placeholder="Tìm sản phẩm hoặc SKU..."
                className="h-10 w-full rounded-xl border border-[#e8edf3] pr-3 pl-9 text-[11px] outline-none focus:border-[#fe7e4f] sm:w-56"
              />
            </label>
            <select
              value={sort}
              onChange={(event: ChangeEvent<HTMLSelectElement>) =>
                setSort(event.target.value as ProductSort)
              }
              className="h-10 rounded-xl border border-[#e8edf3] bg-white px-3 text-[10px] font-bold text-[#10283b] outline-none focus:border-[#fe7e4f]"
            >
              <option value="quantity">Số lượng giảm dần</option>
              <option value="orders">Số đơn giảm dần</option>
              <option value="share">Tỷ trọng giảm dần</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-[900px] w-full text-left text-[10px]">
            <thead className="border-y border-[#e8edf3] bg-[#fafbfd] text-[9px] font-black tracking-[0.06em] text-[#8b99a7] uppercase">
              <tr>
                <th className="px-4 py-3">Xếp hạng</th>
                <th className="px-4 py-3">Sản phẩm</th>
                <th className="px-4 py-3">SKU</th>
                <th className="px-4 py-3">Số đơn</th>
                <th className="px-4 py-3">Số lượng</th>
                <th className="px-4 py-3">Tỷ trọng</th>
                <th className="px-4 py-3">Xu hướng</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#eef2f6]">
              {loading && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-[#718296]">
                    Đang tải dữ liệu sản phẩm...
                  </td>
                </tr>
              )}

              {!loading &&
                filteredProducts.map((product, index) => (
                  <tr key={product.productKey} className="hover:bg-[#fcfdff]">
                    <td className="px-4 py-3.5">
                      <span
                        className={`grid h-7 w-7 place-items-center rounded-lg font-black ${
                          index < 3
                            ? "bg-[#fff3cf] text-[#a56800]"
                            : "bg-[#f2f5f9] text-[#718296]"
                        }`}
                      >
                        {index + 1}
                      </span>
                    </td>
                    <td className="min-w-64 px-4 py-3.5">
                      <div className="flex items-center gap-3">
                        <ProductThumbnail product={product} />
                        <div>
                          <strong className="block text-[11px] text-[#10283b]">
                            {product.productName}
                          </strong>
                          <span className="mt-1 block text-[9px] text-[#94a2b2]">
                            {product.variantName}
                          </span>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span className="rounded-lg bg-[#f2f5f8] px-2 py-1.5 font-mono text-[9px] font-bold text-[#667789]">
                        {product.productSku || "—"}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-[#718296]">
                      <b className="text-[#10283b]">{formatNumber(product.orderCount)}</b> đơn
                    </td>
                    <td className="px-4 py-3.5 text-[#718296]">
                      <b className="text-[#10283b]">{formatNumber(product.quantity)}</b> sp
                    </td>
                    <td className="min-w-36 px-4 py-3.5">
                      <div className="flex items-center justify-between gap-2 text-[#718296]">
                        <span>{formatNumber(product.sharePercent, 1)}%</span>
                        <span>Tổng tỷ trọng</span>
                      </div>
                      <div className="mt-1.5 h-[5px] overflow-hidden rounded-full bg-[#edf1f5]">
                        <span
                          className="block h-full rounded-full bg-[#fe7e4f]"
                          style={{
                            width: `${Math.min(100, product.sharePercent * 4)}%`,
                          }}
                        />
                      </div>
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`font-black ${
                          product.trendPercent >= 0
                            ? "text-[#24a775]"
                            : "text-[#e85d64]"
                        }`}
                      >
                        {formatChange(product.trendPercent)}
                      </span>
                    </td>
                  </tr>
                ))}

              {!loading && filteredProducts.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-4 py-12 text-center text-sm text-[#718296]">
                    Không có sản phẩm phù hợp trong khoảng thời gian này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </article>

      <div className="flex flex-col justify-between gap-2 px-1 pt-4 pb-2 text-[10px] text-[#94a2b2] sm:flex-row">
        <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-[#cdebdc] bg-[#eaf9f3] px-2.5 py-1 font-bold text-[#247654]">
          ● Dữ liệu trực tiếp từ đơn hàng InGiDay
        </span>
        <span>
          Cập nhật lần cuối: {data ? formatDateTime(data.generatedAt) : "—"} · Múi giờ Việt Nam (GMT+7)
        </span>
      </div>
    </section>
  );
}
