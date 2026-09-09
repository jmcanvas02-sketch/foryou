import { useEffect } from "react";
import type { OrderStatus, StoreOrder } from "../../../types/store";
import { formatCurrency } from "../../../utils/currency";

type OrderDetailDialogProps = {
  open: boolean;
  order: StoreOrder | null;
  loading: boolean;
  error: string;
  onClose: () => void;
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

export function OrderDetailDialog({
  open,
  order,
  loading,
  error,
  onClose,
}: OrderDetailDialogProps) {
  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
      }
    };

    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, open]);

  if (!open) return null;

  const address = order
    ? [
        order.customer.addressDetail,
        order.customer.ward,
        order.customer.district,
        order.customer.province,
      ]
        .filter(Boolean)
        .join(", ")
    : "";

  return (
    <div
      className="fixed inset-0 z-[80] flex items-center justify-center bg-[#07141f]/60 p-3 backdrop-blur-[2px] sm:p-6"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Chi tiết đơn hàng"
        className="flex max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-[28px] bg-[#f6f8fb] shadow-[0_32px_100px_rgba(7,20,31,0.32)]"
      >
        <header className="flex items-start justify-between gap-4 border-b border-[#e5eaf0] bg-white px-5 py-4 sm:px-7 sm:py-5">
          <div className="min-w-0">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-[#006397]">
              Chi tiết đơn hàng
            </p>
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <h2 className="truncate text-2xl font-black text-[#10283b] sm:text-3xl">
                {order?.code ?? "Đang tải..."}
              </h2>
              {order ? (
                <span
                  className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusClasses[order.status]}`}
                >
                  {statusLabels[order.status]}
                </span>
              ) : null}
            </div>
            {order ? (
              <p className="mt-1.5 text-sm text-[#718296]">
                Tạo lúc {formatDate(order.createdAt)}
              </p>
            ) : null}
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Đóng chi tiết đơn hàng"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#edf1f5] text-xl font-black text-[#526578] transition hover:bg-[#dfe6ed]"
          >
            ×
          </button>
        </header>

        <div className="overflow-y-auto p-4 sm:p-6">
          {loading ? (
            <div className="grid min-h-[320px] place-items-center rounded-3xl border border-[#e7ebf0] bg-white">
              <div className="text-center">
                <div className="mx-auto h-9 w-9 animate-spin rounded-full border-4 border-[#d9e7ef] border-t-[#006397]" />
                <p className="mt-4 text-sm font-bold text-[#718296]">
                  Đang tải chi tiết đơn hàng...
                </p>
              </div>
            </div>
          ) : error ? (
            <div className="grid min-h-[260px] place-items-center rounded-3xl border border-[#ffd5cd] bg-[#fff5f2] p-6 text-center">
              <div>
                <p className="text-lg font-black text-[#a43c12]">
                  Không thể mở đơn
                </p>
                <p className="mt-2 max-w-lg text-sm leading-6 text-[#8a5948]">
                  {error}
                </p>
              </div>
            </div>
          ) : order ? (
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_350px]">
              <div className="space-y-5">
                <article className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <h3 className="text-lg font-black text-[#10283b]">Sản phẩm</h3>
                      <p className="mt-1 text-xs text-[#82909d]">
                        {order.items.reduce((total, item) => total + item.quantity, 0)} sản phẩm trong đơn
                      </p>
                    </div>
                    <strong className="text-lg font-black text-[#006397]">
                      {formatCurrency(order.total)}
                    </strong>
                  </div>

                  <div className="mt-5 space-y-3">
                    {order.items.map((item) => (
                      <div
                        key={item.key}
                        className="flex gap-4 rounded-2xl border border-[#edf0f3] p-4"
                      >
                        <div
                          className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-xl text-3xl"
                          style={{ backgroundColor: item.background }}
                        >
                          {item.imageUrl ? (
                            <img src={item.imageUrl} alt={item.name} className="h-full w-full object-cover" />
                          ) : (
                            item.emoji
                          )}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="font-black text-[#10283b]">{item.name}</p>

                          {item.selectedVariants.length > 0 ? (
                            <p className="mt-1 text-xs leading-5 text-[#718296]">
                              {item.selectedVariants
                                .map((variant) => `${variant.groupName}: ${variant.optionLabel}`)
                                .join(" · ")}
                            </p>
                          ) : null}

                          {item.selectedCustomOptions?.text ? (
                            <div className="mt-2 space-y-1 rounded-xl bg-[#f7f9ff] px-3 py-2 text-xs leading-5 text-[#3f4850]">
                              <p>
                                <span className="font-bold text-[#10283b]">
                                  {item.selectedCustomOptions.text.label}:
                                </span>{" "}
                                {item.selectedCustomOptions.text.value}
                              </p>
                              {item.selectedCustomOptions.color ? (
                                <p>
                                  <span className="font-bold text-[#10283b]">Màu chữ:</span>{" "}
                                  {item.selectedCustomOptions.color.name}
                                </p>
                              ) : null}
                              {item.selectedCustomOptions.text.priceDelta > 0 ? (
                                <p className="font-semibold text-[#a43c12]">
                                  Phụ phí text: +{formatCurrency(item.selectedCustomOptions.text.priceDelta)}
                                </p>
                              ) : null}
                            </div>
                          ) : null}

                          <p className="mt-2 text-sm text-[#526578]">
                            {item.quantity} × {formatCurrency(item.unitPrice)}
                          </p>
                        </div>

                        <strong className="shrink-0 text-sm text-[#10283b]">
                          {formatCurrency(item.unitPrice * item.quantity)}
                        </strong>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-3xl bg-white p-5 shadow-sm sm:p-6">
                  <h3 className="text-lg font-black text-[#10283b]">Lịch sử trạng thái</h3>
                  <div className="mt-4 space-y-2">
                    {[...order.statusHistory].reverse().map((entry, index) => (
                      <div
                        key={`${entry.changedAt}-${index}`}
                        className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#f7f9ff] px-4 py-3"
                      >
                        <span className="font-bold text-[#10283b]">{statusLabels[entry.status]}</span>
                        <span className="text-xs text-[#718296]">{formatDate(entry.changedAt)}</span>
                      </div>
                    ))}
                  </div>
                </article>
              </div>

              <aside className="space-y-5">
                <article className="rounded-3xl bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-black text-[#10283b]">Khách hàng</h3>
                  <dl className="mt-4 space-y-4 text-sm">
                    <div>
                      <dt className="text-[#82909d]">Họ tên</dt>
                      <dd className="mt-1 font-black text-[#10283b]">{order.customer.fullName}</dd>
                    </div>
                    <div>
                      <dt className="text-[#82909d]">Số điện thoại</dt>
                      <dd className="mt-1 font-black text-[#006397]">{order.customer.phone}</dd>
                    </div>
                    <div>
                      <dt className="text-[#82909d]">Địa chỉ gốc</dt>
                      <dd className="mt-1 leading-6 text-[#31475a]">{address || "Chưa có"}</dd>
                    </div>
                    {order.normalizedAddress ? (
                      <div className="rounded-2xl bg-[#f7f9ff] p-4">
                        <dt className="font-bold text-[#10283b]">Địa chỉ đã chuẩn hóa</dt>
                        <dd className="mt-2 leading-6 text-[#526578]">
                          {[
                            order.normalizedAddress.addressDetail,
                            order.normalizedAddress.ward,
                            order.normalizedAddress.district,
                            order.normalizedAddress.province,
                          ]
                            .filter(Boolean)
                            .join(", ")}
                        </dd>
                      </div>
                    ) : null}
                    <div>
                      <dt className="text-[#82909d]">Ghi chú</dt>
                      <dd className="mt-1 whitespace-pre-wrap leading-6 text-[#31475a]">
                        {order.customer.note || "Không có"}
                      </dd>
                    </div>
                  </dl>
                </article>

                <article className="rounded-3xl bg-white p-5 shadow-sm">
                  <h3 className="text-lg font-black text-[#10283b]">Thanh toán</h3>
                  <dl className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-[#718296]">Tiền sản phẩm</dt>
                      <dd className="font-bold">{formatCurrency(order.subtotal)}</dd>
                    </div>
                    {order.discount > 0 ? (
                      <div className="flex items-center justify-between gap-4">
                        <dt className="text-[#718296]">
                          Giảm giá{order.couponCode ? ` (${order.couponCode})` : ""}
                        </dt>
                        <dd className="font-bold text-[#14633d]">−{formatCurrency(order.discount)}</dd>
                      </div>
                    ) : null}
                    <div className="flex items-center justify-between gap-4">
                      <dt className="text-[#718296]">Phí vận chuyển</dt>
                      <dd className="font-bold">
                        {order.shipping === 0 ? "Miễn phí" : formatCurrency(order.shipping)}
                      </dd>
                    </div>
                    <div className="border-t border-[#edf0f3] pt-3">
                      <div className="flex items-end justify-between gap-4">
                        <dt className="font-black text-[#10283b]">Tổng COD</dt>
                        <dd className="text-xl font-black text-[#a43c12]">
                          {formatCurrency(order.total)}
                        </dd>
                      </div>
                    </div>
                  </dl>
                </article>
              </aside>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}