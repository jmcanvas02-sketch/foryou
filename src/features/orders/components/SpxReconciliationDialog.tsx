import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { OrderStatus } from "../../../types/store";
import { formatCurrency } from "../../../utils/currency";
import {
  isValidVietnamPhone,
  parseSpxReconciliationFile,
} from "../spxReconciliation";
import type {
  SpxReconciliationOrder,
  SpxReconciliationRecord,
} from "../spxReconciliation";

type ActionResult<T = undefined> = {
  success: boolean;
  message: string;
  data?: T;
};

type SpxReconciliationDialogProps = {
  onClose: () => void;
  loadOrdersByPhones: (
    phones: string[],
  ) => Promise<ActionResult<SpxReconciliationOrder[]>>;
  updateOrderStatusBatch: (
    ids: string[],
    status: OrderStatus,
  ) => Promise<ActionResult>;
  onApplied: (updatedCount: number) => void;
};

type RowResolution = {
  candidates: SpxReconciliationOrder[];
  selectedOrder?: SpxReconciliationOrder;
  action: "update" | "unchanged" | "protected" | "missing" | "manual" | "invalid";
  message: string;
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

function chunk<T>(items: T[], size: number) {
  const result: T[][] = [];

  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }

  return result;
}

export default function SpxReconciliationDialog({
  onClose,
  loadOrdersByPhones,
  updateOrderStatusBatch,
  onApplied,
}: SpxReconciliationDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const loadOrdersRef = useRef(loadOrdersByPhones);
  const updateStatusRef = useRef(updateOrderStatusBatch);
  const [fileName, setFileName] = useState("");
  const [records, setRecords] = useState<SpxReconciliationRecord[]>([]);
  const [orders, setOrders] = useState<SpxReconciliationOrder[]>([]);
  const [selectedOrderIds, setSelectedOrderIds] = useState<
    Record<string, string>
  >({});
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [message, setMessage] = useState("");
  const [messageSuccess, setMessageSuccess] = useState(false);
  const [totalDataRows, setTotalDataRows] = useState(0);
  const [ignoredOlderRows, setIgnoredOlderRows] = useState(0);

  useEffect(() => {
    loadOrdersRef.current = loadOrdersByPhones;
  }, [loadOrdersByPhones]);

  useEffect(() => {
    updateStatusRef.current = updateOrderStatusBatch;
  }, [updateOrderStatusBatch]);

  useEffect(() => {
    function handleEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !loading && !applying) {
        onClose();
      }
    }

    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [applying, loading, onClose]);

  const candidatesByPhone = useMemo(() => {
    const grouped = new Map<string, SpxReconciliationOrder[]>();

    for (const order of orders) {
      const current = grouped.get(order.phone) ?? [];
      current.push(order);
      grouped.set(order.phone, current);
    }

    for (const candidates of grouped.values()) {
      candidates.sort(
        (left, right) =>
          new Date(right.createdAt).getTime() -
          new Date(left.createdAt).getTime(),
      );
    }

    return grouped;
  }, [orders]);

  const resolutions = useMemo(() => {
    const result = new Map<string, RowResolution>();

    for (const record of records) {
      if (!isValidVietnamPhone(record.phone)) {
        result.set(record.key, {
          candidates: [],
          action: "invalid",
          message: "Số điện thoại không hợp lệ.",
        });
        continue;
      }

      if (!record.targetStatus) {
        result.set(record.key, {
          candidates: candidatesByPhone.get(record.phone) ?? [],
          action: "invalid",
          message: "Trạng thái SPX chưa được hỗ trợ.",
        });
        continue;
      }

      const candidates = candidatesByPhone.get(record.phone) ?? [];
      if (candidates.length === 0) {
        result.set(record.key, {
          candidates,
          action: "missing",
          message: "Không tìm thấy đơn website cùng SĐT.",
        });
        continue;
      }

      const selectedId = selectedOrderIds[record.key] ?? "";
      const selectedOrder = candidates.find(
        (candidate) => candidate.id === selectedId,
      );

      if (!selectedOrder) {
        result.set(record.key, {
          candidates,
          action: "manual",
          message:
            candidates.length > 1
              ? "Có nhiều đơn cùng SĐT, cần chọn thủ công."
              : "Chưa chọn đơn cần cập nhật.",
        });
        continue;
      }

      if (
        selectedOrder.status === "completed" &&
        record.targetStatus !== "completed"
      ) {
        result.set(record.key, {
          candidates,
          selectedOrder,
          action: "protected",
          message: "Đơn Thành công được giữ nguyên, không hạ trạng thái.",
        });
        continue;
      }

      if (selectedOrder.status === record.targetStatus) {
        result.set(record.key, {
          candidates,
          selectedOrder,
          action: "unchanged",
          message: "Trạng thái đã khớp.",
        });
        continue;
      }

      result.set(record.key, {
        candidates,
        selectedOrder,
        action: "update",
        message: `Sẽ chuyển sang ${statusLabels[record.targetStatus]}.`,
      });
    }

    return result;
  }, [candidatesByPhone, records, selectedOrderIds]);

  const summary = useMemo(() => {
    const values = [...resolutions.values()];

    return {
      matched: values.filter((item) => Boolean(item.selectedOrder)).length,
      update: values.filter((item) => item.action === "update").length,
      unchanged: values.filter((item) => item.action === "unchanged").length,
      protected: values.filter((item) => item.action === "protected").length,
      missing: values.filter((item) => item.action === "missing").length,
      manual: values.filter((item) => item.action === "manual").length,
      invalid: values.filter((item) => item.action === "invalid").length,
    };
  }, [resolutions]);

  async function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file || loading || applying) return;

    setLoading(true);
    setMessage("");
    setMessageSuccess(false);
    setFileName(file.name);
    setRecords([]);
    setOrders([]);
    setSelectedOrderIds({});
    setTotalDataRows(0);
    setIgnoredOlderRows(0);

    try {
      const parsed = await parseSpxReconciliationFile(file);
      const phones = [
        ...new Set(
          parsed.records
            .map((record) => record.phone)
            .filter(isValidVietnamPhone),
        ),
      ];
      const ordersResult = await loadOrdersRef.current(phones);

      if (!ordersResult.success || !ordersResult.data) {
        throw new Error(ordersResult.message);
      }

      const grouped = new Map<string, SpxReconciliationOrder[]>();
      for (const order of ordersResult.data) {
        const current = grouped.get(order.phone) ?? [];
        current.push(order);
        grouped.set(order.phone, current);
      }

      const initialSelection: Record<string, string> = {};
      for (const record of parsed.records) {
        const candidates = grouped.get(record.phone) ?? [];
        const onlyCandidate = candidates.length === 1 ? candidates[0] : undefined;

        if (onlyCandidate) {
          initialSelection[record.key] = onlyCandidate.id;
        }
      }

      setRecords(parsed.records);
      setOrders(ordersResult.data);
      setSelectedOrderIds(initialSelection);
      setTotalDataRows(parsed.totalDataRows);
      setIgnoredOlderRows(parsed.ignoredOlderRows);
      setMessageSuccess(true);
      setMessage(
        `Đã đọc ${parsed.totalDataRows} dòng SPX và giữ ${parsed.records.length} SĐT để so khớp.`,
      );
    } catch (error) {
      setFileName("");
      setMessageSuccess(false);
      setMessage(
        error instanceof Error
          ? error.message
          : "Không thể đọc và so khớp file SPX.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function applyUpdates() {
    if (applying || summary.update === 0) return;

    const updates = records
      .map((record) => {
        const resolution = resolutions.get(record.key);
        if (
          resolution?.action !== "update" ||
          !resolution.selectedOrder ||
          !record.targetStatus
        ) {
          return null;
        }

        return {
          orderId: resolution.selectedOrder.id,
          status: record.targetStatus,
        };
      })
      .filter(
        (
          item,
        ): item is {
          orderId: string;
          status: OrderStatus;
        } => Boolean(item),
      );

    setApplying(true);
    setMessage("");
    setMessageSuccess(false);

    let updatedCount = 0;
    const appliedStatuses = new Map<string, OrderStatus>();

    try {
      for (const status of [
        "completed",
        "shipping",
        "cancelled",
      ] as OrderStatus[]) {
        const ids = updates
          .filter((update) => update.status === status)
          .map((update) => update.orderId);

        for (const batch of chunk(ids, 50)) {
          const result = await updateStatusRef.current(batch, status);

          if (!result.success) {
            throw new Error(result.message);
          }

          updatedCount += batch.length;
          for (const id of batch) {
            appliedStatuses.set(id, status);
          }
        }
      }

      setOrders((current) =>
        current.map((order) => {
          const nextStatus = appliedStatuses.get(order.id);
          return nextStatus ? { ...order, status: nextStatus } : order;
        }),
      );
      setMessageSuccess(true);
      setMessage(`Đã cập nhật trạng thái ${updatedCount} đơn hàng.`);
      onApplied(updatedCount);
    } catch (error) {
      if (updatedCount > 0) {
        setOrders((current) =>
          current.map((order) => {
            const nextStatus = appliedStatuses.get(order.id);
            return nextStatus ? { ...order, status: nextStatus } : order;
          }),
        );
        onApplied(updatedCount);
      }

      setMessageSuccess(false);
      setMessage(
        `${
          updatedCount > 0 ? `Đã cập nhật ${updatedCount} đơn trước khi lỗi. ` : ""
        }${
          error instanceof Error
            ? error.message
            : "Không thể cập nhật trạng thái đơn hàng."
        }`,
      );
    } finally {
      setApplying(false);
    }
  }

  return (
    <div
      className="fixed inset-0 z-[120] flex items-center justify-center bg-[#091d2e]/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="spx-reconciliation-title"
    >
      <div className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#e3e8ee] px-5 py-4 sm:px-7">
          <div>
            <h2
              id="spx-reconciliation-title"
              className="text-2xl font-black"
            >
              So khớp trạng thái SPX
            </h2>
            <p className="mt-1 text-sm text-[#707881]">
              Chỉ dùng số điện thoại người nhận để tìm đơn website. Nếu một SĐT
              có nhiều đơn, bạn phải chọn thủ công.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={loading || applying}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#edf0f3] text-xl font-bold disabled:opacity-50"
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
          <section className="rounded-2xl border border-dashed border-[#9fb6c8] bg-[#f7fbff] p-5">
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(event) => void chooseFile(event)}
              disabled={loading || applying}
              className="hidden"
            />
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="font-black text-[#091d2e]">
                  {fileName || "Chưa chọn báo cáo SPX"}
                </p>
                <p className="mt-1 text-xs leading-5 text-[#59636d]">
                  Hệ thống đọc cột Số điện thoại người nhận và Trạng thái hiện
                  tại. Với SĐT lặp trong file, chỉ giữ vận đơn mới nhất theo thời
                  gian tạo.
                </p>
              </div>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={loading || applying}
                className="rounded-xl bg-[#006397] px-5 py-3 text-sm font-bold text-white disabled:opacity-50"
              >
                {loading ? "Đang đọc file..." : "Chọn file XLSX"}
              </button>
            </div>
          </section>

          {message && (
            <p
              className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
                messageSuccess
                  ? "bg-[#dcf8eb] text-[#14633d]"
                  : "bg-[#fff0eb] text-[#a43c12]"
              }`}
            >
              {message}
            </p>
          )}

          {records.length > 0 && (
            <>
              <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
                <div className="rounded-2xl bg-[#f7f9ff] p-4">
                  <p className="text-xs text-[#707881]">Dòng SPX</p>
                  <p className="mt-1 text-xl font-black">{totalDataRows}</p>
                </div>
                <div className="rounded-2xl bg-[#f7f9ff] p-4">
                  <p className="text-xs text-[#707881]">SĐT mới nhất</p>
                  <p className="mt-1 text-xl font-black">{records.length}</p>
                </div>
                <div className="rounded-2xl bg-[#fff1b8] p-4">
                  <p className="text-xs text-[#7a5200]">Bản ghi cũ bỏ qua</p>
                  <p className="mt-1 text-xl font-black text-[#7a5200]">
                    {ignoredOlderRows}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#dcf8eb] p-4">
                  <p className="text-xs text-[#14633d]">Sẽ cập nhật</p>
                  <p className="mt-1 text-xl font-black text-[#14633d]">
                    {summary.update}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#edf4ff] p-4">
                  <p className="text-xs text-[#006397]">Đã khớp sẵn</p>
                  <p className="mt-1 text-xl font-black text-[#006397]">
                    {summary.unchanged}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#e7e4ff] p-4">
                  <p className="text-xs text-[#493b9f]">Giữ Thành công</p>
                  <p className="mt-1 text-xl font-black text-[#493b9f]">
                    {summary.protected}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#fff1b8] p-4">
                  <p className="text-xs text-[#7a5200]">Cần chọn đơn</p>
                  <p className="mt-1 text-xl font-black text-[#7a5200]">
                    {summary.manual}
                  </p>
                </div>
                <div className="rounded-2xl bg-[#fff0eb] p-4">
                  <p className="text-xs text-[#a43c12]">Không xử lý</p>
                  <p className="mt-1 text-xl font-black text-[#a43c12]">
                    {summary.missing + summary.invalid}
                  </p>
                </div>
              </div>

              <div className="mt-5 overflow-x-auto rounded-2xl border border-[#d7dee6]">
                <table className="min-w-[1220px] w-full text-left text-sm">
                  <thead className="bg-[#edf4ff] text-[#3f4850]">
                    <tr>
                      <th className="px-4 py-3">Dòng</th>
                      <th className="px-4 py-3">Thông tin SPX</th>
                      <th className="px-4 py-3">Trạng thái SPX</th>
                      <th className="px-4 py-3">Đơn website cùng SĐT</th>
                      <th className="px-4 py-3">Hiện tại</th>
                      <th className="px-4 py-3">Kết quả</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#edf0f3]">
                    {records.map((record) => {
                      const resolution = resolutions.get(record.key);
                      const candidates = resolution?.candidates ?? [];
                      const selectedOrder = resolution?.selectedOrder;
                      const onlyCandidate =
                        candidates.length === 1 ? candidates[0] : undefined;

                      return (
                        <tr key={record.key} className="align-top">
                          <td className="px-4 py-4 font-bold">
                            {record.sourceRow}
                          </td>
                          <td className="px-4 py-4">
                            <p className="font-black">{record.phone || "—"}</p>
                            {record.rawPhone !== record.phone && (
                              <p className="mt-1 text-xs text-[#707881]">
                                Gốc: {record.rawPhone || "—"}
                              </p>
                            )}
                            <p className="mt-1 text-xs text-[#3f4850]">
                              {record.receiverName || "Không có tên người nhận"}
                            </p>
                            <p className="mt-1 text-xs text-[#707881]">
                              {record.trackingNo || "Không có mã vận đơn"}
                            </p>
                            {record.createdAtText && (
                              <p className="mt-1 text-xs text-[#707881]">
                                Tạo: {record.createdAtText}
                              </p>
                            )}
                            {record.duplicateSourceCount > 0 && (
                              <p className="mt-2 text-xs font-bold text-[#7a5200]">
                                Đã bỏ qua {record.duplicateSourceCount} vận đơn
                                cũ cùng SĐT
                              </p>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <p className="font-bold">{record.statusText || "—"}</p>
                            {record.targetStatus ? (
                              <span
                                className={`mt-2 inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusClasses[record.targetStatus]}`}
                              >
                                {statusLabels[record.targetStatus]}
                              </span>
                            ) : (
                              <span className="mt-2 inline-flex rounded-full bg-[#fff0eb] px-3 py-1 text-xs font-bold text-[#a43c12]">
                                Chưa hỗ trợ
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            {candidates.length === 0 ? (
                              <span className="font-semibold text-[#a43c12]">
                                Không tìm thấy
                              </span>
                            ) : onlyCandidate ? (
                              <div>
                                <p className="font-black text-[#006397]">
                                  {onlyCandidate.code}
                                </p>
                                <p className="mt-1 text-xs text-[#3f4850]">
                                  {onlyCandidate.customerName}
                                </p>
                                <p className="mt-1 text-xs text-[#707881]">
                                  {formatDate(onlyCandidate.createdAt)} ·{" "}
                                  {formatCurrency(onlyCandidate.total)}
                                </p>
                              </div>
                            ) : (
                              <select
                                value={selectedOrderIds[record.key] ?? ""}
                                onChange={(event) =>
                                  setSelectedOrderIds((current) => ({
                                    ...current,
                                    [record.key]: event.target.value,
                                  }))
                                }
                                disabled={applying}
                                className="h-11 w-full min-w-72 rounded-xl border border-[#cfd6dd] bg-white px-3 outline-none focus:border-[#006397]"
                              >
                                <option value="">
                                  Chọn 1 trong {candidates.length} đơn
                                </option>
                                {candidates.map((candidate) => (
                                  <option key={candidate.id} value={candidate.id}>
                                    {candidate.code} ·{" "}
                                    {statusLabels[candidate.status]} ·{" "}
                                    {formatDate(candidate.createdAt)} ·{" "}
                                    {formatCurrency(candidate.total)}
                                  </option>
                                ))}
                              </select>
                            )}
                          </td>
                          <td className="px-4 py-4">
                            {selectedOrder ? (
                              <span
                                className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${statusClasses[selectedOrder.status]}`}
                              >
                                {statusLabels[selectedOrder.status]}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                          <td className="px-4 py-4">
                            <p
                              className={`font-semibold ${
                                resolution?.action === "update" ||
                                resolution?.action === "unchanged"
                                  ? "text-[#14633d]"
                                  : resolution?.action === "protected"
                                    ? "text-[#493b9f]"
                                    : "text-[#a43c12]"
                              }`}
                            >
                              {resolution?.message ?? "Chưa xử lý"}
                            </p>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>

        <div className="border-t border-[#e3e8ee] px-5 py-4 sm:px-7">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs leading-5 text-[#707881]">
              Đơn đã Thành công không bị hạ xuống Đang giao hoặc Đã hủy.
            </p>
            <div className="flex flex-wrap justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                disabled={loading || applying}
                className="rounded-xl bg-[#edf0f3] px-5 py-3 text-sm font-bold disabled:opacity-50"
              >
                Đóng
              </button>
              <button
                type="button"
                onClick={() => void applyUpdates()}
                disabled={loading || applying || summary.update === 0}
                className="rounded-xl bg-[#006397] px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
              >
                {applying
                  ? "Đang cập nhật..."
                  : `Áp dụng ${summary.update} cập nhật`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
