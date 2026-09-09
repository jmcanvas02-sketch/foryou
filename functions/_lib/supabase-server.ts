import {
  HttpError,
} from "./http";

export type AdsFunctionEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVER_KEY?: string;
  ADS_TOKEN_ENCRYPTION_KEY?: string;
  ADS_SERVER_DRY_RUN?: string;
};

type SupabaseServerConfig = {
  url: string;
  key: string;
};

function requiredBinding(
  value: string | undefined,
  name: string,
) {
  const normalized = value?.trim();

  if (!normalized) {
    throw new HttpError(
      500,
      `Thiếu cấu hình máy chủ ${name}.`,
    );
  }

  return normalized;
}

export function requireEncryptionKey(
  env: AdsFunctionEnv,
) {
  return requiredBinding(
    env.ADS_TOKEN_ENCRYPTION_KEY,
    "ADS_TOKEN_ENCRYPTION_KEY",
  );
}

export function getSupabaseServerConfig(
  env: AdsFunctionEnv,
): SupabaseServerConfig {
  return {
    url: requiredBinding(
      env.SUPABASE_URL,
      "SUPABASE_URL",
    ).replace(/\/+$/, ""),
    key: requiredBinding(
      env.SUPABASE_SERVER_KEY,
      "SUPABASE_SERVER_KEY",
    ),
  };
}

export async function supabaseServerFetch(
  env: AdsFunctionEnv,
  path: string,
  init: RequestInit = {},
  userAccessToken?: string,
) {
  const config =
    getSupabaseServerConfig(env);
  const headers =
    new Headers(init.headers);

  headers.set("apikey", config.key);
  headers.set("Accept", "application/json");

  if (userAccessToken) {
    headers.set(
      "Authorization",
      `Bearer ${userAccessToken}`,
    );
  }

  return fetch(
    `${config.url}${path}`,
    {
      ...init,
      headers,
    },
  );
}
