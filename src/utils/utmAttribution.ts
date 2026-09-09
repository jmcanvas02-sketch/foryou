import type { UtmAttribution } from "../types/cart";

const STORAGE_KEY = "ingiday-utm-attribution-v1";
const MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;
const MAX_VALUE_LENGTH = 200;

type UtmField = "source" | "medium" | "campaign" | "content";
type StorageName = "localStorage" | "sessionStorage";

const URL_PARAMETER_FIELDS: ReadonlyArray<
  readonly [queryName: string, fieldName: UtmField]
> = [
  ["utm_source", "source"],
  ["utm_medium", "medium"],
  ["utm_campaign", "campaign"],
  ["utm_content", "content"],
];

const ATTRIBUTION_FIELDS: UtmField[] = [
  "source",
  "medium",
  "campaign",
  "content",
];

function cleanValue(value: unknown) {
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().slice(0, MAX_VALUE_LENGTH);
  return normalized || undefined;
}

function hasAttribution(attribution: UtmAttribution) {
  return ATTRIBUTION_FIELDS.some((field) => Boolean(attribution[field]));
}

function removeStoredAttribution(storageName: StorageName) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window[storageName].removeItem(STORAGE_KEY);
  } catch {
    // Storage may be unavailable in restricted browser modes.
  }
}

function readStoredAttributionFrom(storageName: StorageName) {
  if (typeof window === "undefined") {
    return undefined;
  }

  try {
    const raw = window[storageName].getItem(STORAGE_KEY);

    if (!raw) {
      return undefined;
    }

    const parsed = normalizeUtmAttribution(JSON.parse(raw));

    if (!parsed) {
      removeStoredAttribution(storageName);
      return undefined;
    }

    if (parsed.capturedAt) {
      const capturedAt = new Date(parsed.capturedAt).getTime();

      if (
        !Number.isFinite(capturedAt) ||
        Date.now() - capturedAt > MAX_AGE_MS
      ) {
        removeStoredAttribution(storageName);
        return undefined;
      }
    }

    return parsed;
  } catch {
    removeStoredAttribution(storageName);
    return undefined;
  }
}

function readStoredUtmAttribution() {
  return (
    readStoredAttributionFrom("localStorage") ??
    readStoredAttributionFrom("sessionStorage")
  );
}

function writeStoredUtmAttribution(attribution: UtmAttribution) {
  if (typeof window === "undefined") {
    return;
  }

  const serialized = JSON.stringify(attribution);

  for (const storageName of ["localStorage", "sessionStorage"] as const) {
    try {
      window[storageName].setItem(STORAGE_KEY, serialized);
    } catch {
      // Keep trying the other storage. The current-page value is still returned.
    }
  }
}

export function normalizeUtmAttribution(
  value: unknown,
): UtmAttribution | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  const source = value as Record<string, unknown>;
  const normalizedSource = cleanValue(source.source);
  const normalized: UtmAttribution = {
    source:
      normalizedSource?.toLowerCase() === "direct"
        ? undefined
        : normalizedSource,
    medium: cleanValue(source.medium),
    campaign: cleanValue(source.campaign),
    content: cleanValue(source.content),
    capturedAt: cleanValue(source.capturedAt),
  };

  return hasAttribution(normalized) ? normalized : undefined;
}

export function captureUtmAttribution(search: string) {
  const params = new URLSearchParams(search);
  const captured: UtmAttribution = {};

  for (const [queryName, fieldName] of URL_PARAMETER_FIELDS) {
    const value = cleanValue(params.get(queryName));

    if (value) {
      captured[fieldName] = value;
    }
  }

  if (!hasAttribution(captured)) {
    return readStoredUtmAttribution();
  }

  captured.capturedAt = new Date().toISOString();
  writeStoredUtmAttribution(captured);

  return captured;
}

export function getCurrentUtmAttribution():
  | UtmAttribution
  | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }

  return captureUtmAttribution(window.location.search);
}

export function getUtmSourceLabel(
  attribution?: UtmAttribution,
) {
  const normalized = normalizeUtmAttribution(attribution);
  const source = normalized?.source;

  if (!source) {
    return normalized ? "Kh\u00f4ng x\u00e1c \u0111\u1ecbnh" : "Kh\u00f4ng c\u00f3 UTM";
  }

  const lowerSource = source.toLowerCase();

  if (["facebook", "fb", "meta"].includes(lowerSource)) {
    return "Meta / Facebook";
  }

  if (["instagram", "ig"].includes(lowerSource)) {
    return "Instagram";
  }

  if (lowerSource === "tiktok") {
    return "TikTok";
  }

  if (lowerSource === "google") {
    return "Google";
  }

  if (lowerSource === "zalo") {
    return "Zalo";
  }

  return source;
}

export function getUtmSecondaryLabel(
  attribution?: UtmAttribution,
) {
  const normalized = normalizeUtmAttribution(attribution);

  if (!normalized) {
    return "Kh\u00f4ng c\u00f3 UTM";
  }

  return (
    normalized.campaign ||
    normalized.content ||
    normalized.medium ||
    "C\u00f3 UTM"
  );
}

export function getUtmAttributionTitle(
  attribution?: UtmAttribution,
) {
  const normalized = normalizeUtmAttribution(attribution);
  const missingValue = "\u2014";

  return [
    `utm_source: ${normalized?.source ?? missingValue}`,
    `utm_medium: ${normalized?.medium ?? missingValue}`,
    `utm_campaign: ${normalized?.campaign ?? missingValue}`,
    `utm_content: ${normalized?.content ?? missingValue}`,
  ].join("\n");
}