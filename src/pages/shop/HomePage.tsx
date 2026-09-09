/* eslint-disable react-hooks/set-state-in-effect */
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import ProductCard from "../../components/shop/ProductCard";
import ProductGridSkeleton from "../../components/shop/ProductGridSkeleton";
import { useBanners } from "../../features/banners/BannersContext";
import { useSettings } from "../../features/settings/SettingsContext";
import {
  getCloudinarySrcSet,
  optimizeCloudinaryUrl,
} from "../../lib/cloudinary";
import {
  fetchActiveCategories,
  fetchCollectionProductPreviews,
  fetchFeaturedProducts,
  searchProducts,
} from "../../services/products";
import type { Category, Product } from "../../types/product";
import { formatCurrency } from "../../utils/currency";
import "./HomePage.css";

const COLLECTION_TONES = ["pink", "yellow", "lavender", "mint"] as const;

const COLLECTION_COPY: Array<{
  matches: string[];
  description: string;
}> = [
  {
    matches: ["móc khóa", "moc khoa"],
    description: "Nhỏ xinh, mang theo mọi khoảnh khắc",
  },
  {
    matches: ["decor", "trang trí", "trang tri"],
    description: "Trang trí góc nhỏ thêm xinh",
  },
  {
    matches: ["mô hình", "mo hinh", "mini"],
    description: "Sưu tầm niềm vui mỗi ngày",
  },
  {
    matches: ["god"],
    description: "Đồ decor truyền cảm hứng tích cực",
  },
];

function isBannerAvailable(startsAt?: string, endsAt?: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (startsAt) {
    const start = new Date(`${startsAt}T00:00:00`);
    if (start > today) {
      return false;
    }
  }

  if (endsAt) {
    const end = new Date(`${endsAt}T23:59:59`);
    if (end < today) {
      return false;
    }
  }

  return true;
}

function primaryImage(product?: Product) {
  if (!product) {
    return undefined;
  }

  return (
    (product.images ?? []).find((image) => image.isPrimary) ??
    (product.images ?? [])[0]
  );
}

function collectionDescription(category: Category) {
  const normalizedName = category.name.trim().toLowerCase();

  return (
    COLLECTION_COPY.find((item) =>
      item.matches.some((keyword) => normalizedName.includes(keyword)),
    )?.description ?? "Khám phá những món hợp mood của bạn"
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

function PencilIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m4 20 4.5-1 10-10a2.1 2.1 0 0 0-3-3l-10 10L4 20Z" />
      <path d="m13.5 7.5 3 3" />
    </svg>
  );
}

function SparkIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="m12 3 1.7 4.3L18 9l-4.3 1.7L12 15l-1.7-4.3L6 9l4.3-1.7L12 3Z" />
      <path d="m18.5 15 .8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2Z" />
    </svg>
  );
}

function CardIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <rect x="3" y="5" width="18" height="14" rx="3" />
      <path d="M3 10h18" />
      <path d="M7 15h4" />
    </svg>
  );
}

function HeadsetIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 13v-1a8 8 0 0 1 16 0v1" />
      <path d="M4 13h3v6H5a1 1 0 0 1-1-1v-5Z" />
      <path d="M20 13h-3v6h2a1 1 0 0 0 1-1v-5Z" />
      <path d="M17 19c-.7 1.3-2.2 2-4 2" />
    </svg>
  );
}

type HomeProductSectionProps = {
  kicker: string;
  title: string;
  symbol: string;
  products: Product[];
  loading: boolean;
  emptyText: string;
  href: string;
};

function HomeProductSection({
  kicker,
  title,
  symbol,
  products,
  loading,
  emptyText,
  href,
}: HomeProductSectionProps) {
  return (
    <div className="home-cute__featured">
      <div className="home-cute__section-heading home-cute__section-heading--compact">
        <div>
          <span className="home-cute__section-kicker">{kicker}</span>
          <h2>
            {title} <span aria-hidden="true">{symbol}</span>
          </h2>
        </div>

        <Link to={href} className="home-cute__text-link">
          Xem tất cả
          <ArrowIcon />
        </Link>
      </div>

      {loading && products.length === 0 ? (
        <ProductGridSkeleton count={5} />
      ) : products.length > 0 ? (
        <div className="home-cute__product-grid">
          {products.map((product) => (
            <ProductCard
              key={product.id}
              product={product}
              variant="featured"
            />
          ))}
        </div>
      ) : (
        <div className="home-cute__empty-state">
          <span aria-hidden="true">♡</span>
          <p>{emptyText}</p>
        </div>
      )}
    </div>
  );
}
export default function HomePage() {
  const {
    banners,
    loading: bannersLoading,
    error: bannersError,
  } = useBanners();
  const { settings } = useSettings();

  const [categories, setCategories] = useState<Category[]>([]);
  const [featuredProducts, setFeaturedProducts] = useState<Product[]>([]);
  const [bestSellingProducts, setBestSellingProducts] = useState<Product[]>([]);
  const [newProducts, setNewProducts] = useState<Product[]>([]);
  const [collectionProducts, setCollectionProducts] = useState<
    Record<string, Product[]>
  >({});
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState("");
  const [heroSlideIndex, setHeroSlideIndex] = useState(0);
  const [heroPaused, setHeroPaused] = useState(false);
  const [collectionPageIndex, setCollectionPageIndex] = useState(0);
  const [collectionPageSize, setCollectionPageSize] = useState(8);
  const collectionSwipeStartRef = useRef<number | null>(null);

  const loadCatalog = useCallback(async (force = false) => {
    setCatalogLoading(true);
    setCatalogError("");

    try {
      const [
        nextCategories,
        nextFeaturedProducts,
        bestSellingResult,
        newestResult,
      ] = await Promise.all([
        fetchActiveCategories({ force }),
        fetchFeaturedProducts(5, { force }),
        searchProducts(
          {
            sort: "bestselling",
            page: 1,
            pageSize: 5,
          },
          { force },
        ),
        searchProducts(
          {
            sort: "newest",
            page: 1,
            pageSize: 5,
          },
          { force },
        ),
      ]);

      setCategories(nextCategories);
      setBestSellingProducts(
        bestSellingResult.products.filter(
          (product) => (product.soldQuantity ?? 0) > 0,
        ),
      );
      setNewProducts(newestResult.products);
      setFeaturedProducts(nextFeaturedProducts);

      const nextCollectionProducts = await fetchCollectionProductPreviews(
        nextCategories,
        3,
        { force },
      );

      setCollectionProducts(nextCollectionProducts);
    } catch (error) {
      setCatalogError(
        error instanceof Error ? error.message : "Không thể tải sản phẩm.",
      );
    } finally {
      setCatalogLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCatalog();
  }, [loadCatalog]);

  const banner = [...banners]
    .filter(
      (item) =>
        item.active && isBannerAvailable(item.startsAt, item.endsAt),
    )
    .sort((left, right) => left.sortOrder - right.sortOrder)[0];

  const messengerUrl = settings.messengerUrl.trim();
  const heroImageUrl =
    banner?.imageUrl?.trim() || "/images/ingiday-hero-default.webp";
  const heroImageAlt =
    banner?.imageAlt?.trim() ||
    "Móc khóa thỏ, đèn decor và mô hình robot 3D phong cách InGiDay";

  const featuredHeroProducts = featuredProducts
    .filter((item) => Boolean(primaryImage(item)))
    .slice(0, 5);
  const heroSlideCount = featuredHeroProducts.length;
  const activeHeroProduct =
    heroSlideCount > 0
      ? featuredHeroProducts[heroSlideIndex % heroSlideCount]
      : undefined;
  const activeHeroImage = primaryImage(activeHeroProduct);
  const activeHeroHref = activeHeroProduct
    ? `/san-pham/${activeHeroProduct.slug}`
    : banner?.primaryLink || "/san-pham";
  const activeHeroAlt =
    activeHeroImage?.altText ||
    activeHeroProduct?.name ||
    heroImageAlt;
  const customPreviewProduct =
    featuredProducts[1] ||
    featuredProducts[0] ||
    newProducts[0] ||
    bestSellingProducts[0];
  const customPreviewImage = primaryImage(customPreviewProduct);

  useEffect(() => {
    setHeroSlideIndex((current) =>
      heroSlideCount > 0 ? current % heroSlideCount : 0,
    );
  }, [heroSlideCount]);

  useEffect(() => {
    if (heroPaused || heroSlideCount <= 1) {
      return;
    }

    const timer = window.setInterval(() => {
      setHeroSlideIndex((current) => (current + 1) % heroSlideCount);
    }, 8000);

    return () => {
      window.clearInterval(timer);
    };
  }, [heroPaused, heroSlideCount]);

  const moveHeroSlide = (direction: "previous" | "next") => {
    if (heroSlideCount <= 1) {
      return;
    }

    setHeroSlideIndex((current) => {
      const offset = direction === "next" ? 1 : -1;
      return (current + offset + heroSlideCount) % heroSlideCount;
    });
  };

  useEffect(() => {
    const mediaQuery = window.matchMedia("(max-width: 700px)");

    const syncCollectionPageSize = () => {
      setCollectionPageSize(mediaQuery.matches ? 4 : 8);
      setCollectionPageIndex(0);
    };

    syncCollectionPageSize();

    if (typeof mediaQuery.addEventListener === "function") {
      mediaQuery.addEventListener("change", syncCollectionPageSize);
      return () => {
        mediaQuery.removeEventListener("change", syncCollectionPageSize);
      };
    }

    mediaQuery.addListener(syncCollectionPageSize);
    return () => {
      mediaQuery.removeListener(syncCollectionPageSize);
    };
  }, []);

  const collectionPageCount = Math.max(
    1,
    Math.ceil(categories.length / collectionPageSize),
  );
  const collectionPages = Array.from(
    { length: collectionPageCount },
    (_item, pageIndex) =>
      categories.slice(
        pageIndex * collectionPageSize,
        (pageIndex + 1) * collectionPageSize,
      ),
  );

  useEffect(() => {
    setCollectionPageIndex((current) =>
      Math.min(current, collectionPageCount - 1),
    );
  }, [collectionPageCount]);

  const moveCollectionPage = (direction: "left" | "right") => {
    if (collectionPageCount <= 1) {
      return;
    }

    setCollectionPageIndex((current) =>
      direction === "right"
        ? (current + 1) % collectionPageCount
        : (current - 1 + collectionPageCount) % collectionPageCount,
    );
  };

  const handleCollectionTouchStart = (clientX: number) => {
    collectionSwipeStartRef.current = clientX;
  };

  const handleCollectionTouchEnd = (clientX: number) => {
    const startX = collectionSwipeStartRef.current;
    collectionSwipeStartRef.current = null;

    if (startX === null || Math.abs(clientX - startX) < 44) {
      return;
    }

    moveCollectionPage(clientX < startX ? "right" : "left");
  };

  return (
    <main className="home-cute">
      <section
        className="home-cute__hero"
        style={{
          background:
            banner?.background ||
            "linear-gradient(135deg, #fffaf5 0%, #fff6ee 52%, #fffaf8 100%)",
        }}
      >
        <div className="sf-container home-cute__hero-grid">
          <div className="home-cute__hero-copy">
            <span className="home-cute__eyebrow">
              {banner?.badge || "Đồ nhỏ xinh, làm thật chỉn chu"}
            </span>

            <h1>
              {banner?.title ? (
                banner.title
              ) : (
                <>
                  Mỗi món đồ đều có
                  <span>một chút “bạn” trong đó.</span>
                </>
              )}
            </h1>

            <p>
              {banner?.description ||
                "Móc khóa, mô hình mini và sản phẩm in riêng được hoàn thiện tinh gọn, dễ thương vừa đủ và đẹp trong từng góc nhìn."}
            </p>

            <div className="home-cute__hero-actions">
              <Link
                className="sf-button sf-button--primary"
                to={banner?.primaryLink || "/san-pham"}
              >
                {banner?.primaryLabel || "Khám phá sản phẩm"}
                <ArrowIcon />
              </Link>

              <Link
                className="sf-button home-cute__button-secondary"
                to={banner?.secondaryLink || "/in-rieng"}
              >
                {banner?.secondaryLabel || "Đặt in theo ý tưởng"}
                <PencilIcon />
              </Link>
            </div>

          </div>

          <div
            className="home-cute__hero-visual home-premium__hero-carousel"
            onMouseEnter={() => setHeroPaused(true)}
            onMouseLeave={() => setHeroPaused(false)}
          >
            <Link
              className="home-premium__hero-slide"
              to={activeHeroHref}
              aria-label={
                activeHeroProduct
                  ? `Xem sản phẩm ${activeHeroProduct.name}`
                  : "Khám phá sản phẩm InGiDay"
              }
              style={{
                backgroundColor:
                  activeHeroProduct?.background || "#e9e4dc",
              }}
            >
              <img
                key={activeHeroProduct?.id || heroImageUrl}
                src={
                  activeHeroImage
                    ? optimizeCloudinaryUrl(activeHeroImage.url, 1400)
                    : heroImageUrl
                }
                srcSet={
                  activeHeroImage
                    ? getCloudinarySrcSet(activeHeroImage.url, [
                        640,
                        900,
                        1200,
                        1400,
                      ])
                    : undefined
                }
                sizes="(max-width: 1020px) calc(100vw - 40px), 54vw"
                alt={activeHeroAlt}
                fetchPriority="high"
              />

              {activeHeroProduct && (
                <span className="home-premium__hero-product-card">
                  <small>{activeHeroProduct.categoryName}</small>
                  <strong>{activeHeroProduct.name}</strong>
                  <em>{formatCurrency(activeHeroProduct.price)}</em>
                </span>
              )}
            </Link>

            {heroSlideCount > 1 && (
              <>
                <button
                  type="button"
                  className="home-premium__hero-arrow home-premium__hero-arrow--previous"
                  onClick={() => moveHeroSlide("previous")}
                  aria-label="Xem sản phẩm nổi bật trước"
                >
                  ←
                </button>
                <button
                  type="button"
                  className="home-premium__hero-arrow home-premium__hero-arrow--next"
                  onClick={() => moveHeroSlide("next")}
                  aria-label="Xem sản phẩm nổi bật tiếp theo"
                >
                  →
                </button>

                <div
                  className="home-premium__hero-counter"
                  aria-label={`Sản phẩm nổi bật ${
                    (heroSlideIndex % heroSlideCount) + 1
                  } trên ${heroSlideCount}`}
                >
                  <span>
                    {String((heroSlideIndex % heroSlideCount) + 1).padStart(
                      2,
                      "0",
                    )}
                  </span>
                  <span aria-hidden="true">/</span>
                  <span>{String(heroSlideCount).padStart(2, "0")}</span>
                </div>
              </>
            )}
          </div>
        </div>
      </section>

      {(bannersError || catalogError) && (
        <div className="sf-container home-cute__notice" role="alert">
          <span>
            {catalogError ||
              bannersError ||
              "Không thể tải đầy đủ dữ liệu trang chủ."}
          </span>
          {catalogError && (
            <button type="button" onClick={() => void loadCatalog(true)}>
              Thử lại
            </button>
          )}
        </div>
      )}

      {bannersLoading && (
        <p className="sf-container home-cute__loading-note">
          Đang cập nhật banner...
        </p>
      )}

      <section className="home-cute__content">
        <div className="sf-container home-cute__panel">
          <div className="home-cute__section-heading">
            <div>
              <span className="home-cute__section-kicker">Bộ sưu tập</span>
              <h2>
                Chọn theo điều bạn đang thích
              </h2>
            </div>

            <div className="home-cute__section-actions">
              {collectionPageCount > 1 && (
                <div
                  className="home-cute__collection-nav"
                  aria-label="Điều hướng bộ sưu tập"
                >
                  <button
                    type="button"
                    onClick={() => moveCollectionPage("left")}
                    aria-label="Xem nhóm bộ sưu tập phía trước"
                  >
                    ←
                  </button>
                  <span aria-live="polite">
                    {String(collectionPageIndex + 1).padStart(2, "0")} /{
                      " "
                    }
                    {String(collectionPageCount).padStart(2, "0")}
                  </span>
                  <button
                    type="button"
                    onClick={() => moveCollectionPage("right")}
                    aria-label="Xem nhóm bộ sưu tập tiếp theo"
                  >
                    →
                  </button>
                </div>
              )}

              <Link to="/san-pham" className="home-cute__text-link">
                Xem tất cả
                <ArrowIcon />
              </Link>
            </div>
          </div>

          <div
            className="home-cute__collection-carousel"
            onTouchStart={(event) =>
              handleCollectionTouchStart(event.touches[0]?.clientX ?? 0)
            }
            onTouchEnd={(event) =>
              handleCollectionTouchEnd(event.changedTouches[0]?.clientX ?? 0)
            }
            onTouchCancel={() => {
              collectionSwipeStartRef.current = null;
            }}
          >
            <div
              className="home-cute__collection-pages"
              style={{
                transform: `translate3d(-${collectionPageIndex * 100}%, 0, 0)`,
              }}
            >
              {catalogLoading && categories.length === 0 ? (
                <div
                  className="home-cute__collection-page"
                  aria-hidden="true"
                >
                  {Array.from({ length: collectionPageSize }).map(
                    (_item, index) => (
                      <div
                        className="home-cute__collection-skeleton"
                        key={index}
                        aria-hidden="true"
                      />
                    ),
                  )}
                </div>
              ) : (
                collectionPages.map((pageCategories, pageIndex) => (
                  <div
                    className="home-cute__collection-page"
                    key={`collection-page-${pageIndex}`}
                    aria-hidden={pageIndex !== collectionPageIndex}
                  >
                    {pageCategories.map((category, cardIndex) => {
                      const globalIndex =
                        pageIndex * collectionPageSize + cardIndex;
                      const previews = collectionProducts[category.id] ?? [];
                      const previewImages = previews
                        .map((previewProduct) => ({
                          product: previewProduct,
                          image: primaryImage(previewProduct),
                        }))
                        .filter((item) => Boolean(item.image))
                        .slice(0, 3);
                      const tone =
                        COLLECTION_TONES[
                          globalIndex % COLLECTION_TONES.length
                        ];

                      return (
                        <Link
                          key={category.id}
                          className={`home-cute__collection-card home-premium__collection-card home-premium__collection-card--${tone}`}
                          to={`/san-pham?danh-muc=${encodeURIComponent(
                            category.slug,
                          )}`}
                          tabIndex={
                            pageIndex === collectionPageIndex ? 0 : -1
                          }
                        >
                          <div className="home-premium__collection-visual">
                            <span className="home-premium__collection-number">
                              {String(globalIndex + 1).padStart(2, "0")}
                            </span>

                            {previewImages.length > 0 ? (
                              <>
                                <div className="home-premium__collection-main-shot">
                                  <img
                                    src={optimizeCloudinaryUrl(
                                      previewImages[0].image?.url || "",
                                      900,
                                    )}
                                    srcSet={getCloudinarySrcSet(
                                      previewImages[0].image?.url || "",
                                      [360, 520, 720, 900],
                                    )}
                                    sizes="(max-width: 700px) 50vw, 25vw"
                                    alt={
                                      previewImages[0].image?.altText ||
                                      previewImages[0].product.name ||
                                      category.name
                                    }
                                    loading="lazy"
                                    decoding="async"
                                  />
                                </div>

                                {previewImages.length > 1 && (
                                  <div
                                    className="home-premium__collection-preview-stack"
                                    aria-hidden="true"
                                  >
                                    {previewImages.slice(1, 3).map(
                                      ({
                                        product: previewProduct,
                                        image,
                                      }) => (
                                        <span key={previewProduct.id}>
                                          <img
                                            src={optimizeCloudinaryUrl(
                                              image?.url || "",
                                              220,
                                            )}
                                            alt=""
                                            loading="lazy"
                                            decoding="async"
                                          />
                                        </span>
                                      ),
                                    )}
                                  </div>
                                )}
                              </>
                            ) : (
                              <div className="home-premium__collection-fallback">
                                <span aria-hidden="true">
                                  {category.emoji || "✦"}
                                </span>
                                <small>Đang cập nhật sản phẩm</small>
                              </div>
                            )}
                          </div>

                          <div className="home-premium__collection-meta">
                            <div className="home-premium__collection-copy">
                              <span
                                className="home-premium__collection-emoji"
                                aria-hidden="true"
                              >
                                {category.emoji || "✦"}
                              </span>
                              <div>
                                <h3>{category.name}</h3>
                                <p>{collectionDescription(category)}</p>
                              </div>
                            </div>

                            <div className="home-premium__collection-bottom">
                              <span>
                                {previews.length > 0
                                  ? `Khám phá bộ sưu tập ${category.name}`
                                  : "Khám phá danh mục"}
                              </span>
                              <span
                                className="home-cute__round-arrow"
                                aria-hidden="true"
                              >
                                <ArrowIcon />
                              </span>
                            </div>
                          </div>
                        </Link>
                      );
                    })}
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="home-cute__benefit-strip">
            <article>
              <span className="home-cute__benefit-icon home-cute__benefit-icon--lavender">
                <PencilIcon />
              </span>
              <div>
                <h3>Thiết kế riêng</h3>
                <p>In theo ý tưởng của bạn</p>
              </div>
            </article>

            <article>
              <span className="home-cute__benefit-icon home-cute__benefit-icon--blue">
                <SparkIcon />
              </span>
              <div>
                <h3>Chất lượng cao</h3>
                <p>Sản phẩm sắc nét, chỉn chu</p>
              </div>
            </article>

            <article>
              <span className="home-cute__benefit-icon home-cute__benefit-icon--coral">
                <CardIcon />
              </span>
              <div>
                <h3>Thanh toán dễ dàng</h3>
                <p>Thông tin rõ ràng, thao tác gọn</p>
              </div>
            </article>

            <article>
              <span className="home-cute__benefit-icon home-cute__benefit-icon--mint">
                <HeadsetIcon />
              </span>
              <div>
                <h3>Hỗ trợ tận tâm</h3>
                <p>Tư vấn theo nhu cầu thực tế</p>
              </div>
            </article>
          </div>

          <div className="home-cute__catalog-sections">
                    {bestSellingProducts.length > 0 && (
            <HomeProductSection
              kicker="Bán chạy"
              title="Sản phẩm bán chạy"
              symbol="🔥"
              products={bestSellingProducts}
              loading={catalogLoading}
              emptyText="Chưa có dữ liệu sản phẩm bán chạy."
              href="/san-pham?sap-xep=bestselling"
            />
          )}

          <HomeProductSection
            kicker="Mới nhất"
            title="Sản phẩm mới"
            symbol="✨"
            products={newProducts}
            loading={catalogLoading}
            emptyText="Chưa có sản phẩm mới."
            href="/san-pham?sap-xep=newest"
          />

          <HomeProductSection
            kicker="Nổi bật"
            title="Sản phẩm nổi bật"
            symbol="✦"
            products={featuredProducts}
            loading={catalogLoading}
            emptyText="Chưa có sản phẩm nổi bật."
            href="/san-pham"
          />
        </div>
      </div>
    </section>

    <section className="sf-container home-cute__custom">
        <div className="home-cute__custom-copy">
          <span className="home-cute__section-kicker">
            Ý tưởng của riêng bạn
          </span>
          <h2>
            {settings.customPrintTitle ||
              "Biến ý tưởng thành món đồ của riêng bạn"}
          </h2>
          <p>
            {settings.customPrintDescription ||
              "Không cần biết thiết kế 3D. Chỉ cần gửi hình, phác thảo hoặc kể ý tưởng. InGiDay sẽ cùng bạn chốt kiểu dáng, màu sắc và kích thước phù hợp."}
          </p>

          <div className="home-cute__custom-steps">
            <article>
              <span>01</span>
              <div>
                <h3>{settings.customPrintStep1Title || "Gửi ý tưởng"}</h3>
                <p>
                  {settings.customPrintStep1Description ||
                    "Gửi hình tham khảo hoặc mô tả món đồ bạn muốn."}
                </p>
              </div>
            </article>

            <article>
              <span>02</span>
              <div>
                <h3>
                  {settings.customPrintStep2Title ||
                    "Duyệt mẫu và báo giá"}
                </h3>
                <p>
                  {settings.customPrintStep2Description ||
                    "Cùng chốt phương án phù hợp trước khi sản xuất."}
                </p>
              </div>
            </article>

            <article>
              <span>03</span>
              <div>
                <h3>
                  {settings.customPrintStep3Title || "In và hoàn thiện"}
                </h3>
                <p>
                  {settings.customPrintStep3Description ||
                    "In 3D, kiểm tra và hoàn thiện sản phẩm trước khi gửi."}
                </p>
              </div>
            </article>
          </div>

          <div className="home-cute__custom-actions">
            <Link className="sf-button sf-button--primary" to="/in-rieng">
              {settings.customPrintButtonText || "Gửi yêu cầu thiết kế"}
              <ArrowIcon />
            </Link>

            {messengerUrl && (
              <a
                className="home-cute__messenger-link"
                href={messengerUrl}
                target="_blank"
                rel="noreferrer"
              >
                Nhắn InGiDay
              </a>
            )}
          </div>
        </div>

        <div
          className="home-cute__custom-art home-premium__custom-visual"
          aria-hidden="true"
          style={{
            backgroundColor:
              customPreviewProduct?.background || "#ddd7ce",
          }}
        >
          <span className="home-premium__custom-label">
            CUSTOM · ONE OF ONE
          </span>

          <img
            src={
              customPreviewImage
                ? optimizeCloudinaryUrl(customPreviewImage.url, 1200)
                : "/images/ingiday-hero-default.webp"
            }
            srcSet={
              customPreviewImage
                ? getCloudinarySrcSet(customPreviewImage.url, [
                    520,
                    800,
                    1000,
                    1200,
                  ])
                : undefined
            }
            sizes="(max-width: 1020px) calc(100vw - 24px), 46vw"
            alt=""
            width="1200"
            height="1200"
            loading="lazy"
            decoding="async"
          />

          <span className="home-premium__custom-caption">
            <strong>Thiết kế theo ý tưởng</strong>
            <small>Một sản phẩm dành riêng cho bạn</small>
          </span>
        </div>
      </section>
    </main>
  );
}

// IGD_REFINED_STOREFRONT_UI_20260718
