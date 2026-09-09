import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useSearchParams } from "react-router-dom";
import ProductGridSkeleton from "../../components/shop/ProductGridSkeleton";
import ProductCard from "../../components/shop/ProductCard";
import { useAdTracking } from "../../features/ads/AdTrackingContext";
import { useDebouncedValue } from "../../hooks/useDebouncedValue";
import { useProductSearch } from "../../hooks/useProductSearch";
import { fetchActiveCategories } from "../../services/products";
import type {
  CatalogSort,
  Category,
  ProductSearchFilters,
} from "../../types/product";

const PAGE_SIZE = 12;

function numberParam(
  value: string | null,
  fallback: number,
) {
  if (value === null || value.trim() === "") {
    return fallback;
  }

  const parsed = Number(value);

  return Number.isFinite(parsed) && parsed >= 0
    ? parsed
    : fallback;
}

function SearchIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="20"
      height="20"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function FilterIcon() {
  return (
    <svg
      viewBox="0 0 24 24"
      width="22"
      height="22"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M4 6h16" />
      <path d="M7 12h10" />
      <path d="M10 18h4" />
    </svg>
  );
}

export default function ProductsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const { trackSearch } = useAdTracking();
  const lastTrackedSearchRef = useRef("");

  const keyword = searchParams.get("q") ?? "";
  const categoryParam = searchParams.get("danh-muc") ?? "";
  const minPrice = numberParam(searchParams.get("gia-tu"), 0);
  const maxPrice = numberParam(searchParams.get("gia-den"), 500000);
  const inStock = searchParams.get("con-hang") === "1";
  const sort =
    (searchParams.get("sap-xep") as CatalogSort | null) ??
    "relevance";
  const page = Math.max(
    1,
    numberParam(searchParams.get("trang"), 1),
  );

  const debouncedKeyword = useDebouncedValue(keyword, 400);

  useEffect(() => {
    const normalizedKeyword = debouncedKeyword.trim();

    if (normalizedKeyword.length < 2) {
      lastTrackedSearchRef.current = "";
      return;
    }

    const trackingKey =
      normalizedKeyword.toLocaleLowerCase("vi");

    if (lastTrackedSearchRef.current === trackingKey) {
      return;
    }

    lastTrackedSearchRef.current = trackingKey;
    void trackSearch(normalizedKeyword);
  }, [debouncedKeyword, trackSearch]);

  const [categories, setCategories] = useState<Category[]>([]);
  const [categoriesError, setCategoriesError] = useState("");

  useEffect(() => {
    let active = true;

    void fetchActiveCategories()
      .then((data) => {
        if (active) {
          setCategories(data);
          setCategoriesError("");
        }
      })
      .catch((error: unknown) => {
        if (active) {
          setCategoriesError(
            error instanceof Error
              ? error.message
              : "Không thể tải danh mục.",
          );
        }
      });

    return () => {
      active = false;
    };
  }, []);

  const resolvedCategoryId = useMemo(() => {
    if (!categoryParam) {
      return "";
    }

    const matchedCategory = categories.find(
      (category) =>
        category.id === categoryParam ||
        category.slug === categoryParam,
    );

    return matchedCategory?.id ?? "";
  }, [categories, categoryParam]);

  const filters = useMemo<ProductSearchFilters>(
    () => ({
      query: debouncedKeyword,
      categoryId: resolvedCategoryId,
      minPrice,
      maxPrice,
      inStock,
      sort,
      page,
      pageSize: PAGE_SIZE,
    }),
    [
      resolvedCategoryId,
      debouncedKeyword,
      inStock,
      maxPrice,
      minPrice,
      page,
      sort,
    ],
  );

  const {
    data,
    loading,
    error,
    retry,
  } = useProductSearch(filters);

  function updateParam(
    name: string,
    value?: string,
    resetPage = true,
  ) {
    const next = new URLSearchParams(searchParams);

    if (value) {
      next.set(name, value);
    } else {
      next.delete(name);
    }

    if (resetPage) {
      next.delete("trang");
    }

    setSearchParams(next, {
      replace: true,
    });
  }

  function goToPage(nextPage: number) {
    updateParam("trang", String(nextPage), false);

    window.scrollTo({
      top: 0,
      behavior: "smooth",
    });
  }

  const hasPreviousData = data.products.length > 0;
  const selectedCategory = categories.find(
    (category) =>
      category.id === categoryParam ||
      category.slug === categoryParam,
  );

  const activeFilterCount =
    Number(minPrice > 0) +
    Number(maxPrice < 500000) +
    Number(inStock);

  return (
    <main className="storefront-page storefront-products-page pb-20">
      <section className="border-b border-[rgba(88,63,80,0.06)] bg-[linear-gradient(135deg,#fff8f2_0%,#fff1f5_56%,#f5f1ff_100%)]">
        <div className="sf-container py-12 sm:py-16">
          <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--sf-pink-strong)]">
            <span className="h-2 w-2 rounded-full bg-[var(--sf-pink)] shadow-[0_0_0_5px_rgba(255,95,143,0.10)]" />
            Cửa hàng InGiDay
          </span>

          <h1 className="mt-4 max-w-3xl text-4xl font-black tracking-[-0.055em] text-[var(--sf-ink)] sm:text-5xl lg:text-6xl">
            Tìm một món
            <span className="block text-[var(--sf-pink)]">
              đúng gu của bạn ♡
            </span>
          </h1>

          <p className="mt-4 max-w-2xl text-base leading-7 text-[var(--sf-ink-soft)]">
            Tìm có dấu hoặc không dấu, chọn danh mục và sắp xếp
            trực tiếp từ kho sản phẩm.
          </p>
        </div>
      </section>

      <section className="sf-container pt-8">
        <div className="rounded-[22px] border border-[rgba(88,63,80,0.07)] bg-white p-3 shadow-[0_14px_38px_rgba(86,53,74,0.07)]">
          <div className="grid gap-3 lg:grid-cols-[minmax(220px,1.25fr)_minmax(170px,0.72fr)_minmax(150px,0.62fr)_auto] lg:items-end">
            <label className="min-w-0">
              <span className="sr-only">Tìm kiếm</span>
              <span className="flex h-11 items-center gap-3 rounded-2xl border border-[var(--sf-border)] bg-[#faf6f8] px-4 transition focus-within:border-[rgba(255,95,143,0.42)] focus-within:bg-white focus-within:shadow-[0_0_0_5px_rgba(255,95,143,0.07)]">
                <SearchIcon />
                <input
                  value={keyword}
                  onChange={(event) =>
                    updateParam("q", event.target.value)
                  }
                  className="min-w-0 flex-1 border-0 bg-transparent text-sm font-normal text-[var(--sf-ink)] outline-none placeholder:text-[#9a909b]"
                  placeholder="Tìm sản phẩm..."
                />
              </span>
            </label>

            <label className="min-w-0">
              <span className="sr-only">Danh mục</span>
              <select
                value={categoryParam}
                onChange={(event) =>
                  updateParam("danh-muc", event.target.value)
                }
                className="h-11 w-full rounded-2xl border border-[var(--sf-border)] bg-[#faf6f8] px-4 text-sm font-semibold text-[var(--sf-ink)] outline-none transition focus:border-[rgba(255,95,143,0.42)] focus:bg-white"
                aria-label="Danh mục sản phẩm"
              >
                <option value="">Tất cả danh mục</option>
                {categories.map((category) => (
                  <option key={category.id} value={category.slug}>
                    {category.name}
                  </option>
                ))}
              </select>
            </label>

            <label className="min-w-0">
              <span className="sr-only">Sắp xếp</span>
              <select
                value={sort}
                onChange={(event) =>
                  updateParam("sap-xep", event.target.value)
                }
                className="h-11 w-full rounded-2xl border border-[var(--sf-border)] bg-[#faf6f8] px-4 text-sm font-semibold text-[var(--sf-ink)] outline-none transition focus:border-[rgba(255,95,143,0.42)] focus:bg-white"
                aria-label="Sắp xếp sản phẩm"
              >
                <option value="relevance">Liên quan nhất</option>
                <option value="newest">Mới nhất</option>
                <option value="bestselling">Bán chạy</option>
                <option value="price_asc">Giá tăng dần</option>
                <option value="price_desc">Giá giảm dần</option>
              </select>
            </label>

            <button
              type="button"
              onClick={() => setFiltersOpen((current) => !current)}
              className="flex h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--sf-border)] bg-white px-4 text-sm font-black text-[var(--sf-ink)] transition hover:border-[rgba(255,95,143,0.26)] hover:bg-[var(--sf-pink-wash)] hover:text-[var(--sf-pink-strong)]"
              aria-expanded={filtersOpen}
              aria-controls="catalog-advanced-filters"
            >
              <FilterIcon />
              <span>Bộ lọc</span>
              {activeFilterCount > 0 && (
                <span className="grid h-5 min-w-5 place-items-center rounded-full bg-[var(--sf-pink)] px-1 text-[10px] text-white">
                  {activeFilterCount}
                </span>
              )}
            </button>
          </div>

          {activeFilterCount > 0 && (
            <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-bold text-[var(--sf-ink-soft)]">
              <span>Đang lọc:</span>
              {minPrice > 0 && (
                <button
                  type="button"
                  onClick={() => updateParam("gia-tu", undefined)}
                  className="rounded-full bg-[var(--sf-pink-wash)] px-3 py-1.5 text-[var(--sf-pink-strong)]"
                >
                  Từ {minPrice.toLocaleString("vi-VN")}₫ ×
                </button>
              )}
              {maxPrice < 500000 && (
                <button
                  type="button"
                  onClick={() => updateParam("gia-den", undefined)}
                  className="rounded-full bg-[var(--sf-pink-wash)] px-3 py-1.5 text-[var(--sf-pink-strong)]"
                >
                  Đến {maxPrice.toLocaleString("vi-VN")}₫ ×
                </button>
              )}
              {inStock && (
                <button
                  type="button"
                  onClick={() => updateParam("con-hang", undefined)}
                  className="rounded-full bg-[var(--sf-pink-wash)] px-3 py-1.5 text-[var(--sf-pink-strong)]"
                >
                  Còn hàng ×
                </button>
              )}
            </div>
          )}

          {filtersOpen && (
            <div
              id="catalog-advanced-filters"
              className="fixed inset-x-3 bottom-3 z-50 max-h-[70vh] overflow-y-auto rounded-[22px] border border-[var(--sf-border)] bg-white p-4 shadow-[0_28px_80px_rgba(40,24,34,0.24)] sm:static sm:mt-3 sm:max-h-none sm:overflow-visible sm:bg-[var(--sf-paper)] sm:shadow-none"
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-sm font-black tracking-[-0.02em] text-[var(--sf-ink)]">
                    Bộ lọc nâng cao
                  </h2>
                  <p className="mt-1 text-[10px] leading-4 text-[var(--sf-ink-soft)]">
                    Chỉ mở khi cần lọc kỹ hơn.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setFiltersOpen(false)}
                  className="grid h-8 w-8 place-items-center rounded-full border border-[var(--sf-border)] bg-white text-lg leading-none text-[var(--sf-ink-soft)]"
                  aria-label="Đóng bộ lọc nâng cao"
                >
                  ×
                </button>
              </div>

              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] lg:items-end">
                <label className="min-w-0 text-xs font-black text-[var(--sf-ink)]">
                  Giá từ
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    value={minPrice}
                    onChange={(event) =>
                      updateParam("gia-tu", event.target.value)
                    }
                    className="mt-2 h-11 w-full rounded-2xl border border-[var(--sf-border)] bg-white px-4 font-normal text-[var(--sf-ink)] outline-none transition focus:border-[rgba(255,95,143,0.42)]"
                  />
                </label>

                <label className="min-w-0 text-xs font-black text-[var(--sf-ink)]">
                  Giá đến
                  <input
                    type="number"
                    min="0"
                    step="10000"
                    value={maxPrice}
                    onChange={(event) =>
                      updateParam("gia-den", event.target.value)
                    }
                    className="mt-2 h-11 w-full rounded-2xl border border-[var(--sf-border)] bg-white px-4 font-normal text-[var(--sf-ink)] outline-none transition focus:border-[rgba(255,95,143,0.42)]"
                  />
                </label>

                <label className="inline-flex min-h-11 cursor-pointer items-center gap-3 rounded-2xl border border-[var(--sf-border)] bg-white px-4 text-sm font-bold text-[var(--sf-ink)] sm:col-span-2 lg:col-span-1">
                  <input
                    type="checkbox"
                    checked={inStock}
                    onChange={(event) =>
                      updateParam(
                        "con-hang",
                        event.target.checked ? "1" : undefined,
                      )
                    }
                    className="h-5 w-5 accent-[var(--sf-pink)]"
                  />
                  Chỉ còn hàng
                </label>
              </div>
            </div>
          )}
        </div>
        {(error || categoriesError) && (
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 rounded-[22px] border border-[rgba(214,117,80,0.18)] bg-[#fff5ed] px-5 py-4 text-sm font-semibold text-[#884426]">
            <span>{error || categoriesError}</span>
            <button
              type="button"
              onClick={retry}
              className="rounded-full bg-white px-4 py-2 font-black text-[var(--sf-pink-strong)] shadow-sm"
            >
              Thử lại
            </button>
          </div>
        )}

        <div className="mt-8 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-[11px] font-black uppercase tracking-[0.14em] text-[var(--sf-pink-strong)]">
              {selectedCategory?.name || "Tất cả sản phẩm"}
            </p>
            <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--sf-ink)] sm:text-3xl">
              Tìm thấy {data.total} sản phẩm
            </h2>
          </div>

          {loading && hasPreviousData && (
            <p className="rounded-full bg-[var(--sf-pink-wash)] px-4 py-2 text-xs font-bold text-[var(--sf-pink-strong)]">
              Đang cập nhật kết quả...
            </p>
          )}
        </div>

        <div
          className={`relative mt-6 transition-opacity ${
            loading && hasPreviousData
              ? "opacity-60"
              : "opacity-100"
          }`}
        >
          {loading && !hasPreviousData ? (
            <ProductGridSkeleton count={PAGE_SIZE} />
          ) : data.products.length > 0 ? (
            <div className="grid grid-cols-2 gap-x-3 gap-y-7 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {data.products.map((product) => (
                <ProductCard
                  key={product.id}
                  product={product}
                />
              ))}
            </div>
          ) : (
            <div className="grid min-h-72 place-items-center rounded-[32px] border border-dashed border-[rgba(255,95,143,0.28)] bg-[var(--sf-pink-wash)] p-8 text-center">
              <div>
                <span
                  className="text-5xl text-[var(--sf-pink)]"
                  aria-hidden="true"
                >
                  ♡
                </span>
                <h2 className="mt-3 text-2xl font-black tracking-[-0.03em] text-[var(--sf-ink)]">
                  Chưa tìm thấy sản phẩm
                </h2>
                <p className="mt-2 text-sm text-[var(--sf-ink-soft)]">
                  Hãy đổi từ khóa hoặc bộ lọc.
                </p>
              </div>
            </div>
          )}
        </div>

        {data.totalPages > 1 && (
          <nav
            className="mt-10 flex flex-wrap items-center justify-center gap-3"
            aria-label="Phân trang sản phẩm"
          >
            <button
              type="button"
              disabled={page <= 1 || loading}
              onClick={() => goToPage(page - 1)}
              className="min-h-11 rounded-full border border-[var(--sf-border)] bg-white px-5 font-black text-[var(--sf-ink)] shadow-sm transition hover:-translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-40"
            >
              ← Trang trước
            </button>

            <span className="rounded-full bg-[var(--sf-pink-wash)] px-5 py-3 text-sm font-black text-[var(--sf-pink-strong)]">
              Trang {page}/{data.totalPages}
            </span>

            <button
              type="button"
              disabled={
                page >= data.totalPages || loading
              }
              onClick={() => goToPage(page + 1)}
              className="min-h-11 rounded-full bg-[var(--sf-pink)] px-5 font-black text-white shadow-[0_10px_24px_rgba(255,95,143,0.24)] transition hover:-translate-y-0.5 hover:bg-[var(--sf-pink-strong)] disabled:cursor-not-allowed disabled:opacity-40"
            >
              Trang sau →
            </button>
          </nav>
        )}
      </section>
    </main>
  );
}

// IGD_REFINED_STOREFRONT_UI_20260718
