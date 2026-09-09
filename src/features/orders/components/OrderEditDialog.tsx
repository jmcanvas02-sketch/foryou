import { useMemo, useState } from "react";
import type {
  AdminOrderItemInput,
  AdminOrderUpdateInput,
} from "../../../types/adminOrder";
import type { OrderStatus, StoreOrder } from "../../../types/store";
import { formatCurrency } from "../../../utils/currency";

type ActionResult = {
  success: boolean;
  message: string;
};

type OrderEditDialogProps = {
  order: StoreOrder;
  onClose: () => void;
  onSave: (input: AdminOrderUpdateInput) => Promise<ActionResult>;
};

type EditItem = AdminOrderItemInput & {
  formKey: string;
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

function createInitialItems(order: StoreOrder): EditItem[] {
  return order.items.map((item) => ({
    formKey: item.key,
    sourceItemId: item.key,
    productId: item.productId || undefined,
    productName: item.name,
    productSlug: item.slug || undefined,
    productImageUrl: item.imageUrl,
    productBackground: item.background,
    productEmoji: item.emoji,
    unitPrice: item.unitPrice,
    quantity: item.quantity,
    selectedVariants: item.selectedVariants.map((variant) => ({
      ...variant,
    })),
    customOptions: item.selectedCustomOptions
      ? {
          text: item.selectedCustomOptions.text
            ? { ...item.selectedCustomOptions.text }
            : undefined,
          color: item.selectedCustomOptions.color
            ? { ...item.selectedCustomOptions.color }
            : undefined,
        }
      : undefined,
  }));
}

function manualItem(): EditItem {
  return {
    formKey: `manual-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    productName: "",
    unitPrice: 0,
    quantity: 1,
    selectedVariants: [],
  };
}

export default function OrderEditDialog({
  order,
  onClose,
  onSave,
}: OrderEditDialogProps) {
  const [customerName, setCustomerName] = useState(order.customer.fullName);
  const [customerPhone, setCustomerPhone] = useState(order.customer.phone);
  const [customerEmail, setCustomerEmail] = useState(
    order.customer.email ?? "",
  );
  const [province, setProvince] = useState(order.customer.province);
  const [district, setDistrict] = useState(order.customer.district);
  const [ward, setWard] = useState(order.customer.ward);
  const [addressDetail, setAddressDetail] = useState(
    order.customer.addressDetail,
  );
  const [note, setNote] = useState(order.customer.note);
  const [discount, setDiscount] = useState(String(order.discount));
  const [shipping, setShipping] = useState(String(order.shipping));
  const [status, setStatus] = useState<OrderStatus>(order.status);
  const [items, setItems] = useState<EditItem[]>(() =>
    createInitialItems(order),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");

  const subtotal = useMemo(
    () =>
      items.reduce(
        (sum, item) =>
          sum +
          Math.max(0, Number(item.unitPrice) || 0) *
            Math.max(0, Number(item.quantity) || 0),
        0,
      ),
    [items],
  );
  const numericDiscount = Math.max(0, Number(discount) || 0);
  const numericShipping = Math.max(0, Number(shipping) || 0);
  const total =
    Math.max(0, subtotal - Math.min(numericDiscount, subtotal)) +
    numericShipping;

  function updateItem(
    formKey: string,
    changes: Partial<EditItem>,
  ) {
    setItems((current) =>
      current.map((item) =>
        item.formKey === formKey ? { ...item, ...changes } : item,
      ),
    );
    setMessage("");
  }

  function removeItem(formKey: string) {
    setItems((current) =>
      current.filter((item) => item.formKey !== formKey),
    );
    setMessage("");
  }

  async function save() {
    if (saving) return;

    if (customerName.trim().length < 2) {
      setMessage("Tên người nhận không hợp lệ.");
      return;
    }

    if (customerPhone.trim().length < 8) {
      setMessage("Số điện thoại không hợp lệ.");
      return;
    }

    if (!addressDetail.trim()) {
      setMessage("Địa chỉ chi tiết không được để trống.");
      return;
    }

    if (items.length === 0) {
      setMessage("Đơn hàng phải có ít nhất một sản phẩm.");
      return;
    }

    const invalidItem = items.find(
      (item) =>
        !item.productName.trim() ||
        !Number.isInteger(Number(item.quantity)) ||
        Number(item.quantity) <= 0 ||
        !Number.isFinite(Number(item.unitPrice)) ||
        Number(item.unitPrice) < 0,
    );

    if (invalidItem) {
      setMessage(
        "Tên, số lượng hoặc đơn giá của một sản phẩm chưa hợp lệ.",
      );
      return;
    }

    const input: AdminOrderUpdateInput = {
      orderId: order.id ?? "",
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerEmail: customerEmail.trim() || undefined,
      province: province.trim(),
      district: district.trim(),
      ward: ward.trim(),
      addressDetail: addressDetail.trim(),
      note: note.trim(),
      discount: Math.round(numericDiscount),
      shipping: Math.round(numericShipping),
      status,
      items: items.map(
        (item): AdminOrderItemInput => ({
          sourceItemId: item.sourceItemId,
          productId: item.productId,
          productName: item.productName.trim(),
          productSlug: item.productSlug,
          productImageUrl: item.productImageUrl,
          productBackground: item.productBackground,
          productEmoji: item.productEmoji,
          unitPrice: Math.round(Number(item.unitPrice)),
          quantity: Math.round(Number(item.quantity)),
          selectedVariants: item.selectedVariants,
          customOptions: item.customOptions,
        }),
      ),
    };

    setSaving(true);
    setMessage("");
    const result = await onSave(input);
    setSaving(false);

    if (result.success) {
      onClose();
      return;
    }

    setMessage(result.message);
  }

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-[#091d2e]/55 p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="edit-order-title"
    >
      <div className="flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-start justify-between gap-4 border-b border-[#e3e8ee] px-5 py-4 sm:px-7">
          <div>
            <h2 id="edit-order-title" className="text-2xl font-black">
              Chỉnh sửa đơn hàng
            </h2>
            <p className="mt-1 text-sm text-[#707881]">
              {order.code} · Tính năng độc lập với chuẩn hóa địa chỉ và xuất
              SPX.
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

        <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
          <div className="grid gap-6 xl:grid-cols-[1fr_360px]">
            <div className="space-y-6">
              <section className="rounded-2xl border border-[#d7dee6] p-5">
                <h3 className="text-lg font-black">
                  Người nhận và địa chỉ gốc
                </h3>
                <p className="mt-1 text-xs text-[#707881]">
                  Nếu địa chỉ gốc thay đổi, địa chỉ đã chuẩn hóa sẽ tự chuyển
                  sang trạng thái cần chuẩn hóa lại.
                </p>

                <div className="mt-5 grid gap-4 sm:grid-cols-2">
                  <label className="text-sm font-bold">
                    Tên người nhận
                    <input
                      value={customerName}
                      onChange={(event) =>
                        setCustomerName(event.target.value)
                      }
                      className="mt-2 h-11 w-full rounded-xl border border-[#cfd6dd] px-3 font-normal outline-none focus:border-[#006397]"
                    />
                  </label>
                  <label className="text-sm font-bold">
                    Số điện thoại
                    <input
                      value={customerPhone}
                      onChange={(event) =>
                        setCustomerPhone(event.target.value)
                      }
                      className="mt-2 h-11 w-full rounded-xl border border-[#cfd6dd] px-3 font-normal outline-none focus:border-[#006397]"
                    />
                  </label>
                  <label className="text-sm font-bold sm:col-span-2">
                    Email
                    <input
                      type="email"
                      value={customerEmail}
                      onChange={(event) =>
                        setCustomerEmail(event.target.value)
                      }
                      className="mt-2 h-11 w-full rounded-xl border border-[#cfd6dd] px-3 font-normal outline-none focus:border-[#006397]"
                    />
                  </label>
                  <label className="text-sm font-bold">
                    Tỉnh/Thành phố
                    <input
                      value={province}
                      onChange={(event) => setProvince(event.target.value)}
                      className="mt-2 h-11 w-full rounded-xl border border-[#cfd6dd] px-3 font-normal outline-none focus:border-[#006397]"
                    />
                  </label>
                  <label className="text-sm font-bold">
                    Quận/Huyện
                    <input
                      value={district}
                      onChange={(event) => setDistrict(event.target.value)}
                      className="mt-2 h-11 w-full rounded-xl border border-[#cfd6dd] px-3 font-normal outline-none focus:border-[#006397]"
                    />
                  </label>
                  <label className="text-sm font-bold sm:col-span-2">
                    Xã/Phường
                    <input
                      value={ward}
                      onChange={(event) => setWard(event.target.value)}
                      className="mt-2 h-11 w-full rounded-xl border border-[#cfd6dd] px-3 font-normal outline-none focus:border-[#006397]"
                    />
                  </label>
                  <label className="text-sm font-bold sm:col-span-2">
                    Địa chỉ chi tiết
                    <textarea
                      value={addressDetail}
                      onChange={(event) =>
                        setAddressDetail(event.target.value)
                      }
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-[#cfd6dd] p-3 font-normal outline-none focus:border-[#006397]"
                    />
                  </label>
                  <label className="text-sm font-bold sm:col-span-2">
                    Ghi chú đơn hàng
                    <textarea
                      value={note}
                      onChange={(event) => setNote(event.target.value)}
                      rows={3}
                      className="mt-2 w-full rounded-xl border border-[#cfd6dd] p-3 font-normal outline-none focus:border-[#006397]"
                    />
                  </label>
                </div>
              </section>

              <section className="rounded-2xl border border-[#d7dee6] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <h3 className="text-lg font-black">Sản phẩm</h3>
                    <p className="mt-1 text-xs text-[#707881]">
                      Dòng có liên kết sản phẩm sẽ được điều chỉnh tồn kho an
                      toàn. Dòng thêm thủ công không liên kết tồn kho.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      setItems((current) => [...current, manualItem()])
                    }
                    className="rounded-xl bg-[#edf4ff] px-4 py-2 text-sm font-bold text-[#006397]"
                  >
                    + Thêm dòng sản phẩm
                  </button>
                </div>

                <div className="mt-5 space-y-4">
                  {items.map((item, index) => (
                    <article
                      key={item.formKey}
                      className="rounded-2xl bg-[#f7f9ff] p-4"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-black">
                            Sản phẩm {index + 1}
                          </p>
                          <p className="mt-1 text-xs text-[#707881]">
                            {item.productId
                              ? "Có liên kết tồn kho"
                              : "Dòng thủ công, không liên kết tồn kho"}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeItem(item.formKey)}
                          className="rounded-lg bg-[#fff0eb] px-3 py-1.5 text-xs font-bold text-[#a43c12]"
                        >
                          Xóa
                        </button>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-[1fr_130px_160px]">
                        <label className="text-xs font-bold">
                          Tên sản phẩm
                          <input
                            value={item.productName}
                            onChange={(event) =>
                              updateItem(item.formKey, {
                                productName: event.target.value,
                              })
                            }
                            className="mt-1.5 h-10 w-full rounded-xl border border-[#cfd6dd] bg-white px-3 text-sm font-normal outline-none focus:border-[#006397]"
                          />
                        </label>
                        <label className="text-xs font-bold">
                          Số lượng
                          <input
                            type="number"
                            min="1"
                            max="999"
                            value={item.quantity}
                            onChange={(event) =>
                              updateItem(item.formKey, {
                                quantity: Number(event.target.value),
                              })
                            }
                            className="mt-1.5 h-10 w-full rounded-xl border border-[#cfd6dd] bg-white px-3 text-sm font-normal outline-none focus:border-[#006397]"
                          />
                        </label>
                        <label className="text-xs font-bold">
                          Đơn giá
                          <input
                            type="number"
                            min="0"
                            step="1000"
                            value={item.unitPrice}
                            onChange={(event) =>
                              updateItem(item.formKey, {
                                unitPrice: Number(event.target.value),
                              })
                            }
                            className="mt-1.5 h-10 w-full rounded-xl border border-[#cfd6dd] bg-white px-3 text-sm font-normal outline-none focus:border-[#006397]"
                          />
                        </label>
                      </div>

                      {item.selectedVariants.length > 0 && (
                        <p className="mt-3 text-xs text-[#3f4850]">
                          <strong>Biến thể:</strong>{" "}
                          {item.selectedVariants
                            .map(
                              (variant) =>
                                `${variant.groupName}: ${variant.optionLabel}`,
                            )
                            .join(" · ")}
                        </p>
                      )}

                      {item.customOptions?.text && (
                        <p className="mt-2 text-xs text-[#3f4850]">
                          <strong>
                            {item.customOptions.text.label}:
                          </strong>{" "}
                          {item.customOptions.text.value}
                          {item.customOptions.color &&
                            ` · Màu chữ: ${item.customOptions.color.name}`}
                        </p>
                      )}

                      <p className="mt-3 text-right text-sm font-black">
                        {formatCurrency(
                          Math.max(0, Number(item.unitPrice) || 0) *
                            Math.max(0, Number(item.quantity) || 0),
                        )}
                      </p>
                    </article>
                  ))}

                  {items.length === 0 && (
                    <div className="rounded-2xl border border-dashed border-[#bfc7d2] p-8 text-center text-sm text-[#707881]">
                      Hãy thêm ít nhất một sản phẩm.
                    </div>
                  )}
                </div>
              </section>
            </div>

            <aside className="space-y-5">
              <section className="rounded-2xl border border-[#d7dee6] p-5">
                <h3 className="text-lg font-black">Trạng thái</h3>
                <select
                  value={status}
                  onChange={(event) =>
                    setStatus(event.target.value as OrderStatus)
                  }
                  className="mt-4 h-11 w-full rounded-xl border border-[#cfd6dd] bg-white px-3 text-sm outline-none focus:border-[#006397]"
                >
                  {Object.entries(statusLabels).map(([value, label]) => (
                    <option key={value} value={value}>
                      {label}
                    </option>
                  ))}
                </select>
              </section>

              <section className="rounded-2xl border border-[#d7dee6] p-5">
                <h3 className="text-lg font-black">Thanh toán</h3>

                <div className="mt-4 space-y-4">
                  <label className="block text-sm font-bold">
                    Tiền giảm giá
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={discount}
                      onChange={(event) => setDiscount(event.target.value)}
                      className="mt-2 h-11 w-full rounded-xl border border-[#cfd6dd] px-3 font-normal outline-none focus:border-[#006397]"
                    />
                  </label>
                  <label className="block text-sm font-bold">
                    Phí vận chuyển
                    <input
                      type="number"
                      min="0"
                      step="1000"
                      value={shipping}
                      onChange={(event) => setShipping(event.target.value)}
                      className="mt-2 h-11 w-full rounded-xl border border-[#cfd6dd] px-3 font-normal outline-none focus:border-[#006397]"
                    />
                  </label>
                </div>

                <dl className="mt-5 space-y-3 border-t border-[#d7dee6] pt-4 text-sm">
                  <div className="flex justify-between gap-4">
                    <dt>Tiền sản phẩm</dt>
                    <dd className="font-bold">
                      {formatCurrency(subtotal)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 text-[#14633d]">
                    <dt>Giảm giá</dt>
                    <dd className="font-bold">
                      −{formatCurrency(Math.min(numericDiscount, subtotal))}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4">
                    <dt>Phí vận chuyển</dt>
                    <dd className="font-bold">
                      {formatCurrency(numericShipping)}
                    </dd>
                  </div>
                  <div className="flex justify-between gap-4 border-t border-[#d7dee6] pt-3 text-base">
                    <dt className="font-black">Tổng đơn hàng</dt>
                    <dd className="font-black text-[#a43c12]">
                      {formatCurrency(total)}
                    </dd>
                  </div>
                </dl>
              </section>

              {order.couponCode && (
                <p className="rounded-2xl bg-[#fff1b8] px-4 py-3 text-xs font-semibold text-[#7a5200]">
                  Đơn đang lưu mã giảm giá {order.couponCode}. Trình chỉnh sửa
                  chỉ thay đổi số tiền giảm, không thay đổi lượt sử dụng mã.
                </p>
              )}
            </aside>
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
              disabled={saving}
              className="rounded-xl bg-[#edf0f3] px-5 py-3 text-sm font-bold disabled:opacity-50"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => void save()}
              disabled={saving || !order.id}
              className="rounded-xl bg-[#006397] px-5 py-3 text-sm font-bold text-white disabled:opacity-40"
            >
              {saving ? "Đang lưu..." : "Lưu thay đổi"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
