/* eslint-disable react-refresh/only-export-components */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "../../lib/supabase";
import {
  authChangeNeedsDataReload,
  getSessionUserId,
} from "../../utils/authSessionChange";
import type { Banner, BannerInput } from "../../types/store";

const LEGACY_STORAGE_KEY = "ingiday-banners";

type BannerRow = {
  id: string;
  internal_title: string;
  badge: string | null;
  title: string | null;
  description: string | null;
  primary_label: string | null;
  primary_link: string | null;
  secondary_label: string | null;
  secondary_link: string | null;
  emoji: string | null;
  background: string | null;
  image_desktop_url: string;
  image_public_id: string | null;
  image_alt: string | null;
  sort_order: number;
  active: boolean;
  starts_at: string | null;
  ends_at: string | null;
  created_at: string;
  updated_at: string;
};

type BannerActionResult = {
  success: boolean;
  message: string;
  data?: Banner;
};

type BannersContextValue = {
  banners: Banner[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  createBanner: (input: BannerInput) => Promise<BannerActionResult>;
  updateBanner: (
    id: string,
    input: BannerInput,
  ) => Promise<BannerActionResult>;
  deleteBanner: (id: string) => Promise<BannerActionResult>;
  toggleBanner: (id: string) => Promise<BannerActionResult>;
};

const BannersContext = createContext<BannersContextValue | null>(null);

const bannerSelect = `
  id,
  internal_title,
  badge,
  title,
  description,
  primary_label,
  primary_link,
  secondary_label,
  secondary_link,
  emoji,
  background,
  image_desktop_url,
  image_public_id,
  image_alt,
  sort_order,
  active,
  starts_at,
  ends_at,
  created_at,
  updated_at
`;

function dateInput(value: string | null) {
  return value ? value.slice(0, 10) : undefined;
}

function bannerFromRow(row: BannerRow): Banner {
  return {
    id: row.id,
    internalName: row.internal_title,
    badge: row.badge ?? "",
    title: row.title ?? "",
    description: row.description ?? "",
    primaryLabel: row.primary_label ?? "",
    primaryLink: row.primary_link ?? "/san-pham",
    secondaryLabel: row.secondary_label ?? "",
    secondaryLink: row.secondary_link ?? "/in-rieng",
    emoji: row.emoji ?? "🐲",
    background:
      row.background ??
      "linear-gradient(135deg, #d9eaff 0%, #edf4ff 55%, #ffe1ef 100%)",
    imageUrl: row.image_desktop_url || undefined,
    imagePublicId: row.image_public_id ?? undefined,
    imageAlt: row.image_alt ?? undefined,
    startsAt: dateInput(row.starts_at),
    endsAt: dateInput(row.ends_at),
    active: row.active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function bannerInputToRow(input: BannerInput) {
  return {
    internal_title: input.internalName.trim(),
    badge: input.badge.trim(),
    title: input.title.trim(),
    description: input.description.trim(),
    primary_label: input.primaryLabel.trim(),
    primary_link: input.primaryLink.trim() || "/san-pham",
    secondary_label: input.secondaryLabel.trim(),
    secondary_link: input.secondaryLink.trim() || "/in-rieng",
    emoji: input.emoji.trim() || "🐲",
    background:
      input.background.trim() ||
      "linear-gradient(135deg, #d9eaff 0%, #edf4ff 55%, #ffe1ef 100%)",
    image_desktop_url: input.imageUrl?.trim() ?? "",
    image_public_id: input.imagePublicId?.trim() || null,
    image_alt: input.imageAlt?.trim() || null,
    position: "home_hero",
    sort_order: Math.max(0, Math.round(input.sortOrder)),
    starts_at: input.startsAt
      ? `${input.startsAt}T00:00:00+07:00`
      : null,
    ends_at: input.endsAt
      ? `${input.endsAt}T23:59:59+07:00`
      : null,
    active: input.active,
  };
}

function readLegacyBanners(): Banner[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Banner[]) : [];
  } catch {
    return [];
  }
}

export function BannersProvider({ children }: { children: ReactNode }) {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const authUserIdRef = useRef("");

  const loadBanners = useCallback(async (session?: Session | null) => {
    const activeSession =
      session === undefined
        ? (await supabase.auth.getSession()).data.session
        : session;

    setLoading(true);

    const { data, error: queryError } = await supabase
      .from("banners")
      .select(bannerSelect)
      .eq("position", "home_hero")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: true });

    if (queryError) {
      setBanners([]);
      setError(queryError.message);
      setLoading(false);
      return;
    }

    let rows = (data ?? []) as unknown as BannerRow[];

    if (activeSession && rows.length === 0) {
      const legacyBanners = readLegacyBanners();

      if (legacyBanners.length > 0) {
        const { data: migratedData, error: migrationError } =
          await supabase
            .from("banners")
            .insert(
              legacyBanners.map((banner) =>
                bannerInputToRow({
                  internalName: banner.internalName,
                  badge: banner.badge,
                  title: banner.title,
                  description: banner.description,
                  primaryLabel: banner.primaryLabel,
                  primaryLink: banner.primaryLink,
                  secondaryLabel: banner.secondaryLabel,
                  secondaryLink: banner.secondaryLink,
                  emoji: banner.emoji,
                  background: banner.background,
                  imageUrl: banner.imageUrl,
                  imagePublicId: banner.imagePublicId,
                  imageAlt: banner.imageAlt,
                  startsAt: banner.startsAt,
                  endsAt: banner.endsAt,
                  active: banner.active,
                  sortOrder: banner.sortOrder,
                }),
              ),
            )
            .select(bannerSelect);

        if (migrationError) {
          setError(
            `Không thể chuyển banner cũ lên Supabase: ${migrationError.message}`,
          );
        } else {
          rows = (migratedData ?? []) as unknown as BannerRow[];
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
      }
    }

    setBanners(rows.map(bannerFromRow));
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      authUserIdRef.current = getSessionUserId(data.session);

      if (mounted) {
        void loadBanners(data.session);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      const previousUserId = authUserIdRef.current;
      authUserIdRef.current = getSessionUserId(session);

      if (
        !authChangeNeedsDataReload(
          event,
          previousUserId,
          session,
        )
      ) {
        return;
      }

      window.setTimeout(() => {
        if (mounted) {
          void loadBanners(session);
        }
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadBanners]);

  const value = useMemo<BannersContextValue>(
    () => ({
      banners,
      loading,
      error,
      refresh: () => loadBanners(),

      async createBanner(input) {
        const { data, error: insertError } = await supabase
          .from("banners")
          .insert(bannerInputToRow(input))
          .select(bannerSelect)
          .single();

        if (insertError) {
          return {
            success: false,
            message: insertError.message,
          };
        }

        const created = bannerFromRow(data as unknown as BannerRow);
        setBanners((current) =>
          [...current, created].sort(
            (left, right) => left.sortOrder - right.sortOrder,
          ),
        );

        return {
          success: true,
          message: "Đã tạo banner.",
          data: created,
        };
      },

      async updateBanner(id, input) {
        const { data, error: updateError } = await supabase
          .from("banners")
          .update(bannerInputToRow(input))
          .eq("id", id)
          .select(bannerSelect)
          .single();

        if (updateError) {
          return {
            success: false,
            message: updateError.message,
          };
        }

        const updated = bannerFromRow(data as unknown as BannerRow);
        setBanners((current) =>
          current
            .map((banner) => (banner.id === id ? updated : banner))
            .sort((left, right) => left.sortOrder - right.sortOrder),
        );

        return {
          success: true,
          message: "Đã lưu banner.",
          data: updated,
        };
      },

      async deleteBanner(id) {
        const { error: deleteError } = await supabase
          .from("banners")
          .delete()
          .eq("id", id);

        if (deleteError) {
          return {
            success: false,
            message: deleteError.message,
          };
        }

        setBanners((current) =>
          current.filter((banner) => banner.id !== id),
        );

        return {
          success: true,
          message: "Đã xóa banner.",
        };
      },

      async toggleBanner(id) {
        const currentBanner = banners.find((banner) => banner.id === id);

        if (!currentBanner) {
          return {
            success: false,
            message: "Không tìm thấy banner.",
          };
        }

        const { data, error: updateError } = await supabase
          .from("banners")
          .update({ active: !currentBanner.active })
          .eq("id", id)
          .select(bannerSelect)
          .single();

        if (updateError) {
          return {
            success: false,
            message: updateError.message,
          };
        }

        const updated = bannerFromRow(data as unknown as BannerRow);
        setBanners((current) =>
          current.map((banner) =>
            banner.id === id ? updated : banner,
          ),
        );

        return {
          success: true,
          message: updated.active
            ? "Đã hiển thị banner."
            : "Đã ẩn banner.",
          data: updated,
        };
      },
    }),
    [banners, error, loadBanners, loading],
  );

  return (
    <BannersContext.Provider value={value}>
      {children}
    </BannersContext.Provider>
  );
}

export function useBanners() {
  const context = useContext(BannersContext);

  if (!context) {
    throw new Error("useBanners phải được dùng trong BannersProvider.");
  }

  return context;
}