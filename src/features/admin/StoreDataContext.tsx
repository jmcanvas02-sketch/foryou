/* eslint-disable react-refresh/only-export-components */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, useRef } from "react";
import type { ReactNode } from "react";
import type { CartItem } from "../../types/cart";
import { categories as initialCategories, products as initialProducts } from "../../data/mockData";
import { supabase } from "../../lib/supabase";
import type { Category, CategoryInput, Product, ProductImage, ProductInput, ProductStatus, ProductVideo } from "../../types/product";
import { slugify } from "../../utils/slug";
import {
  authChangeNeedsDataReload,
  getSessionUserId,
} from "../../utils/authSessionChange";

const LEGACY_PRODUCTS_KEY = "ingiday-admin-products";
const LEGACY_CATEGORIES_KEY = "ingiday-admin-categories";
const SEED_MARKER_KEY = "ingiday-supabase-products-seeded-v1";

type StoreActionResult<T = undefined> = {
  success: boolean;
  message: string;
  data?: T;
};

type DeleteResult = StoreActionResult;

type ProductPageFilters = {
  page: number;
  pageSize: number;
  keyword: string;
  categoryId: string;
  status: ProductStatus | "";
};

type ProductPageResult = {
  products: Product[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

type AdminPageIdsResult = {
  ids: string[];
  total: number;
  page: number;
  pageSize: number;
};

type StoreDataContextValue = {
  products: Product[];
  categories: Category[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  loadProductPage: (filters: ProductPageFilters) => Promise<StoreActionResult<ProductPageResult>>;
  bulkDeleteProducts: (ids: string[]) => Promise<DeleteResult>;
  bulkUpdateProductStatus: (ids: string[], status: ProductStatus) => Promise<StoreActionResult>;
  bulkAddProductsToCategories: (ids: string[], categoryIds: string[]) => Promise<StoreActionResult>;
  createProduct: (input: ProductInput) => Promise<StoreActionResult<Product>>;
  updateProduct: (id: string, input: ProductInput) => Promise<StoreActionResult<Product>>;
  deleteProduct: (id: string) => Promise<DeleteResult>;
  duplicateProduct: (id: string) => Promise<StoreActionResult<Product>>;
  toggleProductVisibility: (id: string) => Promise<StoreActionResult<Product>>;
  createCategory: (input: CategoryInput) => Promise<StoreActionResult<Category>>;
  updateCategory: (id: string, input: CategoryInput) => Promise<StoreActionResult<Category>>;
  deleteCategory: (id: string) => Promise<DeleteResult>;
  toggleCategoryVisibility: (id: string) => Promise<StoreActionResult<Category>>;
  reserveStockForOrder: (items: CartItem[]) => StoreActionResult;
  restoreStockForOrder: (items: CartItem[]) => StoreActionResult;
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  sort_order: number;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type ProductRow = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  sku: string | null;
  price: number | string;
  compare_at_price: number | string | null;
  stock: number;
  status: "draft" | "active" | "hidden" | "out_of_stock";
  is_featured: boolean;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  categories?: { name?: string } | Array<{ name?: string }> | null;
};


type ProductImageRow = {
  id: string;
  product_id: string;
  image_url: string;
  public_id: string | null;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
};

type ProductVideoRow = {
  id: string;
  product_id: string;
  video_url: string;
  public_id: string | null;
  poster_url: string;
  alt_text: string | null;
  sort_order: number;
  duration_seconds: number | string;
  width: number;
  height: number;
  bytes: number | string;
};

type ProductCategoryRow = {
  product_id: string;
  category_id: string;
};

type CategoryMetadata = {
  emoji?: string;
  background?: string;
};

type ProductMetadata = {
  emoji?: string;
  background?: string;
  badge?: string;
  stockNoteEnabled?: boolean;
  stockNote?: string;
  material?: string;
  origin?: string;
  variantGroups?: Product["variantGroups"];
};

const StoreDataContext = createContext<StoreDataContextValue | null>(null);

function parseJsonObject<T extends object>(value: unknown): Partial<T> {
  if (!value) return {};
  if (typeof value === "object" && !Array.isArray(value)) return value as Partial<T>;
  if (typeof value !== "string") return {};

  try {
    const parsed = JSON.parse(value) as unknown;
    return parsed && typeof parsed === "object" && !Array.isArray(parsed)
      ? (parsed as Partial<T>)
      : {};
  } catch {
    return {};
  }
}

function categoryFromRow(row: CategoryRow): Category {
  const metadata = parseJsonObject<CategoryMetadata>(row.description);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    emoji: metadata.emoji ?? "📁",
    background: metadata.background ?? "#dff4ff",
    status: row.active ? "active" : "hidden",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function relationName(relation: ProductRow["categories"]): string {
  if (Array.isArray(relation)) return relation[0]?.name ?? "Chưa phân loại";
  return relation?.name ?? "Chưa phân loại";
}

function productFromRow(
  row: ProductRow,
  fallbackCategoryName?: string,
  images: ProductImage[] = [],
  categoryIds: string[] = [],
  videos: ProductVideo[] = [],
): Product {
  const metadata = parseJsonObject<ProductMetadata>(
    row.metadata,
  );
  const status: ProductStatus =
    row.status === "draft" ? "hidden" : row.status;
  const primaryCategoryId = row.category_id ?? "";
  const normalizedCategoryIds = [
    ...new Set(
      [primaryCategoryId, ...categoryIds].filter(Boolean),
    ),
  ];

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    sku: row.sku ?? undefined,
    categoryId: primaryCategoryId,
    categoryIds: normalizedCategoryIds,
    categoryName:
      fallbackCategoryName ?? relationName(row.categories),
    price: Number(row.price),
    compareAtPrice: row.compare_at_price === null ? undefined : Number(row.compare_at_price),
    emoji: metadata.emoji ?? "📦",
    background: metadata.background ?? "#dff4ff",
    badge: metadata.badge,
    stockNoteEnabled:
      metadata.stockNoteEnabled === true,
    stockNote:
      typeof metadata.stockNote === "string" &&
      metadata.stockNote.trim()
        ? metadata.stockNote.trim()
        : undefined,
    material:
      typeof metadata.material === "string" &&
      metadata.material.trim()
        ? metadata.material.trim()
        : undefined,
    origin:
      typeof metadata.origin === "string" &&
      metadata.origin.trim()
        ? metadata.origin.trim()
        : undefined,    featured: row.is_featured,
    stock: row.stock,
    description: row.description ?? "",
    images: [...images].sort((a, b) => a.sortOrder - b.sortOrder),
    videos: [...videos].sort((a, b) => a.sortOrder - b.sortOrder),
    variantGroups: metadata.variantGroups,
    status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}


function productImageFromRow(row: ProductImageRow): ProductImage {
  return {
    id: row.id,
    url: row.image_url,
    publicId: row.public_id ?? undefined,
    altText: row.alt_text ?? undefined,
    sortOrder: row.sort_order,
    isPrimary: row.is_primary,
  };
}

function productVideoFromRow(row: ProductVideoRow): ProductVideo {
  return {
    id: row.id,
    url: row.video_url,
    publicId: row.public_id ?? undefined,
    posterUrl: row.poster_url,
    altText: row.alt_text ?? undefined,
    sortOrder: row.sort_order,
    durationSeconds: Number(row.duration_seconds),
    width: row.width,
    height: row.height,
    bytes: Number(row.bytes),
  };
}

async function syncProductImages(productId: string, images: ProductImage[]) {
  const { error: deleteError } = await supabase.from("product_images").delete().eq("product_id", productId);
  if (deleteError) throw deleteError;
  if (images.length === 0) return;
  const hasPrimary = images.some((image) => image.isPrimary);
  const payload = images.map((image, index) => ({
    id: image.id,
    product_id: productId,
    image_url: image.url,
    public_id: image.publicId ?? null,
    alt_text: image.altText ?? null,
    sort_order: index,
    is_primary: hasPrimary ? image.isPrimary : index === 0,
  }));
  const { error } = await supabase
    .from("product_images")
    .insert(payload);
  if (error) throw error;
}

async function syncProductVideos(
  productId: string,
  videos: ProductVideo[],
) {
  const { error: deleteError } = await supabase
    .from("product_videos")
    .delete()
    .eq("product_id", productId);
  if (deleteError) throw deleteError;
  if (videos.length === 0) return;

  const payload = videos.map((video, index) => ({
    id: video.id,
    product_id: productId,
    video_url: video.url,
    public_id: video.publicId ?? null,
    poster_url: video.posterUrl,
    alt_text: video.altText ?? null,
    sort_order: index,
    duration_seconds: video.durationSeconds,
    width: video.width,
    height: video.height,
    bytes: video.bytes,
  }));

  const { error } = await supabase
    .from("product_videos")
    .insert(payload);
  if (error) throw error;
}

async function syncProductCategories(
  productId: string,
  categoryIds: string[],
) {
  const uniqueCategoryIds = [
    ...new Set(categoryIds.filter(Boolean)),
  ];
  const { error } = await supabase.rpc(
    "admin_set_product_categories",
    {
      p_product_id: productId,
      p_category_ids: uniqueCategoryIds,
    },
  );
  if (error) throw error;
}

function uniqueSlug(base: string, items: Array<{ id: string; slug: string }>, currentId?: string) {
  const normalizedBase = slugify(base) || "khong-ten";
  let candidate = normalizedBase;
  let index = 2;

  while (items.some((item) => item.id !== currentId && item.slug.toLowerCase() === candidate.toLowerCase())) {
    candidate = `${normalizedBase}-${index}`;
    index += 1;
  }

  return candidate;
}

function categoryDescription(input: CategoryInput) {
  return JSON.stringify({
    emoji: input.emoji || "📁",
    background: input.background || "#dff4ff",
  } satisfies CategoryMetadata);
}

function productMetadata(input: ProductInput): ProductMetadata {
  return {
    emoji: input.emoji || "📦",
    background: input.background || "#dff4ff",
    badge: input.badge,
    stockNoteEnabled: Boolean(input.stockNoteEnabled),
    stockNote: input.stockNote?.trim() || undefined,
    material: input.material?.trim() || undefined,
    origin: input.origin?.trim() || undefined,    variantGroups: input.variantGroups,
  };
}

function resolveProductCategories(
  input: ProductInput,
  categories: Category[],
) {
  const categoryIds = [
    ...new Set(
      (
        input.categoryIds?.length
          ? input.categoryIds
          : [input.categoryId]
      ).filter(Boolean),
    ),
  ];
  if (categoryIds.length === 0) return null;

  const selectedCategories = categoryIds.map((categoryId) =>
    categories.find(
      (category) => category.id === categoryId,
    ),
  );
  if (selectedCategories.some((category) => !category)) {
    return null;
  }

  return {
    categoryIds,
    category: selectedCategories[0] as Category,
  };
}

function readLegacyArray<T>(key: string, fallback: T[]): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as T[]) : fallback;
  } catch {
    return fallback;
  }
}

async function currentUserIsAdmin() {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) return false;

  const { data, error } = await supabase
    .from("admin_profiles")
    .select("id")
    .eq("id", session.user.id)
    .eq("active", true)
    .maybeSingle();

  return !error && Boolean(data);
}

async function seedInitialData() {
  const sourceCategories = readLegacyArray<Category>(LEGACY_CATEGORIES_KEY, initialCategories);
  const sourceProducts = readLegacyArray<Product>(LEGACY_PRODUCTS_KEY, initialProducts);

  const categoryPayload = sourceCategories.map((category, index) => ({
    name: category.name,
    slug: category.slug || slugify(category.name),
    description: JSON.stringify({
      emoji: category.emoji || "📁",
      background: category.background || "#dff4ff",
    } satisfies CategoryMetadata),
    sort_order: index,
    active: category.status === "active",
  }));

  const { data: insertedCategories, error: categoryError } = await supabase
    .from("categories")
    .insert(categoryPayload)
    .select("id,name,slug,description,sort_order,active,created_at,updated_at");

  if (categoryError) throw categoryError;

  const categoryIdBySlug = new Map(
    (insertedCategories as CategoryRow[] | null)?.map((category) => [category.slug, category.id]) ?? [],
  );

  const productPayload = sourceProducts
    .map((product, index) => {
      const sourceCategory = sourceCategories.find((category) => category.id === product.categoryId);
      const categoryId = sourceCategory ? categoryIdBySlug.get(sourceCategory.slug) : undefined;
      if (!categoryId) return null;

      return {
        category_id: categoryId,
        name: product.name,
        slug: product.slug || slugify(product.name),
        description: product.description,
        price: product.price,
        compare_at_price: product.compareAtPrice ?? null,
        stock: product.stock,
        track_inventory: true,
        low_stock_threshold: 5,
        has_variants: Boolean(product.variantGroups?.length),
        status: product.status,
        is_featured: Boolean(product.featured),
        sort_order: index,
        metadata: {
          emoji: product.emoji || "📦",
          background: product.background || "#dff4ff",
          badge: product.badge,
          stockNoteEnabled:
            Boolean(product.stockNoteEnabled),
          stockNote:
            product.stockNote?.trim() || undefined,
          material: product.material?.trim() || undefined,
          origin: product.origin?.trim() || undefined,          variantGroups: product.variantGroups,
        } satisfies ProductMetadata,
      };
    })
    .filter((product): product is NonNullable<typeof product> => Boolean(product));

  if (productPayload.length > 0) {
    const { error: productError } = await supabase.from("products").insert(productPayload);
    if (productError) throw productError;
  }

  localStorage.setItem(SEED_MARKER_KEY, "true");
  localStorage.removeItem(LEGACY_PRODUCTS_KEY);
  localStorage.removeItem(LEGACY_CATEGORIES_KEY);
}

async function fetchStoreData(includeProducts = true) {
  const categoryResult = await supabase
    .from("categories")
    .select("id,name,slug,description,sort_order,active,created_at,updated_at")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (categoryResult.error) throw categoryResult.error;

  if (!includeProducts) {
    return {
      categoryRows:
        (categoryResult.data ?? []) as CategoryRow[],
      productRows: [] as ProductRow[],
      imageRows: [] as ProductImageRow[],
      videoRows: [] as ProductVideoRow[],
      productCategoryRows: [] as ProductCategoryRow[],
    };
  }

  const [
    productResult,
    imageResult,
    videoResult,
    productCategoryResult,
  ] = await Promise.all([
    supabase
      .from("products")
      .select(
        "id,category_id,name,slug,sku,price,compare_at_price,stock,status,is_featured,description,metadata,created_at,updated_at,categories!products_category_id_fkey(name)",
      )
      .order("created_at", { ascending: false }),
    supabase
      .from("product_images")
      .select("id,product_id,image_url,public_id,alt_text,sort_order,is_primary")
      .order("sort_order", { ascending: true }),
    supabase
      .from("product_videos")
      .select("id,product_id,video_url,public_id,poster_url,alt_text,sort_order,duration_seconds,width,height,bytes")
      .order("sort_order", { ascending: true }),
    supabase
      .from("product_categories")
      .select("product_id,category_id"),
  ]);

  if (productResult.error) throw productResult.error;
  if (imageResult.error) throw imageResult.error;
  if (videoResult.error) throw videoResult.error;
  if (productCategoryResult.error) {
    throw productCategoryResult.error;
  }

  return {
    categoryRows:
      (categoryResult.data ?? []) as CategoryRow[],
    productRows:
      (productResult.data ?? []) as ProductRow[],
    imageRows:
      (imageResult.data ?? []) as ProductImageRow[],
    videoRows:
      (videoResult.data ?? []) as ProductVideoRow[],
    productCategoryRows:
      (productCategoryResult.data ??
        []) as ProductCategoryRow[],
  };
}

function parseAdminPageIds(
  value: unknown,
  fallbackPage: number,
  fallbackPageSize: number,
): AdminPageIdsResult {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {
      ids: [],
      total: 0,
      page: fallbackPage,
      pageSize: fallbackPageSize,
    };
  }

  const object = value as Record<string, unknown>;
  const ids = Array.isArray(object.ids)
    ? object.ids.filter((id): id is string => typeof id === "string")
    : [];
  const total = Number(object.total ?? 0);
  const page = Number(object.page ?? fallbackPage);
  const pageSize = Number(object.page_size ?? fallbackPageSize);

  return {
    ids,
    total: Number.isFinite(total) ? Math.max(0, total) : 0,
    page: Number.isFinite(page) ? Math.max(1, page) : fallbackPage,
    pageSize: Number.isFinite(pageSize) ? Math.max(1, pageSize) : fallbackPageSize,
  };
}

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "object" && error && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message) return message;
  }
  return fallback;
}

export function StoreDataProvider({ children }: { children: ReactNode }) {
  const [products, setProductsState] = useState<Product[]>([]);
  const productPageCacheRef = useRef(
    new Map<string, ProductPageResult>(),
  );
  const setProducts = useCallback(
    (
      value:
        | Product[]
        | ((current: Product[]) => Product[]),
    ) => {
      productPageCacheRef.current.clear();
      setProductsState(value);
    },
    [],
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const authUserIdRef = useRef("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const refresh = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const includeProducts = true;
      let {
        categoryRows,
        productRows,
        imageRows,
        videoRows,
        productCategoryRows,
      } = await fetchStoreData(includeProducts);

      const canSeed =
        categoryRows.length === 0 &&
        productRows.length === 0 &&
        localStorage.getItem(SEED_MARKER_KEY) !== "true" &&
        (await currentUserIsAdmin());

      if (canSeed) {
        await seedInitialData();
        ({
          categoryRows,
          productRows,
          imageRows,
          videoRows,
          productCategoryRows,
        } = await fetchStoreData(includeProducts));
      }

      setCategories(categoryRows.map(categoryFromRow));
      const imagesByProduct = new Map<string, ProductImage[]>();
      for (const imageRow of imageRows) {
        const list = imagesByProduct.get(imageRow.product_id) ?? [];
        list.push(productImageFromRow(imageRow));
        imagesByProduct.set(imageRow.product_id, list);
      }
      const videosByProduct = new Map<string, ProductVideo[]>();
      for (const videoRow of videoRows) {
        const list = videosByProduct.get(videoRow.product_id) ?? [];
        list.push(productVideoFromRow(videoRow));
        videosByProduct.set(videoRow.product_id, list);
      }
      const categoryIdsByProduct = new Map<
        string,
        string[]
      >();
      for (const row of productCategoryRows) {
        const list =
          categoryIdsByProduct.get(row.product_id) ?? [];
        list.push(row.category_id);
        categoryIdsByProduct.set(row.product_id, list);
      }

      setProducts(
        productRows.map((row) =>
          productFromRow(
            row,
            undefined,
            imagesByProduct.get(row.id) ?? [],
            categoryIdsByProduct.get(row.id) ?? [],
            videosByProduct.get(row.id) ?? [],
          ),
        ),
      );
    } catch (loadError) {
      setError(errorMessage(loadError, "Không thể tải sản phẩm và danh mục từ Supabase."));
      setCategories([]);
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, [setProducts]);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      authUserIdRef.current = getSessionUserId(data.session);

      if (mounted) {
        void refresh();
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const previousUserId = authUserIdRef.current;
      authUserIdRef.current = getSessionUserId(session);

      if (
        !authChangeNeedsDataReload(
          event,
          previousUserId,
          session,
        )
      ) {
        return;
      }

      window.setTimeout(() => {
        if (mounted) {
          void refresh();
        }
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refresh]);

  const value = useMemo<StoreDataContextValue>(() => ({
    products,
    categories,
    loading,
    error,
    refresh,

    async loadProductPage(filters) {
      const page = Math.max(1, filters.page);
      const pageSize = Math.min(50, Math.max(1, filters.pageSize));
      const cacheKey = JSON.stringify({
        page,
        pageSize,
        keyword: filters.keyword.trim(),
        categoryId: filters.categoryId,
        status: filters.status,
      });
      const cachedPage =
        productPageCacheRef.current.get(cacheKey);

      if (cachedPage) {
        setProductsState(cachedPage.products);
        return {
          success: true,
          message: "Đã tải sản phẩm từ bộ nhớ tạm.",
          data: cachedPage,
        };
      }

      try {
        const { data: pageData, error: pageError } = await supabase.rpc(
          "admin_search_product_ids",
          {
            p_query: filters.keyword.trim(),
            p_category_id: filters.categoryId || null,
            p_status: filters.status || null,
            p_page: page,
            p_page_size: pageSize,
          },
        );

        if (pageError) throw pageError;

        const parsed = parseAdminPageIds(pageData, page, pageSize);
        let pageProducts: Product[] = [];

        if (parsed.ids.length > 0) {
          const { data: productData, error: productError } = await supabase
            .from("products")
            .select(
              "id,category_id,name,slug,sku,price,compare_at_price,stock,status,is_featured,description,metadata,created_at,updated_at,categories!products_category_id_fkey(name)",
            )
            .in("id", parsed.ids);

          if (productError) throw productError;

          const { data: imageData, error: imageError } = await supabase
            .from("product_images")
            .select("id,product_id,image_url,public_id,alt_text,sort_order,is_primary")
            .in("product_id", parsed.ids)
            .order("sort_order", { ascending: true });

          if (imageError) throw imageError;

          const { data: videoData, error: videoError } = await supabase
            .from("product_videos")
            .select("id,product_id,video_url,public_id,poster_url,alt_text,sort_order,duration_seconds,width,height,bytes")
            .in("product_id", parsed.ids)
            .order("sort_order", { ascending: true });

          if (videoError) throw videoError;

          const {
            data: productCategoryData,
            error: productCategoryError,
          } = await supabase
            .from("product_categories")
            .select("product_id,category_id")
            .in("product_id", parsed.ids);
          if (productCategoryError) {
            throw productCategoryError;
          }

          const categoryIdsByProduct = new Map<
            string,
            string[]
          >();
          for (const row of (
            productCategoryData ?? []
          ) as ProductCategoryRow[]) {
            const list =
              categoryIdsByProduct.get(row.product_id) ?? [];
            list.push(row.category_id);
            categoryIdsByProduct.set(row.product_id, list);
          }

          const imagesByProduct = new Map<
            string,
            ProductImage[]
          >();
          for (const row of (imageData ?? []) as ProductImageRow[]) {
            const list = imagesByProduct.get(row.product_id) ?? [];
            list.push(productImageFromRow(row));
            imagesByProduct.set(row.product_id, list);
          }
          const videosByProduct = new Map<
            string,
            ProductVideo[]
          >();
          for (const row of (videoData ?? []) as ProductVideoRow[]) {
            const list = videosByProduct.get(row.product_id) ?? [];
            list.push(productVideoFromRow(row));
            videosByProduct.set(row.product_id, list);
          }

          const productsById = new Map(
            ((productData ?? []) as ProductRow[]).map(
              (row) => [
                row.id,
                productFromRow(
                  row,
                  undefined,
                  imagesByProduct.get(row.id) ?? [],
                  categoryIdsByProduct.get(row.id) ?? [],
                  videosByProduct.get(row.id) ?? [],
                ),
              ],
            ),
          );

          pageProducts = parsed.ids
            .map((id) => productsById.get(id))
            .filter((product): product is Product => Boolean(product));
        }

        setProductsState(pageProducts);

        const result = {
          success: true,
          message: "Đã tải danh sách sản phẩm.",
          data: {
            products: pageProducts,
            total: parsed.total,
            page: parsed.page,
            pageSize: parsed.pageSize,
            totalPages: Math.max(1, Math.ceil(parsed.total / parsed.pageSize)),
          },
        } satisfies StoreActionResult<ProductPageResult>;
        productPageCacheRef.current.set(
          cacheKey,
          result.data,
        );
        return result;
      } catch (loadError) {
        setProducts([]);
        return {
          success: false,
          message: errorMessage(loadError, "Không thể tải danh sách sản phẩm."),
        };
      }
    },

    async bulkDeleteProducts(ids) {
      try {
        const uniqueIds = [...new Set(ids)].slice(0, 50);
        if (uniqueIds.length === 0) {
          return { success: false, message: "Chưa chọn sản phẩm." };
        }

        const { error: rpcError } = await supabase.rpc(
          "admin_bulk_delete_products",
          {
            p_product_ids: uniqueIds,
          },
        );

        if (rpcError) throw rpcError;
        setProducts((current) =>
          current.filter((product) => !uniqueIds.includes(product.id)),
        );
        return {
          success: true,
          message: `Đã xóa ${uniqueIds.length} sản phẩm.`,
        };
      } catch (actionError) {
        return {
          success: false,
          message: errorMessage(actionError, "Không thể xóa các sản phẩm đã chọn."),
        };
      }
    },

    async bulkUpdateProductStatus(ids, status) {
      try {
        const uniqueIds = [...new Set(ids)].slice(0, 50);
        if (uniqueIds.length === 0) {
          return { success: false, message: "Chưa chọn sản phẩm." };
        }

        const { error: rpcError } = await supabase.rpc(
          "admin_bulk_update_product_status",
          {
            p_product_ids: uniqueIds,
            p_status: status,
          },
        );

        if (rpcError) throw rpcError;
        return {
          success: true,
          message: `Đã cập nhật ${uniqueIds.length} sản phẩm.`,
        };
      } catch (actionError) {
        return {
          success: false,
          message: errorMessage(actionError, "Không thể cập nhật các sản phẩm đã chọn."),
        };
      }
    },

    async bulkAddProductsToCategories(ids, categoryIds) {
      try {
        const uniqueIds = [...new Set(ids)].slice(0, 50);
        const uniqueCategoryIds = [
          ...new Set(categoryIds.filter(Boolean)),
        ];

        if (uniqueIds.length === 0) {
          return {
            success: false,
            message: "Chưa chọn sản phẩm.",
          };
        }

        if (uniqueCategoryIds.length === 0) {
          return {
            success: false,
            message: "Chưa chọn bộ sưu tập.",
          };
        }

        if (
          uniqueCategoryIds.some(
            (categoryId) =>
              !categories.some(
                (category) => category.id === categoryId,
              ),
          )
        ) {
          return {
            success: false,
            message: "Có bộ sưu tập không tồn tại.",
          };
        }

        const { error: rpcError } = await supabase.rpc(
          "admin_bulk_add_product_categories",
          {
            p_product_ids: uniqueIds,
            p_category_ids: uniqueCategoryIds,
          },
        );

        if (rpcError) throw rpcError;

        setProducts((current) =>
          current.map((product) =>
            uniqueIds.includes(product.id)
              ? {
                  ...product,
                  categoryIds: [
                    ...new Set([
                      ...(
                        product.categoryIds ?? [
                          product.categoryId,
                        ]
                      ).filter(Boolean),
                      ...uniqueCategoryIds,
                    ]),
                  ],
                }
              : product,
          ),
        );

        return {
          success: true,
          message:
            `Đã thêm ${uniqueIds.length} sản phẩm vào ${uniqueCategoryIds.length} bộ sưu tập.`,
        };
      } catch (actionError) {
        return {
          success: false,
          message: errorMessage(
            actionError,
            "Không thể thêm các sản phẩm vào bộ sưu tập.",
          ),
        };
      }
    },

    async createProduct(input) {
      try {
        const categorySelection =
          resolveProductCategories(input, categories);
        if (!categorySelection) {
          return {
            success: false,
            message: "Bộ sưu tập không tồn tại.",
          };
        }
        const { category, categoryIds } =
          categorySelection;

        const id = crypto.randomUUID();
        const slug = uniqueSlug(input.slug || input.name, products);
        const { data, error: insertError } = await supabase
          .from("products")
          .insert({
            id,
            category_id: category.id,
            name: input.name,
            slug,
            description: input.description,
            price: input.price,
            compare_at_price: input.compareAtPrice ?? null,
            stock: input.stock,
            track_inventory: true,
            low_stock_threshold: 5,
            has_variants: Boolean(input.variantGroups?.length),
            status: input.status,
            is_featured: Boolean(input.featured),
            metadata: productMetadata(input),
          })
          .select("id,category_id,name,slug,sku,price,compare_at_price,stock,status,is_featured,description,metadata,created_at,updated_at")
          .single();

        if (insertError) throw insertError;
        await syncProductCategories(id, categoryIds);
        await syncProductImages(id, input.images ?? []);
        await syncProductVideos(id, input.videos ?? []);

        const product = productFromRow(
          data as ProductRow,
          category.name,
          input.images ?? [],
          categoryIds,
          input.videos ?? [],
        );
        setProducts((current) => [product, ...current]);
        return { success: true, message: "Đã tạo sản phẩm.", data: product };
      } catch (actionError) {
        return { success: false, message: errorMessage(actionError, "Không thể tạo sản phẩm.") };
      }
    },

    async updateProduct(id, input) {
      try {
        const categorySelection =
          resolveProductCategories(input, categories);
        if (!categorySelection) {
          return {
            success: false,
            message: "Bộ sưu tập không tồn tại.",
          };
        }
        const { category, categoryIds } =
          categorySelection;

        const slug = uniqueSlug(input.slug || input.name, products, id);
        const { data, error: updateError } = await supabase
          .from("products")
          .update({
            category_id: category.id,
            name: input.name,
            slug,
            description: input.description,
            price: input.price,
            compare_at_price: input.compareAtPrice ?? null,
            stock: input.stock,
            has_variants: Boolean(input.variantGroups?.length),
            status: input.status,
            is_featured: Boolean(input.featured),
            metadata: productMetadata(input),
          })
          .eq("id", id)
          .select("id,category_id,name,slug,sku,price,compare_at_price,stock,status,is_featured,description,metadata,created_at,updated_at")
          .single();

        if (updateError) throw updateError;
        await syncProductCategories(id, categoryIds);
        await syncProductImages(id, input.images ?? []);
        await syncProductVideos(id, input.videos ?? []);

        const product = productFromRow(
          data as ProductRow,
          category.name,
          input.images ?? [],
          categoryIds,
          input.videos ?? [],
        );
        setProducts((current) => current.map((item) => (item.id === id ? product : item)));
        return { success: true, message: "Đã cập nhật sản phẩm.", data: product };
      } catch (actionError) {
        return { success: false, message: errorMessage(actionError, "Không thể cập nhật sản phẩm.") };
      }
    },

    async deleteProduct(id) {
      try {
        const { error: deleteError } = await supabase.from("products").delete().eq("id", id);
        if (deleteError) throw deleteError;
        setProducts((current) => current.filter((product) => product.id !== id));
        return { success: true, message: "Đã xóa sản phẩm." };
      } catch (actionError) {
        return { success: false, message: errorMessage(actionError, "Không thể xóa sản phẩm.") };
      }
    },

    async duplicateProduct(id) {
      const source = products.find((product) => product.id === id);
      if (!source) return { success: false, message: "Không tìm thấy sản phẩm." };

      const duplicatedImages = (source.images ?? []).map(
        (image) => ({
          ...image,
          id: crypto.randomUUID(),
        }),
      );
      const imageIdMap = new Map(
        (source.images ?? []).map((image, index) => [
          image.id,
          duplicatedImages[index].id,
        ]),
      );
      const duplicatedVideos = (source.videos ?? []).map(
        (video) => ({
          ...video,
          id: crypto.randomUUID(),
        }),
      );
      const videoIdMap = new Map(
        (source.videos ?? []).map((video, index) => [
          video.id,
          duplicatedVideos[index].id,
        ]),
      );
      const duplicatedVariantGroups = source.variantGroups?.map(
        (group, groupIndex) => ({
          ...group,
          options: group.options.map((option) => {
            const imageId =
              groupIndex === 0 && option.imageId
                ? imageIdMap.get(option.imageId)
                : undefined;
            const videoId =
              groupIndex === 0 &&
              !imageId &&
              option.videoId
                ? videoIdMap.get(option.videoId)
                : undefined;

            return {
              ...option,
              imageId,
              videoId,
            };
          }),
        }),
      );

      const input: ProductInput = {
        name: `${source.name} - Bản sao`,
        slug: uniqueSlug(`${source.slug}-ban-sao`, products),
      categoryId: source.categoryId,
      categoryIds:
        source.categoryIds ?? [source.categoryId],
      categoryName: source.categoryName,
        price: source.price,
        compareAtPrice: source.compareAtPrice,
        emoji: source.emoji,
        background: source.background,
        badge: source.badge,
        stockNoteEnabled:
          Boolean(source.stockNoteEnabled),
        stockNote: source.stockNote,
        material: source.material,
        origin: source.origin,        featured: false,
        stock: source.stock,
        description: source.description,
        images: duplicatedImages,
        videos: duplicatedVideos,
        variantGroups: duplicatedVariantGroups,
        status: "hidden",
      };

      try {
        const categorySelection =
          resolveProductCategories(input, categories);
        if (!categorySelection) {
          return {
            success: false,
            message: "Bộ sưu tập không tồn tại.",
          };
        }
        const { category, categoryIds } =
          categorySelection;

        const newId = crypto.randomUUID();
        const { data, error: insertError } = await supabase
          .from("products")
          .insert({
            id: newId,
            category_id: category.id,
            name: input.name,
            slug: input.slug,
            description: input.description,
            price: input.price,
            compare_at_price: input.compareAtPrice ?? null,
            stock: input.stock,
            track_inventory: true,
            low_stock_threshold: 5,
            has_variants: Boolean(input.variantGroups?.length),
            status: input.status,
            is_featured: false,
            metadata: productMetadata(input),
          })
          .select("id,category_id,name,slug,sku,price,compare_at_price,stock,status,is_featured,description,metadata,created_at,updated_at")
          .single();

        if (insertError) throw insertError;
        await syncProductCategories(
          newId,
          categoryIds,
        );
        await syncProductImages(newId, input.images ?? []);
        await syncProductVideos(newId, input.videos ?? []);

        const product = productFromRow(
          data as ProductRow,
          category.name,
          input.images ?? [],
          categoryIds,
          input.videos ?? [],
        );
        setProducts((current) => [product, ...current]);
        return { success: true, message: "Đã nhân bản sản phẩm.", data: product };
      } catch (actionError) {
        return { success: false, message: errorMessage(actionError, "Không thể nhân bản sản phẩm.") };
      }
    },

    async toggleProductVisibility(id) {
      const source = products.find((product) => product.id === id);
      if (!source) return { success: false, message: "Không tìm thấy sản phẩm." };

      const nextStatus: ProductStatus =
        source.status === "hidden"
          ? source.stock > 0
            ? "active"
            : "out_of_stock"
          : "hidden";

      try {
        const { data, error: updateError } = await supabase
          .from("products")
          .update({ status: nextStatus })
          .eq("id", id)
          .select("id,category_id,name,slug,sku,price,compare_at_price,stock,status,is_featured,description,metadata,created_at,updated_at")
          .single();

        if (updateError) throw updateError;

        const product = productFromRow(
          data as ProductRow,
          source.categoryName,
          source.images ?? [],
          source.categoryIds ?? [source.categoryId],
          source.videos ?? [],
        );
        setProducts((current) => current.map((item) => (item.id === id ? product : item)));
        return { success: true, message: "Đã cập nhật trạng thái sản phẩm.", data: product };
      } catch (actionError) {
        return { success: false, message: errorMessage(actionError, "Không thể cập nhật sản phẩm.") };
      }
    },

    async createCategory(input) {
      try {
        const id = crypto.randomUUID();
        const slug = uniqueSlug(input.slug || input.name, categories);
        const { data, error: insertError } = await supabase
          .from("categories")
          .insert({
            id,
            name: input.name,
            slug,
            description: categoryDescription(input),
            sort_order: categories.length,
            active: input.status === "active",
          })
          .select("id,name,slug,description,sort_order,active,created_at,updated_at")
          .single();

        if (insertError) throw insertError;

        const category = categoryFromRow(data as CategoryRow);
        setCategories((current) => [...current, category]);
        return { success: true, message: "Đã tạo danh mục.", data: category };
      } catch (actionError) {
        return { success: false, message: errorMessage(actionError, "Không thể tạo danh mục.") };
      }
    },

    async updateCategory(id, input) {
      try {
        const slug = uniqueSlug(input.slug || input.name, categories, id);
        const { data, error: updateError } = await supabase
          .from("categories")
          .update({
            name: input.name,
            slug,
            description: categoryDescription(input),
            active: input.status === "active",
          })
          .eq("id", id)
          .select("id,name,slug,description,sort_order,active,created_at,updated_at")
          .single();

        if (updateError) throw updateError;

        const category = categoryFromRow(data as CategoryRow);
        setCategories((current) => current.map((item) => (item.id === id ? category : item)));
        setProducts((current) => current.map((product) => (
          product.categoryId === id
            ? { ...product, categoryName: category.name }
            : product
        )));
        return { success: true, message: "Đã cập nhật danh mục.", data: category };
      } catch (actionError) {
        return { success: false, message: errorMessage(actionError, "Không thể cập nhật danh mục.") };
      }
    },

    async deleteCategory(id) {
      if (
        products.some((product) =>
          (
            product.categoryIds ?? [product.categoryId]
          ).includes(id),
        )
      ) {
        return { success: false, message: "Không thể xóa danh mục đang có sản phẩm." };
      }

      try {
        const { error: deleteError } = await supabase.from("categories").delete().eq("id", id);
        if (deleteError) throw deleteError;
        setCategories((current) => current.filter((category) => category.id !== id));
        return { success: true, message: "Đã xóa danh mục." };
      } catch (actionError) {
        return { success: false, message: errorMessage(actionError, "Không thể xóa danh mục.") };
      }
    },

    async toggleCategoryVisibility(id) {
      const source = categories.find((category) => category.id === id);
      if (!source) return { success: false, message: "Không tìm thấy danh mục." };

      try {
        const { data, error: updateError } = await supabase
          .from("categories")
          .update({ active: source.status !== "active" })
          .eq("id", id)
          .select("id,name,slug,description,sort_order,active,created_at,updated_at")
          .single();

        if (updateError) throw updateError;

        const category = categoryFromRow(data as CategoryRow);
        setCategories((current) => current.map((item) => (item.id === id ? category : item)));
        return { success: true, message: "Đã cập nhật trạng thái danh mục.", data: category };
      } catch (actionError) {
        return { success: false, message: errorMessage(actionError, "Không thể cập nhật danh mục.") };
      }
    },

    reserveStockForOrder(items) {
      const productQuantities = new Map<string, number>();
      const optionQuantities = new Map<string, number>();

      for (const item of items) {
        productQuantities.set(
          item.productId,
          (productQuantities.get(item.productId) ?? 0) + item.quantity,
        );

        for (const selected of item.selectedVariants) {
          const key = `${item.productId}::${selected.groupId}::${selected.optionId}`;
          optionQuantities.set(key, (optionQuantities.get(key) ?? 0) + item.quantity);
        }
      }

      for (const [productId, quantity] of productQuantities) {
        const product = products.find((item) => item.id === productId);

        if (!product || product.status === "hidden") {
          return { success: false, message: "Có sản phẩm không còn được bán." };
        }

        if (product.stock < quantity) {
          return { success: false, message: `${product.name} không đủ tồn kho.` };
        }
      }

      for (const [key, quantity] of optionQuantities) {
        const [productId, groupId, optionId] = key.split("::");
        const product = products.find((item) => item.id === productId);
        const option = product?.variantGroups
          ?.find((group) => group.id === groupId)
          ?.options.find((item) => item.id === optionId);

        if (typeof option?.stock === "number" && option.stock < quantity) {
          return {
            success: false,
            message: `${product?.name ?? "Sản phẩm"} không đủ tồn kho cho biến thể đã chọn.`,
          };
        }
      }

      const changedAt = new Date().toISOString();

      setProducts((current) =>
        current.map((product) => {
          const quantity = productQuantities.get(product.id) ?? 0;
          if (quantity === 0) return product;

          const nextStock = Math.max(0, product.stock - quantity);

          return {
            ...product,
            stock: nextStock,
            status:
              product.status === "hidden"
                ? "hidden"
                : nextStock === 0
                  ? "out_of_stock"
                  : "active",
            variantGroups: product.variantGroups?.map((group) => ({
              ...group,
              options: group.options.map((option) => {
                const key = `${product.id}::${group.id}::${option.id}`;
                const used = optionQuantities.get(key) ?? 0;

                return typeof option.stock === "number"
                  ? { ...option, stock: Math.max(0, option.stock - used) }
                  : option;
              }),
            })),
            updatedAt: changedAt,
          };
        }),
      );

      return { success: true, message: "Đã giữ tồn kho cho đơn hàng." };
    },

    restoreStockForOrder(items) {
      const productQuantities = new Map<string, number>();
      const optionQuantities = new Map<string, number>();

      for (const item of items) {
        productQuantities.set(
          item.productId,
          (productQuantities.get(item.productId) ?? 0) + item.quantity,
        );

        for (const selected of item.selectedVariants) {
          const key = `${item.productId}::${selected.groupId}::${selected.optionId}`;
          optionQuantities.set(key, (optionQuantities.get(key) ?? 0) + item.quantity);
        }
      }

      const changedAt = new Date().toISOString();

      setProducts((current) =>
        current.map((product) => {
          const quantity = productQuantities.get(product.id) ?? 0;
          if (quantity === 0) return product;

          const nextStock = product.stock + quantity;

          return {
            ...product,
            stock: nextStock,
            status: product.status === "hidden" ? "hidden" : "active",
            variantGroups: product.variantGroups?.map((group) => ({
              ...group,
              options: group.options.map((option) => {
                const key = `${product.id}::${group.id}::${option.id}`;
                const restored = optionQuantities.get(key) ?? 0;

                return typeof option.stock === "number"
                  ? { ...option, stock: option.stock + restored }
                  : option;
              }),
            })),
            updatedAt: changedAt,
          };
        }),
      );

      return { success: true, message: "Đã hoàn lại tồn kho." };
    },
  }), [categories, error, loading, products, refresh, setProducts]);

  return <StoreDataContext.Provider value={value}>{children}</StoreDataContext.Provider>;
}

export function useStoreData() {
  const context = useContext(StoreDataContext);
  if (!context) throw new Error("useStoreData phải được dùng trong StoreDataProvider.");
  return context;
}
