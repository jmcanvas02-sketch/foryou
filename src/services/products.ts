import { supabase } from "../lib/supabase";
import type {
  CatalogSort,
  Category,
  Product,
  ProductImage,
  ProductVideo,
  ProductSearchFilters,
  ProductSearchResult,
  ProductStatus,
  ProductVariantGroup,
} from "../types/product";

const CACHE_TTL_MS = 2 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_ATTEMPTS = 3;

type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

type CategoryRow = {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type CatalogRpcRow = {
  product_id: string;
  product_name: string;
  product_slug: string;
  category_id: string | null;
  category_name: string | null;
  price: number | string;
  compare_at_price: number | string | null;
  stock: number;
  status: string;
  is_featured: boolean;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  image_id: string | null;
  image_url: string | null;
  image_public_id: string | null;
  image_alt_text: string | null;
  sold_quantity: number | string;
  total_count: number | string;
};

type ProductImageRow = {
  id: string;
  image_url: string;
  public_id: string | null;
  alt_text: string | null;
  sort_order: number;
  is_primary: boolean;
};

type ProductVideoRow = {
  id: string;
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

type ProductDetailRow = {
  id: string;
  category_id: string | null;
  name: string;
  slug: string;
  price: number | string;
  compare_at_price: number | string | null;
  stock: number;
  status: string;
  is_featured: boolean;
  description: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  updated_at: string;
  categories:
    | { name?: string }
    | Array<{ name?: string }>
    | null;
  product_images: ProductImageRow[] | null;
  product_videos: ProductVideoRow[] | null;
};

type FetchOptions = {
  force?: boolean;
};

const cache = new Map<string, CacheEntry<unknown>>();
const pending = new Map<string, Promise<unknown>>();

function parseJsonObject(
  value: unknown,
): Record<string, unknown> {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value as Record<string, unknown>;
  }

  if (typeof value !== "string") {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as unknown;

    return parsed &&
      typeof parsed === "object" &&
      !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return {};
  }
}

function relationName(
  relation: ProductDetailRow["categories"],
) {
  if (Array.isArray(relation)) {
    return relation[0]?.name ?? "Chưa phân loại";
  }

  return relation?.name ?? "Chưa phân loại";
}

function productStatus(value: string): ProductStatus {
  if (value === "out_of_stock") {
    return "out_of_stock";
  }

  if (value === "active") {
    return "active";
  }

  return "hidden";
}

function metadataFields(
  metadataValue: unknown,
) {
  const metadata = parseJsonObject(metadataValue);

  return {
    emoji:
      typeof metadata.emoji === "string"
        ? metadata.emoji
        : "",
    background:
      typeof metadata.background === "string"
        ? metadata.background
        : "#dff4ff",
    badge:
      typeof metadata.badge === "string"
        ? metadata.badge
        : undefined,
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
        : undefined,    variantGroups: Array.isArray(
      metadata.variantGroups,
    )
      ? (metadata.variantGroups as ProductVariantGroup[])
      : undefined,
  };
}

function imageFromRow(
  row: ProductImageRow,
): ProductImage {
  return {
    id: row.id,
    url: row.image_url,
    publicId: row.public_id ?? undefined,
    altText: row.alt_text ?? undefined,
    isPrimary: row.is_primary,
    sortOrder: row.sort_order,
  };
}

function videoFromRow(
  row: ProductVideoRow,
): ProductVideo {
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

function productFromCatalogRow(
  row: CatalogRpcRow,
): Product {
  const metadata = metadataFields(row.metadata);
  const images: ProductImage[] = row.image_url
    ? [
        {
          id:
            row.image_id ??
            `catalog-${row.product_id}`,
          url: row.image_url,
          publicId:
            row.image_public_id ?? undefined,
          altText:
            row.image_alt_text ?? undefined,
          isPrimary: true,
          sortOrder: 0,
        },
      ]
    : [];

  return {
    id: row.product_id,
    name: row.product_name,
    slug: row.product_slug,
    categoryId: row.category_id ?? "",
    categoryName:
      row.category_name ?? "Chưa phân loại",
    price: Number(row.price),
    compareAtPrice:
      row.compare_at_price === null
        ? undefined
        : Number(row.compare_at_price),
    emoji: metadata.emoji,
    background: metadata.background,
    badge: metadata.badge,
    stockNoteEnabled: metadata.stockNoteEnabled,
    stockNote: metadata.stockNote,
    material: metadata.material,
    origin: metadata.origin,
    featured: row.is_featured,
    stock: row.stock,
    description: row.description ?? "",
    images,
    variantGroups: metadata.variantGroups,
    status: productStatus(row.status),
    soldQuantity: Number(row.sold_quantity),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function productFromDetailRow(
  row: ProductDetailRow,
): Product {
  const metadata = metadataFields(row.metadata);
  const images = [...(row.product_images ?? [])]
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order,
    )
    .map(imageFromRow);
  const videos = [...(row.product_videos ?? [])]
    .sort(
      (left, right) =>
        left.sort_order - right.sort_order,
    )
    .map(videoFromRow);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    categoryId: row.category_id ?? "",
    categoryName: relationName(row.categories),
    price: Number(row.price),
    compareAtPrice:
      row.compare_at_price === null
        ? undefined
        : Number(row.compare_at_price),
    emoji: metadata.emoji,
    background: metadata.background,
    badge: metadata.badge,
    stockNoteEnabled: metadata.stockNoteEnabled,
    stockNote: metadata.stockNote,
    material: metadata.material,
    origin: metadata.origin,
    featured: row.is_featured,
    stock: row.stock,
    description: row.description ?? "",
    images,
    videos,
    variantGroups: metadata.variantGroups,
    status: productStatus(row.status),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function categoryFromRow(row: CategoryRow): Category {
  const metadata = parseJsonObject(row.description);

  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    emoji:
      typeof metadata.emoji === "string"
        ? metadata.emoji
        : "",
    background:
      typeof metadata.background === "string"
        ? metadata.background
        : "#dff4ff",
    status: row.active ? "active" : "hidden",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function errorMessage(error: unknown) {
  if (
    error instanceof Error &&
    error.message
  ) {
    return error.message;
  }

  if (
    error &&
    typeof error === "object" &&
    "message" in error
  ) {
    const message = (
      error as { message?: unknown }
    ).message;

    if (typeof message === "string") {
      return message;
    }
  }

  return "Không thể tải dữ liệu sản phẩm.";
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

async function withTimeout<T>(
  task: Promise<T>,
  timeoutMs = REQUEST_TIMEOUT_MS,
): Promise<T> {
  let timer = 0;

  const timeout = new Promise<never>(
    (_resolve, reject) => {
      timer = window.setTimeout(() => {
        reject(
          new Error(
            "Máy chủ phản hồi quá chậm. Vui lòng thử lại.",
          ),
        );
      }, timeoutMs);
    },
  );

  try {
    return await Promise.race([task, timeout]);
  } finally {
    window.clearTimeout(timer);
  }
}

async function retry<T>(
  loader: () => Promise<T>,
): Promise<T> {
  let lastError: unknown;

  for (
    let attempt = 1;
    attempt <= MAX_ATTEMPTS;
    attempt += 1
  ) {
    try {
      return await withTimeout(loader());
    } catch (error) {
      lastError = error;

      if (attempt < MAX_ATTEMPTS) {
        await wait(350 * attempt);
      }
    }
  }

  throw new Error(errorMessage(lastError));
}

async function cached<T>(
  key: string,
  loader: () => Promise<T>,
  options: FetchOptions = {},
): Promise<T> {
  const now = Date.now();
  const existing = cache.get(key) as
    | CacheEntry<T>
    | undefined;

  if (
    !options.force &&
    existing &&
    existing.expiresAt > now
  ) {
    return existing.value;
  }

  const currentPending = pending.get(key) as
    | Promise<T>
    | undefined;

  if (!options.force && currentPending) {
    return currentPending;
  }

  const request = retry(loader)
    .then((value) => {
      cache.set(key, {
        value,
        expiresAt: Date.now() + CACHE_TTL_MS,
      });

      return value;
    })
    .finally(() => {
      pending.delete(key);
    });

  pending.set(key, request);
  return request;
}

export function clearCatalogCache() {
  cache.clear();
}

export async function fetchActiveCategories(
  options: FetchOptions = {},
) {
  return cached<Category[]>(
    "catalog:categories",
    async () => {
      const { data, error } = await supabase
        .from("categories")
        .select(
          "id,name,slug,description,active,created_at,updated_at",
        )
        .eq("active", true)
        .order("sort_order", {
          ascending: true,
        })
        .order("created_at", {
          ascending: true,
        });

      if (error) {
        throw error;
      }

      return (
        (data ?? []) as CategoryRow[]
      ).map(categoryFromRow);
    },
    options,
  );
}

export async function searchProducts(
  filters: ProductSearchFilters,
  options: FetchOptions = {},
): Promise<ProductSearchResult> {
  const page = Math.max(1, filters.page ?? 1);
  const pageSize = Math.min(
    48,
    Math.max(1, filters.pageSize ?? 12),
  );
  const sort: CatalogSort =
    filters.sort ?? "relevance";

  const normalizedFilters = {
    query: filters.query?.trim() ?? "",
    categoryId: filters.categoryId || null,
    minPrice:
      typeof filters.minPrice === "number"
        ? Math.max(0, filters.minPrice)
        : null,
    maxPrice:
      typeof filters.maxPrice === "number"
        ? Math.max(0, filters.maxPrice)
        : null,
    inStock: Boolean(filters.inStock),
    featured:
      typeof filters.featured === "boolean"
        ? filters.featured
        : null,
    sort,
    page,
    pageSize,
  };

  const key = `catalog:search:${JSON.stringify(
    normalizedFilters,
  )}`;

  return cached<ProductSearchResult>(
    key,
    async () => {
      const { data, error } = await supabase.rpc(
        "search_catalog_products",
        {
          p_query: normalizedFilters.query,
          p_category_id:
            normalizedFilters.categoryId,
          p_min_price: normalizedFilters.minPrice,
          p_max_price: normalizedFilters.maxPrice,
          p_in_stock: normalizedFilters.inStock,
          p_featured: normalizedFilters.featured,
          p_sort: normalizedFilters.sort,
          p_page: normalizedFilters.page,
          p_page_size:
            normalizedFilters.pageSize,
        },
      );

      if (error) {
        throw error;
      }

      const rows =
        (data ?? []) as CatalogRpcRow[];
      const total = Number(
        rows[0]?.total_count ?? 0,
      );

      return {
        products: rows.map(productFromCatalogRow),
        total,
        page,
        pageSize,
        totalPages: Math.max(
          1,
          Math.ceil(total / pageSize),
        ),
      };
    },
    options,
  );
}

export async function fetchCollectionProductPreviews(
  categories: Category[],
  limit = 3,
  options: FetchOptions = {},
): Promise<Record<string, Product[]>> {
  const previewLimit = Math.min(3, Math.max(1, limit));
  const entries = await Promise.all(
    categories.map(async (category) => {
      const result = await searchProducts(
        {
          categoryId: category.id,
          sort: "bestselling",
          page: 1,
          pageSize: 12,
        },
        options,
      );
      const productsWithImages = result.products
        .filter((product) =>
          (product.images ?? []).some((image) =>
            Boolean(image.url.trim()),
          ),
        )
        .slice(0, previewLimit);

      return [category.id, productsWithImages] as const;
    }),
  );

  return Object.fromEntries(entries);
}

export async function fetchFeaturedProducts(
  limit = 4,
  options: FetchOptions = {},
) {
  const result = await searchProducts(
    {
      featured: true,
      sort: "newest",
      page: 1,
      pageSize: limit,
    },
    options,
  );

  return result.products;
}

export async function fetchProductSlugBySku(
  sku: string,
  options: FetchOptions = {},
): Promise<string | null> {
  const normalizedSku = sku.trim().toUpperCase();

  if (!/^IGD\d+$/.test(normalizedSku)) {
    return null;
  }

  return cached<string | null>(
    `catalog:short-link:${normalizedSku}`,
    async () => {
      const { data, error } = await supabase
        .from("products")
        .select("slug")
        .eq("sku", normalizedSku)
        .in("status", ["active", "out_of_stock"])
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data || typeof data.slug !== "string") {
        return null;
      }

      const slug = data.slug.trim();

      return slug || null;
    },
    options,
  );
}
export async function fetchProductBySlug(
  slug: string,
  options: FetchOptions = {},
): Promise<Product | null> {
  const normalizedSlug = slug.trim().toLowerCase();

  if (!normalizedSlug) {
    return null;
  }

  return cached<Product | null>(
    `catalog:detail:${normalizedSlug}`,
    async () => {
      const { data, error } = await supabase
        .from("products")
        .select(`
          id,
          category_id,
          name,
          slug,
          price,
          compare_at_price,
          stock,
          status,
          is_featured,
          description,
          metadata,
          created_at,
          updated_at,
          categories!products_category_id_fkey (
            name
          ),
          product_images (
            id,
            image_url,
            public_id,
            alt_text,
            sort_order,
            is_primary
          ),
          product_videos (
            id,
            video_url,
            public_id,
            poster_url,
            alt_text,
            sort_order,
            duration_seconds,
            width,
            height,
            bytes
          )
        `)
        .eq("slug", normalizedSlug)
        .in("status", [
          "active",
          "out_of_stock",
        ])
        .maybeSingle();

      if (error) {
        throw error;
      }

      if (!data) {
        return null;
      }

      return productFromDetailRow(
        data as unknown as ProductDetailRow,
      );
    },
    options,
  );
}