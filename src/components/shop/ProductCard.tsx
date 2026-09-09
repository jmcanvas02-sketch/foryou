import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";

import { useAdTracking } from "../../features/ads/AdTrackingContext";
import { useCart } from "../../features/cart/CartContext";
import {
  getCloudinarySrcSet,
  optimizeCloudinaryUrl,
} from "../../lib/cloudinary";
import { fetchProductCustomOptions } from "../../services/customProductOptions";
import type { Product } from "../../types/product";
import { formatCurrency } from "../../utils/currency";

function CartIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="18"
      height="18"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="9" cy="20" r="1" />
      <circle cx="18" cy="20" r="1" />
      <path d="M3 4h2l2.4 10.2a2 2 0 0 0 2 1.5h7.8a2 2 0 0 0 2-1.6L21 7H6" />
      <path d="M12 9v4" />
      <path d="M10 11h4" />
    </svg>
  );
}

type ProductCardVariant = "default" | "featured";

export default function ProductCard({
  product,
  variant = "default",
}: {
  product: Product;
  variant?: ProductCardVariant;
}) {
  const navigate = useNavigate();
  const { addItem } = useCart();
  const { trackAddToCart } = useAdTracking();
  const [quickAddState, setQuickAddState] = useState<
    "idle" | "checking" | "added"
  >("idle");
  const primaryImage =
    (product.images ?? []).find((image) => image.isPrimary) ??
    (product.images ?? [])[0];
  const isOutOfStock =
    product.status === "out_of_stock" || product.stock <= 0;
  const hasVariants = (product.variantGroups ?? []).some(
    (group) => group.options.length > 0,
  );
  const isQuickAddBusy = quickAddState === "checking";
  const discountPercent =
    product.compareAtPrice && product.compareAtPrice > product.price
      ? Math.round(
          ((product.compareAtPrice - product.price) /
            product.compareAtPrice) *
            100,
        )
      : 0;

  async function handleQuickAdd() {
    if (isOutOfStock || isQuickAddBusy) {
      return;
    }

    if (hasVariants) {
      navigate(`/san-pham/${product.slug}`);
      return;
    }

    setQuickAddState("checking");

    try {
      const customOptions = await fetchProductCustomOptions(product.id);

      if (customOptions.enabled) {
        navigate(`/san-pham/${product.slug}`);
        return;
      }

      addItem(product, 1, []);
      void trackAddToCart({
        product,
        quantity: 1,
        unitPrice: product.price,
        selectedVariants: [],
      });

      setQuickAddState("added");
      window.setTimeout(() => setQuickAddState("idle"), 1800);
    } catch (error) {
      console.warn("Cannot verify product quick-add options:", error);
      navigate(`/san-pham/${product.slug}`);
    }
  }

  const quickAddLabel = isOutOfStock
    ? "Sản phẩm tạm hết hàng"
    : hasVariants
      ? `Chọn tùy chọn cho ${product.name}`
      : quickAddState === "checking"
        ? `Đang kiểm tra ${product.name}`
        : quickAddState === "added"
          ? `Đã thêm ${product.name} vào giỏ hàng`
          : `Thêm ${product.name} vào giỏ hàng`;
  return (
    <article
      className={`sf-product-card relative${
        variant === "featured" ? " sf-product-card--featured" : ""
      }`}
    >
      <Link
        to={`/san-pham/${product.slug}`}
        className="sf-product-card__link"
      >
        <div className="sf-product-card__media">
          {primaryImage ? (
            <img
              src={optimizeCloudinaryUrl(primaryImage.url, 800)}
              srcSet={getCloudinarySrcSet(
                primaryImage.url,
                [320, 480, 640, 800, 960],
              )}
              sizes="(max-width: 639px) 50vw, (max-width: 1020px) 33vw, 25vw"
              alt={primaryImage.altText || product.name}
              width="800"
              height="848"
              loading="lazy"
              decoding="async"
            />
          ) : (
            <span className="sf-product-card__fallback" aria-hidden="true">
              {product.emoji}
            </span>
          )}

          {(product.badge || discountPercent > 0) && (
            <span className="sf-product-card__badge">
              {product.badge || `-${discountPercent}%`}
            </span>
          )}

          {isOutOfStock && (
            <span className="sf-product-card__stock">Tạm hết hàng</span>
          )}

          {typeof product.soldQuantity === "number" &&
            product.soldQuantity > 0 && (
              <span className="sf-product-card__sold">
                Đã bán {product.soldQuantity}
              </span>
            )}
        </div>

        <div className="sf-product-card__body">
          <p className="sf-product-card__category">{product.categoryName}</p>
          <h3 className="sf-product-card__title">{product.name}</h3>

          <div className="sf-product-card__footer">
            <div>
              <strong className="sf-product-card__price">
                {formatCurrency(product.price)}
              </strong>
              {product.compareAtPrice && (
                <span className="sf-product-card__compare">
                  {formatCurrency(product.compareAtPrice)}
                </span>
              )}
            </div>

            <span
              className="sf-product-card__arrow invisible"
              aria-hidden="true"
            >
              <CartIcon />
            </span>
          </div>
        </div>
      </Link>

      <button
        type="button"
        onClick={() => void handleQuickAdd()}
        disabled={isOutOfStock || isQuickAddBusy}
        className={`absolute z-20 grid flex-none place-items-center rounded-full border border-[rgba(255,95,143,0.22)] bg-[#fff8fa] text-[var(--sf-pink-strong)] shadow-[0_7px_18px_rgba(86,53,74,0.08)] transition duration-300 ease-out hover:border-[var(--sf-pink)] hover:bg-[var(--sf-pink)] hover:text-white focus-visible:outline focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[rgba(255,95,143,0.32)] disabled:cursor-not-allowed disabled:opacity-45 ${
          variant === "featured"
            ? "bottom-3 right-3 h-8 w-8"
            : "bottom-4 right-4 h-10 w-10"
        }`}
        aria-label={quickAddLabel}
        title={
          hasVariants
            ? "Chọn tùy chọn sản phẩm"
            : quickAddState === "added"
              ? "Đã thêm vào giỏ"
              : "Thêm vào giỏ"
        }
      >
        {quickAddState === "checking" ? (
          <span
            className="h-4 w-4 animate-spin rounded-full border-2 border-current border-r-transparent"
            aria-hidden="true"
          />
        ) : quickAddState === "added" ? (
          <span className="text-sm font-black" aria-hidden="true">
            ✓
          </span>
        ) : (
          <CartIcon />
        )}
      </button>

      <span className="sr-only" role="status" aria-live="polite">
        {quickAddState === "added"
          ? `Đã thêm ${product.name} vào giỏ hàng.`
          : ""}
      </span>
    </article>
  );
}
