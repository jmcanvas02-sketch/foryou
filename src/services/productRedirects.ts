import { supabase } from "../lib/supabase";

export async function resolveProductSlugRedirect(
  oldSlug: string,
) {
  const normalizedSlug = oldSlug
    .trim()
    .toLowerCase();

  if (!normalizedSlug) {
    return null;
  }

  const { data, error } = await supabase.rpc(
    "resolve_product_slug_redirect",
    {
      p_old_slug: normalizedSlug,
    },
  );

  if (error) {
    throw new Error(error.message);
  }

  return typeof data === "string" && data
    ? data
    : null;
}