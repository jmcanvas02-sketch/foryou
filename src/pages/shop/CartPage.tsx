import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";

import CartRecommendations from "../../components/shop/CartRecommendations";
import { useCart } from "../../features/cart/CartContext";
import { searchProducts } from "../../services/products";
import type { Product } from "../../types/product";
import { useSettings } from "../../features/settings/SettingsContext";
import { formatCurrency } from "../../utils/currency";
import { calculateShipping } from "../../utils/shipping";

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 8h12l1 13H5L6 8Z" />
      <path d="M9 9V6a3 3 0 0 1 6 0v3" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export default function CartPage() {
  const { items, subtotal, updateQuantity, removeItem } = useCart();
  const { settings } = useSettings();
  const [recommendationProducts, setRecommendationProducts] = useState<
    Product[]
  >([]);
  const [recommendationsLoading, setRecommendationsLoading] =
    useState(true);
  const cartProductIds = useMemo(
    () => [...new Set(items.map((item) => item.productId))],
    [items],
  );

  useEffect(() => {
    let cancelled = false;

    async function loadRecommendationProducts() {
      try {
        const result = await searchProducts({
          page: 1,
          pageSize: 48,
          sort: "bestselling",
        });

        if (!cancelled) {
          setRecommendationProducts(result.products);
        }
      } catch (error) {
        console.warn("Cannot load cart recommendations:", error);

        if (!cancelled) {
          setRecommendationProducts([]);
        }
      } finally {
        if (!cancelled) {
          setRecommendationsLoading(false);
        }
      }
    }

    void loadRecommendationProducts();

    return () => {
      cancelled = true;
    };
  }, []);

  const shipping = calculateShipping(
    subtotal,
    settings.shippingFee,
    settings.freeShippingThreshold,
  );
  const total = subtotal + shipping;
  const remainingForFreeShipping = Math.max(
    settings.freeShippingThreshold - subtotal,
    0,
  );
  const shippingProgress =
    settings.freeShippingThreshold > 0
      ? Math.min(
          (subtotal / settings.freeShippingThreshold) * 100,
          100,
        )
      : 100;

  if (items.length === 0) {
    return (
      <main className="storefront-page storefront-cart-empty sf-container py-12 sm:py-20">
        <section className="grid min-h-[480px] place-items-center rounded-[36px] border border-dashed border-[rgba(255,95,143,0.28)] bg-[radial-gradient(circle_at_50%_0%,rgba(255,231,239,0.88),transparent_20rem),#fff] p-8 text-center shadow-[0_20px_54px_rgba(86,53,74,0.07)]">
          <div>
            <span
              className="mx-auto grid h-24 w-24 place-items-center rounded-[30px] bg-[var(--sf-pink-soft)] text-[var(--sf-pink-strong)]"
              aria-hidden="true"
            >
              <BagIcon />
            </span>
            <p className="mt-7 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--sf-pink-strong)]">
              Giỏ hàng InGiDay
            </p>
            <h1 className="mt-3 text-3xl font-black tracking-[-0.045em] text-[var(--sf-ink)] sm:text-4xl">
              Giỏ hàng đang trống
            </h1>
            <p className="mx-auto mt-3 max-w-md text-sm leading-6 text-[var(--sf-ink-soft)]">
              Hãy chọn một món 3D đáng yêu rồi quay lại đây nhé.
            </p>
            <Link
              to="/san-pham"
              className="sf-button sf-button--primary mt-7"
            >
              Khám phá sản phẩm
              <ArrowIcon />
            </Link>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="storefront-page storefront-cart-page pb-20">
      <section className="border-b border-[rgba(88,63,80,0.06)] bg-[linear-gradient(135deg,#fff8f2_0%,#fff1f5_58%,#f5f1ff_100%)]">
        <div className="sf-container py-11 sm:py-14">
          <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--sf-pink-strong)]">
            <span className="h-2 w-2 rounded-full bg-[var(--sf-pink)] shadow-[0_0_0_5px_rgba(255,95,143,0.10)]" />
            Giỏ hàng
          </span>
          <h1 className="mt-4 text-4xl font-black tracking-[-0.055em] text-[var(--sf-ink)] sm:text-5xl">
            Những món bạn đã chọn ♡
          </h1>
          <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--sf-ink-soft)] sm:text-base">
            Kiểm tra sản phẩm, lựa chọn và số lượng trước khi thanh toán.
          </p>
        </div>
      </section>

      <section className="sf-container pt-8">
        <div className="grid gap-7 lg:grid-cols-[minmax(0,1fr)_390px]">
          <div className="space-y-4">
            {items.map((item) => (
              <article
                key={item.key}
                className="storefront-cart-item grid min-w-0 gap-4 rounded-[28px] border border-[rgba(88,63,80,0.07)] bg-white p-4 shadow-[0_14px_38px_rgba(86,53,74,0.07)] sm:grid-cols-[132px_minmax(0,1fr)_auto] sm:items-center sm:p-5"
              >
                <Link
                  to={`/san-pham/${item.slug}`}
                  className="relative grid aspect-square place-items-center overflow-hidden rounded-[24px] border border-white/70 text-6xl shadow-inner"
                  style={{
                    backgroundColor:
                      item.background || "var(--sf-cream)",
                  }}
                  aria-label={`Xem ${item.name}`}
                >
                  {item.imageUrl ? (
                    <img
                      src={item.imageUrl}
                      alt={item.name}
                      className="h-full w-full object-contain p-3"
                      loading="lazy"
                      decoding="async"
                    />
                  ) : (
                    <span aria-hidden="true">{item.emoji}</span>
                  )}
                </Link>

                <div className="min-w-0">
                  <Link
                    to={`/san-pham/${item.slug}`}
                    className="line-clamp-2 text-lg font-black tracking-[-0.025em] text-[var(--sf-ink)] no-underline transition hover:text-[var(--sf-pink-strong)]"
                  >
                    {item.name}
                  </Link>

                  {item.selectedVariants.length > 0 && (
                    <p className="mt-2 text-xs leading-5 text-[var(--sf-ink-soft)]">
                      {item.selectedVariants
                        .map(
                          (variant) =>
                            `${variant.groupName}: ${variant.optionLabel}`,
                        )
                        .join(" · ")}
                    </p>
                  )}

                  {item.selectedCustomOptions?.text && (
                    <div
                      data-custom-options-display="cart"
                      className="mt-3 space-y-1 rounded-[18px] bg-[#faf6f8] px-3.5 py-3 text-xs leading-5 text-[var(--sf-ink-soft)]"
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
                          {item.selectedCustomOptions.color.imageUrl && (
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
                          <span className="font-bold text-[#24835b]">
                            miễn phí
                          </span>
                        </p>
                      )}

                      {item.selectedCustomOptions.text.priceDelta > 0 && (
                        <p className="font-bold text-[var(--sf-pink-strong)]">
                          Phụ phí text: +
                          {formatCurrency(
                            item.selectedCustomOptions.text.priceDelta,
                          )}
                        </p>
                      )}
                    </div>
                  )}

                  <strong className="mt-4 block text-lg font-black tracking-[-0.03em] text-[var(--sf-pink-strong)]">
                    {formatCurrency(item.unitPrice)}
                  </strong>
                </div>

                <div className="flex items-center justify-between gap-4 sm:flex-col sm:items-end">
                  <div className="grid grid-cols-[42px_48px_42px] items-center overflow-hidden rounded-full border border-[var(--sf-border)] bg-[#faf6f8]">
                    <button
                      type="button"
                      onClick={() =>
                        updateQuantity(item.key, item.quantity - 1)
                      }
                      className="grid h-11 place-items-center text-lg font-black text-[var(--sf-ink)] transition hover:bg-[var(--sf-pink-wash)] hover:text-[var(--sf-pink-strong)]"
                      aria-label="Giảm số lượng"
                    >
                      −
                    </button>
                    <span className="grid h-11 place-items-center border-x border-[var(--sf-border)] text-sm font-black text-[var(--sf-ink)]">
                      {item.quantity}
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        updateQuantity(item.key, item.quantity + 1)
                      }
                      className="grid h-11 place-items-center text-lg font-black text-[var(--sf-ink)] transition hover:bg-[var(--sf-pink-wash)] hover:text-[var(--sf-pink-strong)]"
                      aria-label="Tăng số lượng"
                    >
                      +
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => removeItem(item.key)}
                    className="rounded-full px-3 py-2 text-xs font-black text-[#c94772] transition hover:bg-[#fff0f3]"
                  >
                    Xóa
                  </button>
                </div>
              </article>
            ))}
          </div>

          <aside className="h-fit rounded-[30px] border border-[rgba(88,63,80,0.07)] bg-white p-6 shadow-[0_20px_54px_rgba(86,53,74,0.09)] lg:sticky lg:top-28">
            <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--sf-pink-strong)]">
              Đơn hàng của bạn
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.035em] text-[var(--sf-ink)]">
              Tóm tắt thanh toán
            </h2>

            <div className="mt-5 rounded-[22px] bg-[linear-gradient(135deg,var(--sf-pink-wash),#fff8f2)] p-4">
              {remainingForFreeShipping > 0 ? (
                <p className="text-sm leading-6 text-[var(--sf-ink-soft)]">
                  Mua thêm{" "}
                  <strong className="text-[var(--sf-pink-strong)]">
                    {formatCurrency(remainingForFreeShipping)}
                  </strong>{" "}
                  để được miễn phí ship.
                </p>
              ) : (
                <p className="text-sm font-black text-[#24835b]">
                  Bạn đã được miễn phí vận chuyển.
                </p>
              )}

              <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white">
                <div
                  className="h-full rounded-full bg-[linear-gradient(90deg,var(--sf-pink),#f7a8c1)] transition-all"
                  style={{ width: `${shippingProgress}%` }}
                />
              </div>
            </div>

            <dl className="mt-6 space-y-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--sf-ink-soft)]">
                  Tiền sản phẩm
                </dt>
                <dd className="font-black text-[var(--sf-ink)]">
                  {formatCurrency(subtotal)}
                </dd>
              </div>

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

            <Link
              to="/thanh-toan"
              className="sf-button sf-button--primary mt-6 w-full"
            >
              Tiến hành đặt hàng
              <ArrowIcon />
            </Link>

            <Link
              to="/san-pham"
              className="mt-3 inline-flex min-h-11 w-full items-center justify-center rounded-full text-sm font-black text-[var(--sf-ink)] no-underline transition hover:bg-[var(--sf-pink-wash)] hover:text-[var(--sf-pink-strong)]"
            >
              Tiếp tục mua sắm
            </Link>
          </aside>
        </div>
      </section>

      <CartRecommendations
        products={recommendationProducts}
        cartProductIds={cartProductIds}
        remainingForFreeShipping={remainingForFreeShipping}
        loading={recommendationsLoading}
      />
    </main>
  );
}
