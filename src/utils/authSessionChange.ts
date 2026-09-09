import type { AuthChangeEvent, Session } from "@supabase/supabase-js";

export function getSessionUserId(
  session: Session | null | undefined,
) {
  return session?.user.id ?? "";
}

export function authChangeNeedsDataReload(
  event: AuthChangeEvent,
  previousUserId: string,
  nextSession: Session | null,
) {
  if (
    event === "INITIAL_SESSION" ||
    event === "TOKEN_REFRESHED"
  ) {
    return false;
  }

  const nextUserId = getSessionUserId(nextSession);

  if (event === "SIGNED_IN") {
    return Boolean(nextUserId) && nextUserId !== previousUserId;
  }

  if (event === "SIGNED_OUT") {
    return Boolean(previousUserId);
  }

  return nextUserId !== previousUserId;
}
