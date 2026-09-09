/* eslint-disable react-hooks/set-state-in-effect */
import {
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { SyntheticEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
} from "react-router-dom";
import ProductDetailSkeleton from "../../components/shop/ProductDetailSkeleton";
import ProductRecommendations from "../../components/shop/ProductRecommendations";
import { useAdTracking } from "../../features/ads/AdTrackingContext";
import { useCart } from "../../features/cart/CartContext";
import { usePageMeta } from "../../hooks/usePageMeta";
import {
  getCloudinarySrcSet,
  optimizeCloudinaryUrl,
} from "../../lib/cloudinary";
import { fetchProductCustomOptions } from "../../services/customProductOptions";
import { resolveProductSlugRedirect } from "../../services/productRedirects";
import { fetchProductBySlug } from "../../services/products";
import type { SelectedVariant } from "../../types/cart";
import type {
  ProductCustomOptions,
  SelectedCustomOptions,
} from "../../types/customProductOptions";
import type { Product } from "../../types/product";
import { formatCurrency } from "../../utils/currency";
import "./ProductDetailPage.css";

const PRODUCT_VIDEO_VOLUME_KEY = "ingiday-product-video-volume";

function BagIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 8h12l1 13H5L6 8Z" />
      <path d="M9 9V6a3 3 0 0 1 6 0v3" />
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

export default function ProductDetailPage() {
  const { slug = "" } = useParams();
  const navigate = useNavigate();
  const { addItem } = useCart();
  const {
    trackAddToCart,
    trackPageView,
    trackViewContent,
  } = useAdTracking();

  const [product, setProduct] = useState<Product | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);
  const [quantity, setQuantity] = useState(1);
  const [selections, setSelections] = useState<
    Record<string, string>
  >({});
  const [message, setMessage] = useState("");
  const [selectedImageId, setSelectedImageId] = useState("");
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [videoMuted, setVideoMuted] = useState(true);
  const [videoPlaying, setVideoPlaying] = useState(false);
  const [videoCurrentTime, setVideoCurrentTime] = useState(0);
  const [videoDuration, setVideoDuration] = useState(0);
  const [videoVolume, setVideoVolume] = useState(0.3);
  const [isImageZoomOpen, setIsImageZoomOpen] = useState(false);
  const [customOptions, setCustomOptions] =
    useState<ProductCustomOptions | null>(null);
  const [customText, setCustomText] = useState("");
  const [customColorId, setCustomColorId] = useState("");
  const [descriptionExpanded, setDescriptionExpanded] = useState(false);
  const [descriptionCanExpand, setDescriptionCanExpand] = useState(false);
  const descriptionRef = useRef<HTMLParagraphElement>(null);
  const productVideoRef = useRef<HTMLVideoElement>(null);
  const productVideoUserPausedRef = useRef(false);
  const trackedProductIdRef = useRef("");

  usePageMeta({
    title: product
      ? `${product.name} | InGiDay`
      : "Sản phẩm | InGiDay",
    description: product?.description
      ? product.description.slice(0, 160)
      : "Chi tiết sản phẩm InGiDay.",
    canonicalPath: product
      ? `/san-pham/${product.slug}`
      : `/san-pham/${slug}`,
  });

  const descriptionText =
    product?.description || "Thông tin sản phẩm đang được cập nhật.";

  useEffect(() => {
    setProduct(null);
    setQuantity(1);
    setSelections({});
    setMessage("");
    setSelectedImageId("");
    setSelectedVideoId("");
    setVideoMuted(true);
    setVideoPlaying(false);
    setVideoCurrentTime(0);
    setVideoDuration(0);
    setVideoVolume(0.3);
    productVideoUserPausedRef.current = false;
    setCustomOptions(null);
    setCustomText("");
    setCustomColorId("");
    setDescriptionExpanded(false);
    setDescriptionCanExpand(false);
    trackedProductIdRef.current = "";
  }, [slug]);

  useEffect(() => {
    const element = descriptionRef.current;

    if (!element || descriptionExpanded) {
      return;
    }

    const updateOverflow = () => {
      setDescriptionCanExpand(
        element.scrollHeight > element.clientHeight + 1,
      );
    };

    updateOverflow();

    const resizeObserver = new ResizeObserver(updateOverflow);
    resizeObserver.observe(element);

    return () => {
      resizeObserver.disconnect();
    };
  }, [descriptionExpanded, descriptionText]);

  useEffect(() => {
    if (!isImageZoomOpen) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsImageZoomOpen(false);
      }
    };

    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [isImageZoomOpen]);

  useEffect(() => {
    let active = true;
    let redirecting = false;

    setLoading(true);
    setError("");

    void (async () => {
      try {
        const nextProduct = await fetchProductBySlug(slug, {
          force: retryVersion > 0,
        });

        if (!active) {
          return;
        }

        if (nextProduct) {
          setProduct(nextProduct);

          try {
            const nextCustomOptions =
              await fetchProductCustomOptions(nextProduct.id);

            if (!active) {
              return;
            }

            setCustomOptions(nextCustomOptions);
            setCustomColorId(
              nextCustomOptions.colors[0]?.id ?? "",
            );
          } catch (customOptionsError) {
            console.warn(
              "Cannot load custom product options:",
              customOptionsError,
            );

            if (!active) {
              return;
            }

            setCustomOptions(null);
            setCustomColorId("");
          }

          return;
        }

        const redirectSlug =
          await resolveProductSlugRedirect(slug);

        if (!active) {
          return;
        }

        if (
          redirectSlug &&
          redirectSlug !== slug
        ) {
          redirecting = true;

          navigate(`/san-pham/${redirectSlug}`, {
            replace: true,
          });

          return;
        }

        setProduct(null);
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Không thể tải sản phẩm.",
          );
        }
      } finally {
        if (active && !redirecting) {
          setLoading(false);
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [navigate, retryVersion, slug]);

  const selectedVariants = useMemo<SelectedVariant[]>(() => {
    if (!product?.variantGroups) {
      return [];
    }

    return product.variantGroups.flatMap((group) => {
      const selectedOptionId =
        selections[group.id] ?? group.options[0]?.id;
      const option = group.options.find(
        (item) => item.id === selectedOptionId,
      );

      if (!option) {
        return [];
      }

      return [
        {
          groupId: group.id,
          groupName: group.name,
          optionId: option.id,
          optionLabel: option.label,
          priceDelta: option.priceDelta ?? 0,
          stock: option.stock,
          imageId: option.imageId,
        },
      ];
    });
  }, [product, selections]);

  const activeCustomOptions = customOptions?.enabled
    ? customOptions
    : null;
  const customTextConfig = activeCustomOptions?.text.enabled
    ? activeCustomOptions.text
    : null;
  const normalizedCustomText = customText.trim();
  const availableCustomColors = activeCustomOptions?.colors ?? [];
  const selectedCustomColor =
    normalizedCustomText.length > 0 &&
    availableCustomColors.length > 0
      ? availableCustomColors.find(
          (color) => color.id === customColorId,
        ) ?? availableCustomColors[0]
      : undefined;

  const selectedCustomOptions:
    | SelectedCustomOptions
    | undefined =
    customTextConfig && normalizedCustomText
      ? {
          text: {
            label: customTextConfig.label,
            value: normalizedCustomText,
            priceDelta: customTextConfig.priceDelta,
          },
          color: selectedCustomColor
            ? {
                id: selectedCustomColor.id,
                name: selectedCustomColor.name,
                imageUrl: selectedCustomColor.imageUrl,
                colorHex: selectedCustomColor.colorHex,
              }
            : undefined,
        }
      : undefined;

  const productImages = useMemo(
    () => product?.images ?? [],
    [product?.images],
  );
  const productVideos = useMemo(
    () => product?.videos ?? [],
    [product?.videos],
  );
  const primaryImage =
    productImages.find((image) => image.isPrimary) ??
    productImages[0];
  const selectedVariantImageId =
    selectedVariants.find((variant) => variant.imageId)?.imageId ??
    "";
  const selectedVariantVideoId = useMemo(() => {
    if (!product?.variantGroups) {
      return "";
    }

    for (const group of product.variantGroups) {
      const selectedOptionId =
        selections[group.id] ?? group.options[0]?.id;
      const option = group.options.find(
        (item) => item.id === selectedOptionId,
      );

      if (option?.videoId) {
        return option.videoId;
      }
    }

    return "";
  }, [product, selections]);

  const selectedVariantMediaContext = useMemo(() => {
    if (!product?.variantGroups) {
      return null;
    }

    const selectedOptions = product.variantGroups.map((group) => {
      const selectedOptionId =
        selections[group.id] ?? group.options[0]?.id;
      const option = group.options.find(
        (item) => item.id === selectedOptionId,
      );

      return {
        groupName: group.name,
        option,
      };
    });

    const activeSelection = selectedVariantVideoId
      ? selectedOptions.find(
          ({ option }) =>
            option?.videoId === selectedVariantVideoId,
        )
      : selectedOptions.find(
          ({ option }) =>
            option?.imageId === selectedVariantImageId,
        );

    if (!activeSelection?.option) {
      return null;
    }

    return {
      groupName: activeSelection.groupName,
      optionLabel: activeSelection.option.label,
      imageId: activeSelection.option.imageId ?? "",
      videoId: activeSelection.option.videoId ?? "",
    };
  }, [
    product,
    selections,
    selectedVariantImageId,
    selectedVariantVideoId,
  ]);

  useEffect(() => {
    if (!product) {
      return;
    }

    const hasVariantVideo = productVideos.some(
      (video) => video.id === selectedVariantVideoId,
    );

    if (hasVariantVideo) {
      productVideoUserPausedRef.current = false;
      setIsImageZoomOpen(false);
      setVideoMuted(true);
      setVideoPlaying(false);
      setVideoCurrentTime(0);
      setVideoDuration(0);
      setSelectedImageId("");
      setSelectedVideoId(selectedVariantVideoId);
      return;
    }

    const hasVariantImage = productImages.some(
      (image) => image.id === selectedVariantImageId,
    );

    productVideoUserPausedRef.current = true;
    setVideoMuted(true);
    setVideoPlaying(false);
    setVideoCurrentTime(0);
    setVideoDuration(0);
    setSelectedVideoId("");
    setSelectedImageId(
      hasVariantImage
        ? selectedVariantImageId
        : (primaryImage?.id ?? ""),
    );
  }, [
    primaryImage,
    product,
    productImages,
    productVideos,
    selectedVariantImageId,
    selectedVariantVideoId,
  ]);

  const selectedVideo =
    productVideos.find(
      (video) => video.id === selectedVideoId,
    );

  useEffect(() => {
    const video = productVideoRef.current;

    if (!selectedVideoId || !video) {
      return undefined;
    }

    let isInViewport = true;

    const playWhenAllowed = () => {
      if (
        !document.hidden &&
        isInViewport &&
        !productVideoUserPausedRef.current
      ) {
        void video.play().catch(() => undefined);
      }
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        video.pause();
        return;
      }

      playWhenAllowed();
    };

    const observer =
      "IntersectionObserver" in window
        ? new IntersectionObserver(
            ([entry]) => {
              isInViewport = entry?.isIntersecting ?? false;

              if (!isInViewport) {
                video.pause();
                return;
              }

              playWhenAllowed();
            },
            {
              threshold: 0.2,
            },
          )
        : null;

    observer?.observe(video);
    document.addEventListener(
      "visibilitychange",
      handleVisibilityChange,
    );
    playWhenAllowed();

    return () => {
      observer?.disconnect();
      document.removeEventListener(
        "visibilitychange",
        handleVisibilityChange,
      );
      video.pause();
      video.removeAttribute("src");
      video.load();
    };
  }, [selectedVideoId]);

  function getRememberedProductVideoVolume() {
    const storedVolume = Number(
      window.sessionStorage.getItem(
        PRODUCT_VIDEO_VOLUME_KEY,
      ),
    );

    return Number.isFinite(storedVolume) &&
      storedVolume > 0 &&
      storedVolume <= 1
      ? storedVolume
      : 0.3;
  }

  function formatProductVideoTime(value: number) {
    if (!Number.isFinite(value) || value < 0) {
      return "0:00";
    }

    const totalSeconds = Math.floor(value);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return `${minutes}:${String(seconds).padStart(2, "0")}`;
  }

  function handleProductVideoLoadedMetadata(
    event: SyntheticEvent<HTMLVideoElement>,
  ) {
    const video = event.currentTarget;
    const nextDuration = Number.isFinite(video.duration)
      ? video.duration
      : 0;
    const rememberedVolume =
      getRememberedProductVideoVolume();

    video.volume = rememberedVolume;
    setVideoVolume(rememberedVolume);
    setVideoDuration(nextDuration);
    setVideoCurrentTime(video.currentTime || 0);
  }

  function handleProductVideoTimeUpdate(
    event: SyntheticEvent<HTMLVideoElement>,
  ) {
    setVideoCurrentTime(event.currentTarget.currentTime);
  }

  function handleProductVideoVolumeChange(
    event: SyntheticEvent<HTMLVideoElement>,
  ) {
    const video = event.currentTarget;
    const nextVolume = Math.min(
      1,
      Math.max(0, video.volume),
    );
    const nextMuted =
      video.muted || nextVolume === 0;

    setVideoMuted(nextMuted);
    setVideoVolume(nextVolume);

    if (!nextMuted && nextVolume > 0) {
      window.sessionStorage.setItem(
        PRODUCT_VIDEO_VOLUME_KEY,
        String(nextVolume),
      );
    }
  }

  function toggleProductVideoPlayback() {
    const video = productVideoRef.current;

    if (!video) {
      return;
    }

    if (video.paused || video.ended) {
      if (video.ended) {
        video.currentTime = 0;
        setVideoCurrentTime(0);
      }

      productVideoUserPausedRef.current = false;
      void video.play().catch(() => undefined);
      return;
    }

    productVideoUserPausedRef.current = true;
    video.pause();
  }

  function toggleProductVideoMute() {
    const video = productVideoRef.current;

    if (!video) {
      return;
    }

    if (video.muted || video.volume === 0) {
      const nextVolume =
        getRememberedProductVideoVolume();

      video.volume = nextVolume;
      video.muted = false;
      setVideoVolume(nextVolume);
      setVideoMuted(false);
      window.sessionStorage.setItem(
        PRODUCT_VIDEO_VOLUME_KEY,
        String(nextVolume),
      );
      return;
    }

    video.muted = true;
    setVideoMuted(true);
  }

  function changeProductVideoVolume(value: number) {
    const video = productVideoRef.current;

    if (!video) {
      return;
    }

    const nextVolume = Math.min(
      1,
      Math.max(0, value),
    );

    video.volume = nextVolume;
    video.muted = nextVolume === 0;
    setVideoVolume(nextVolume);
    setVideoMuted(nextVolume === 0);

    if (nextVolume > 0) {
      window.sessionStorage.setItem(
        PRODUCT_VIDEO_VOLUME_KEY,
        String(nextVolume),
      );
    }
  }

  function seekProductVideo(value: number) {
    const video = productVideoRef.current;

    if (!video || !Number.isFinite(video.duration)) {
      return;
    }

    const nextTime = Math.min(
      video.duration,
      Math.max(0, value),
    );

    video.currentTime = nextTime;
    setVideoCurrentTime(nextTime);
  }
  function selectProductImage(imageId: string) {
    productVideoUserPausedRef.current = true;
    setIsImageZoomOpen(false);
    setVideoMuted(true);
    setVideoPlaying(false);
    setVideoCurrentTime(0);
    setVideoDuration(0);
    setSelectedVideoId("");
    setSelectedImageId(imageId);
  }

  function selectProductVideo(videoId: string) {
    productVideoUserPausedRef.current = false;
    setIsImageZoomOpen(false);
    setVideoMuted(true);
    setVideoPlaying(false);
    setVideoCurrentTime(0);
    setVideoDuration(0);
    setSelectedImageId("");
    setSelectedVideoId(videoId);
  }

  useEffect(() => {
    if (
      !product ||
      trackedProductIdRef.current === product.id
    ) {
      return;
    }

    trackedProductIdRef.current = product.id;

    const initialUnitPrice =
      product.price +
      selectedVariants.reduce(
        (sum, variant) => sum + variant.priceDelta,
        0,
      );

    const path =
      `${window.location.pathname}${window.location.search}`;

    void trackPageView({
      path,
      productId: product.id,
    });

    void trackViewContent({
      product,
      quantity: 1,
      unitPrice: initialUnitPrice,
      selectedVariants,
    });
  }, [
    product,
    selectedVariants,
    trackPageView,
    trackViewContent,
  ]);

  if (loading && !product) {
    return <ProductDetailSkeleton />;
  }

  if (error && !product) {
    return (
      <main className="product-detail-state">
        <span aria-hidden="true">♡</span>
        <h1>Không thể tải sản phẩm</h1>
        <p>{error}</p>
        <button
          type="button"
          onClick={() =>
            setRetryVersion((current) => current + 1)
          }
        >
          Thử lại
        </button>
      </main>
    );
  }

  if (!product) {
    return (
      <main className="product-detail-state">
        <span aria-hidden="true">?</span>
        <h1>Không tìm thấy sản phẩm</h1>
        <p>
          Sản phẩm có thể đã bị ẩn hoặc đường dẫn không còn
          tồn tại.
        </p>
        <Link to="/san-pham">Quay lại cửa hàng</Link>
      </main>
    );
  }

  const selectedImage = selectedVideo
    ? undefined
    : productImages.find(
        (image) => image.id === selectedImageId,
      ) ?? primaryImage;

  const isShowingSelectedVariantMedia = Boolean(
    selectedVariantMediaContext &&
      ((selectedVariantMediaContext.videoId &&
        selectedVideo?.id ===
          selectedVariantMediaContext.videoId) ||
        (selectedVariantMediaContext.imageId &&
          selectedImage?.id ===
            selectedVariantMediaContext.imageId)),
  );

  const variantStocks = selectedVariants
    .map((variant) => variant.stock)
    .filter(
      (stock): stock is number =>
        typeof stock === "number",
    );

  const availableStock =
    product.status === "out_of_stock"
      ? 0
      : variantStocks.length > 0
        ? Math.min(product.stock, ...variantStocks)
        : product.stock;

  const customTextPriceDelta =
    selectedCustomOptions?.text?.priceDelta ?? 0;

  const unitPrice =
    product.price +
    selectedVariants.reduce(
      (sum, variant) => sum + variant.priceDelta,
      0,
    ) +
    customTextPriceDelta;

  const discountPercent =
    product.compareAtPrice &&
    product.compareAtPrice > unitPrice
      ? Math.round(
          ((product.compareAtPrice - unitPrice) /
            product.compareAtPrice) *
            100,
        )
      : 0;

  function addToCart(goToCheckout: boolean) {
    if (!product || availableStock <= 0) {
      return;
    }

    const cartQuantity = Math.min(
      quantity,
      availableStock,
    );

    addItem(
      product,
      cartQuantity,
      selectedVariants,
      selectedCustomOptions,
    );

    void trackAddToCart({
      product,
      quantity: cartQuantity,
      unitPrice,
      selectedVariants,
    });

    if (goToCheckout) {
      navigate("/thanh-toan");
      return;
    }

    setMessage("Đã thêm sản phẩm vào giỏ hàng.");

    window.setTimeout(() => {
      setMessage("");
    }, 2200);
  }

  return (
    <main className="product-detail">
      <div className="product-detail__container">
        <nav
          className="product-detail__breadcrumb"
          aria-label="Đường dẫn"
        >
          <Link to="/">Trang chủ</Link>
          <span>/</span>
          <Link to="/san-pham">Sản phẩm</Link>
          <span>/</span>
          <strong>{product.name}</strong>
        </nav>

        {error && (
          <div className="product-detail__error">
            <span>{error}</span>
            <button
              type="button"
              onClick={() =>
                setRetryVersion((current) => current + 1)
              }
            >
              Thử lại
            </button>
          </div>
        )}

        <header className="product-detail__heading">
          <p className="product-detail__category">
            {product.categoryName}
          </p>
          <h1>{product.name}</h1>
        </header>

        <section className="product-detail__main">
          <div className="product-detail__gallery">
            <div
              className={`product-detail__image-stage ${
                selectedVideo ? "is-video" : ""
              }`}
              role={selectedImage ? "button" : undefined}
              tabIndex={selectedImage ? 0 : -1}
              aria-label={
                selectedImage
                  ? "Phóng to ảnh sản phẩm"
                  : selectedVideo
                    ? `Video sản phẩm ${product.name}`
                    : undefined
              }
              onClick={() => {
                if (selectedImage) {
                  setIsImageZoomOpen(true);
                }
              }}
              onKeyDown={(event) => {
                if (
                  selectedImage &&
                  (event.key === "Enter" || event.key === " ")
                ) {
                  event.preventDefault();
                  setIsImageZoomOpen(true);
                }
              }}
              style={{
                backgroundColor: selectedVideo
                  ? "#111111"
                  : product.background || "var(--sf-cream)",
              }}
            >
              {!selectedVideo && (
                <>
                  <span className="product-detail__image-orbit" />
                  <span className="product-detail__image-spark">
                    ✦
                  </span>
                </>
              )}

              {product.badge && (
                <span className="product-detail__badge">
                  {product.badge}
                </span>
              )}


              {selectedImage && (
                <span className="product-detail__zoom-hint">
                  <span aria-hidden="true">↗</span>
                  Nhấn để phóng to
                </span>
              )}

              {selectedVideo ? (
                <div
                  key={selectedVideo.id}
                  className="product-detail__video-frame"
                >
                  <video
                    key={selectedVideo.id}
                    ref={productVideoRef}
                    src={selectedVideo.url}
                    poster={selectedVideo.posterUrl}
                    autoPlay
                    muted={videoMuted}
                    playsInline
                    preload="metadata"
                    onLoadedMetadata={
                      handleProductVideoLoadedMetadata
                    }
                    onTimeUpdate={
                      handleProductVideoTimeUpdate
                    }
                    onVolumeChange={
                      handleProductVideoVolumeChange
                    }
                    onPlay={() => setVideoPlaying(true)}
                    onPause={() => setVideoPlaying(false)}
                    onEnded={() => {
                      productVideoUserPausedRef.current = true;
                      setVideoPlaying(false);
                    }}
                    aria-label={
                      selectedVideo.altText ||
                      `Video sản phẩm ${product.name}`
                    }
                    className="product-detail__video"
                  >
                    Trình duyệt không hỗ trợ video.
                  </video>

                  <div
                    className="product-detail__video-controls"
                    aria-label="Điều khiển video"
                  >
                    <button
                      type="button"
                      onClick={toggleProductVideoPlayback}
                      aria-label={
                        videoPlaying
                          ? "Tạm dừng video"
                          : "Phát video"
                      }
                      title={
                        videoPlaying
                          ? "Tạm dừng"
                          : "Phát video"
                      }
                    >
                      {videoPlaying ? "❚❚" : "▶"}
                    </button>

                    <input
                      className="product-detail__video-seek"
                      type="range"
                      min="0"
                      max={Math.max(videoDuration, 0)}
                      step="0.1"
                      value={Math.min(
                        videoCurrentTime,
                        Math.max(videoDuration, 0),
                      )}
                      disabled={videoDuration <= 0}
                      onChange={(event) =>
                        seekProductVideo(
                          Number(event.currentTarget.value),
                        )
                      }
                      aria-label="Tua video"
                    />

                    <span className="product-detail__video-time">
                      {formatProductVideoTime(videoCurrentTime)}
                      {" / "}
                      {formatProductVideoTime(videoDuration)}
                    </span>

                    <button
                      type="button"
                      onClick={toggleProductVideoMute}
                      aria-label={
                        videoMuted || videoVolume === 0
                          ? "Bật tiếng"
                          : "Tắt tiếng"
                      }
                      title={
                        videoMuted || videoVolume === 0
                          ? "Bật tiếng"
                          : "Tắt tiếng"
                      }
                    >
                      {videoMuted || videoVolume === 0
                        ? "🔇"
                        : "🔊"}
                    </button>

                    <input
                      className="product-detail__video-volume"
                      type="range"
                      min="0"
                      max="1"
                      step="0.05"
                      value={videoMuted ? 0 : videoVolume}
                      onChange={(event) =>
                        changeProductVideoVolume(
                          Number(event.currentTarget.value),
                        )
                      }
                      aria-label="Âm lượng video"
                    />

                    <span className="product-detail__video-volume-value">
                      {Math.round(
                        (videoMuted ? 0 : videoVolume) * 100,
                      )}
                      %
                    </span>
                  </div>
                </div>
              ) : selectedImage ? (
                <img
                  key={selectedImage.id}
                  src={optimizeCloudinaryUrl(
                    selectedImage.url,
                    1080,
                  )}
                  srcSet={getCloudinarySrcSet(
                    selectedImage.url,
                    [480, 640, 800, 1080, 1400],
                  )}
                  sizes="(max-width: 1023px) 100vw, 50vw"
                  alt={
                    selectedImage.altText || product.name
                  }
                  width="1080"
                  height="1080"
                  fetchPriority="high"
                />
              ) : (
                <span
                  className="product-detail__emoji"
                  aria-hidden="true"
                >
                  {product.emoji}
                </span>
              )}
            </div>

            {productImages.length + productVideos.length > 1 && (
              <div
                className="product-detail__thumbnails"
                aria-label="Ảnh và video sản phẩm"
              >
                {productImages.map((image, index) => (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() =>
                      selectProductImage(image.id)
                    }
                    className={
                      !selectedVideo &&
                      selectedImage?.id === image.id
                        ? "is-active"
                        : ""
                    }
                    aria-label={`Xem ảnh ${
                      index + 1
                    } của ${product.name}`}
                  >
                    <img
                      src={optimizeCloudinaryUrl(
                        image.url,
                        180,
                      )}
                      alt=""
                      width="180"
                      height="180"
                      loading="lazy"
                      decoding="async"
                    />
                  </button>
                ))}

                {productVideos.map((video, index) => (
                  <button
                    key={video.id}
                    type="button"
                    onClick={() =>
                      selectProductVideo(video.id)
                    }
                    className={`is-video-thumbnail ${
                      selectedVideo?.id === video.id
                        ? "is-active"
                        : ""
                    }`}
                    aria-label={`Xem video ${
                      index + 1
                    } của ${product.name}`}
                  >
                    <img
                      src={optimizeCloudinaryUrl(
                        video.posterUrl,
                        180,
                      )}
                      alt=""
                      width="180"
                      height="180"
                      loading="lazy"
                      decoding="async"
                    />
                    <span
                      className="product-detail__video-play"
                      aria-hidden="true"
                    >
                      ▶
                    </span>
                  </button>
                ))}
              </div>
            )}

            {isShowingSelectedVariantMedia &&
              selectedVariantMediaContext && (
                <p
                  className="product-detail__gallery-footnote"
                  aria-live="polite"
                >
                  <SparkIcon />
                  Đang xem theo phân loại{" "}
                  <strong>
                    {selectedVariantMediaContext.groupName} ·{" "}
                    {selectedVariantMediaContext.optionLabel}
                  </strong>
                  .
                </p>
              )}
          </div>

          <div className="product-detail__purchase">
            <div className="product-detail__price-panel">
              <div className="product-detail__price-row">
                <strong>{formatCurrency(unitPrice)}</strong>

                {product.compareAtPrice && (
                  <span className="product-detail__compare-price">
                    {formatCurrency(product.compareAtPrice)}
                  </span>
                )}

                {discountPercent > 0 && (
                  <span className="product-detail__price-note">
                    Giá đã gồm ưu đãi hiện tại
                  </span>
                )}
              </div>

              <div className="product-detail__price-meta">
                {discountPercent > 0 && (
                  <em>Tiết kiệm {discountPercent}%</em>
                )}

                <span
                  className={`product-detail__stock ${
                    availableStock > 0
                      ? "is-available"
                      : "is-out"
                  }`}
                >
                  {availableStock > 0
                    ? `Còn ${availableStock.toLocaleString(
                        "vi-VN",
                      )}`
                    : "Tạm hết hàng"}
                </span>
              </div>
            </div>

            {product.stockNoteEnabled &&
              product.stockNote && (
                <p className="product-detail__stock-note">
                  {product.stockNote}
                </p>
              )}


            {product.variantGroups?.map((group) => {
              const selectedOptionId =
                selections[group.id] ??
                group.options[0]?.id;
              const groupHasTaggedOption = group.options.some(
                (option) => Boolean(option.tag?.trim()),
              );

              return (
                <fieldset
                  key={group.id}
                  className="product-detail__option-group"
                >
                  <legend>{group.name}</legend>

                  <div
                    className={`product-detail__option-list${
                      groupHasTaggedOption
                        ? " product-detail__option-list--has-tag"
                        : ""
                    }`}
                  >
                    {group.options.map((option) => (
                      <label
                        key={option.id}
                        className={
                          option.tag?.trim()
                            ? "product-detail__option-label product-detail__option-label--has-tag"
                            : "product-detail__option-label"
                        }
                      >
                        <input
                          type="radio"
                          name={`variant-${group.id}`}
                          value={option.id}
                          checked={
                            selectedOptionId === option.id
                          }
                          onChange={() => {
                            setSelections((current) => ({
                              ...current,
                              [group.id]: option.id,
                            }));
                            setQuantity(1);
                          }}
                        />
                        <span className="product-detail__option-choice">
                          <span className="product-detail__option-copy">
                            {option.label}
                            {option.priceDelta && option.showPriceDelta !== false
                              ? ` (+${formatCurrency(
                                  option.priceDelta,
                                )})`
                              : ""}
                          </span>

                          {option.tag?.trim() && (
                            <span
                              className={`product-detail__option-tag product-detail__option-tag--${
                                option.tagColor ?? "red"
                              }`}
                              title={option.tag.trim()}
                            >
                              {option.tag.trim()}
                            </span>
                          )}
                        </span>
                      </label>
                    ))}
                  </div>
                </fieldset>
              );
            })}

            {customTextConfig && (
              <div className="product-detail__custom-text">
                <div className="product-detail__field-heading">
                  <label htmlFor="product-custom-text">
                    {customTextConfig.label}
                  </label>

                  {customTextConfig.priceDelta > 0 && (
                    <span>
                      +
                      {formatCurrency(
                        customTextConfig.priceDelta,
                      )}
                    </span>
                  )}
                </div>

                <input
                  id="product-custom-text"
                  type="text"
                  value={customText}
                  placeholder={customTextConfig.placeholder}
                  maxLength={customTextConfig.maxLength}
                  onChange={(event) => {
                    setCustomText(
                      event.target.value.slice(
                        0,
                        customTextConfig.maxLength,
                      ),
                    );
                  }}
                />

                <div className="product-detail__field-help">
                  <span>
                    {normalizedCustomText
                      ? "Phụ phí chỉ tính khi có nhập text."
                      : "Có thể bỏ trống nếu không cần custom text."}
                  </span>
                  <strong>
                    {customText.length}/
                    {customTextConfig.maxLength}
                  </strong>
                </div>
              </div>
            )}

            {activeCustomOptions &&
              normalizedCustomText &&
              availableCustomColors.length > 0 && (
                <fieldset className="product-detail__color-group">
                  <legend>Màu chữ miễn phí</legend>

                  <div className="product-detail__color-list">
                    {availableCustomColors.map((color) => {
                      const selectedColorId =
                        customColorId ||
                        availableCustomColors[0]?.id;

                      return (
                        <label key={color.id}>
                          <input
                            type="radio"
                            name="custom-color"
                            value={color.id}
                            checked={
                              selectedColorId === color.id
                            }
                            onChange={() =>
                              setCustomColorId(color.id)
                            }
                          />

                          <span className="product-detail__color-choice">
                            <span
                              className="product-detail__color-swatch"
                              style={{
                                backgroundColor:
                                  color.colorHex || "#ffffff",
                              }}
                            >
                              {color.imageUrl && (
                                <img
                                  src={color.imageUrl}
                                  alt=""
                                  loading="lazy"
                                  decoding="async"
                                />
                              )}
                            </span>
                            {color.name}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  <p>
                    Màu miễn phí và chỉ áp dụng cho phần text
                    đã nhập.
                  </p>
                </fieldset>
              )}

            <div className="product-detail__quantity-row">
              <span>Số lượng</span>

              <div className="product-detail__quantity">
                <button
                  type="button"
                  onClick={() =>
                    setQuantity((current) =>
                      Math.max(1, current - 1),
                    )
                  }
                  aria-label="Giảm số lượng"
                >
                  −
                </button>
                <strong>{quantity}</strong>
                <button
                  type="button"
                  onClick={() =>
                    setQuantity((current) =>
                      Math.min(
                        Math.max(availableStock, 1),
                        current + 1,
                      ),
                    )
                  }
                  aria-label="Tăng số lượng"
                >
                  +
                </button>
              </div>
            </div>

            <div className="product-detail__inspection-tag" role="note">
              <span aria-hidden="true">✓</span>
              <strong>Được kiểm tra hàng trước khi nhận</strong>
            </div>

            <div className="product-detail__actions">
              <button
                type="button"
                onClick={() => addToCart(true)}
                disabled={availableStock <= 0}
                className="product-detail__buy-now"
              >
                Mua ngay
              </button>

              <button
                type="button"
                onClick={() => addToCart(false)}
                disabled={availableStock <= 0}
                className="product-detail__add-cart"
              >
                <BagIcon />
                Thêm vào giỏ
              </button>
            </div>

            {message && (
              <p
                className="product-detail__message"
                role="status"
                aria-live="polite"
              >
                {message}
              </p>
            )}

            <div className="product-detail__micro-trust">
              <SparkIcon />
              <span>
                Ảnh hiển thị trọn sản phẩm, lựa chọn và giá
                được cập nhật theo cấu hình bạn chọn.
              </span>
            </div>
          </div>
        </section>

        <section className="product-detail__trust">
          <div className="product-detail__trust-heading">
            <span aria-hidden="true">✦</span>
            <div>
              <p>Cam kết InGiDay</p>
              <h2>An tâm hơn khi đặt sản phẩm in 3D</h2>
            </div>
          </div>

          <div className="product-detail__trust-grid">
            <article>
              <span>01</span>
              <h3>Trao đổi rõ ràng</h3>
              <p>
                Thông tin mẫu, lựa chọn và yêu cầu riêng được
                thể hiện rõ trước khi đặt.
              </p>
            </article>

            <article>
              <span>02</span>
              <h3>Đóng gói cẩn thận</h3>
              <p>
                Sản phẩm được kiểm tra và đóng gói phù hợp
                trước khi gửi.
              </p>
            </article>

            <article>
              <span>03</span>
              <h3>Đặc trưng in 3D</h3>
              <p>
                Vân lớp nhẹ có thể xuất hiện và là đặc trưng
                của quá trình in 3D.
              </p>
            </article>

            <article>
              <span>04</span>
              <h3>Hỗ trợ theo nhu cầu</h3>
              <p>
                Có thể liên hệ shop khi cần hỏi thêm về mẫu,
                màu hoặc sản phẩm in riêng.
              </p>
            </article>
          </div>
        </section>

        <section className="product-detail__information">
          <div>
            <p>Chi tiết</p>
            <h2>Thông tin sản phẩm</h2>
          </div>

          <div className="product-detail__description">
            {(product.material || product.origin) && (
              <dl className="product-detail__facts">
                {product.material && (
                  <div>
                    <dt>Chất liệu</dt>
                    <dd>{product.material}</dd>
                  </div>
                )}

                {product.origin && (
                  <div>
                    <dt>Xuất xứ</dt>
                    <dd>{product.origin}</dd>
                  </div>
                )}
              </dl>
            )}
            <div
              className={`product-detail__description-copy${
                descriptionExpanded ? " is-expanded" : ""
              }`}
            >
              <p ref={descriptionRef}>{descriptionText}</p>
              {descriptionCanExpand && !descriptionExpanded && (
                <span
                  className="product-detail__description-fade"
                  aria-hidden="true"
                />
              )}
            </div>
            {descriptionCanExpand && (
              <button
                type="button"
                className="product-detail__description-toggle"
                onClick={() =>
                  setDescriptionExpanded((current) => !current)
                }
                aria-expanded={descriptionExpanded}
              >
                {descriptionExpanded ? "Thu gọn" : "Xem thêm"}
                <span aria-hidden="true">
                  {descriptionExpanded ? "↑" : "↓"}
                </span>
              </button>
            )}

            <div className="product-detail__note">
              <strong>Lưu ý nhỏ</strong>
              <ul>
                <li>
                  Sản phẩm in 3D có thể có vân lớp nhẹ đặc
                  trưng.
                </li>
                <li>
                  Màu thực tế có thể chênh nhẹ do màn hình và
                  ánh sáng.
                </li>
              </ul>
            </div>
          </div>
        </section>

        {isImageZoomOpen && selectedImage && (
        <div
          className="product-detail__zoom"
          role="dialog"
          aria-modal="true"
          aria-label="Ảnh sản phẩm phóng to"
        >
          <button
            type="button"
            className="product-detail__zoom-backdrop"
            onClick={() => setIsImageZoomOpen(false)}
            aria-label="Đóng ảnh phóng to"
          />
          <div className="product-detail__zoom-content">
            <button
              type="button"
              className="product-detail__zoom-close"
              onClick={() => setIsImageZoomOpen(false)}
              aria-label="Đóng ảnh phóng to"
              autoFocus
            >
              ×
            </button>
            <div
              className="product-detail__zoom-stage"
              style={{
                backgroundColor:
                  product.background || "var(--sf-cream)",
              }}
            >
              <img
                src={optimizeCloudinaryUrl(
                  selectedImage.url,
                  1800,
                )}
                alt={selectedImage.altText || product.name}
                width="1800"
                height="1800"
                decoding="async"
              />
            </div>
            <p>Nhấn nút ×, vùng tối hoặc phím Esc để thoát.</p>
          </div>
        </div>
      )}

      <ProductRecommendations product={product} />
      </div>
    </main>
  );
}

// IGD_REFINED_STOREFRONT_UI_20260718
