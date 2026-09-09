import type { Product } from "../types/product";

type RecommendationInput = {
  products: Product[];
  cartProductIds: string[];
  remainingForFreeShipping: number;
  seed: string;
  limit?: number;
};

function hashString(value: string) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return hash >>> 0;
}

function compareSeededProducts(
  first: Product,
  second: Product,
  seed: string,
) {
  const firstScore = hashString(`${seed}:${first.id}`);
  const secondScore = hashString(`${seed}:${second.id}`);

  if (firstScore !== secondScore) {
    return firstScore - secondScore;
  }

  return first.id.localeCompare(second.id);
}

function getCategoryIds(product: Product) {
  const categoryIds = product.categoryIds?.filter(Boolean) ?? [];

  if (categoryIds.length > 0) {
    return [...new Set(categoryIds)];
  }

  return product.categoryId ? [product.categoryId] : ["uncategorized"];
}

export function selectCartRecommendations({
  products,
  cartProductIds,
  remainingForFreeShipping,
  seed,
  limit = 4,
}: RecommendationInput) {
  const excludedProductIds = new Set(cartProductIds);
  const eligibleProducts = products.filter(
    (product) =>
      product.status === "active" &&
      product.stock > 0 &&
      !excludedProductIds.has(product.id),
  );

  if (remainingForFreeShipping > 0) {
    return [...eligibleProducts]
      .sort((first, second) => {
        const firstCompletesFreeShipping =
          first.price >= remainingForFreeShipping;
        const secondCompletesFreeShipping =
          second.price >= remainingForFreeShipping;

        if (
          firstCompletesFreeShipping !== secondCompletesFreeShipping
        ) {
          return firstCompletesFreeShipping ? -1 : 1;
        }

        const firstGap = Math.abs(
          first.price - remainingForFreeShipping,
        );
        const secondGap = Math.abs(
          second.price - remainingForFreeShipping,
        );

        if (firstGap !== secondGap) {
          return firstGap - secondGap;
        }

        return compareSeededProducts(first, second, seed);
      })
      .slice(0, limit);
  }

  const randomizedProducts = [...eligibleProducts].sort(
    (first, second) =>
      compareSeededProducts(first, second, seed),
  );
  const selectedProducts: Product[] = [];
  const selectedProductIds = new Set<string>();
  const usedCategoryIds = new Set<string>();

  for (const product of randomizedProducts) {
    const unusedCategoryId = getCategoryIds(product).find(
      (categoryId) => !usedCategoryIds.has(categoryId),
    );

    if (!unusedCategoryId) {
      continue;
    }

    selectedProducts.push(product);
    selectedProductIds.add(product.id);
    usedCategoryIds.add(unusedCategoryId);

    if (selectedProducts.length === limit) {
      return selectedProducts;
    }
  }

  for (const product of randomizedProducts) {
    if (selectedProductIds.has(product.id)) {
      continue;
    }

    selectedProducts.push(product);

    if (selectedProducts.length === limit) {
      break;
    }
  }

  return selectedProducts;
}
