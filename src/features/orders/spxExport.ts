import type { StoreOrder } from "../../types/store";

export const SPX_HEADERS = [
  "*Mã đơn hàng",
  "*Tên người nhận",
  "*Số điện thoại",
  "*Tỉnh/Thành Phố",
  "*Quận/Huyện",
  "*Xã/Phường",
  "*Địa chỉ chi tiết",
  "Lưu ý về địa chỉ",
  "Mã bưu chính",
  "*Tên sản phẩm",
  "Số lượng (Thông tin bắt buộc khi chọn Giao hàng một phần & Thu COD)",
  "Giá tiền (Thông tin bắt buộc khi chọn Giao hàng một phần & Thu COD)",
  "*Tổng cân nặng bưu gửi (KG)",
  "Chiều dài (CM)",
  "Chiều rộng (CM)",
  "Chiều cao (CM)",
  "Mã khách hàng",
  "*Giá trị đơn hàng",
  "*Giao hàng một phần (Y/N)",
  "*Cho phép thử hàng (Y/N)",
  "*Cho xem hàng, không cho thử (Y/N)",
  "Thu phí từ chối nhận hàng (Y/N)",
  "Phí từ chối nhận hàng cần thu",
  "*Thu COD (Y/N)",
  "Số tiền COD",
  "bưu gửi giá trị cao (Y/N)",
  "*Hình thức thanh Toán",
  "Lưu ý giao hàng",
] as const;

export type SpxAddress = {
  province: string;
  district: string;
  ward: string;
  addressDetail: string;
  usesNormalizedAddress: boolean;
};

export type SpxExportResult = {
  exportedCount: number;
  skippedShippingCount: number;
  skippedCompletedCount: number;
};

type SpxExportOptions = {
  beforeDownload?: (orders: StoreOrder[]) => Promise<void>;
};

export function getSpxAddress(order: StoreOrder): SpxAddress {
  if (
    order.normalizedAddressStatus === "ready" &&
    order.normalizedAddress
  ) {
    return {
      province: order.normalizedAddress.province,
      district: order.normalizedAddress.district,
      ward: order.normalizedAddress.ward,
      addressDetail: order.normalizedAddress.addressDetail,
      usesNormalizedAddress: true,
    };
  }

  return {
    province: order.customer.province,
    district: order.customer.district,
    ward: order.customer.ward,
    addressDetail: order.customer.addressDetail,
    usesNormalizedAddress: false,
  };
}

export function getMissingSpxAddressFields(order: StoreOrder) {
  const address = getSpxAddress(order);
  const missing: string[] = [];

  if (!address.province.trim()) missing.push("Tỉnh/Thành phố");
  if (!address.district.trim()) missing.push("Quận/Huyện");
  if (!address.ward.trim()) missing.push("Xã/Phường");
  if (!address.addressDetail.trim()) missing.push("Địa chỉ chi tiết");

  return missing;
}

function itemDescription(order: StoreOrder) {
  return order.items
    .map((item) => {
      const variants = item.selectedVariants
        .map((variant) => `${variant.groupName}: ${variant.optionLabel}`)
        .join(" — ");
      const customText = item.selectedCustomOptions?.text
        ? `${item.selectedCustomOptions.text.label}: ${item.selectedCustomOptions.text.value}`
        : "";
      const customColor = item.selectedCustomOptions?.color
        ? `Màu chữ: ${item.selectedCustomOptions.color.name}`
        : "";
      const details = [variants, customText, customColor].filter(Boolean);

      return `${item.quantity} ${item.name}${
        details.length > 0 ? ` — ${details.join(" — ")}` : ""
      }`;
    })
    .join("; ");
}

function downloadFile(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}

function exportFileName() {
  const now = new Date();
  const date = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, "0"),
    String(now.getDate()).padStart(2, "0"),
  ].join("-");
  const time = [
    String(now.getHours()).padStart(2, "0"),
    String(now.getMinutes()).padStart(2, "0"),
  ].join("");

  return `SPX_Don_hang_${date}_${time}.xlsx`;
}

export async function exportOrdersToSpx(
  orders: StoreOrder[],
  options: SpxExportOptions = {},
): Promise<SpxExportResult> {
  if (orders.length === 0) {
    throw new Error("Chưa chọn đơn hàng để xuất SPX.");
  }

  const exportableOrders = orders.filter(
    (order) =>
      order.status !== "shipping" && order.status !== "completed",
  );
  const skippedShippingCount = orders.filter(
    (order) => order.status === "shipping",
  ).length;
  const skippedCompletedCount = orders.filter(
    (order) => order.status === "completed",
  ).length;

  if (exportableOrders.length === 0) {
    throw new Error(
      "Không thể xuất SPX vì toàn bộ đơn đã chọn đang ở trạng thái Đang giao hoặc Thành công.",
    );
  }

  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();
  workbook.creator = "InGiDay";
  workbook.created = new Date();

  const worksheet = workbook.addWorksheet("SPX_Don_hang", {
    views: [{ state: "frozen", ySplit: 1 }],
  });

  worksheet.addRow([...SPX_HEADERS]);

  exportableOrders.forEach((order, index) => {
    const address = getSpxAddress(order);
    const totalQuantity = order.items.reduce(
      (sum, item) => sum + item.quantity,
      0,
    );

    worksheet.addRow([
      index + 1,
      order.customer.fullName,
      order.customer.phone,
      address.province,
      address.district,
      address.ward,
      address.addressDetail,
      null,
      null,
      itemDescription(order),
      String(totalQuantity),
      order.subtotal,
      "1",
      null,
      null,
      null,
      null,
      order.total,
      "N",
      "N",
      "Y",
      "Y",
      30_000,
      "Y",
      order.total,
      null,
      "Người gửi trả",
      order.customer.note || null,
    ]);
  });

  const header = worksheet.getRow(1);
  header.height = 34;
  header.font = { bold: true };
  header.alignment = {
    vertical: "middle",
    horizontal: "center",
    wrapText: true,
  };
  header.eachCell((cell) => {
    cell.fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FFEAF2F8" },
    };
    cell.border = {
      top: { style: "thin", color: { argb: "FFB8C4CE" } },
      left: { style: "thin", color: { argb: "FFB8C4CE" } },
      bottom: { style: "thin", color: { argb: "FFB8C4CE" } },
      right: { style: "thin", color: { argb: "FFB8C4CE" } },
    };
  });

  worksheet.columns = [
    { width: 14 },
    { width: 24 },
    { width: 16 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 42 },
    { width: 24 },
    { width: 15 },
    { width: 56 },
    { width: 20 },
    { width: 18 },
    { width: 18 },
    { width: 15 },
    { width: 15 },
    { width: 15 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 18 },
    { width: 22 },
    { width: 22 },
    { width: 22 },
    { width: 16 },
    { width: 18 },
    { width: 20 },
    { width: 22 },
    { width: 34 },
  ];

  worksheet.autoFilter = {
    from: "A1",
    to: "AB1",
  };

  for (let rowNumber = 2; rowNumber <= worksheet.rowCount; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    row.alignment = { vertical: "top", wrapText: true };
    row.getCell(3).numFmt = "@";
    row.getCell(11).numFmt = "@";
    row.getCell(13).numFmt = "@";

    for (const column of [12, 18, 23, 25]) {
      row.getCell(column).numFmt = "#,##0";
    }
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer as BlobPart], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });

  if (options.beforeDownload) {
    await options.beforeDownload(exportableOrders);
  }

  downloadFile(blob, exportFileName());

  return {
    exportedCount: exportableOrders.length,
    skippedShippingCount,
    skippedCompletedCount,
  };
}
