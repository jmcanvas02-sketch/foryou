import { useMemo, useState } from "react";
import type { NormalizedAddressSaveInput } from "../../../types/adminOrder";
import type { StoreOrder } from "../../../types/store";
import {
  formatAddressesForCopy,
  formatOriginalOrderAddress,
  parseNormalizedAddressText,
} from "../addressNormalization";

type ActionResult = {
  success: boolean;
  message: string;
};

type AddressNormalizationDialogProps = {
  orders: StoreOrder[];
  onClose: () => void;
  onSave: (
    entries: NormalizedAddressSaveInput[],
  ) => Promise<ActionResult>;
};

export default function AddressNormalizationDialog({
  orders,
  onClose,
  onSave,
}: AddressNormalizationDialogProps) {
  const [includedOrders, setIncludedOrders] = useState(orders);
  const [normalizedText, setNormalizedText] = useState("");
  const [copyMessage, setCopyMessage] = useState("");
  const [message, setMessage] = useState("");
  const [saving, setSaving] = useState(false);

  const parsed = useMemo(
    () => parseNormalizedAddressText(normalizedText),
    [normalizedText],
  );
  const countMatches = parsed.addresses.length === includedOrders.length;
  const hasAddressErrors = parsed.addresses.some((address) =>
    Boolean(address.error),
  );
  const canSave =
    includedOrders.length > 0 &&
    !parsed.generalError &&
    countMatches &&
    !hasAddressErrors &&
    !saving;

  async function copyAll() {
    const text = formatAddressesForCopy(includedOrders);

    try {
      let copied = false;

      if (navigator.clipboard?.writeText) {
        try {
          await navigator.clipboard.writeText(text);
          copied = true;
        } catch {
          copied = false;
        }
      }

      if (!copied) {
        const textarea = document.createElement("textarea");
        textarea.value = text;
        textarea.setAttribute("readonly", "");
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);

        try {
          textarea.select();

          if (!document.execCommand("copy")) {
            throw new Error("Copy failed");
          }
        } finally {
          textarea.remove();
        }
      }

      setCopyMessage(`Đã copy ${includedOrders.length} địa chỉ.`);
    } catch {
      setCopyMessage(
        "Trình duyệt không cho phép copy tự động. Hãy chọn và copy thủ công.",
      );
    }
  }

  function removeOrder(orderId: string) {
    setIncludedOrders((current) =>
      current.filter((order) => order.id !== orderId),
    );
    setMessage("");
  }

  async function save() {
    if (!canSave) return;

    const entries: NormalizedAddressSaveInput[] = includedOrders.map(
      (order, index) => {
        const address = parsed.addresses[index];

        return {
          orderId: order.id ?? "",
          province: address.province,
          district: address.district,
          ward: address.ward,
          addressDetail: address.addressDetail,
        };
      },
    );

    setSaving(true);
    setMessage("");
    const result = await onSave(entries);
    setSaving(false);
    setMessage(result.message);

    if (result.success) {
      onClose();
    }
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#091d2e]/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="normalize-address-title"
    >
      <div className="flex max-h-[94vh] w-full max-w-7xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#e3e8ee] px-5 py-4 sm:px-7">
          <div>
            <h2 id="normalize-address-title" className="text-2xl font-black">
              Chuẩn hóa địa chỉ
            </h2>
            <p className="mt-1 text-sm text-[#707881]">
              Địa chỉ chuẩn hóa được lưu riêng và không ghi đè địa chỉ gốc.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#edf0f3] text-xl font-bold disabled:opacity-50"
            aria-label="Đóng"
          >
            ×
          </button>
        </div>

        <div className="grid min-h-0 flex-1 gap-5 overflow-y-auto p-5 lg:grid-cols-2 lg:overflow-hidden lg:p-7">
          <section className="flex min-h-0 flex-col">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-black">Địa chỉ gốc</h3>
                <p className="text-xs text-[#707881]">
                  {includedOrders.length} đơn còn trong lần xử lý này
                </p>
              </div>
              <button
                type="button"
                onClick={() => void copyAll()}
                disabled={includedOrders.length === 0}
                className="rounded-xl bg-[#006397] px-4 py-2 text-sm font-bold text-white disabled:opacity-40"
              >
                Copy tất cả
              </button>
            </div>

            {copyMessage && (
              <p className="mt-3 rounded-xl bg-[#edf4ff] px-3 py-2 text-xs font-semibold text-[#006397]">
                {copyMessage}
              </p>
            )}

            <div className="mt-4 min-h-0 space-y-3 overflow-y-auto pr-1">
              {includedOrders.map((order, index) => (
                <article
                  key={order.id ?? order.code}
                  className="rounded-2xl border border-[#d7dee6] p-4"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="font-black">
                        {index + 1}. {order.code}
                      </p>
                      <p className="mt-1 text-xs text-[#707881]">
                        {order.customer.fullName} · {order.customer.phone}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => order.id && removeOrder(order.id)}
                      className="rounded-lg bg-[#fff0eb] px-3 py-1.5 text-xs font-bold text-[#a43c12]"
                    >
                      Loại
                    </button>
                  </div>
                  <p className="mt-3 whitespace-pre-wrap text-sm leading-6">
                    {formatOriginalOrderAddress(order) || "Chưa có địa chỉ"}
                  </p>
                </article>
              ))}

              {includedOrders.length === 0 && (
                <div className="rounded-2xl border border-dashed border-[#bfc7d2] p-8 text-center text-sm text-[#707881]">
                  Bạn đã loại toàn bộ đơn khỏi lần chuẩn hóa.
                </div>
              )}
            </div>
          </section>

          <section className="flex min-h-0 flex-col">
            <div>
              <h3 className="font-black">Địa chỉ đã chuẩn hóa</h3>
              <p className="mt-1 text-xs leading-5 text-[#707881]">
                Dán theo đúng thứ tự bên trái. Mỗi địa chỉ phải bắt đầu bằng
                dấu <strong>*</strong> và có dạng: chi tiết, xã/phường,
                quận/huyện, tỉnh/thành phố.
              </p>
            </div>

            <textarea
              value={normalizedText}
              onChange={(event) => {
                setNormalizedText(event.target.value);
                setMessage("");
              }}
              className="mt-4 min-h-56 w-full flex-1 resize-none rounded-2xl border border-[#d7dee6] p-4 text-sm leading-6 outline-none focus:border-[#006397] lg:min-h-0"
              placeholder={"* Số 10 đường A, Phường B, Quận C, Thành phố D\n* Thôn E, Xã F, Huyện G, Tỉnh H"}
            />

            <div className="mt-4 space-y-2 text-sm">
              <p
                className={`font-bold ${
                  countMatches ? "text-[#14633d]" : "text-[#a43c12]"
                }`}
              >
                Đã nhận {parsed.addresses.length}/{includedOrders.length} địa chỉ
              </p>

              {parsed.generalError && (
                <p className="rounded-xl bg-[#fff0eb] px-3 py-2 font-semibold text-[#a43c12]">
                  {parsed.generalError}
                </p>
              )}

              {!parsed.generalError &&
                parsed.addresses.map((address, index) => (
                  <div
                    key={`${address.raw}-${index}`}
                    className={`rounded-xl px-3 py-2 ${
                      address.error
                        ? "bg-[#fff0eb] text-[#a43c12]"
                        : "bg-[#f7f9ff] text-[#3f4850]"
                    }`}
                  >
                    <strong>Địa chỉ {index + 1}:</strong>{" "}
                    {address.error ??
                      `${address.addressDetail} | ${address.ward} | ${address.district} | ${address.province}`}
                  </div>
                ))}
            </div>
          </section>
        </div>

        <div className="border-t border-[#e3e8ee] px-5 py-4 sm:px-7">
          {message && (
            <p
              className={`mb-3 rounded-xl px-3 py-2 text-sm font-semibold ${
                message.startsWith("Đã")
                  ? "bg-[#dcf8eb] text-[#14633d]"
                  : "bg-[#fff0eb] text-[#a43c12]"
              }`}
            >
              {message}
            </p>
          )}

          <div className="flex flex-wrap justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-xl bg-[#edf0f3] px-5 py-3 text-sm font-bold disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={!canSave}
              className="rounded-xl bg-[#006397] px-5 py-3 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
            >
              {saving ? "Đang lưu..." : "Chuẩn hóa"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
