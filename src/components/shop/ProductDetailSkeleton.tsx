export default function ProductDetailSkeleton() {
  return (
    <main
      className="sf-container grid gap-10 py-10 lg:grid-cols-[minmax(0,1.08fr)_minmax(360px,0.92fr)]"
      aria-label="Đang tải chi tiết sản phẩm"
    >
      <div className="aspect-square animate-pulse rounded-[20px] bg-[#e8e3dc]" />

      <div className="space-y-5 py-3">
        <div className="h-3 w-28 animate-pulse rounded bg-[#e2dcd4]" />
        <div className="h-10 w-full animate-pulse rounded bg-[#e2dcd4]" />
        <div className="h-10 w-3/4 animate-pulse rounded bg-[#e2dcd4]" />
        <div className="h-8 w-40 animate-pulse rounded bg-[#ded7cf]" />
        <div className="h-20 w-full animate-pulse rounded-[14px] bg-[#ebe6df]" />
        <div className="h-14 w-full animate-pulse rounded-[12px] bg-[#d8d1c9]" />
      </div>
    </main>
  );
}
