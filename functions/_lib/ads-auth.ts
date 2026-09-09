import {
  HttpError,
} from "./http";
import {
  supabaseServerFetch,
} from "./supabase-server";
import type {
  AdsFunctionEnv,
} from "./supabase-server";

type VerifiedUser = {
  id: string;
  email?: string;
};

async function verifyUser(
  accessToken: string,
  env: AdsFunctionEnv,
): Promise<VerifiedUser> {
  const response =
    await supabaseServerFetch(
      env,
      "/auth/v1/user",
      {},
      accessToken,
    );

  if (!response.ok) {
    throw new HttpError(
      401,
      "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.",
    );
  }

  const payload =
    (await response.json()) as unknown;

  if (
    !payload ||
    typeof payload !== "object" ||
    !("id" in payload) ||
    typeof payload.id !== "string"
  ) {
    throw new HttpError(
      401,
      "Phiên đăng nhập quản trị không hợp lệ.",
    );
  }

  return payload as VerifiedUser;
}

async function verifyAdminPermission(
  accessToken: string,
  env: AdsFunctionEnv,
) {
  const response =
    await supabaseServerFetch(
      env,
      "/rest/v1/rpc/admin_can_manage_ads",
      {
        method: "POST",
        headers: {
          "Content-Type":
            "application/json",
        },
        body: "{}",
      },
      accessToken,
    );

  if (!response.ok) {
    console.error(
      "admin-permission-check-failed",
      response.status,
    );

    throw new HttpError(
      500,
      "Không thể kiểm tra quyền quản trị.",
    );
  }

  const allowed =
    (await response.json()) as unknown;

  if (allowed !== true) {
    throw new HttpError(
      403,
      "Tài khoản không có quyền quản trị.",
    );
  }
}

export async function requireAdmin(
  request: Request,
  env: AdsFunctionEnv,
): Promise<{
  user: VerifiedUser;
  accessToken: string;
}> {
  const authorization =
    request.headers.get("Authorization") ?? "";
  const match = authorization.match(
    /^Bearer\s+(.+)$/i,
  );
  const accessToken = match?.[1]?.trim();

  if (!accessToken) {
    throw new HttpError(
      401,
      "Phiên đăng nhập quản trị không hợp lệ.",
    );
  }

  const user =
    await verifyUser(
      accessToken,
      env,
    );

  await verifyAdminPermission(
    accessToken,
    env,
  );

  return {
    user,
    accessToken,
  };
}
