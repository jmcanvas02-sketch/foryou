/* eslint-disable react-hooks/set-state-in-effect */
import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import { OrderDetailDialog } from "../../features/orders/components/OrderDetailDialog";
import { useOrders } from "../../features/orders/OrdersContext";
import { supabase } from "../../lib/supabase";
import { loadMetaAdsCostReport } from "../../services/metaAdsReport";
import type { MetaAdsCurrencyTotal } from "../../types/metaAdsReport";
import type { OrderStatus, StoreOrder } from "../../types/store";
import { formatCurrency } from "../../utils/currency";

const PAGE_SIZE = 50;

type DatePreset =
  | "today"
  | "yesterday"
  | "last7"
  | "last30"
  | "thisMonth"
  | "custom";

type DateRange = {
  start: string;
  end: string;
};

type DashboardOrderRow = {
  id: string;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  total_amount: number | string;
  status: OrderStatus;
  created_at: string;
  order_items:
    | Array<{
        quantity: number;
      }>
    | null;
};

type DashboardOrder = {
  id: string;
  code: string;
  customerName: string;
  customerPhone: string;
  total: number;
  status: OrderStatus;
  itemQuantity: number;
  createdAt: string;
};

const statusLabels: Record<OrderStatus, string> = {
  new: "Đơn mới",
  unreachable: "Không gọi được",
  confirmed: "Đã xác nhận",
  preparing: "Đang chuẩn bị",
  prepared: "Đã chuẩn bị",
  shipping: "Đang giao",
  completed: "Thành công",
  cancelled: "Đã hủy",
};

const statusClasses: Record<OrderStatus, string> = {
  new: "bg-[#edf4ff] text-[#006397]",
  unreachable: "bg-[#f2edff] text-[#6241a5]",
  confirmed: "bg-[#fff1b8] text-[#7a5200]",
  preparing: "bg-[#ffe8dc] text-[#a43c12]",
  prepared: "bg-[#e7f6fb] text-[#006b82]",
  shipping: "bg-[#e7e4ff] text-[#493b9f]",
  completed: "bg-[#dcf8eb] text-[#14633d]",
  cancelled: "bg-[#fff0eb] text-[#a43c12]",
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

function getPresetRange(preset: Exclude<DatePreset, "custom">) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (preset === "yesterday") {
    const yesterday = addDays(today, -1);

    return {
      start: toDateInput(yesterday),
      end: toDateInput(yesterday),
    };
  }

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

function formatAdsMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "VND" ? 0 : 2,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat("vi-VN", {
      maximumFractionDigits: 2,
    }).format(value)} ${currency}`;
  }
}

function orderFromRow(row: DashboardOrderRow): DashboardOrder {
  return {
    id: row.id,
    code: row.order_code,
    customerName: row.customer_name,
    customerPhone: row.customer_phone,
    total: Number(row.total_amount),
    status: row.status,
    itemQuantity: (row.order_items ?? []).reduce(
      (sum, item) => sum + Number(item.quantity),
      0,
    ),
    createdAt: row.created_at,
  };
}

export default function DashboardPage() {
  const { loadOrderByCode } = useOrders();
  const initialRange = useMemo(
    () => getPresetRange("today"),
    [],
  );

  const [preset, setPreset] = useState<DatePreset>("today");
  const [dateRange, setDateRange] =
    useState<DateRange>(initialRange);
  const [draftStart, setDraftStart] = useState(
    initialRange.start,
  );
  const [draftEnd, setDraftEnd] = useState(initialRange.end);

  const [orders, setOrders] = useState<DashboardOrder[]>([]);
  const [totalOrders, setTotalOrders] = useState(0);
  const [newOrders, setNewOrders] = useState(0);
  const [cancelledOrders, setCancelledOrders] = useState(0);
  const [adsTotals, setAdsTotals] = useState<MetaAdsCurrencyTotal[]>([]);
  const [adsLoading, setAdsLoading] = useState(true);
  const [adsError, setAdsError] = useState("");
  const [orderDialogOpen, setOrderDialogOpen] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState<StoreOrder | null>(null);
  const [orderDialogLoading, setOrderDialogLoading] = useState(false);
  const [orderDialogError, setOrderDialogError] = useState("");

  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const totalPages = Math.max(
    1,
    Math.ceil(totalOrders / PAGE_SIZE),
  );

  const loadDashboard = useCallback(async () => {
    if (!dateRange.start || !dateRange.end) {
      setError("Vui lòng chọn đủ ngày bắt đầu và ngày kết thúc.");
      return;
    }

    if (dateRange.start > dateRange.end) {
      setError("Ngày bắt đầu không được lớn hơn ngày kết thúc.");
      return;
    }

    setLoading(true);
    setError("");

    const { startIso, endExclusiveIso } =
      dateRangeToIso(dateRange);

    const firstRow = (page - 1) * PAGE_SIZE;
    const lastRow = firstRow + PAGE_SIZE - 1;

    const [
      totalResult,
      newResult,
      cancelledResult,
      listResult,
    ] = await Promise.all([
      supabase
        .from("orders")
        .select("id", {
          count: "exact",
          head: true,
        })
        .gte("created_at", startIso)
        .lt("created_at", endExclusiveIso),

      supabase
        .from("orders")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("status", "new")
        .gte("created_at", startIso)
        .lt("created_at", endExclusiveIso),

      supabase
        .from("orders")
        .select("id", {
          count: "exact",
          head: true,
        })
        .eq("status", "cancelled")
        .gte("created_at", startIso)
        .lt("created_at", endExclusiveIso),

      supabase
        .from("orders")
        .select(`
          id,
          order_code,
          customer_name,
          customer_phone,
          total_amount,
          status,
          created_at,
          order_items (
            quantity
          )
        `)
        .gte("created_at", startIso)
        .lt("created_at", endExclusiveIso)
        .order("created_at", { ascending: false })
        .range(firstRow, lastRow),
    ]);

    const queryError =
      totalResult.error ??
      newResult.error ??
      cancelledResult.error ??
      listResult.error;

    if (queryError) {
      setOrders([]);
      setTotalOrders(0);
      setNewOrders(0);
      setCancelledOrders(0);
      setError(queryError.message);
      setLoading(false);
      return;
    }

    setTotalOrders(totalResult.count ?? 0);
    setNewOrders(newResult.count ?? 0);
    setCancelledOrders(cancelledResult.count ?? 0);
    setOrders(
      (
        (listResult.data ?? []) as unknown as DashboardOrderRow[]
      ).map(orderFromRow),
    );

    setLoading(false);
  }, [dateRange, page]);

  const loadAdsSummary = useCallback(async () => {
    if (
      !dateRange.start ||
      !dateRange.end ||
      dateRange.start > dateRange.end
    ) {
      return;
    }

    setAdsLoading(true);
    setAdsError("");

    try {
      const report = await loadMetaAdsCostReport({
        since: dateRange.start,
        until: dateRange.end,
      });

      setAdsTotals(report.totalsByCurrency);

      if (report.errors.length > 0) {
        setAdsError(
          `Có ${report.errors.length} tài khoản Ads trả về lỗi. Chỉ số hiện tại chỉ dùng dữ liệu tải thành công.`,
        );
      }
    } catch (loadError) {
      setAdsTotals([]);
      setAdsError(
        loadError instanceof Error
          ? loadError.message
          : "Không thể tải tổng chi phí Ads.",
      );
    } finally {
      setAdsLoading(false);
    }
  }, [dateRange]);

  useEffect(() => {
    void loadDashboard();
  }, [loadDashboard]);

  useEffect(() => {
    void loadAdsSummary();
  }, [loadAdsSummary]);

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

  function applyCustomRange() {
    if (!draftStart || !draftEnd) {
      setError("Vui lòng chọn đủ ngày bắt đầu và ngày kết thúc.");
      return;
    }

    if (draftStart > draftEnd) {
      setError("Ngày bắt đầu không được lớn hơn ngày kết thúc.");
      return;
    }

    setPreset("custom");
    setDateRange({
      start: draftStart,
      end: draftEnd,
    });
    setPage(1);
  }

  async function openOrderDialog(code: string) {
    setOrderDialogOpen(true);
    setSelectedOrder(null);
    setOrderDialogError("");
    setOrderDialogLoading(true);

    const result = await loadOrderByCode(code);

    if (!result.success || !result.data) {
      setOrderDialogError(result.message);
      setOrderDialogLoading(false);
      return;
    }

    setSelectedOrder(result.data);
    setOrderDialogLoading(false);
  }

  function closeOrderDialog() {
    setOrderDialogOpen(false);
    setSelectedOrder(null);
    setOrderDialogError("");
    setOrderDialogLoading(false);
  }

  const adsDisplayTotals: MetaAdsCurrencyTotal[] =
    adsTotals.length > 0
      ? adsTotals
      : !adsLoading && !adsError
        ? [{ currency: "VND", spend: 0 }]
        : [];

  const presetButtons: Array<{
    id: Exclude<DatePreset, "custom">;
    label: string;
  }> = [
    { id: "today", label: "Hôm nay" },
    { id: "yesterday", label: "Hôm qua" },
    { id: "last7", label: "7 ngày" },
    { id: "last30", label: "30 ngày" },
    { id: "thisMonth", label: "Tháng này" },
  ];

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#006397]">
            Tổng quan
          </p>

          <h1 className="mt-2 text-3xl font-black sm:text-4xl">
            Dashboard doanh số
          </h1>

          <p className="mt-3 text-sm leading-6 text-[#707881]">
            Đơn đã hủy được thống kê theo ngày tạo đơn, không
            phải ngày chuyển sang trạng thái hủy.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            void loadDashboard();
            void loadAdsSummary();
          }}
          disabled={loading || adsLoading}
          className="rounded-xl bg-[#edf4ff] px-4 py-3 text-sm font-bold text-[#006397] disabled:opacity-60"
        >
          {loading || adsLoading ? "Đang tải..." : "Làm mới"}
        </button>
      </div>

      <div className="mt-7 rounded-3xl bg-white p-5 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {presetButtons.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => applyPreset(item.id)}
              className={`rounded-xl px-4 py-2.5 text-sm font-bold transition ${
                preset === item.id
                  ? "bg-[#006397] text-white"
                  : "bg-[#edf4ff] text-[#006397]"
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-[1fr_1fr_auto]">
          <label className="text-sm font-bold">
            Từ ngày
            <input
              type="date"
              value={draftStart}
              onChange={(event) =>
                setDraftStart(event.target.value)
              }
              className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none focus:border-[#006397]"
            />
          </label>

          <label className="text-sm font-bold">
            Đến ngày
            <input
              type="date"
              value={draftEnd}
              onChange={(event) =>
                setDraftEnd(event.target.value)
              }
              className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none focus:border-[#006397]"
            />
          </label>

          <button
            type="button"
            onClick={applyCustomRange}
            className="min-h-11 self-end rounded-xl bg-[#203243] px-5 font-bold text-white"
          >
            Áp dụng
          </button>
        </div>

        <p className="mt-4 text-sm font-semibold text-[#3f4850]">
          Đang xem: {formatDateOnly(dateRange.start)} –{" "}
          {formatDateOnly(dateRange.end)}
        </p>
      </div>

      {error && (
        <p className="mt-5 rounded-2xl bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[#a43c12]">
          {error}
        </p>
      )}

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-[#707881]">
            Tổng đơn phát sinh
          </p>
          <p className="mt-3 text-3xl font-black text-[#091d2e]">
            {loading ? "…" : totalOrders}
          </p>
        </article>

        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-[#707881]">
            Đơn mới chưa xử lý
          </p>
          <p className="mt-3 text-3xl font-black text-[#006397]">
            {loading ? "…" : newOrders}
          </p>
        </article>

        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-[#707881]">
            Đơn đã hủy
          </p>
          <p className="mt-3 text-3xl font-black text-[#a43c12]">
            {loading ? "…" : cancelledOrders}
          </p>
        </article>
      </div>

      <section className="mt-6 overflow-hidden rounded-3xl border border-[#dfe8ef] bg-[linear-gradient(135deg,#f8fbff_0%,#ffffff_48%,#fff8f3_100%)] shadow-sm">
        <div className="grid gap-5 p-5 lg:grid-cols-[1.1fr_0.9fr] lg:p-6">
          <div className="rounded-[26px] bg-[#10283b] p-5 text-white sm:p-6">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#8fd5f4]">
                  Hiệu quả quảng cáo
                </p>
                <h2 className="mt-2 text-xl font-black">Chi phí Ads thực / đơn</h2>
              </div>
              <span className="rounded-full bg-white/10 px-3 py-1.5 text-xs font-bold text-[#d8edf7]">
                Cùng khoảng ngày đã chọn
              </span>
            </div>

            <div className="mt-7">
              {adsLoading ? (
                <p className="text-4xl font-black tracking-[-0.04em]">…</p>
              ) : adsDisplayTotals.length === 0 ? (
                <p className="text-2xl font-black text-[#ffd4c3]">Chưa thể tính</p>
              ) : totalOrders === 0 ? (
                <>
                  <p className="text-4xl font-black tracking-[-0.04em]">—</p>
                  <p className="mt-2 text-sm text-[#b9cbd7]">
                    Chưa có đơn phát sinh trong khoảng thời gian này.
                  </p>
                </>
              ) : (
                <div className="space-y-1">
                  {adsDisplayTotals.map((item) => (
                    <p
                      key={item.currency}
                      className="text-4xl font-black tracking-[-0.04em] sm:text-5xl"
                    >
                      {formatAdsMoney(item.spend / totalOrders, item.currency)}
                      <span className="ml-2 text-base font-bold text-[#b9cbd7]">/ đơn</span>
                    </p>
                  ))}
                </div>
              )}
            </div>

            <p className="mt-5 max-w-2xl text-sm leading-6 text-[#b9cbd7]">
              Tổng chi phí Meta Ads trong kỳ ÷ tổng số đơn phát sinh cùng kỳ.
              Không tách theo tài khoản quảng cáo.
            </p>

            {adsError ? (
              <p className="mt-4 rounded-2xl bg-[#ffb38f]/15 px-4 py-3 text-xs font-semibold leading-5 text-[#ffd4c3]">
                {adsError}
              </p>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">
            <article className="rounded-[24px] border border-[#e8edf2] bg-white p-5">
              <p className="text-sm font-bold text-[#718296]">Tổng chi phí Ads</p>
              <div className="mt-3 space-y-1">
                {adsLoading ? (
                  <p className="text-2xl font-black text-[#10283b]">…</p>
                ) : adsDisplayTotals.length > 0 ? (
                  adsDisplayTotals.map((item) => (
                    <p key={item.currency} className="text-2xl font-black text-[#fe6f3d]">
                      {formatAdsMoney(item.spend, item.currency)}
                    </p>
                  ))
                ) : (
                  <p className="text-lg font-black text-[#a43c12]">Chưa có dữ liệu</p>
                )}
              </div>
            </article>

            <article className="rounded-[24px] border border-[#e8edf2] bg-white p-5">
              <p className="text-sm font-bold text-[#718296]">Công thức đang dùng</p>
              <p className="mt-3 text-2xl font-black text-[#10283b]">
                {loading ? "…" : `${totalOrders} đơn`}
              </p>

              {!adsLoading && !loading && totalOrders > 0 && adsDisplayTotals.length > 0 ? (
                <div className="mt-3 space-y-1 text-xs font-semibold leading-5 text-[#718296]">
                  {adsDisplayTotals.map((item) => (
                    <p key={item.currency}>
                      {formatAdsMoney(item.spend, item.currency)} ÷ {totalOrders} ={" "}
                      {formatAdsMoney(item.spend / totalOrders, item.currency)}/đơn
                    </p>
                  ))}
                </div>
              ) : (
                <p className="mt-3 text-xs leading-5 text-[#82909d]">
                  Tổng Ads ÷ tổng đơn phát sinh trong đúng khoảng ngày đang xem.
                </p>
              )}
            </article>
          </div>
        </div>
      </section>

      <div className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#edf0f3] p-5">
          <div>
            <h2 className="text-xl font-black">
              Danh sách đơn trong khoảng đã chọn
            </h2>
            <p className="mt-1 text-sm text-[#707881]">
              Tối đa {PAGE_SIZE} đơn mỗi trang.
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
                <th className="px-5 py-4">Giá trị đơn</th>
                <th className="px-5 py-4">Trạng thái</th>
                <th className="px-5 py-4">Ngày tạo</th>
                <th className="px-5 py-4 text-right">
                  Thao tác
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#edf0f3]">
              {loading && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-12 text-center text-[#707881]"
                  >
                    Đang tải dữ liệu...
                  </td>
                </tr>
              )}

              {!loading &&
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

                    <td className="px-5 py-4 font-bold">
                      {formatCurrency(order.total)}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                          statusClasses[order.status]
                        }`}
                      >
                        {statusLabels[order.status]}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-[#3f4850]">
                      {formatDateTime(order.createdAt)}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <button
                        type="button"
                        onClick={() => void openOrderDialog(order.code)}
                        className="font-bold text-[#006397] transition hover:text-[#004d77]"
                      >
                        Mở đơn
                      </button>
                    </td>
                  </tr>
                ))}

              {!loading && orders.length === 0 && (
                <tr>
                  <td
                    colSpan={7}
                    className="px-5 py-12 text-center text-[#707881]"
                  >
                    Không có đơn hàng trong khoảng thời gian này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {!loading && totalOrders > PAGE_SIZE && (
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

      <OrderDetailDialog
        open={orderDialogOpen}
        order={selectedOrder}
        loading={orderDialogLoading}
        error={orderDialogError}
        onClose={closeOrderDialog}
      />
    </section>
  );
}