import type { StoreOrder } from "../../types/store";

export type ParsedNormalizedAddress = {
  raw: string;
  addressDetail: string;
  ward: string;
  district: string;
  province: string;
  error?: string;
};

export type ParsedNormalizedAddressList = {
  addresses: ParsedNormalizedAddress[];
  generalError: string;
};

export function formatOriginalOrderAddress(order: StoreOrder) {
  return [
    order.customer.addressDetail,
    order.customer.ward,
    order.customer.district,
    order.customer.province,
  ]
    .map((part) => part.trim())
    .filter(Boolean)
    .join(", ");
}

export function formatAddressesForCopy(orders: StoreOrder[]) {
  return orders
    .map(
      (order) =>
        formatOriginalOrderAddress(order) || "(Chưa có địa chỉ)",
    )
    .join("\n");
}

function parseAddress(raw: string): ParsedNormalizedAddress {
  const parts = raw
    .split(/[\n,]+/)
    .map((part) => part.trim())
    .filter(Boolean);

  if (parts.length < 4) {
    return {
      raw,
      addressDetail: "",
      ward: "",
      district: "",
      province: "",
      error:
        "Cần tối thiểu 4 phần, theo thứ tự: địa chỉ chi tiết, xã/phường, quận/huyện, tỉnh/thành phố.",
    };
  }

  const province = parts.at(-1) ?? "";
  const district = parts.at(-2) ?? "";
  const ward = parts.at(-3) ?? "";
  const addressDetail = parts.slice(0, -3).join(", ");

  if (!addressDetail || !ward || !district || !province) {
    return {
      raw,
      addressDetail,
      ward,
      district,
      province,
      error: "Địa chỉ còn thiếu thành phần.",
    };
  }

  return {
    raw,
    addressDetail,
    ward,
    district,
    province,
  };
}

export function parseNormalizedAddressText(
  value: string,
): ParsedNormalizedAddressList {
  const normalized = value.replace(/\r\n?/g, "\n");
  const lines = normalized.split("\n");
  const blocks: string[] = [];
  let currentLines: string[] = [];
  let textBeforeFirstMarker = false;
  let hasMarker = false;

  for (const sourceLine of lines) {
    const line = sourceLine.trim();
    if (!line) continue;

    if (line.startsWith("*")) {
      if (hasMarker) {
        blocks.push(currentLines.join("\n"));
      }

      hasMarker = true;
      currentLines = [line.slice(1).trim()].filter(Boolean);
      continue;
    }

    if (!hasMarker) {
      textBeforeFirstMarker = true;
      continue;
    }

    currentLines.push(line);
  }

  if (hasMarker) {
    blocks.push(currentLines.join("\n"));
  }

  if (textBeforeFirstMarker) {
    return {
      addresses: blocks.map(parseAddress),
      generalError: "Mỗi địa chỉ phải bắt đầu bằng dấu *.",
    };
  }

  if (!value.trim()) {
    return {
      addresses: [],
      generalError: "",
    };
  }

  if (blocks.length === 0) {
    return {
      addresses: [],
      generalError: "Không tìm thấy địa chỉ nào bắt đầu bằng dấu *.",
    };
  }

  return {
    addresses: blocks.map(parseAddress),
    generalError: "",
  };
}

export function normalizedAddressStatusLabel(order: StoreOrder) {
  if (order.normalizedAddressStatus === "ready") return "Đã chuẩn hóa";
  if (order.normalizedAddressStatus === "stale") return "Cần chuẩn hóa lại";
  return "Chưa chuẩn hóa";
}

export function normalizedAddressStatusClass(order: StoreOrder) {
  if (order.normalizedAddressStatus === "ready") {
    return "bg-[#dcf8eb] text-[#14633d]";
  }

  if (order.normalizedAddressStatus === "stale") {
    return "bg-[#fff1b8] text-[#7a5200]";
  }

  return "bg-[#fff0eb] text-[#a43c12]";
}
