export const storeSocialPlatforms = [
  {
    key: "facebook",
    label: "Facebook",
    placeholder: "facebook.com/ten-trang",
  },
  {
    key: "tiktok",
    label: "TikTok",
    placeholder: "tiktok.com/@ten-tai-khoan",
  },
  {
    key: "instagram",
    label: "Instagram",
    placeholder: "instagram.com/ten-tai-khoan",
  },
  {
    key: "youtube",
    label: "YouTube",
    placeholder: "youtube.com/@ten-kenh",
  },
  {
    key: "zalo",
    label: "Zalo",
    placeholder: "zalo.me/so-dien-thoai",
  },
] as const;

export type StoreSocialPlatformKey =
  (typeof storeSocialPlatforms)[number]["key"];

export type StoreSocialLinks = Record<
  StoreSocialPlatformKey,
  string
>;

export function createEmptySocialLinks(): StoreSocialLinks {
  return {
    facebook: "",
    tiktok: "",
    instagram: "",
    youtube: "",
    zalo: "",
  };
}

export function normalizeExternalUrl(value: string) {
  const trimmed = value.trim();

  if (!trimmed) {
    return "";
  }

  if (/^(?:javascript|data|file|vbscript):/i.test(trimmed)) {
    return "";
  }

  const candidate = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed)
    ? trimmed
    : `https://${trimmed.replace(/^\/+/, "")}`;

  try {
    const url = new URL(candidate);

    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return "";
    }

    return url.toString();
  } catch {
    return "";
  }
}

export function normalizeSocialLinks(
  value: Partial<StoreSocialLinks> | null | undefined,
): StoreSocialLinks {
  const empty = createEmptySocialLinks();

  return storeSocialPlatforms.reduce<StoreSocialLinks>(
    (result, platform) => ({
      ...result,
      [platform.key]: normalizeExternalUrl(
        value?.[platform.key] ?? "",
      ),
    }),
    empty,
  );
}

export function configuredSocialLinks(
  value: Partial<StoreSocialLinks> | null | undefined,
) {
  const normalized = normalizeSocialLinks(value);

  return storeSocialPlatforms.flatMap((platform) => {
    const url = normalized[platform.key];

    return url
      ? [
          {
            ...platform,
            url,
          },
        ]
      : [];
  });
}
