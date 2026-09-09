import { useMemo, useState } from "react";
import type { FormEvent } from "react";
import { useCoupons } from "../../features/coupons/CouponsContext";
import type { Coupon, CouponInput, CouponType } from "../../types/store";
import { formatCurrency } from "../../utils/currency";

const emptyForm: CouponInput = {
  code: "",
  type: "percentage",
  value: 10,
  minOrder: 0,
  maxDiscount: 0,
  usageLimit: 0,
  startsAt: "",
  endsAt: "",
  active: true,
};

type MessageType = "success" | "error";

export default function CouponsAdminPage() {
  const {
    coupons,
    loading,
    error,
    refresh,
    createCoupon,
    updateCoupon,
    deleteCoupon,
    toggleCoupon,
  } = useCoupons();

  const [form, setForm] = useState<CouponInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState<MessageType>("success");
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const editingCoupon = useMemo(
    () => coupons.find((coupon) => coupon.id === editingId),
    [coupons, editingId],
  );

  function showMessage(text: string, type: MessageType) {
    setMessage(text);
    setMessageType(type);
  }

  function resetForm(clearMessage = true) {
    setForm(emptyForm);
    setEditingId(null);

    if (clearMessage) {
      setMessage("");
    }
  }

  function startEdit(coupon: Coupon) {
    setEditingId(coupon.id);
    setForm({
      code: coupon.code,
      type: coupon.type,
      value: coupon.value,
      minOrder: coupon.minOrder,
      maxDiscount: coupon.maxDiscount ?? 0,
      usageLimit: coupon.usageLimit ?? 0,
      startsAt: coupon.startsAt ?? "",
      endsAt: coupon.endsAt ?? "",
      active: coupon.active,
    });
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    const code = form.code.trim().toUpperCase().replace(/\s+/g, "");

    if (!code) {
      showMessage("Vui lòng nhập mã giảm giá.", "error");
      return;
    }

    if (!/^[A-Z0-9_-]+$/.test(code)) {
      showMessage(
        "Mã chỉ được chứa chữ in hoa, số, dấu gạch ngang hoặc gạch dưới.",
        "error",
      );
      return;
    }

    if (form.value <= 0) {
      showMessage("Giá trị giảm phải lớn hơn 0.", "error");
      return;
    }

    if (form.type === "percentage" && form.value > 100) {
      showMessage(
        "Giảm theo phần trăm không được vượt quá 100%.",
        "error",
      );
      return;
    }

    if (form.minOrder < 0) {
      showMessage("Giá trị đơn tối thiểu không hợp lệ.", "error");
      return;
    }

    if (
      form.startsAt &&
      form.endsAt &&
      form.endsAt < form.startsAt
    ) {
      showMessage(
        "Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.",
        "error",
      );
      return;
    }

    if (
      coupons.some(
        (coupon) => coupon.code === code && coupon.id !== editingId,
      )
    ) {
      showMessage("Mã giảm giá đã tồn tại.", "error");
      return;
    }

    const normalized: CouponInput = {
      ...form,
      code,
      maxDiscount:
        form.maxDiscount && form.maxDiscount > 0
          ? form.maxDiscount
          : undefined,
      usageLimit:
        form.usageLimit && form.usageLimit > 0
          ? form.usageLimit
          : undefined,
      startsAt: form.startsAt || undefined,
      endsAt: form.endsAt || undefined,
    };

    setSaving(true);

    const result = editingId
      ? await updateCoupon(editingId, normalized)
      : await createCoupon(normalized);

    setSaving(false);

    if (!result.success) {
      showMessage(result.message, "error");
      return;
    }

    resetForm(false);
    showMessage(result.message, "success");
  }

  async function handleToggle(coupon: Coupon) {
    setBusyId(coupon.id);
    const result = await toggleCoupon(coupon.id);
    setBusyId(null);
    showMessage(result.message, result.success ? "success" : "error");
  }

  async function handleDelete(coupon: Coupon) {
    if (!confirm(`Xóa mã ${coupon.code}?`)) return;

    setBusyId(coupon.id);
    const result = await deleteCoupon(coupon.id);
    setBusyId(null);

    if (editingId === coupon.id && result.success) {
      resetForm(false);
    }

    showMessage(result.message, result.success ? "success" : "error");
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#006397]">
            Khuyến mãi
          </p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">
            Mã giảm giá
          </h1>
        </div>

        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl bg-[#edf4ff] px-4 py-3 text-sm font-bold text-[#006397]"
        >
          Làm mới
        </button>
      </div>

      {error && (
        <p className="mt-5 rounded-2xl bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[#a43c12]">
          {error}
        </p>
      )}

      <form
        onSubmit={handleSubmit}
        className="mt-7 rounded-3xl bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black">
            {editingCoupon
              ? `Sửa mã ${editingCoupon.code}`
              : "Tạo mã mới"}
          </h2>

          {editingId && (
            <button
              type="button"
              onClick={() => resetForm()}
              className="text-sm font-bold text-[#006397]"
            >
              Hủy sửa
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <label className="text-sm font-bold">
            Mã giảm giá
            <input
              value={form.code}
              maxLength={40}
              onChange={(event) =>
                setForm({
                  ...form,
                  code: event.target.value
                    .toUpperCase()
                    .replace(/\s+/g, ""),
                })
              }
              className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none focus:border-[#006397]"
              placeholder="INGIDAY10"
            />
          </label>

          <label className="text-sm font-bold">
            Loại giảm
            <select
              value={form.type}
              onChange={(event) =>
                setForm({
                  ...form,
                  type: event.target.value as CouponType,
                })
              }
              className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] bg-white px-3 font-normal outline-none"
            >
              <option value="percentage">Phần trăm</option>
              <option value="fixed">Số tiền</option>
            </select>
          </label>

          <label className="text-sm font-bold">
            Giá trị
            <input
              type="number"
              min="1"
              step={form.type === "percentage" ? "1" : "1000"}
              value={form.value}
              onChange={(event) =>
                setForm({ ...form, value: Number(event.target.value) })
              }
              className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none"
            />
          </label>

          <label className="text-sm font-bold">
            Đơn tối thiểu
            <input
              type="number"
              min="0"
              step="1000"
              value={form.minOrder}
              onChange={(event) =>
                setForm({
                  ...form,
                  minOrder: Number(event.target.value),
                })
              }
              className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none"
            />
          </label>

          <label className="text-sm font-bold">
            Giảm tối đa
            <input
              type="number"
              min="0"
              step="1000"
              value={form.maxDiscount ?? 0}
              onChange={(event) =>
                setForm({
                  ...form,
                  maxDiscount: Number(event.target.value),
                })
              }
              disabled={form.type === "fixed"}
              className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none disabled:bg-[#edf0f3] disabled:text-[#8a929a]"
            />
          </label>

          <label className="text-sm font-bold">
            Giới hạn lượt dùng
            <input
              type="number"
              min="0"
              value={form.usageLimit ?? 0}
              onChange={(event) =>
                setForm({
                  ...form,
                  usageLimit: Number(event.target.value),
                })
              }
              className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none"
            />
          </label>

          <label className="text-sm font-bold">
            Ngày bắt đầu
            <input
              type="date"
              value={form.startsAt ?? ""}
              onChange={(event) =>
                setForm({ ...form, startsAt: event.target.value })
              }
              className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none"
            />
          </label>

          <label className="text-sm font-bold">
            Ngày kết thúc
            <input
              type="date"
              value={form.endsAt ?? ""}
              onChange={(event) =>
                setForm({ ...form, endsAt: event.target.value })
              }
              className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none"
            />
          </label>
        </div>

        <label className="mt-5 flex items-center gap-3 text-sm font-bold">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) =>
              setForm({ ...form, active: event.target.checked })
            }
            className="h-5 w-5"
          />
          Kích hoạt ngay
        </label>

        {message && (
          <p
            className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
              messageType === "success"
                ? "bg-[#dcf8eb] text-[#14633d]"
                : "bg-[#fff0eb] text-[#a43c12]"
            }`}
          >
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={saving}
          className="mt-5 min-h-11 rounded-xl bg-[#006397] px-6 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving
            ? "Đang lưu..."
            : editingId
              ? "Lưu thay đổi"
              : "Tạo mã giảm giá"}
        </button>
      </form>

      <div className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#edf4ff]">
              <tr>
                <th className="px-5 py-4">Mã</th>
                <th className="px-5 py-4">Giá trị</th>
                <th className="px-5 py-4">Điều kiện</th>
                <th className="px-5 py-4">Lượt dùng</th>
                <th className="px-5 py-4">Trạng thái</th>
                <th className="px-5 py-4 text-right">Thao tác</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#edf0f3]">
              {loading && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-[#707881]"
                  >
                    Đang tải mã giảm giá...
                  </td>
                </tr>
              )}

              {!loading &&
                coupons.map((coupon) => (
                  <tr key={coupon.id}>
                    <td className="px-5 py-4 font-black text-[#006397]">
                      {coupon.code}
                    </td>
                    <td className="px-5 py-4 font-bold">
                      {coupon.type === "percentage"
                        ? `${coupon.value}%`
                        : formatCurrency(coupon.value)}
                    </td>
                    <td className="px-5 py-4 text-[#3f4850]">
                      Từ {formatCurrency(coupon.minOrder)}
                      {coupon.maxDiscount
                        ? ` · Tối đa ${formatCurrency(
                            coupon.maxDiscount,
                          )}`
                        : ""}
                      {coupon.startsAt
                        ? ` · Từ ${coupon.startsAt}`
                        : ""}
                      {coupon.endsAt ? ` đến ${coupon.endsAt}` : ""}
                    </td>
                    <td className="px-5 py-4">
                      {coupon.usedCount}/{coupon.usageLimit ?? "∞"}
                    </td>
                    <td className="px-5 py-4">
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-bold ${
                          coupon.active
                            ? "bg-[#dcf8eb] text-[#14633d]"
                            : "bg-[#edf0f3] text-[#4f5963]"
                        }`}
                      >
                        {coupon.active ? "Đang bật" : "Đang tắt"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          disabled={busyId === coupon.id}
                          onClick={() => startEdit(coupon)}
                          className="rounded-xl bg-[#edf4ff] px-3 py-2 font-bold text-[#006397] disabled:opacity-50"
                        >
                          Sửa
                        </button>
                        <button
                          type="button"
                          disabled={busyId === coupon.id}
                          onClick={() => void handleToggle(coupon)}
                          className="rounded-xl bg-[#fff7f1] px-3 py-2 font-bold text-[#a43c12] disabled:opacity-50"
                        >
                          {coupon.active ? "Tắt" : "Bật"}
                        </button>
                        <button
                          type="button"
                          disabled={busyId === coupon.id}
                          onClick={() => void handleDelete(coupon)}
                          className="rounded-xl bg-[#fff0eb] px-3 py-2 font-bold text-[#a43c12] disabled:opacity-50"
                        >
                          Xóa
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}

              {!loading && coupons.length === 0 && (
                <tr>
                  <td
                    colSpan={6}
                    className="px-5 py-12 text-center text-[#707881]"
                  >
                    Chưa có mã giảm giá.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}