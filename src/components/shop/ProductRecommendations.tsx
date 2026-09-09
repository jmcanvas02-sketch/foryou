/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { fetchProductRecommendations } from "../../services/productRecommendations";
import type { Product } from "../../types/product";
import ProductCard from "./ProductCard";

type ProductRecommendationsProps = {
  product: Pick<Product, "id" | "categoryId">;
};

type RecommendationState = {
  similar: Product[];
  bestselling: Product[];
};

const emptyState: RecommendationState = {
  similar: [],
  bestselling: [],
};

function CardsSkeleton() {
  return (
    <div className="sf-product-card-grid">
      {Array.from({ length: 6 }).map((_item, index) => (
        <div
          key={index}
          className="sf-product-card-skeleton"
          aria-hidden="true"
        >
          <div className="sf-product-card-skeleton__media animate-pulse" />
          <div className="sf-product-card-skeleton__body">
            <div className="sf-product-card-skeleton__line sf-product-card-skeleton__line--short animate-pulse" />
            <div className="sf-product-card-skeleton__line animate-pulse" />
            <div className="sf-product-card-skeleton__line sf-product-card-skeleton__line--price animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  );
}

function RecommendationGroup({
  eyebrow,
  title,
  description,
  products,
}: {
  eyebrow: string;
  title: string;
  description: string;
  products: Product[];
}) {
  if (products.length === 0) {
    return null;
  }

  return (
    <section>
      <p className="sf-recommendations__eyebrow">{eyebrow}</p>
      <h2>{title}</h2>
      <p className="sf-recommendations__description">{description}</p>

      <div className="sf-product-card-grid sf-recommendations__grid">
        {products.map((item) => (
          <ProductCard key={item.id} product={item} variant="featured" />
        ))}
      </div>
    </section>
  );
}

export default function ProductRecommendations({
  product,
}: ProductRecommendationsProps) {
  const [data, setData] = useState(emptyState);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");

    void fetchProductRecommendations(
      product.id,
      product.categoryId,
      6,
      retryVersion > 0,
    )
      .then((result) => {
        if (active) {
          setData(result);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Không thể tải gợi ý sản phẩm.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [product.categoryId, product.id, retryVersion]);

  if (loading) {
    return (
      <section className="sf-recommendations">
        <p className="sf-recommendations__eyebrow">Có thể bạn sẽ thích</p>
        <h2>Đang tải sản phẩm gợi ý</h2>
        <div className="sf-recommendations__grid">
          <CardsSkeleton />
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="sf-recommendations">
        <div className="sf-recommendations__error">
          <p>{error}</p>
          <button
            type="button"
            onClick={() => setRetryVersion((current) => current + 1)}
            className="sf-button mt-4 border border-[var(--sf-border)] bg-white text-[var(--sf-ink)]"
          >
            Tải lại gợi ý
          </button>
        </div>
      </section>
    );
  }

  if (
    data.similar.length === 0 &&
    data.bestselling.length === 0
  ) {
    return null;
  }

  return (
    <div className="sf-recommendations">
      <div className="sf-recommendations__groups">
        <RecommendationGroup
          eyebrow="Cùng cảm hứng"
          title="Có thể bạn sẽ thích"
          description="Những món cùng nhóm sản phẩm để bạn khám phá thêm."
          products={data.similar}
        />

        <RecommendationGroup
          eyebrow="Được quan tâm"
          title="Những món đang được chọn nhiều"
          description="Gợi ý thêm từ các sản phẩm bán chạy trong cửa hàng."
          products={data.bestselling}
        />
      </div>
    </div>
  );
}
