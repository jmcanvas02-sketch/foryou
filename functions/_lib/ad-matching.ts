const encoder = new TextEncoder();

function hex(bytes: Uint8Array) {
  return Array.from(
    bytes,
    (value) => value.toString(16).padStart(2, "0"),
  ).join("");
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    encoder.encode(value),
  );

  return hex(new Uint8Array(digest));
}

export function normalizeText(value: string) {
  return value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "")
    .trim();
}

export function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.startsWith("84") && digits.length >= 11) {
    return digits;
  }

  if (digits.startsWith("0") && digits.length === 10) {
    return `84${digits.slice(1)}`;
  }

  return digits;
}

export function splitFullName(value: string) {
  const parts = value
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  if (parts.length === 0) {
    return {
      firstName: "",
      lastName: "",
    };
  }

  if (parts.length === 1) {
    return {
      firstName: parts[0],
      lastName: "",
    };
  }

  return {
    firstName: parts.at(-1) ?? "",
    lastName: parts.slice(0, -1).join(" "),
  };
}

export function normalizeFbc(
  fbc: string | null,
  fbclid: string | null,
) {
  const normalizedFbc = fbc?.trim() ?? "";

  if (
    /^fb\.1\.\d{13}\.[A-Za-z0-9._~-]+$/.test(
      normalizedFbc,
    )
  ) {
    return normalizedFbc;
  }

  const normalizedClickId =
    fbclid?.trim() ?? "";

  if (
    !normalizedClickId ||
    !/^[A-Za-z0-9._~-]+$/.test(normalizedClickId)
  ) {
    return undefined;
  }

  return `fb.1.${Date.now()}.${normalizedClickId}`;
}

export type MatchingInput = {
  anonymousId?: string;
  externalId?: string;
  customerName?: string;
  customerPhone?: string;
  province?: string;
  country?: string;
  clientIp?: string;
  userAgent?: string;
  fbp?: string | null;
  fbc?: string | null;
  fbclid?: string | null;
  ttp?: string | null;
  ttclid?: string | null;
};

export async function buildMatchingData(
  input: MatchingInput,
) {
  const fullName = splitFullName(
    input.customerName ?? "",
  );
  const phone = normalizePhone(
    input.customerPhone ?? "",
  );
  const firstName = normalizeText(
    fullName.firstName,
  );
  const lastName = normalizeText(
    fullName.lastName,
  );
  const city = normalizeText(
    input.province ?? "",
  );
  const country = normalizeText(
    input.country ?? "vn",
  );
  const externalId = normalizeText(
    input.externalId ?? input.anonymousId ?? "",
  );
  const fbc = normalizeFbc(
    input.fbc ?? null,
    input.fbclid ?? null,
  );

  const [
    hashedPhone,
    hashedFirstName,
    hashedLastName,
    hashedCity,
    hashedCountry,
    hashedExternalId,
  ] = await Promise.all([
    phone ? sha256(phone) : undefined,
    firstName ? sha256(firstName) : undefined,
    lastName ? sha256(lastName) : undefined,
    city ? sha256(city) : undefined,
    country ? sha256(country) : undefined,
    externalId ? sha256(externalId) : undefined,
  ]);

  return {
    meta: {
      ...(hashedPhone
        ? { ph: [hashedPhone] }
        : {}),
      ...(hashedFirstName
        ? { fn: [hashedFirstName] }
        : {}),
      ...(hashedLastName
        ? { ln: [hashedLastName] }
        : {}),
      ...(hashedCity
        ? { ct: [hashedCity] }
        : {}),
      ...(hashedCountry
        ? { country: [hashedCountry] }
        : {}),
      ...(hashedExternalId
        ? { external_id: [hashedExternalId] }
        : {}),
      ...(input.clientIp
        ? { client_ip_address: input.clientIp }
        : {}),
      ...(input.userAgent
        ? { client_user_agent: input.userAgent }
        : {}),
      ...(input.fbp?.trim()
        ? { fbp: input.fbp.trim() }
        : {}),
      ...(fbc ? { fbc } : {}),
    },
    tiktok: {
      ...(hashedPhone
        ? { phone: hashedPhone }
        : {}),
      ...(hashedExternalId
        ? { external_id: hashedExternalId }
        : {}),
      ...(input.clientIp
        ? { ip: input.clientIp }
        : {}),
      ...(input.userAgent
        ? { user_agent: input.userAgent }
        : {}),
      ...(input.ttp?.trim()
        ? { ttp: input.ttp.trim() }
        : {}),
      ...(input.ttclid?.trim()
        ? { ttclid: input.ttclid.trim() }
        : {}),
    },
  };
}
