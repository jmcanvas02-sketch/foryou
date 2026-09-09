import { useMemo, useState } from "react";
import type { OrderStatus, StoreOrder } from "../../../types/store";
import {
  normalizedAddressStatusClass,
  normalizedAddressStatusLabel,
} from "../addressNormalization";
import {
  exportOrdersToSpx,
  getMissingSpxAddressFields,
  getSpxAddress,
} from "../spxExport";

type ActionResult = {
  success: boolean;
  message: string;
};

type SpxExportDialogProps = {
  orders: StoreOrder[];
  onClose: () => void;
  onMarkShipping: (
    ids: string[],
    status: OrderStatus,
  ) => Promise<ActionResult>;
  onExported: (
    exportedCount: number,
    skippedShippingCount: number,
    skippedCompletedCount: number,
    skippedUnreachableCount: number,
  ) => void;
};

export default function SpxExportDialog({
  orders,
  onClose,
  onMarkShipping,
  onExported,
}: SpxExportDialogProps) {
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");

  const exportableOrders = useMemo(
    () =>
      orders.filter(
        (order) =>
          order.status !== "unreachable" &&
          order.status !== "shipping" &&
          order.status !== "completed",
      ),
    [orders],
  );
  const skippedShippingCount = orders.filter(
    (order) => order.status === "shipping",
  ).length;
  const skippedCompletedCount = orders.filter(
    (order) => order.status === "completed",
  ).length;
  const skippedUnreachableCount = orders.filter(
    (order) => order.status === "unreachable",
  ).length;
  const skippedCount =
    skippedShippingCount +
    skippedCompletedCount +
    skippedUnreachableCount;
  const rows = useMemo(
    () =>
      exportableOrders.map((order) => ({
        order,
        address: getSpxAddress(order),
        missingFields: getMissingSpxAddressFields(order),
      })),
    [exportableOrders],
  );
  const incompleteCount = rows.filter(
    (row) => row.missingFields.length > 0,
  ).length;

  async function exportFile() {
    if (exporting) return;

    setExporting(true);
    setMessage("");

    try {
      const result = await exportOrdersToSpx(exportableOrders, {
        beforeDownload: async (exportedOrders) => {
          const idsToMarkShipping = exportedOrders
            .map((order) => order.id)
            .filter((id): id is string => Boolean(id));

          if (idsToMarkShipping.length === 0) return;

          const updateResult = await onMarkShipping(
            idsToMarkShipping,
            "shipping",
          );

          if (!updateResult.success) {
            throw new Error(
              `Chưa tải file vì không thể chuyển đơn sang Đang giao: ${updateResult.message}`,
            );
          }
        },
      });

      onExported(
        result.exportedCount,
        skippedShippingCount,
        skippedCompletedCount,
        skippedUnreachableCount,
      );
    } catch (error) {
      setMessage(
        error instanceof Error
          ? error.message
          : "Không thể tạo file SPX.",
      );
    } finally {
      setExporting(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#091d2e]/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="spx-export-title"
    >
      <div className="flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#e3e8ee] px-5 py-4 sm:px-7">
          <div>
            <h2 id="spx-export-title" className="text-2xl font-black">
              Xuất file SPX
            </h2>
            <p className="mt-1 text-sm text-[#707881]">
              Đơn Không gọi được, Đang giao và Thành công bị loại khỏi file.
              Các đơn đủ điều kiện sẽ được chuyển sang trạng thái Đang giao
              trước khi tải file.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={exporting}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#edf0f3] text-xl font-bold disabled:opacity-50"
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-auto p-5 sm:p-7">
          {skippedCount > 0 && (
            <p className="mb-5 rounded-2xl bg-[#fff1b8] px-4 py-3 text-sm font-semibold text-[#7a5200]">
              Đã loại {skippedUnreachableCount} đơn Không gọi được,{" "}
              {skippedShippingCount} đơn Đang giao và{" "}
              {skippedCompletedCount} đơn Thành công. File chỉ còn{" "}
              {exportableOrders.length} đơn đủ điều kiện xuất.
            </p>
          )}

          {incompleteCount > 0 && (
            <p className="mb-5 rounded-2xl bg-[#fff1b8] px-4 py-3 text-sm font-semibold text-[#7a5200]">
              Có {incompleteCount} đơn thiếu thành phần địa chỉ SPX. Bạn vẫn có
              thể xuất, nhưng nên chuẩn hóa trước để hạn chế SPX từ chối file.
            </p>
          )}

          {rows.length === 0 ? (
            <div className="rounded-2xl bg-[#fff0eb] px-5 py-10 text-center text-sm font-semibold text-[#a43c12]">
              Không còn đơn nào đủ điều kiện xuất SPX vì toàn bộ đơn đã chọn
              đang ở trạng thái Không gọi được, Đang giao hoặc Thành công.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-2xl border border-[#d7dee6]">
              <table className="min-w-[980px] w-full text-left text-sm">
                <thead className="bg-[#edf4ff] text-[#3f4850]">
                  <tr>
                    <th className="px-4 py-3">STT</th>
                    <th className="px-4 py-3">Đơn hàng</th>
                    <th className="px-4 py-3">Trạng thái địa chỉ</th>
                    <th className="px-4 py-3">Nguồn dùng khi xuất</th>
                    <th className="px-4 py-3">Địa chỉ đưa vào SPX</th>
                    <th className="px-4 py-3">Kiểm tra</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#edf0f3]">
                  {rows.map(({ order, address, missingFields }, index) => (
                    <tr key={order.id ?? order.code}>
                      <td className="px-4 py-4 font-bold">{index + 1}</td>
                      <td className="px-4 py-4">
                        <p className="font-black">{order.code}</p>
                        <p className="mt-1 text-xs text-[#707881]">
                          {order.customer.fullName} · {order.customer.phone}
                        </p>
                      </td>
                      <td className="px-4 py-4">
                        <span
                          className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${normalizedAddressStatusClass(order)}`}
                        >
                          {normalizedAddressStatusLabel(order)}
                        </span>
                      </td>
                      <td className="px-4 py-4 font-semibold">
                        {address.usesNormalizedAddress
                          ? "Địa chỉ chuẩn hóa"
                          : "Địa chỉ gốc"}
                      </td>
                      <td className="max-w-md px-4 py-4 leading-6">
                        {[
                          address.addressDetail,
                          address.ward,
                          address.district,
                          address.province,
                        ]
                          .filter(Boolean)
                          .join(", ") || "Chưa có địa chỉ"}
                      </td>
                      <td className="px-4 py-4">
                        {missingFields.length === 0 ? (
                          <span className="font-bold text-[#14633d]">
                            Đủ 4 phần
                          </span>
                        ) : (
                          <span className="font-semibold text-[#a43c12]">
                            Thiếu: {missingFields.join(", ")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="mt-5 grid gap-3 rounded-2xl bg-[#f7f9ff] p-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
            <p>
              <strong>Trọng lượng:</strong> 1 KG
            </p>
            <p>
              <strong>Giao một phần:</strong> N
            </p>
            <p>
              <strong>Thử hàng:</strong> N
            </p>
            <p>
              <strong>Xem hàng:</strong> Y
            </p>
            <p>
              <strong>Phí từ chối:</strong> 30.000
            </p>
            <p>
              <strong>Thu COD:</strong> Y
            </p>
            <p>
              <strong>Thanh toán:</strong> Người gửi trả
            </p>
            <p>
              <strong>COD:</strong> Tổng tiền đơn hàng
            </p>
          </div>
        </div>

        <div className="border-t border-[#e3e8ee] px-5 py-4 sm:px-7">
          {message && (
            <p className="mb-3 rounded-xl bg-[#fff0eb] px-3 py-2 text-sm font-semibold text-[#a43c12]">
              {message}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={exporting}
              className="rounded-xl bg-[#edf0f3] px-5 py-3 text-sm font-bold disabled:opacity-50"
            >
              Đóng
            </button>
            <button
              type="button"
              onClick={() => void exportFile()}
              disabled={exportableOrders.length === 0 || exporting}
              className="rounded-xl bg-[#006397] px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
            >
              {exporting
                ? "Đang cập nhật và tạo file..."
                : incompleteCount > 0
                  ? "Vẫn xuất file SPX"
                  : `Xuất ${exportableOrders.length} đơn SPX`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
