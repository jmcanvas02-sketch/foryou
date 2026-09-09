import { useMemo, useState } from "react";

import type { Product } from "../../types/product";
import { formatCurrency } from "../../utils/currency";
import {
  selectCartRecommendations,
} from "../../utils/cartRecommendations";
import ProductCard from "./ProductCard";

const SESSION_SEED_KEY =
  "ingiday-cart-recommendations-seed-v1";

function createSessionSeed() {
  const fallbackSeed = `${Date.now()}-${Math.random()}`;

  if (typeof window === "undefined") {
    return fallbackSeed;
  }

  try {
    const savedSeed = window.sessionStorage.getItem(
      SESSION_SEED_KEY,
    );

    if (savedSeed) {
      return savedSeed;
    }

    const nextSeed =
      typeof window.crypto?.randomUUID === "function"
        ? window.crypto.randomUUID()
        : fallbackSeed;

    window.sessionStorage.setItem(SESSION_SEED_KEY, nextSeed);
    return nextSeed;
  } catch {
    return fallbackSeed;
  }
}

export default function CartRecommendations({
  products,
  cartProductIds,
  remainingForFreeShipping,
  loading,
}: {
  products: Product[];
  cartProductIds: string[];
  remainingForFreeShipping: number;
  loading: boolean;
}) {
  const [seed] = useState(createSessionSeed);
  const recommendations = useMemo(
    () =>
      selectCartRecommendations({
        products,
        cartProductIds,
        remainingForFreeShipping,
        seed,
      }),
    [
      cartProductIds,
      products,
      remainingForFreeShipping,
      seed,
    ],
  );

  if (loading || recommendations.length === 0) {
    return null;
  }

  const firstFreeShippingProductId =
    remainingForFreeShipping > 0
      ? recommendations.find(
          (product) =>
            product.price >= remainingForFreeShipping,
        )?.id
      : undefined;

  return (
    <section
      className="sf-container pt-12 sm:pt-16"
      aria-labelledby="cart-recommendations-title"
    >
      <div className="max-w-2xl">
        <p className="text-[10px] font-black uppercase tracking-[0.16em] text-[var(--sf-pink-strong)]">
          {remainingForFreeShipping > 0
            ? "Gợi ý để freeship"
            : "Khám phá thêm"}
        </p>
        <h2
          id="cart-recommendations-title"
          className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--sf-ink)] sm:text-3xl"
        >
          {remainingForFreeShipping > 0
            ? "Thêm một món vừa đủ, tiết kiệm phí vận chuyển"
            : "Bạn có thể thích thêm những món này"}
        </h2>
        <p className="mt-3 text-sm leading-6 text-[var(--sf-ink-soft)] sm:text-base">
          {remainingForFreeShipping > 0 ? (
            <>
              Bạn còn thiếu{" "}
              <strong className="text-[var(--sf-pink-strong)]">
                {formatCurrency(remainingForFreeShipping)}
              </strong>
              . Các sản phẩm phù hợp nhất được xếp trước.
            </>
          ) : (
            <>
              Đơn hàng đã được freeship. Gợi ý được chọn
              ngẫu nhiên từ các bộ sưu tập khác nhau.
            </>
          )}
        </p>
      </div>

      <div className="mt-7 grid grid-flow-col auto-cols-[minmax(178px,72vw)] gap-4 overflow-x-auto pb-3 [scrollbar-width:none] sm:auto-cols-[minmax(210px,42vw)] lg:grid-flow-row lg:grid-cols-4 lg:auto-cols-auto lg:overflow-visible lg:pb-0">
        {recommendations.map((product) => (
          <div key={product.id} className="relative min-w-0">
            {product.id === firstFreeShippingProductId && (
              <span className="pointer-events-none absolute right-3 top-3 z-30 rounded-full border border-white/80 bg-white/95 px-2.5 py-1 text-[9px] font-black uppercase tracking-[0.08em] text-[#24835b] shadow-sm backdrop-blur">
                Thêm là đủ freeship
              </span>
            )}
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </section>
  );
}
