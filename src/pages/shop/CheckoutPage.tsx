import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAdTracking } from "../../features/ads/AdTrackingContext";
import { useCart } from "../../features/cart/CartContext";
import { useCoupons } from "../../features/coupons/CouponsContext";
import { useOrders } from "../../features/orders/OrdersContext";
import { useSettings } from "../../features/settings/SettingsContext";
import type { CheckoutCustomer, LocalOrder } from "../../types/cart";
import type { Coupon } from "../../types/store";
import { formatCurrency } from "../../utils/currency";
import { calculateShipping } from "../../utils/shipping";
import { getCurrentUtmAttribution } from "../../utils/utmAttribution";

const CHECKOUT_CUSTOMER_STORAGE_KEY = "ingiday-checkout-customer";

const initialCustomer: CheckoutCustomer = {
  fullName: "",
  phone: "",
  province: "",
  district: "",
  ward: "",
  addressDetail: "",
  note: "",
};

function readSavedCustomer(): CheckoutCustomer {
  try {
    const raw = localStorage.getItem(CHECKOUT_CUSTOMER_STORAGE_KEY);

    if (!raw) {
      return initialCustomer;
    }

    const saved = JSON.parse(raw) as Partial<CheckoutCustomer>;

    return {
      fullName: typeof saved.fullName === "string" ? saved.fullName : "",
      phone: typeof saved.phone === "string" ? saved.phone : "",
      province: "",
      district: "",
      ward: "",
      addressDetail:
        typeof saved.addressDetail === "string" ? saved.addressDetail : "",
      note: typeof saved.note === "string" ? saved.note : "",
    };
  } catch {
    return initialCustomer;
  }
}

function getPhoneError(phone: string) {
  if (!phone) {
    return "Vui lòng nhập số điện thoại.";
  }

  if (!phone.startsWith("0")) {
    return "Số điện thoại phải bắt đầu bằng số 0.";
  }

  if (phone.length >= 2 && !["3", "5", "7", "8", "9"].includes(phone[1])) {
    return "Đầu số không hợp lệ. Vui lòng dùng đầu số 03, 05, 07, 08 hoặc 09.";
  }

  if (phone.length < 10) {
    return `Số điện thoại còn thiếu ${10 - phone.length} số.`;
  }

  if (!/^0(3|5|7|8|9)\d{8}$/.test(phone)) {
    return "Số điện thoại không đúng định dạng.";
  }

  return "";
}

export default function CheckoutPage() {
  const navigate = useNavigate();
  const { items, subtotal, clearCart } = useCart();
  const {
    trackInitiateCheckout,
    trackPurchase,
  } = useAdTracking();
  const { createOrder } = useOrders();
  const { validateCoupon } = useCoupons();
  const { settings } = useSettings();

  const [customer, setCustomer] = useState<CheckoutCustomer>(readSavedCustomer);
  const [phoneTouched, setPhoneTouched] = useState(false);
  const [couponCode, setCouponCode] = useState("");
  const [appliedCoupon, setAppliedCoupon] = useState<Coupon | null>(null);
  const [discount, setDiscount] = useState(0);
  const [couponMessage, setCouponMessage] = useState("");
  const [applyingCoupon, setApplyingCoupon] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const submitLockRef = useRef(false);
  const checkoutTrackingKeyRef = useRef("");

  const shipping = calculateShipping(
    subtotal,
    settings.shippingFee,
    settings.freeShippingThreshold,
  );
  const total = Math.max(0, subtotal - discount) + shipping;
  const phoneError = getPhoneError(customer.phone);

  useEffect(() => {
    if (items.length === 0) {
      return;
    }

    const trackingKey = items
      .map(
        (item) =>
          `${item.key}:${item.quantity}:${item.unitPrice}`,
      )
      .sort()
      .join("|");

    if (checkoutTrackingKeyRef.current === trackingKey) {
      return;
    }

    checkoutTrackingKeyRef.current = trackingKey;
    void trackInitiateCheckout({
      items,
      subtotal,
    });
  }, [items, subtotal, trackInitiateCheckout]);

  useEffect(() => {
    try {
      localStorage.setItem(
        CHECKOUT_CUSTOMER_STORAGE_KEY,
        JSON.stringify(customer),
      );
    } catch (storageError) {
      console.warn("Không thể lưu thông tin nhận hàng:", storageError);
    }
  }, [customer]);

  function handleChange(
    event: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
  ) {
    const { name, value } = event.target;
    setCustomer((current) => ({ ...current, [name]: value }));
  }

  function handlePhoneChange(event: ChangeEvent<HTMLInputElement>) {
    const digitsOnly = event.target.value.replace(/\D/g, "").slice(0, 10);
    setPhoneTouched(true);
    setCustomer((current) => ({ ...current, phone: digitsOnly }));
  }

  async function handleApplyCoupon() {
    setCouponMessage("");
    setAppliedCoupon(null);
    setDiscount(0);
    setApplyingCoupon(true);

    const result = await validateCoupon(couponCode, subtotal);

    setApplyingCoupon(false);
    setCouponMessage(result.message);

    if (result.valid && result.coupon) {
      setAppliedCoupon(result.coupon);
      setDiscount(result.discount);
      setCouponCode(result.coupon.code);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    if (submitting || submitLockRef.current) return;

    setPhoneTouched(true);

    if (items.length === 0) {
      setError("Giỏ hàng đang trống.");
      return;
    }

    if (customer.fullName.trim().length < 2) {
      setError("Vui lòng nhập họ và tên.");
      return;
    }

    if (phoneError) {
      setError(phoneError);
      return;
    }

    if (!customer.addressDetail.trim()) {
      setError("Vui lòng nhập địa chỉ chi tiết.");
      return;
    }

    const order: LocalOrder = {
      code: "",
      createdAt: new Date().toISOString(),
      paymentMethod: "COD",
      customer: {
        ...customer,
        fullName: customer.fullName.trim(),
        phone: customer.phone.trim(),
        province: "",
        district: "",
        ward: "",
        addressDetail: customer.addressDetail.trim(),
        note: customer.note.trim(),
      },
      items,
      subtotal,
      discount,
      couponCode: appliedCoupon?.code,
      utmAttribution: getCurrentUtmAttribution(),
      shipping,
      total,
    };

    submitLockRef.current = true;
    setSubmitting(true);

    try {
      const result = await createOrder(order);

      if (!result.success || !result.data) {
        setError(result.message);
        return;
      }

      void trackPurchase({
        orderCode: result.data.code,
        items,
        subtotal: result.data.subtotal,
        discount: result.data.discount,
        shipping: result.data.shipping,
        total: result.data.total,
      });
      clearCart();
      navigate(
        `/dat-hang-thanh-cong?ma=${encodeURIComponent(
          result.data.code,
        )}`,
      );
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "KhÃ´ng thá»ƒ táº¡o Ä‘Æ¡n hÃ ng. Vui lÃ²ng thá»­ láº¡i.",
      );
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  if (items.length === 0) {
    return (
      <main className="storefront-page storefront-checkout-empty sf-container py-12 sm:py-20">
        <section className="grid min-h-[460px] place-items-center rounded-[36px] border border-dashed border-[rgba(255,95,143,0.28)] bg-[radial-gradient(circle_at_50%_0%,rgba(255,231,239,0.88),transparent_20rem),#fff] p-8 text-center shadow-[0_20px_54px_rgba(86,53,74,0.07)]">
          <div>
            <span
              className="text-6xl text-[var(--sf-pink)]"
              aria-hidden="true"
            >
              ♡
            </span>
            <h1 className="mt-5 text-3xl font-black tracking-[-0.045em] text-[var(--sf-ink)] sm:text-4xl">
              Chưa có sản phẩm để thanh toán
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--sf-ink-soft)]">
              Chọn một món bạn thích rồi quay lại hoàn tất đơn hàng nhé.
            </p>
            <Link
              to="/san-pham"
              className="sf-button sf-button--primary mt-7"
            >
              Chọn sản phẩm
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="storefront-page storefront-checkout-page pb-20">
      <section className="border-b border-[rgba(88,63,80,0.06)] bg-[linear-gradient(135deg,#fff8f2_0%,#fff1f5_58%,#f5f1ff_100%)]">
        <div className="sf-container py-8 sm:py-10">
          <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--sf-pink-strong)]">
            <span className="h-2 w-2 rounded-full bg-[var(--sf-pink)] shadow-[0_0_0_5px_rgba(255,95,143,0.10)]" />
            Thanh toán
          </span>
          <h1 className="mt-3 text-3xl font-black tracking-[-0.045em] text-[var(--sf-ink)] sm:text-4xl">
            Hoàn tất đơn hàng COD ♡
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--sf-ink-soft)] sm:text-base">
            Điền thông tin nhận hàng, kiểm tra lại sản phẩm và đặt đơn trong vài bước.
          </p>
        </div>
      </section>

      <section className="sf-container pt-8">
        <form
          onSubmit={handleSubmit}
          className="grid gap-4"
        >
          <div className="order-2 rounded-[24px] border border-[rgba(88,63,80,0.07)] bg-white p-4 shadow-[0_14px_38px_rgba(86,53,74,0.07)] sm:p-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--sf-pink-strong)]">
                Giao hàng
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.035em] text-[var(--sf-ink)]">
                Thông tin nhận hàng
              </h2>
              <p className="mt-2 text-sm leading-6 text-[var(--sf-ink-soft)]">
                Thông tin được lưu trên trình duyệt để lần đặt sau nhanh hơn.
              </p>
            </div>

            <div className="mt-5 grid grid-cols-2 gap-3 [&>*]:min-w-0">
              <label className="block text-sm font-black text-[var(--sf-ink)]">
                Họ và tên{" "}
                <span className="text-[var(--sf-pink-strong)]">*</span>
                <input
                  name="fullName"
                  value={customer.fullName}
                  onChange={handleChange}
                  className="mt-2 h-12 w-full rounded-2xl border border-[var(--sf-border)] bg-[#faf6f8] px-4 font-normal text-[var(--sf-ink)] outline-none transition focus:border-[rgba(255,95,143,0.42)] focus:bg-white focus:shadow-[0_0_0_5px_rgba(255,95,143,0.08)]"
                  placeholder="Nguyễn Văn A"
                  autoComplete="name"
                />
              </label>

              <div>
                <label className="block text-sm font-black text-[var(--sf-ink)]">
                  Số điện thoại{" "}
                  <span className="text-[var(--sf-pink-strong)]">*</span>
                </label>
                <input
                  name="phone"
                  value={customer.phone}
                  onChange={handlePhoneChange}
                  onBlur={() => setPhoneTouched(true)}
                  className={`mt-2 h-12 w-full rounded-2xl border bg-[#faf6f8] px-4 font-normal text-[var(--sf-ink)] outline-none transition focus:bg-white focus:shadow-[0_0_0_5px_rgba(255,95,143,0.08)] ${
                    phoneTouched && phoneError
                      ? "border-[#d94c69] focus:border-[#d94c69]"
                      : "border-[var(--sf-border)] focus:border-[rgba(255,95,143,0.42)]"
                  }`}
                  placeholder="0912345678"
                  inputMode="numeric"
                  autoComplete="tel"
                  maxLength={10}
                  pattern="0(3|5|7|8|9)[0-9]{8}"
                  aria-invalid={phoneTouched && Boolean(phoneError)}
                />

                <div className="mt-2 flex items-start justify-between gap-3 text-xs">
                  <span
                    className={`font-semibold ${
                      phoneTouched && phoneError
                        ? "text-[#c94772]"
                        : customer.phone.length === 10
                          ? "text-[#24835b]"
                          : "text-[var(--sf-ink-soft)]"
                    }`}
                    role={
                      phoneTouched && phoneError ? "alert" : undefined
                    }
                  >
                    {phoneTouched
                      ? phoneError || "Số điện thoại hợp lệ."
                      : "Chỉ nhập 10 chữ số, bắt đầu bằng số 0."}
                  </span>
                  <span className="shrink-0 text-[var(--sf-ink-soft)]">
                    {customer.phone.length}/10
                  </span>
                </div>
              </div>
            </div>

            <label className="mt-4 block text-sm font-black text-[var(--sf-ink)]">
              Địa chỉ nhận hàng{" "}
              <span className="text-[var(--sf-pink-strong)]">*</span>
              <input
                name="addressDetail"
                value={customer.addressDetail}
                onChange={handleChange}
                className="mt-2 h-12 w-full rounded-2xl border border-[var(--sf-border)] bg-[#faf6f8] px-4 font-normal text-[var(--sf-ink)] outline-none transition focus:border-[rgba(255,95,143,0.42)] focus:bg-white focus:shadow-[0_0_0_5px_rgba(255,95,143,0.08)]"
                placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành phố"
                autoComplete="street-address"
              />
            </label>
            <label className="mt-5 block text-sm font-black text-[var(--sf-ink)]">
              Ghi chú đơn hàng
              <textarea
                name="note"
                value={customer.note}
                onChange={handleChange}
                className="mt-2 min-h-20 w-full resize-y rounded-2xl border border-[var(--sf-border)] bg-[#faf6f8] p-4 font-normal text-[var(--sf-ink)] outline-none transition focus:border-[rgba(255,95,143,0.42)] focus:bg-white focus:shadow-[0_0_0_5px_rgba(255,95,143,0.08)]"
                placeholder="Màu mong muốn hoặc lưu ý khi giao hàng..."
              />
            </label>

            <div className="mt-4 rounded-[20px] border border-[rgba(255,95,143,0.16)] bg-[linear-gradient(135deg,var(--sf-pink-wash),#fff8f2)] p-4">
              <div className="flex items-start gap-3">
                <span
                  className="grid h-11 w-11 flex-none place-items-center rounded-2xl bg-white text-xl shadow-sm"
                  aria-hidden="true"
                >
                  ♡
                </span>
                <div>
                  <p className="font-black text-[var(--sf-pink-strong)]">
                    Thanh toán khi nhận hàng — COD
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--sf-ink-soft)]">
                    Khách thanh toán trực tiếp cho đơn vị giao hàng khi nhận sản phẩm.
                  </p>
                </div>
              </div>
            </div>

            {error && (
              <p
                className="mt-5 rounded-2xl border border-[rgba(214,117,80,0.18)] bg-[#fff0f3] px-4 py-3 text-sm font-semibold text-[#a83b60]"
                role="alert"
              >
                {error}
              </p>
            )}

            <p className="mt-6 text-center text-xs leading-5 text-[var(--sf-ink-soft)]">
              Khi đặt hàng, bạn xác nhận đã đọc{" "}
              <Link
                to="/dieu-khoan-su-dung"
                className="font-black text-[var(--sf-pink-strong)]"
              >
                Điều khoản sử dụng
              </Link>
              ,{" "}
              <Link
                to="/chinh-sach-giao-hang"
                className="font-black text-[var(--sf-pink-strong)]"
              >
                Chính sách giao hàng
              </Link>{" "}
              và{" "}
              <Link
                to="/chinh-sach-doi-tra"
                className="font-black text-[var(--sf-pink-strong)]"
              >
                Chính sách đổi trả
              </Link>
              .
            </p>

            <button
              type="submit"
              disabled={submitting}
              className="mt-6 min-h-13 w-full rounded-full bg-[var(--sf-pink)] px-6 font-black text-white shadow-[0_12px_28px_rgba(255,95,143,0.26)] transition hover:-translate-y-0.5 hover:bg-[var(--sf-pink-strong)] hover:shadow-[0_16px_34px_rgba(255,95,143,0.34)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {submitting ? "Đang tạo đơn..." : "Đặt hàng COD"}
            </button>

            <p className="mt-3 text-center text-xs leading-5 text-[var(--sf-ink-soft)]">
              Tổng tiền và tồn kho được hệ thống kiểm tra lại trước khi tạo đơn.
            </p>
          </div>

          <aside className="order-1 h-fit rounded-[24px] border border-[rgba(88,63,80,0.07)] bg-white p-4 shadow-[0_14px_38px_rgba(86,53,74,0.07)] sm:p-5">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--sf-pink-strong)]">
              Kiểm tra lần cuối
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.035em] text-[var(--sf-ink)]">
              Tóm tắt đơn hàng
            </h2>

            <div className="mt-4 grid max-h-64 gap-3 overflow-auto pr-1 sm:grid-cols-2">
              {items.map((item) => (
                <div
                  key={item.key}
                  className="flex gap-3 rounded-[18px] bg-[#fcfaf9] p-2.5"
                >
                  <div
                    className="grid h-16 w-16 shrink-0 place-items-center overflow-hidden rounded-2xl text-3xl"
                    style={{ backgroundColor: item.background }}
                  >
                    {item.imageUrl ? (
                      <img
                        src={item.imageUrl}
                        alt={item.name}
                        className="h-full w-full object-contain p-1.5"
                        loading="lazy"
                        decoding="async"
                      />
                    ) : (
                      item.emoji
                    )}
                  </div>

                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 font-black leading-5 text-[var(--sf-ink)]">
                      {item.name}
                    </p>

                    {item.selectedVariants.length > 0 && (
                      <p className="mt-1 truncate text-xs text-[var(--sf-ink-soft)]">
                        {item.selectedVariants
                          .map((variant) => variant.optionLabel)
                          .join(" · ")}
                      </p>
                    )}

                    {item.selectedCustomOptions?.text && (
                      <div
                        data-custom-options-display="checkout"
                        className="mt-2 space-y-1 rounded-xl bg-white px-3 py-2 text-xs leading-5 text-[var(--sf-ink-soft)]"
                      >
                        <p>
                          <span className="font-black text-[var(--sf-ink)]">
                            {item.selectedCustomOptions.text.label}:
                          </span>{" "}
                          {item.selectedCustomOptions.text.value}
                        </p>

                        {item.selectedCustomOptions.color && (
                          <p className="flex flex-wrap items-center gap-2">
                            <span className="font-black text-[var(--sf-ink)]">
                              Màu chữ:
                            </span>
                            {item.selectedCustomOptions.color
                              .imageUrl && (
                              <img
                                src={
                                  item.selectedCustomOptions.color
                                    .imageUrl
                                }
                                alt=""
                                className="h-4 w-4 rounded-full object-cover"
                                loading="lazy"
                                decoding="async"
                              />
                            )}
                            <span>
                              {item.selectedCustomOptions.color.name}
                            </span>
                            <span className="font-semibold text-[#24835b]">
                              miễn phí
                            </span>
                          </p>
                        )}

                        {item.selectedCustomOptions.text.priceDelta >
                          0 && (
                          <p className="font-semibold text-[var(--sf-pink-strong)]">
                            Phụ phí text: +
                            {formatCurrency(
                              item.selectedCustomOptions.text
                                .priceDelta,
                            )}
                          </p>
                        )}
                      </div>
                    )}

                    <p className="mt-2 text-xs font-bold text-[var(--sf-ink-soft)]">
                      {item.quantity} ×{" "}
                      {formatCurrency(item.unitPrice)}
                    </p>
                  </div>
                </div>
              ))}
            </div>

            {settings.couponEnabled && (
              <div className="mt-5 border-t border-[var(--sf-border)] pt-5">
                <label className="text-sm font-black text-[var(--sf-ink)]">
                  Mã giảm giá
                </label>

                <div className="mt-2 flex gap-2">
                  <input
                    value={couponCode}
                    onChange={(event) =>
                      setCouponCode(event.target.value.toUpperCase())
                    }
                    className="h-11 min-w-0 flex-1 rounded-2xl border border-[var(--sf-border)] bg-[#faf6f8] px-3 text-[var(--sf-ink)] outline-none transition focus:border-[rgba(255,95,143,0.42)] focus:bg-white"
                    placeholder="Nhập mã"
                  />
                  <button
                    type="button"
                    disabled={applyingCoupon}
                    onClick={() => void handleApplyCoupon()}
                    className="rounded-2xl bg-[var(--sf-pink)] px-4 text-sm font-black text-white shadow-[0_8px_20px_rgba(255,95,143,0.20)] transition hover:bg-[var(--sf-pink-strong)] disabled:cursor-not-allowed disabled:opacity-60"
                  >
                    {applyingCoupon ? "Đang kiểm tra..." : "Áp dụng"}
                  </button>
                </div>

                {couponMessage && (
                  <p
                    className={`mt-2 text-xs font-semibold ${
                      appliedCoupon
                        ? "text-[#24835b]"
                        : "text-[#c94772]"
                    }`}
                  >
                    {couponMessage}
                  </p>
                )}
              </div>
            )}

            <dl className="mt-6 space-y-4 border-t border-[var(--sf-border)] pt-5 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--sf-ink-soft)]">
                  Tiền sản phẩm
                </dt>
                <dd className="font-black text-[var(--sf-ink)]">
                  {formatCurrency(subtotal)}
                </dd>
              </div>

              {discount > 0 && (
                <div className="flex justify-between gap-4 text-[#24835b]">
                  <dt>
                    Giảm giá{" "}
                    {appliedCoupon?.code && `(${appliedCoupon.code})`}
                  </dt>
                  <dd className="font-black">
                    −{formatCurrency(discount)}
                  </dd>
                </div>
              )}

              <div className="flex justify-between gap-4">
                <dt className="text-[var(--sf-ink-soft)]">
                  Phí vận chuyển
                </dt>
                <dd className="font-black text-[var(--sf-ink)]">
                  {shipping === 0
                    ? "Miễn phí"
                    : formatCurrency(shipping)}
                </dd>
              </div>

              <div className="flex justify-between gap-4 border-t border-[var(--sf-border)] pt-4">
                <dt className="font-black text-[var(--sf-ink)]">
                  Tổng thanh toán
                </dt>
                <dd className="text-xl font-black tracking-[-0.03em] text-[var(--sf-pink-strong)]">
                  {formatCurrency(total)}
                </dd>
              </div>
            </dl>


          </aside>
        </form>
      </section>
    </main>
  );
}

// IGD_REFINED_STOREFRONT_UI_20260718: checkout layout
