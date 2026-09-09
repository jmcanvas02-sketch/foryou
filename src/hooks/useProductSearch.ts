/* eslint-disable react-hooks/set-state-in-effect, react-hooks/exhaustive-deps */
import {
  useCallback,
  useEffect,
  useState,
} from "react";

import { searchProducts } from "../services/products";
import type {
  ProductSearchFilters,
  ProductSearchResult,
} from "../types/product";

const emptyResult: ProductSearchResult = {
  products: [],
  total: 0,
  page: 1,
  pageSize: 12,
  totalPages: 1,
};

export function useProductSearch(
  filters: ProductSearchFilters,
) {
  const [data, setData] =
    useState<ProductSearchResult>(emptyResult);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryVersion, setRetryVersion] =
    useState(0);

  const retry = useCallback(() => {
    setRetryVersion((current) => current + 1);
  }, []);

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");

    void searchProducts(filters, {
      force: retryVersion > 0,
    })
      .then((result) => {
        if (!active) {
          return;
        }

        setData(result);
      })
      .catch((loadError: unknown) => {
        if (!active) {
          return;
        }

        setError(
          loadError instanceof Error
            ? loadError.message
            : "Không thể tải sản phẩm.",
        );
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [
    filters.categoryId,
    filters.featured,
    filters.inStock,
    filters.maxPrice,
    filters.minPrice,
    filters.page,
    filters.pageSize,
    filters.query,
    filters.sort,
    retryVersion,
  ]);

  return {
    data,
    loading,
    error,
    retry,
  };
}