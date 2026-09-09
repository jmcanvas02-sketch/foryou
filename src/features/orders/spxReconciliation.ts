import type { OrderStatus } from "../../types/store";

export type SpxReconciliationOrder = {
  id: string;
  code: string;
  customerName: string;
  phone: string;
  status: OrderStatus;
  total: number;
  createdAt: string;
};

export type SpxReconciliationRecord = {
  key: string;
  sourceRow: number;
  rawPhone: string;
  phone: string;
  trackingNo: string;
  receiverName: string;
  statusText: string;
  targetStatus: OrderStatus | null;
  createdAtText: string;
  createdAtSort: number;
  duplicateSourceCount: number;
};

export type SpxReconciliationParseResult = {
  worksheetName: string;
  totalDataRows: number;
  ignoredOlderRows: number;
  records: SpxReconciliationRecord[];
};

type HeaderColumns = {
  rowNumber: number;
  phone: number;
  status: number;
  tracking: number;
  receiverName: number;
  createdAt: number;
};

function normalizeText(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function normalizeSpxPhone(value: string) {
  let digits = value.replace(/\D/g, "");

  if (digits.startsWith("0084")) {
    digits = digits.slice(2);
  }

  if (digits.startsWith("84") && digits.length === 11) {
    digits = `0${digits.slice(2)}`;
  } else if (digits.length === 9 && /^[35789]/.test(digits)) {
    digits = `0${digits}`;
  }

  return digits;
}

export function isValidVietnamPhone(value: string) {
  return /^0[35789]\d{8}$/.test(value);
}

export function mapSpxStatus(value: string): OrderStatus | null {
  const normalized = normalizeText(value);

  if (
    [
      "da giao hang",
      "giao thanh cong",
      "giao hang thanh cong",
      "phat thanh cong",
    ].some((item) => normalized.includes(item))
  ) {
    return "completed";
  }

  if (
    [
      "da huy",
      "huy don",
      "hoan hang",
      "da hoan hang",
      "dang hoan hang",
      "tra hang",
      "giao that bai",
    ].some((item) => normalized.includes(item))
  ) {
    return "cancelled";
  }

  if (
    [
      "dang van chuyen",
      "dang giao hang",
      "cho giao lai",
      "dang giao",
      "da lay hang",
      "da nhan hang tai kho",
    ].some((item) => normalized.includes(item))
  ) {
    return "shipping";
  }

  return null;
}

function cellText(cell: { text: string; value: unknown }) {
  const rendered = cell.text.trim();
  if (rendered) return rendered;

  if (cell.value instanceof Date) {
    return cell.value.toISOString();
  }

  if (
    typeof cell.value === "string" ||
    typeof cell.value === "number" ||
    typeof cell.value === "boolean"
  ) {
    return String(cell.value).trim();
  }

  return "";
}

function findColumn(headers: Map<string, number>, aliases: string[]) {
  for (const alias of aliases) {
    const column = headers.get(normalizeText(alias));
    if (column) return column;
  }

  return 0;
}

function findHeaderColumns(worksheet: {
  rowCount: number;
  columnCount: number;
  getRow: (rowNumber: number) => {
    getCell: (columnNumber: number) => { text: string; value: unknown };
  };
}): HeaderColumns | null {
  let matched: HeaderColumns | null = null;
  const lastHeaderRow = Math.min(20, worksheet.rowCount);

  for (let rowNumber = 1; rowNumber <= lastHeaderRow; rowNumber += 1) {
    const row = worksheet.getRow(rowNumber);
    const headers = new Map<string, number>();

    for (
      let columnNumber = 1;
      columnNumber <= worksheet.columnCount;
      columnNumber += 1
    ) {
      const value = normalizeText(cellText(row.getCell(columnNumber)));
      if (value) headers.set(value, columnNumber);
    }

    const phone = findColumn(headers, [
      "Số điện thoại người nhận",
      "Receiver Phone Number",
    ]);
    const status = findColumn(headers, [
      "Trạng thái hiện tại",
      "Tracking Status",
    ]);

    if (!phone || !status) continue;

    matched = {
      rowNumber,
      phone,
      status,
      tracking: findColumn(headers, ["Mã vận đơn", "Tracking No."]),
      receiverName: findColumn(headers, [
        "Tên người nhận",
        "Receiver Name",
      ]),
      createdAt: findColumn(headers, [
        "Thời gian tạo đơn",
        "Create Time",
      ]),
    };
  }

  return matched;
}

function parseDateSort(value: unknown, text: string) {
  if (value instanceof Date) return value.getTime();

  const normalized = text.trim();
  const isoMatch = normalized.match(
    /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );

  if (isoMatch) {
    const [, year, month, day, hour = "0", minute = "0", second = "0"] =
      isoMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ).getTime();
  }

  const vietnameseMatch = normalized.match(
    /^(\d{1,2})\/(\d{1,2})\/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/,
  );

  if (vietnameseMatch) {
    const [, day, month, year, hour = "0", minute = "0", second = "0"] =
      vietnameseMatch;
    return new Date(
      Number(year),
      Number(month) - 1,
      Number(day),
      Number(hour),
      Number(minute),
      Number(second),
    ).getTime();
  }

  const parsed = Date.parse(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function chooseNewestRecord(
  current: SpxReconciliationRecord,
  candidate: SpxReconciliationRecord,
) {
  if (candidate.createdAtSort > current.createdAtSort) return candidate;
  if (candidate.createdAtSort < current.createdAtSort) return current;

  return candidate.sourceRow > current.sourceRow ? candidate : current;
}

export async function parseSpxReconciliationFile(
  file: File,
): Promise<SpxReconciliationParseResult> {
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    throw new Error("Vui lòng chọn đúng file XLSX tải từ SPX.");
  }

  if (file.size > 15 * 1024 * 1024) {
    throw new Error("File XLSX vượt quá giới hạn 15 MB.");
  }

  const { Workbook } = await import("exceljs");
  const workbook = new Workbook();

  try {
    await workbook.xlsx.load((await file.arrayBuffer()) as never);
  } catch {
    throw new Error("Không thể đọc file XLSX. Hãy tải lại báo cáo từ SPX.");
  }

  const worksheet = workbook.worksheets[0];
  if (!worksheet) {
    throw new Error("File XLSX không có trang dữ liệu.");
  }

  const columns = findHeaderColumns(worksheet);
  if (!columns) {
    throw new Error(
      "Không tìm thấy cột Số điện thoại người nhận và Trạng thái hiện tại.",
    );
  }

  const parsedRecords: SpxReconciliationRecord[] = [];
  let totalDataRows = 0;

  for (
    let rowNumber = columns.rowNumber + 1;
    rowNumber <= worksheet.rowCount;
    rowNumber += 1
  ) {
    const row = worksheet.getRow(rowNumber);
    const rawPhone = cellText(row.getCell(columns.phone));
    const statusText = cellText(row.getCell(columns.status));

    if (!rawPhone && !statusText) continue;
    totalDataRows += 1;

    const phone = normalizeSpxPhone(rawPhone);
    const createdCell = columns.createdAt
      ? row.getCell(columns.createdAt)
      : null;
    const createdAtText = createdCell ? cellText(createdCell) : "";

    parsedRecords.push({
      key: `${phone || "invalid"}-${rowNumber}`,
      sourceRow: rowNumber,
      rawPhone,
      phone,
      trackingNo: columns.tracking
        ? cellText(row.getCell(columns.tracking))
        : "",
      receiverName: columns.receiverName
        ? cellText(row.getCell(columns.receiverName))
        : "",
      statusText,
      targetStatus: mapSpxStatus(statusText),
      createdAtText,
      createdAtSort: createdCell
        ? parseDateSort(createdCell.value, createdAtText)
        : 0,
      duplicateSourceCount: 0,
    });
  }

  if (parsedRecords.length === 0) {
    throw new Error("File XLSX không có dòng vận đơn để so khớp.");
  }

  const recordsByPhone = new Map<string, SpxReconciliationRecord[]>();
  const invalidRecords: SpxReconciliationRecord[] = [];

  for (const record of parsedRecords) {
    if (!isValidVietnamPhone(record.phone)) {
      invalidRecords.push(record);
      continue;
    }

    const current = recordsByPhone.get(record.phone) ?? [];
    current.push(record);
    recordsByPhone.set(record.phone, current);
  }

  let ignoredOlderRows = 0;
  const selectedRecords: SpxReconciliationRecord[] = [...invalidRecords];

  for (const records of recordsByPhone.values()) {
    const newest = records.reduce(chooseNewestRecord);
    const duplicateSourceCount = records.length - 1;
    ignoredOlderRows += duplicateSourceCount;
    selectedRecords.push({
      ...newest,
      key: newest.phone,
      duplicateSourceCount,
    });
  }

  selectedRecords.sort((left, right) => left.sourceRow - right.sourceRow);

  return {
    worksheetName: worksheet.name,
    totalDataRows,
    ignoredOlderRows,
    records: selectedRecords,
  };
}
