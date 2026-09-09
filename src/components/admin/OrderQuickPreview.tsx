import { useEffect, useId, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import type { OrderStatus, StoreOrder } from "../../types/store";
import { formatCurrency } from "../../utils/currency";

type OrderQuickPreviewProps = {
  order: StoreOrder;
  shortCode: string;
};

type PopoverPosition = {
  left: number;
  top?: number;
  bottom?: number;
  width: number;
  maxHeight: number;
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
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function itemOptionSummary(order: StoreOrder) {
  const firstItem = order.items[0];
  if (!firstItem) return "Đơn chưa có sản phẩm";

  const parts = [`SL ${firstItem.quantity}`];

  if (firstItem.selectedVariants.length > 0) {
    parts.push(
      firstItem.selectedVariants
        .map(
          (variant) =>
            `${variant.groupName}: ${variant.optionLabel}`,
        )
        .join(" · "),
    );
  }

  if (firstItem.selectedCustomOptions?.text) {
    parts.push(
      `${firstItem.selectedCustomOptions.text.label}: ${firstItem.selectedCustomOptions.text.value}`,
    );
  }

  if (order.items.length > 1) {
    parts.push(`+${order.items.length - 1} sản phẩm khác`);
  }

  return parts.join(" · ");
}

function orderAddress(order: StoreOrder) {
  return [
    order.customer.addressDetail,
    order.customer.ward,
    order.customer.district,
    order.customer.province,
  ]
    .filter(Boolean)
    .join(", ");
}

function calculatePopoverPosition(
  trigger: HTMLElement,
): PopoverPosition {
  const rect = trigger.getBoundingClientRect();
  const viewportGap = 12;
  const anchorGap = 8;
  const width = Math.min(
    560,
    Math.max(280, window.innerWidth - viewportGap * 2),
  );
  const left = Math.min(
    Math.max(viewportGap, rect.left),
    Math.max(viewportGap, window.innerWidth - width - viewportGap),
  );
  const spaceBelow =
    window.innerHeight - rect.bottom - anchorGap - viewportGap;
  const spaceAbove =
    rect.top - anchorGap - viewportGap;
  const placeAbove =
    spaceBelow < 300 && spaceAbove > spaceBelow;
  const availableHeight = Math.max(
    220,
    placeAbove ? spaceAbove : spaceBelow,
  );

  return {
    left,
    width,
    maxHeight: Math.min(560, availableHeight),
    ...(placeAbove
      ? {
          bottom:
            window.innerHeight - rect.top + anchorGap,
        }
      : { top: rect.bottom + anchorGap }),
  };
}

export default function OrderQuickPreview({
  order,
  shortCode,
}: OrderQuickPreviewProps) {
  const previewId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeTimerRef = useRef<number | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] =
    useState<PopoverPosition | null>(null);

  const firstItem = order.items[0];
  const totalQuantity = order.items.reduce(
    (sum, item) => sum + item.quantity,
    0,
  );

  function cancelScheduledClose() {
    if (closeTimerRef.current !== null) {
      window.clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }

  function openPreview() {
    cancelScheduledClose();

    const trigger = triggerRef.current;
    if (trigger) {
      setPosition(calculatePopoverPosition(trigger));
    }

    setOpen(true);
  }

  function togglePreview() {
    cancelScheduledClose();

    if (open) {
      setOpen(false);
      return;
    }

    const trigger = triggerRef.current;
    if (trigger) {
      setPosition(calculatePopoverPosition(trigger));
    }

    setOpen(true);
  }

  function scheduleClose() {
    cancelScheduledClose();
    closeTimerRef.current = window.setTimeout(() => {
      setOpen(false);
      closeTimerRef.current = null;
    }, 140);
  }

  useEffect(() => {
    return () => {
      if (closeTimerRef.current !== null) {
        window.clearTimeout(closeTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const trigger = triggerRef.current;
      if (!trigger) return;

      setPosition(calculatePopoverPosition(trigger));
    }

    window.addEventListener("resize", updatePosition);
    window.addEventListener("scroll", updatePosition, true);

    return () => {
      window.removeEventListener("resize", updatePosition);
      window.removeEventListener("scroll", updatePosition, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        triggerRef.current?.focus();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [open]);

  const popoverStyle: CSSProperties | undefined = position
    ? {
        left: position.left,
        top: position.top,
        bottom: position.bottom,
        width: position.width,
        maxHeight: position.maxHeight,
      }
    : undefined;

  const preview =
    open &&
    position &&
    typeof document !== "undefined"
      ? createPortal(
          <aside
            id={previewId}
            role="dialog"
            aria-label={`Xem nhanh đơn hàng ${order.code}`}
            tabIndex={-1}
            onMouseEnter={openPreview}
            onMouseLeave={scheduleClose}
            onFocus={openPreview}
            onBlur={scheduleClose}
            className="fixed z-[100] overflow-y-auto rounded-3xl border border-[#dbe3ea] bg-white p-5 text-left text-sm text-[#091d2e] shadow-[0_24px_80px_rgba(9,29,46,0.22)]"
            style={popoverStyle}
          >
            <div className="flex items-start justify-between gap-4 border-b border-[#e7ebef] pb-4">
              <div className="min-w-0">
                <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#707881]">
                  Xem nhanh đơn hàng
                </p>
                <p className="mt-1 break-all text-lg font-black text-[#006397]">
                  {order.code}
                </p>
                <p className="mt-1 text-xs text-[#707881]">
                  {formatDate(order.createdAt)} · COD
                </p>
              </div>
              <span
                className={`shrink-0 rounded-full px-3 py-1 text-xs font-bold ${statusClasses[order.status]}`}
              >
                {statusLabels[order.status]}
              </span>
            </div>

            <section className="mt-4">
              <div className="flex items-center justify-between gap-3">
                <h3 className="font-black">
                  Sản phẩm ({order.items.length})
                </h3>
                <span className="text-xs font-bold text-[#707881]">
                  Tổng SL {totalQuantity}
                </span>
              </div>

              <div className="mt-3 space-y-3">
                {order.items.map((item) => (
                  <article
                    key={item.key}
                    className="rounded-2xl border border-[#e7ebef] bg-[#fafcff] p-3"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-bold leading-5">
                          {item.name}
                        </p>

                        {item.selectedVariants.length > 0 && (
                          <p className="mt-1 text-xs leading-5 text-[#59636d]">
                            {item.selectedVariants
                              .map(
                                (variant) =>
                                  `${variant.groupName}: ${variant.optionLabel}`,
                              )
                              .join(" · ")}
                          </p>
                        )}

                        {item.selectedCustomOptions?.text && (
                          <div className="mt-2 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-[#3f4850]">
                            <p>
                              <span className="font-bold text-[#091d2e]">
                                {item.selectedCustomOptions.text.label}:
                              </span>{" "}
                              {item.selectedCustomOptions.text.value}
                            </p>

                            {item.selectedCustomOptions.color && (
                              <p>
                                <span className="font-bold text-[#091d2e]">
                                  Màu chữ:
                                </span>{" "}
                                {item.selectedCustomOptions.color.name}
                              </p>
                            )}
                          </div>
                        )}
                      </div>

                      <strong className="shrink-0 text-right">
                        {formatCurrency(
                          item.unitPrice * item.quantity,
                        )}
                      </strong>
                    </div>

                    <p className="mt-2 text-xs text-[#707881]">
                      {item.quantity} ×{" "}
                      {formatCurrency(item.unitPrice)}
                    </p>
                  </article>
                ))}
              </div>
            </section>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <section className="rounded-2xl bg-[#f7f9ff] p-4">
                <h3 className="font-black">Khách hàng</h3>
                <p className="mt-2 font-bold">
                  {order.customer.fullName}
                </p>
                <p className="mt-1 text-xs text-[#59636d]">
                  {order.customer.phone}
                </p>
                <p className="mt-2 text-xs leading-5 text-[#59636d]">
                  {orderAddress(order)}
                </p>
                {order.customer.note && (
                  <p className="mt-2 text-xs leading-5 text-[#a43c12]">
                    Ghi chú: {order.customer.note}
                  </p>
                )}
              </section>

              <section className="rounded-2xl bg-[#f7f9ff] p-4">
                <h3 className="font-black">Thanh toán</h3>
                <dl className="mt-2 space-y-2 text-xs">
                  <div className="flex justify-between gap-3">
                    <dt>Tiền sản phẩm</dt>
                    <dd className="font-bold">
                      {formatCurrency(order.subtotal)}
                    </dd>
                  </div>

                  {order.discount > 0 && (
                    <div className="flex justify-between gap-3 text-[#14633d]">
                      <dt>Giảm giá</dt>
                      <dd className="font-bold">
                        −{formatCurrency(order.discount)}
                      </dd>
                    </div>
                  )}

                  <div className="flex justify-between gap-3">
                    <dt>Phí vận chuyển</dt>
                    <dd className="font-bold">
                      {formatCurrency(order.shipping)}
                    </dd>
                  </div>

                  <div className="flex justify-between gap-3 border-t border-[#dce3ea] pt-2 text-sm">
                    <dt className="font-black">Tổng cộng</dt>
                    <dd className="font-black text-[#a43c12]">
                      {formatCurrency(order.total)}
                    </dd>
                  </div>
                </dl>
              </section>
            </div>

            <div className="mt-4 flex justify-end border-t border-[#e7ebef] pt-4">
              <Link
                to={`/admin/don-hang/${order.code}`}
                className="inline-flex rounded-xl bg-[#006397] px-4 py-2 font-bold text-white"
              >
                Xem chi tiết đầy đủ
              </Link>
            </div>
          </aside>,
          document.body,
        )
      : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={previewId}
        onMouseEnter={openPreview}
        onMouseLeave={scheduleClose}
        onFocus={openPreview}
        onBlur={scheduleClose}
        onClick={togglePreview}
        className="group block max-w-56 text-left outline-none"
      >
        <span className="block font-black text-[#006397] group-focus-visible:underline">
          {shortCode}
        </span>

        <span
          className="mt-1 block max-w-52 truncate text-xs font-bold text-[#3f4850]"
          title={firstItem?.name ?? "Đơn chưa có sản phẩm"}
        >
          {firstItem?.name ?? "Đơn chưa có sản phẩm"}
        </span>

        <span
          className="mt-1 block max-w-52 truncate text-[11px] font-normal text-[#707881]"
          title={itemOptionSummary(order)}
        >
          {itemOptionSummary(order)}
        </span>
      </button>

      {preview}
    </>
  );
}
