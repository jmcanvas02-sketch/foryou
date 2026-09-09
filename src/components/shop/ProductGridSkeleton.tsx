export default function ProductGridSkeleton({
  count = 8,
}: {
  count?: number;
}) {
  return (
    <div className="sf-product-card-grid" aria-label="Đang tải sản phẩm">
      {Array.from({ length: count }).map((_item, index) => (
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
