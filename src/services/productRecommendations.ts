import { supabase } from "../lib/supabase";
import type {
  Product,
  ProductStatus,
  ProductVariantGroup,
} from "../types/product";

const CACHE_TTL_MS = 2 * 60 * 1000;

type RecommendationRow = {
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
  metadata: Record<string, unknown> | string | null;
  created_at: string;
  updated_at: string;
  image_id: string | null;
  image_url: string | null;
  image_public_id: string | null;
  image_alt_text: string | null;
  sold_quantity: number | string;
};

export type ProductRecommendations = {
  similar: Product[];
  bestselling: Product[];
};

type CacheEntry = {
  expiresAt: number;
  value: ProductRecommendations;
};

const cache = new Map<string, CacheEntry>();

function parseMetadata(
  value: RecommendationRow["metadata"],
) {
  if (
    value &&
    typeof value === "object" &&
    !Array.isArray(value)
  ) {
    return value;
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

function productStatus(value: string): ProductStatus {
  if (value === "out_of_stock") {
    return "out_of_stock";
  }

  return value === "active"
    ? "active"
    : "hidden";
}

function mapProduct(row: RecommendationRow): Product {
  const metadata = parseMetadata(row.metadata);
  const image = row.image_url
    ? [
        {
          id:
            row.image_id ??
            `recommendation-${row.product_id}`,
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
    featured: row.is_featured,
    stock: row.stock,
    description: row.description ?? "",
    images: image,
    variantGroups: Array.isArray(metadata.variantGroups)
      ? (metadata.variantGroups as ProductVariantGroup[])
      : undefined,
    status: productStatus(row.status),
    soldQuantity: Number(row.sold_quantity),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchProductRecommendations(
  productId: string,
  categoryId: string,
  limit = 6,
  force = false,
): Promise<ProductRecommendations> {
  const safeLimit = Math.min(
    Math.max(limit, 1),
    12,
  );
  const cacheKey = [
    productId,
    categoryId,
    safeLimit,
  ].join(":");
  const cached = cache.get(cacheKey);

  if (
    !force &&
    cached &&
    cached.expiresAt > Date.now()
  ) {
    return cached.value;
  }

  const [similarResult, bestsellingResult] =
    await Promise.all([
      supabase.rpc(
        "get_similar_products",
        {
          p_product_id: productId,
          p_category_id:
            categoryId || null,
          p_limit: safeLimit,
        },
      ),
      supabase.rpc(
        "get_bestselling_products",
        {
          p_exclude_product_id: productId,
          p_limit: safeLimit,
        },
      ),
    ]);

  const error =
    similarResult.error ??
    bestsellingResult.error;

  if (error) {
    throw new Error(error.message);
  }

  const value: ProductRecommendations = {
    similar: ((similarResult.data ?? []) as unknown as RecommendationRow[]).map(mapProduct),
    bestselling: ((bestsellingResult.data ?? []) as unknown as RecommendationRow[]).map(mapProduct),
  };

  cache.set(cacheKey, {
    value,
    expiresAt:
      Date.now() + CACHE_TTL_MS,
  });

  return value;
}