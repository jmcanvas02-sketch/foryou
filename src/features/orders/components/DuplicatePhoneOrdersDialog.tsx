import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import type {
  DuplicatePhoneOrderSummary,
  OrderStatus,
} from "../../../types/store";
import { formatCurrency } from "../../../utils/currency";

type ActionResult = {
  success: boolean;
  message: string;
  data?: DuplicatePhoneOrderSummary[];
};

type DuplicatePhoneOrdersDialogProps = {
  phone: string;
  loadOrders: (phone: string) => Promise<ActionResult>;
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
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function DuplicatePhoneOrdersDialog({
  phone,
  loadOrders,
  onClose,
}: DuplicatePhoneOrdersDialogProps) {
  const loadOrdersRef = useRef(loadOrders);
  const [orders, setOrders] = useState<DuplicatePhoneOrderSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");

  useEffect(() => {
    loadOrdersRef.current = loadOrders;
  }, [loadOrders]);

  useEffect(() => {
    let active = true;

    void loadOrdersRef.current(phone).then((result) => {
      if (!active) return;

      setLoading(false);

      if (!result.success || !result.data) {
        setMessage(result.message);
        return;
      }

      setOrders(result.data);
    });

    return () => {
      active = false;
    };
  }, [phone]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-[#091d2e]/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="duplicate-phone-orders-title"
    >
      <div className="flex max-h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#e3e8ee] px-5 py-4 sm:px-7">
          <div>
            <h2
              id="duplicate-phone-orders-title"
              className="text-2xl font-black"
            >
              Đơn hàng trùng SĐT
            </h2>
            <p className="mt-1 text-sm text-[#707881]">
              Số điện thoại:{" "}
              <strong className="text-[#3f4850]">{phone}</strong>
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#edf0f3] text-xl font-bold"
            aria-label="Đóng danh sách đơn hàng trùng SĐT"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
          {loading && (
            <p className="rounded-2xl bg-[#f7f9ff] px-4 py-8 text-center text-sm text-[#707881]">
              Đang tải các đơn hàng cùng số điện thoại...
            </p>
          )}

          {!loading && message && (
            <p className="rounded-2xl bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[#a43c12]">
              {message}
            </p>
          )}

          {!loading && !message && (
            <>
              <p className="mb-4 text-sm text-[#3f4850]">
                Tìm thấy <strong>{orders.length}</strong> đơn hàng dùng đúng số
                điện thoại này.
              </p>

              <div className="overflow-x-auto rounded-2xl border border-[#e3e8ee]">
                <table className="min-w-[760px] w-full text-left text-sm">
                  <thead className="bg-[#edf4ff] text-[#3f4850]">
                    <tr>
                      <th className="px-4 py-3">Mã đơn</th>
                      <th className="px-4 py-3">Khách hàng</th>
                      <th className="px-4 py-3">Ngày tạo</th>
                      <th className="px-4 py-3">Trạng thái</th>
                      <th className="px-4 py-3 text-right">Tổng tiền</th>
                      <th className="px-4 py-3 text-right">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf0f3]">
                    {orders.map((order) => (
                      <tr key={order.id}>
                        <td className="px-4 py-3 font-black text-[#006397]">
                          {order.code}
                        </td>
                        <td className="px-4 py-3">
                          <p className="font-bold">{order.customerName}</p>
                          <p className="mt-1 text-xs text-[#707881]">
                            {order.phone}
                          </p>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-[#3f4850]">
                          {formatDate(order.createdAt)}
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusClasses[order.status]}`}
                          >
                            {statusLabels[order.status]}
                          </span>
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-right font-bold">
                          {formatCurrency(order.total)}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <Link
                            to={`/admin/don-hang/${order.code}`}
                            onClick={onClose}
                            className="inline-flex rounded-xl bg-[#edf4ff] px-3 py-2 font-bold text-[#006397]"
                          >
                            Chi tiết
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="flex justify-end border-t border-[#e3e8ee] px-5 py-4 sm:px-7">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl bg-[#edf0f3] px-5 py-3 text-sm font-bold"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
