/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Product } from "../../types/product";
import type { CartItem, SelectedVariant } from "../../types/cart";
import type { SelectedCustomOptions } from "../../types/customProductOptions";

const STORAGE_KEY = "ingiday-cart";

type CartContextValue = {
  items: CartItem[];
  itemCount: number;
  subtotal: number;
  addItem: (
    product: Product,
    quantity: number,
    selectedVariants: SelectedVariant[],
    selectedCustomOptions?: SelectedCustomOptions,
  ) => void;
  updateQuantity: (key: string, quantity: number) => void;
  removeItem: (key: string) => void;
  clearCart: () => void;
};

const CartContext = createContext<CartContextValue | null>(null);

function readInitialCart(): CartItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as CartItem[]) : [];
  } catch {
    return [];
  }
}

export function CartProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<CartItem[]>(readInitialCart);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  }, [items]);

  function addItem(
    product: Product,
    quantity: number,
    selectedVariants: SelectedVariant[],
    selectedCustomOptions?: SelectedCustomOptions,
  ) {
    const normalizedCustomText = selectedCustomOptions?.text?.value.trim() ?? "";
    const customColorId = normalizedCustomText
      ? selectedCustomOptions?.color?.id ?? ""
      : "";
    const keyParts = [
      product.id,
      ...selectedVariants.map((variant) => variant.optionId),
      normalizedCustomText ? "text:" + normalizedCustomText : "text:",
      customColorId ? "color:" + customColorId : "color:",
    ];
    const key = keyParts.join("::");
    const variantStock = selectedVariants
      .map((variant) => variant.stock)
      .filter((stock): stock is number => typeof stock === "number");
    const stock =
      variantStock.length > 0 ? Math.min(product.stock, ...variantStock) : product.stock;
    const effectiveCustomOptions =
      normalizedCustomText && selectedCustomOptions?.text
        ? {
            text: {
              label: selectedCustomOptions.text.label,
              value: normalizedCustomText,
              priceDelta: selectedCustomOptions.text.priceDelta,
            },
            color: selectedCustomOptions.color,
          }
        : undefined;
    const customPriceDelta = effectiveCustomOptions?.text?.priceDelta ?? 0;
    const unitPrice =
      product.price +
      selectedVariants.reduce((sum, variant) => sum + variant.priceDelta, 0) +
      customPriceDelta;
    const variantImageId =
      selectedVariants.find((variant) => variant.imageId)?.imageId ?? "";
    const primaryImage =
      (variantImageId
        ? product.images?.find((image) => image.id === variantImageId)
        : undefined) ??
      product.images?.find((image) => image.isPrimary) ??
      [...(product.images ?? [])].sort((a, b) => a.sortOrder - b.sortOrder)[0];

    setItems((currentItems) => {
      const existing = currentItems.find((item) => item.key === key);

      if (existing) {
        return currentItems.map((item) =>
          item.key === key
            ? {
                ...item,
                imageUrl: primaryImage?.url ?? item.imageUrl,
                unitPrice,
                quantity: Math.min(item.quantity + quantity, stock),
                selectedCustomOptions: effectiveCustomOptions,
              }
            : item,
        );
      }

      return [
        ...currentItems,
        {
          key,
          productId: product.id,
          slug: product.slug,
          name: product.name,
          categoryName: product.categoryName,
          imageUrl: primaryImage?.url,
          emoji: product.emoji,
          background: product.background,
          unitPrice,
          quantity: Math.min(Math.max(quantity, 1), stock),
          stock,
          selectedVariants,
          selectedCustomOptions: effectiveCustomOptions,
        },
      ];
    });
  }

  function updateQuantity(key: string, quantity: number) {
    setItems((currentItems) =>
      currentItems.map((item) =>
        item.key === key
          ? { ...item, quantity: Math.min(Math.max(quantity, 1), item.stock) }
          : item,
      ),
    );
  }

  function removeItem(key: string) {
    setItems((currentItems) => currentItems.filter((item) => item.key !== key));
  }

  function clearCart() {
    setItems([]);
  }

  const value = useMemo<CartContextValue>(() => {
    const itemCount = items.reduce((sum, item) => sum + item.quantity, 0);
    const subtotal = items.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0);

    return {
      items,
      itemCount,
      subtotal,
      addItem,
      updateQuantity,
      removeItem,
      clearCart,
    };
  }, [items]);

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
}

export function useCart() {
  const context = useContext(CartContext);

  if (!context) {
    throw new Error("useCart phải được sử dụng bên trong CartProvider.");
  }

  return context;
}
