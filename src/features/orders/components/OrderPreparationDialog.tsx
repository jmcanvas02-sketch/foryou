import { useState } from "react";
import { createPortal } from "react-dom";
import type { StoreOrder } from "../../../types/store";
import OrderPreparationSlip from "./OrderPreparationSlip";

type OrderPreparationDialogProps = {
  orders: StoreOrder[];
  onClose: () => void;
  onStartPreparing: () => Promise<boolean>;
  onFinished: () => void;
};

export default function OrderPreparationDialog({
  orders,
  onClose,
  onStartPreparing,
  onFinished,
}: OrderPreparationDialogProps) {
  const [starting, setStarting] = useState(false);
  const hasOrderToStart = orders.some((order) => order.status !== "prepared");

  function handleReprint() {
    if (starting || orders.length === 0) return;
    window.print();
    onFinished();
  }

  async function handleStartPreparingAndPrint() {
    if (starting || !hasOrderToStart) return;

    setStarting(true);
    const success = await onStartPreparing();
    setStarting(false);

    if (!success) return;

    window.print();
    onFinished();
  }

  return (
    <>
      <div
        className="order-preparation-dialog-root fixed inset-0 z-[80] flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-7"
      role="dialog"
      aria-modal="true"
      aria-label="Xem trước phiếu chuẩn bị đơn"
    >
      <style>{`
        .order-preparation-print-root {
          display: none;
        }

        @page {
          size: A7 portrait;
          margin: 2mm;
        }

        @media print {
          html,
          body {
            margin: 0 !important;
            padding: 0 !important;
            width: auto !important;
            height: auto !important;
            overflow: visible !important;
            background: #fff !important;
          }

          /*
           * Print root được portal trực tiếp vào document.body.
           * Vì vậy có thể loại toàn bộ app khỏi layout in thay vì chỉ visibility:hidden.
           * visibility:hidden vẫn chiếm chiều cao và chính là nguyên nhân tạo nhiều trang trắng.
           */
          body > * {
            display: none !important;
          }

          body > .order-preparation-print-root {
            display: block !important;
          }

          .order-preparation-print-root {
            position: static !important;
            width: 70mm !important;
            height: auto !important;
            margin: 0 auto !important;
            padding: 0 !important;
            overflow: visible !important;
          }

          .order-preparation-page {
            display: block !important;
            box-sizing: border-box !important;
            width: 70mm !important;
            height: 101mm !important;
            min-height: 101mm !important;
            max-height: 101mm !important;
            margin: 0 !important;
            overflow: hidden !important;
            break-inside: avoid-page !important;
            page-break-inside: avoid !important;
            break-after: page !important;
            page-break-after: always !important;
          }

          .order-preparation-page:last-child {
            break-after: auto !important;
            page-break-after: auto !important;
          }
        }
      `}</style>

      <div className="order-preparation-screen-only w-full max-w-5xl rounded-3xl bg-[#f3f6f8] shadow-2xl">
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-3 rounded-t-3xl border-b border-[#dce3e8] bg-white px-5 py-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#006397]">
              Chuẩn bị đơn hàng
            </p>
            <h2 className="mt-1 text-xl font-black">
              Xem trước {orders.length} phiếu A7
            </h2>
            <p className="mt-1 text-xs text-[#707881]">
              Mỗi đơn là một phiếu. Khi bắt đầu chuẩn bị, hệ thống cập nhật trạng thái trước rồi mới mở hộp thoại máy in.
            </p>
          </div>

          <button
            type="button"
            onClick={onClose}
            disabled={starting}
            className="rounded-xl border border-[#d7dee6] bg-white px-4 py-2 text-sm font-bold disabled:opacity-60"
          >
            Đóng
          </button>
        </header>

        <div className="grid gap-5 p-5 lg:grid-cols-2">
          {orders.map((order) => (
            <div
              key={order.id ?? order.code}
              className="mx-auto w-full max-w-[360px] rounded-2xl bg-white p-4 shadow-sm"
            >
              <div className="mx-auto aspect-[74/105] w-full overflow-auto border border-[#cfd6dd] bg-white p-[3%] shadow-inner">
                <OrderPreparationSlip order={order} />
              </div>
            </div>
          ))}
        </div>

        <footer className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-b-3xl border-t border-[#dce3e8] bg-white px-5 py-4">
          <p className="max-w-xl text-xs leading-5 text-[#707881]">
            Mở preview không tự đổi trạng thái. Sau khi bắt đầu làm đơn, chuyển các đơn chưa hoàn tất sang
            <strong className="text-[#a43c12]"> Đang chuẩn bị</strong>. Khi làm xong, chọn
            <strong className="text-[#006b82]"> Đã chuẩn bị</strong> trong trạng thái đơn.
          </p>

          <div className="flex flex-wrap justify-end gap-2">
            {hasOrderToStart ? (
              <button
                type="button"
                onClick={() => void handleStartPreparingAndPrint()}
                disabled={starting || orders.length === 0}
                className="h-11 rounded-xl bg-[#a43c12] px-5 text-sm font-black text-white disabled:opacity-50"
              >
                {starting ? "Đang cập nhật..." : "Bắt đầu chuẩn bị & in"}
              </button>
            ) : (
              <button
                type="button"
                onClick={handleReprint}
                disabled={starting || orders.length === 0}
                className="h-11 rounded-xl border border-[#006397] bg-white px-5 text-sm font-black text-[#006397] disabled:opacity-60"
              >
                In lại phiếu A7
              </button>
            )}
          </div>
        </footer>
      </div>

      </div>

      {typeof document !== "undefined" &&
        createPortal(
          <div className="order-preparation-print-root" aria-hidden="true">
            {orders.map((order) => (
              <OrderPreparationSlip key={order.id ?? order.code} order={order} />
            ))}
          </div>,
          document.body,
        )}
    </>
  );
}