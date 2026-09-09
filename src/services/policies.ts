import { supabase } from "../lib/supabase";
import type {
  SitePolicy,
  SitePolicyInput,
} from "../types/policy";

const PUBLIC_CACHE_TTL_MS = 5 * 60 * 1000;

type PolicyRow = {
  slug: string;
  title: string;
  content: string;
  seo_title: string;
  seo_description: string;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type CacheEntry = {
  expiresAt: number;
  value: SitePolicy | null;
};

const publicPolicyCache = new Map<
  string,
  CacheEntry
>();

function mapPolicy(row: PolicyRow): SitePolicy {
  return {
    slug: row.slug,
    title: row.title,
    content: row.content,
    seoTitle: row.seo_title,
    seoDescription: row.seo_description,
    active: row.active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

export async function fetchPublicPolicy(
  slug: string,
  force = false,
): Promise<SitePolicy | null> {
  const normalizedSlug = slug.trim().toLowerCase();
  const cached = publicPolicyCache.get(
    normalizedSlug,
  );

  if (
    !force &&
    cached &&
    cached.expiresAt > Date.now()
  ) {
    return cached.value;
  }

  const { data, error } = await supabase
    .from("site_policies")
    .select(
      "slug,title,content,seo_title,seo_description,active,sort_order,created_at,updated_at",
    )
    .eq("slug", normalizedSlug)
    .eq("active", true)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  const policy = data
    ? mapPolicy(data as PolicyRow)
    : null;

  publicPolicyCache.set(normalizedSlug, {
    value: policy,
    expiresAt:
      Date.now() + PUBLIC_CACHE_TTL_MS,
  });

  return policy;
}

export async function fetchAdminPolicies() {
  const { data, error } = await supabase
    .from("site_policies")
    .select(
      "slug,title,content,seo_title,seo_description,active,sort_order,created_at,updated_at",
    )
    .order("sort_order", {
      ascending: true,
    });

  if (error) {
    throw new Error(error.message);
  }

  return ((data ?? []) as PolicyRow[]).map(
    mapPolicy,
  );
}

export async function updateSitePolicy(
  slug: string,
  input: SitePolicyInput,
) {
  const { data, error } = await supabase
    .from("site_policies")
    .update({
      title: input.title.trim(),
      content: input.content.trim(),
      seo_title: input.seoTitle.trim(),
      seo_description:
        input.seoDescription.trim(),
      active: input.active,
    })
    .eq("slug", slug)
    .select(
      "slug,title,content,seo_title,seo_description,active,sort_order,created_at,updated_at",
    )
    .single();

  if (error) {
    return {
      success: false as const,
      message: error.message,
    };
  }

  publicPolicyCache.delete(slug);

  return {
    success: true as const,
    message: "Đã lưu chính sách.",
    data: mapPolicy(data as PolicyRow),
  };
}