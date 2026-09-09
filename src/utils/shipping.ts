export const DEFAULT_SHIPPING_FEE = 15000;
export const FREE_SHIPPING_THRESHOLD = 200000;

export function calculateShipping(
  subtotal: number,
  shippingFee = DEFAULT_SHIPPING_FEE,
  freeShippingThreshold = FREE_SHIPPING_THRESHOLD,
): number {
  return subtotal >= freeShippingThreshold ? 0 : shippingFee;
}
