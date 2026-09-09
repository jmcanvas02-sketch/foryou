import { HttpError } from "./http";
import {
  supabaseServerFetch,
} from "./supabase-server";
import type { AdsFunctionEnv } from "./supabase-server";

const DEFAULT_STORE_NAME = "InGiDay";
const DEFAULT_TITLE =
  "InGiDay | Sản phẩm in 3D đáng yêu";
const DEFAULT_DESCRIPTION =
  "Khám phá móc khóa, mô hình mini và các sản phẩm in 3D độc đáo từ InGiDay.";
const DEFAULT_FAVICON_URL = "/favicon.svg";

type StoreSettingsMetadataRow = {
  shop_name: string | null;
  footer_text: string | null;
  favicon_url: string | null;
  social_share_image_url: string | null;
  social_share_title: string | null;
  social_share_description: string | null;
  meta_domain_verification_code: string | null;
};

export type SiteMetadata = {
  storeName: string;
  faviconUrl: string;
  socialShareImageUrl: string;
  title: string;
  description: string;
  metaDomainVerificationCode: string | null;
};

function normalizedText(
  value: string | null,
  fallback: string,
  maxLength: number,
) {
  const normalized = value?.trim();

  if (!normalized) {
    return fallback;
  }

  return normalized.slice(0, maxLength);
}

function escapeHtmlText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function escapeHtmlAttribute(value: string) {
  return escapeHtmlText(value)
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function absoluteHttpUrl(
  value: string,
  requestUrl: string,
) {
  try {
    const resolved = new URL(value, requestUrl);

    if (
      resolved.protocol !== "https:" &&
      resolved.protocol !== "http:"
    ) {
      return null;
    }

    return resolved.toString();
  } catch {
    return null;
  }
}

function canonicalRequestUrl(requestUrl: string) {
  const url = new URL(requestUrl);
  url.hash = "";
  url.search = "";
  return url.toString();
}

export async function loadSiteMetadata(
  env: AdsFunctionEnv,
): Promise<SiteMetadata> {
  const response = await supabaseServerFetch(
    env,
    "/rest/v1/store_settings" +
      "?id=eq.1" +
      "&select=" +
      [
        "shop_name",
        "footer_text",
        "favicon_url",
        "social_share_image_url",
        "social_share_title",
        "social_share_description",
        "meta_domain_verification_code",
      ].join(",") +
      "&limit=1",
  );

  if (!response.ok) {
    console.error(
      "site-metadata-read-failed",
      response.status,
    );

    throw new HttpError(
      500,
      "Không thể đọc nhận diện website.",
    );
  }

  const payload = (await response.json()) as unknown;
  const row = Array.isArray(payload)
    ? (payload[0] as
        | StoreSettingsMetadataRow
        | undefined)
    : undefined;

  if (!row) {
    throw new HttpError(
      500,
      "Không tìm thấy cấu hình cửa hàng.",
    );
  }

  return {
    storeName: normalizedText(
      row.shop_name,
      DEFAULT_STORE_NAME,
      120,
    ),
    faviconUrl:
      row.favicon_url?.trim() || DEFAULT_FAVICON_URL,
    socialShareImageUrl:
      row.social_share_image_url?.trim() || "",
    title: normalizedText(
      row.social_share_title,
      DEFAULT_TITLE,
      120,
    ),
    description: normalizedText(
      row.social_share_description,
      row.footer_text?.trim() || DEFAULT_DESCRIPTION,
      200,
    ),
    metaDomainVerificationCode:
      row.meta_domain_verification_code?.trim() || null,
  };
}

export function buildSiteMetadataTags(
  metadata: SiteMetadata,
  requestUrl: string,
) {
  const canonicalUrl = canonicalRequestUrl(requestUrl);
  const faviconUrl =
    absoluteHttpUrl(metadata.faviconUrl, requestUrl) ??
    new URL(DEFAULT_FAVICON_URL, requestUrl).toString();
  const socialImageUrl = metadata.socialShareImageUrl
    ? absoluteHttpUrl(
        metadata.socialShareImageUrl,
        requestUrl,
      )
    : null;

  const title = escapeHtmlAttribute(metadata.title);
  const titleText = escapeHtmlText(metadata.title);
  const description = escapeHtmlAttribute(
    metadata.description,
  );
  const storeName = escapeHtmlAttribute(
    metadata.storeName,
  );
  const safeCanonicalUrl =
    escapeHtmlAttribute(canonicalUrl);
  const safeFaviconUrl =
    escapeHtmlAttribute(faviconUrl);

  const tags = [
    `<title>${titleText}</title>`,
    `<link rel="icon" href="${safeFaviconUrl}" />`,
    `<link rel="apple-touch-icon" href="${safeFaviconUrl}" />`,
    `<meta name="description" content="${description}" />`,
    `<meta property="og:type" content="website" />`,
    `<meta property="og:locale" content="vi_VN" />`,
    `<meta property="og:site_name" content="${storeName}" />`,
    `<meta property="og:title" content="${title}" />`,
    `<meta property="og:description" content="${description}" />`,
    `<meta property="og:url" content="${safeCanonicalUrl}" />`,
    `<meta name="twitter:card" content="${
      socialImageUrl ? "summary_large_image" : "summary"
    }" />`,
    `<meta name="twitter:title" content="${title}" />`,
    `<meta name="twitter:description" content="${description}" />`,
  ];

  if (socialImageUrl) {
    const safeImageUrl =
      escapeHtmlAttribute(socialImageUrl);

    tags.push(
      `<meta property="og:image" content="${safeImageUrl}" />`,
      `<meta property="og:image:width" content="1200" />`,
      `<meta property="og:image:height" content="630" />`,
      `<meta property="og:image:alt" content="${title}" />`,
      `<meta name="twitter:image" content="${safeImageUrl}" />`,
    );
  }

  return tags.join("\n    ");
}
