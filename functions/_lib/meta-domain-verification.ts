import { HttpError } from "./http";
import { supabaseServerFetch } from "./supabase-server";
import type { AdsFunctionEnv } from "./supabase-server";

export const META_DOMAIN_VERIFICATION_NAME =
  "facebook-domain-verification";

const MIN_CODE_LENGTH = 8;
const MAX_CODE_LENGTH = 255;
const VALID_CODE_PATTERN = /^[A-Za-z0-9._:-]+$/;

type StoreSettingsRow = {
  meta_domain_verification_code: string | null;
};

function readQuotedAttribute(
  attributes: string,
  attributeName: string,
) {
  const pattern = new RegExp(
    `(?:^|\\s)${attributeName}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`,
    "i",
  );
  const match = attributes.match(pattern);

  return match?.[1] ?? match?.[2] ?? null;
}

function assertValidCode(value: string) {
  const code = value.trim();

  if (
    code.length < MIN_CODE_LENGTH ||
    code.length > MAX_CODE_LENGTH
  ) {
    throw new HttpError(
      400,
      "Mã xác minh tên miền Meta không hợp lệ.",
    );
  }

  if (!VALID_CODE_PATTERN.test(code)) {
    throw new HttpError(
      400,
      "Mã xác minh chỉ được chứa chữ, số, dấu chấm, gạch ngang, gạch dưới hoặc dấu hai chấm.",
    );
  }

  return code;
}

export function parseMetaDomainVerificationInput(
  input: unknown,
) {
  if (typeof input !== "string") {
    throw new HttpError(
      400,
      "Vui lòng nhập thẻ Meta hoặc mã xác minh.",
    );
  }

  const value = input.trim();

  if (!value) {
    throw new HttpError(
      400,
      "Vui lòng nhập thẻ Meta hoặc mã xác minh.",
    );
  }

  if (!value.startsWith("<")) {
    return assertValidCode(value);
  }

  const tagMatch = value.match(
    /^<meta\s+([^<>]*?)\s*\/?>$/i,
  );

  if (!tagMatch) {
    throw new HttpError(
      400,
      "Thẻ Meta xác minh tên miền không đúng định dạng.",
    );
  }

  const attributes = tagMatch[1];
  const name = readQuotedAttribute(attributes, "name");
  const content = readQuotedAttribute(attributes, "content");

  if (
    name?.toLowerCase() !==
    META_DOMAIN_VERIFICATION_NAME
  ) {
    throw new HttpError(
      400,
      'Thẻ Meta phải có name="facebook-domain-verification".',
    );
  }

  if (!content) {
    throw new HttpError(
      400,
      "Thẻ Meta không có mã trong thuộc tính content.",
    );
  }

  return assertValidCode(content);
}

export function buildMetaDomainVerificationTag(
  code: string,
) {
  const normalizedCode = assertValidCode(code);

  return (
    `<meta name="${META_DOMAIN_VERIFICATION_NAME}" ` +
    `content="${normalizedCode}" />`
  );
}

export async function loadMetaDomainVerificationCode(
  env: AdsFunctionEnv,
  userAccessToken?: string,
) {
  const response = await supabaseServerFetch(
    env,
    "/rest/v1/store_settings" +
      "?id=eq.1" +
      "&select=meta_domain_verification_code" +
      "&limit=1",
    {},
    userAccessToken,
  );

  if (!response.ok) {
    console.error(
      "meta-domain-verification-read-failed",
      response.status,
    );

    throw new HttpError(
      500,
      "Không thể đọc cấu hình xác minh tên miền Meta.",
    );
  }

  const payload = (await response.json()) as unknown;
  const row = Array.isArray(payload)
    ? (payload[0] as StoreSettingsRow | undefined)
    : undefined;

  if (!row) {
    throw new HttpError(
      500,
      "Không tìm thấy cấu hình cửa hàng.",
    );
  }

  const storedCode = row.meta_domain_verification_code;

  if (
    storedCode === null ||
    storedCode.trim() === ""
  ) {
    return null;
  }

  return assertValidCode(storedCode);
}

export async function saveMetaDomainVerificationCode(
  env: AdsFunctionEnv,
  userAccessToken: string,
  code: string | null,
) {
  const normalizedCode =
    code === null ? null : assertValidCode(code);

  const response = await supabaseServerFetch(
    env,
    "/rest/v1/store_settings" +
      "?id=eq.1" +
      "&select=meta_domain_verification_code",
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Prefer: "return=representation",
      },
      body: JSON.stringify({
        meta_domain_verification_code: normalizedCode,
      }),
    },
    userAccessToken,
  );

  if (!response.ok) {
    console.error(
      "meta-domain-verification-save-failed",
      response.status,
    );

    if (response.status === 403) {
      throw new HttpError(
        403,
        "Tài khoản không có quyền quản trị.",
      );
    }

    throw new HttpError(
      500,
      "Không thể lưu cấu hình xác minh tên miền Meta.",
    );
  }

  const payload = (await response.json()) as unknown;
  const row = Array.isArray(payload)
    ? (payload[0] as StoreSettingsRow | undefined)
    : undefined;

  if (!row) {
    throw new HttpError(
      500,
      "Không thể cập nhật cấu hình cửa hàng.",
    );
  }

  if (
    row.meta_domain_verification_code === null ||
    row.meta_domain_verification_code.trim() === ""
  ) {
    return null;
  }

  return assertValidCode(
    row.meta_domain_verification_code,
  );
}
