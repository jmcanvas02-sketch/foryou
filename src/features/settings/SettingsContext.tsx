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
import type { StoreSettings } from "../../types/store";
import {
  createEmptySocialLinks,
  normalizeExternalUrl,
  normalizeSocialLinks,
} from "../../utils/externalUrl";
import type { StoreSocialLinks } from "../../utils/externalUrl";

const LEGACY_STORAGE_KEY = "ingiday-settings";
const DEFAULT_SOCIAL_SHARE_TITLE =
  "InGiDay | Sản phẩm in 3D đáng yêu";
const DEFAULT_SOCIAL_SHARE_DESCRIPTION =
  "Khám phá móc khóa, mô hình mini và các sản phẩm in 3D độc đáo từ InGiDay.";

const initialSettings: StoreSettings = {
  storeName: "InGiDay",
  phone: "",
  email: "",
  address: "",
  legalBusinessName: "",
  businessOwnerName: "",
  taxCode: "",
  businessRegistrationNumber: "",
  businessRegistrationDate: "",
  businessRegistrationPlace: "",
  messengerUrl: "",
  socialLinks: createEmptySocialLinks(),
  footerDescription:
    "Những sản phẩm in 3D nhỏ xinh, độc đáo và được tạo ra để làm ngày của bạn vui hơn.",
  shippingFee: 15000,
  freeShippingThreshold: 200000,
  couponEnabled: true,
  stockEnabled: true,
  customPrintTitle: "Biến ý tưởng thành món đồ thật",
  customPrintDescription:
    "Gửi hình ảnh hoặc mô tả qua Messenger. Shop sẽ trao đổi mẫu, kích thước, màu sắc, giá và thời gian hoàn thiện.",
  customPrintButtonText: "Va ngay với chủ shop để yêu cầu",
  customPrintStep1Title: "Gửi ý tưởng",
  customPrintStep1Description:
    "Gửi hình ảnh, mô tả hoặc kích thước mong muốn qua Messenger.",
  customPrintStep2Title: "Shop tư vấn",
  customPrintStep2Description:
    "Shop trao đổi về mẫu, màu sắc, kích thước, giá và thời gian hoàn thiện.",
  customPrintStep3Title: "Xác nhận và in",
  customPrintStep3Description:
    "Sau khi chốt yêu cầu, shop tiến hành in và cập nhật tiến độ cho bạn.",
  logoUrl: "",
  logoPublicId: "",
  faviconUrl: "",
  faviconPublicId: "",
  socialShareImageUrl: "",
  socialShareImagePublicId: "",
  socialShareTitle: DEFAULT_SOCIAL_SHARE_TITLE,
  socialShareDescription: DEFAULT_SOCIAL_SHARE_DESCRIPTION,
  currency: "VND",
};

type StoreSettingsRow = {
  id: number;
  shop_name: string;
  phone: string | null;
  email: string | null;
  address: string | null;
  legal_business_name: string | null;
  business_owner_name: string | null;
  tax_code: string | null;
  business_registration_number: string | null;
  business_registration_date: string | null;
  business_registration_place: string | null;
  messenger_url: string | null;
  social_links: Partial<StoreSocialLinks> | null;
  footer_text: string | null;
  shipping_fee: number | string;
  free_shipping_threshold: number | string;
  currency: string;
  enable_coupons: boolean;
  enable_inventory: boolean;
  custom_print_title: string;
  custom_print_description: string;
  custom_print_button_text: string;
  custom_print_step_1_title: string;
  custom_print_step_1_description: string;
  custom_print_step_2_title: string;
  custom_print_step_2_description: string;
  custom_print_step_3_title: string;
  custom_print_step_3_description: string;
  logo_url: string | null;
  logo_public_id: string | null;
  favicon_url: string | null;
  favicon_public_id: string | null;
  social_share_image_url: string | null;
  social_share_image_public_id: string | null;
  social_share_title: string;
  social_share_description: string;
  updated_at: string;
};

type SettingsActionResult = {
  success: boolean;
  message: string;
  data?: StoreSettings;
};

type SettingsContextValue = {
  settings: StoreSettings;
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  updateSettings: (
    value: StoreSettings,
  ) => Promise<SettingsActionResult>;
};

const SettingsContext = createContext<SettingsContextValue | null>(
  null,
);

const settingsSelect = `
  id,
  shop_name,
  phone,
  email,
  address,
  legal_business_name,
  business_owner_name,
  tax_code,
  business_registration_number,
  business_registration_date,
  business_registration_place,
  messenger_url,
  social_links,
  footer_text,
  shipping_fee,
  free_shipping_threshold,
  currency,
  enable_coupons,
  enable_inventory,
  custom_print_title,
  custom_print_description,
  custom_print_button_text,
  custom_print_step_1_title,
  custom_print_step_1_description,
  custom_print_step_2_title,
  custom_print_step_2_description,
  custom_print_step_3_title,
  custom_print_step_3_description,
  logo_url,
  logo_public_id,
  favicon_url,
  favicon_public_id,
  social_share_image_url,
  social_share_image_public_id,
  social_share_title,
  social_share_description,
  updated_at
`;

function settingsFromRow(row: StoreSettingsRow): StoreSettings {
  return {
    storeName: row.shop_name || initialSettings.storeName,
    phone: row.phone ?? "",
    email: row.email ?? "",
    address: row.address ?? "",
    legalBusinessName: row.legal_business_name ?? "",
    businessOwnerName: row.business_owner_name ?? "",
    taxCode: row.tax_code ?? "",
    businessRegistrationNumber:
      row.business_registration_number ?? "",
    businessRegistrationDate:
      row.business_registration_date ?? "",
    businessRegistrationPlace:
      row.business_registration_place ?? "",
    messengerUrl: normalizeExternalUrl(row.messenger_url ?? ""),
    socialLinks: normalizeSocialLinks(row.social_links),
    footerDescription:
      row.footer_text ?? initialSettings.footerDescription,
    shippingFee: Number(row.shipping_fee),
    freeShippingThreshold: Number(row.free_shipping_threshold),
    couponEnabled: row.enable_coupons,
    stockEnabled: row.enable_inventory,
    customPrintTitle:
      row.custom_print_title || initialSettings.customPrintTitle,
    customPrintDescription:
      row.custom_print_description ||
      initialSettings.customPrintDescription,
    customPrintButtonText:
      row.custom_print_button_text ||
      initialSettings.customPrintButtonText,
    customPrintStep1Title:
      row.custom_print_step_1_title ||
      initialSettings.customPrintStep1Title,
    customPrintStep1Description:
      row.custom_print_step_1_description ||
      initialSettings.customPrintStep1Description,
    customPrintStep2Title:
      row.custom_print_step_2_title ||
      initialSettings.customPrintStep2Title,
    customPrintStep2Description:
      row.custom_print_step_2_description ||
      initialSettings.customPrintStep2Description,
    customPrintStep3Title:
      row.custom_print_step_3_title ||
      initialSettings.customPrintStep3Title,
    customPrintStep3Description:
      row.custom_print_step_3_description ||
      initialSettings.customPrintStep3Description,
    logoUrl: row.logo_url ?? "",
    logoPublicId: row.logo_public_id ?? "",
    faviconUrl: row.favicon_url ?? "",
    faviconPublicId: row.favicon_public_id ?? "",
    socialShareImageUrl:
      row.social_share_image_url ?? "",
    socialShareImagePublicId:
      row.social_share_image_public_id ?? "",
    socialShareTitle:
      row.social_share_title ||
      initialSettings.socialShareTitle,
    socialShareDescription:
      row.social_share_description ||
      initialSettings.socialShareDescription,
    currency: "VND",
  };
}

function settingsToRow(value: StoreSettings) {
  const logoUrl = value.logoUrl.trim();
  const faviconUrl = value.faviconUrl.trim();
  const socialShareImageUrl =
    value.socialShareImageUrl.trim();

  return {
    shop_name: value.storeName.trim() || "InGiDay",
    phone: value.phone.trim() || null,
    email: value.email.trim() || null,
    address: value.address.trim() || null,
    legal_business_name:
      value.legalBusinessName.trim() || null,
    business_owner_name:
      value.businessOwnerName.trim() || null,
    tax_code: value.taxCode.trim() || null,
    business_registration_number:
      value.businessRegistrationNumber.trim() || null,
    business_registration_date:
      value.businessRegistrationDate.trim() || null,
    business_registration_place:
      value.businessRegistrationPlace.trim() || null,
    messenger_url: normalizeExternalUrl(value.messengerUrl) || null,
    social_links: normalizeSocialLinks(value.socialLinks),
    footer_text:
      value.footerDescription.trim() ||
      initialSettings.footerDescription,
    shipping_fee: Math.max(0, Math.round(value.shippingFee)),
    free_shipping_threshold: Math.max(
      0,
      Math.round(value.freeShippingThreshold),
    ),
    currency: "VND",
    enable_coupons: value.couponEnabled,
    enable_inventory: value.stockEnabled,
    custom_print_title:
      value.customPrintTitle.trim() ||
      initialSettings.customPrintTitle,
    custom_print_description:
      value.customPrintDescription.trim() ||
      initialSettings.customPrintDescription,
    custom_print_button_text:
      value.customPrintButtonText.trim() ||
      initialSettings.customPrintButtonText,
    custom_print_step_1_title:
      value.customPrintStep1Title.trim() ||
      initialSettings.customPrintStep1Title,
    custom_print_step_1_description:
      value.customPrintStep1Description.trim() ||
      initialSettings.customPrintStep1Description,
    custom_print_step_2_title:
      value.customPrintStep2Title.trim() ||
      initialSettings.customPrintStep2Title,
    custom_print_step_2_description:
      value.customPrintStep2Description.trim() ||
      initialSettings.customPrintStep2Description,
    custom_print_step_3_title:
      value.customPrintStep3Title.trim() ||
      initialSettings.customPrintStep3Title,
    custom_print_step_3_description:
      value.customPrintStep3Description.trim() ||
      initialSettings.customPrintStep3Description,
    logo_url: logoUrl || null,
    logo_public_id:
      logoUrl
        ? value.logoPublicId.trim() || null
        : null,
    favicon_url: faviconUrl || null,
    favicon_public_id:
      faviconUrl
        ? value.faviconPublicId.trim() || null
        : null,
    social_share_image_url:
      socialShareImageUrl || null,
    social_share_image_public_id:
      socialShareImageUrl
        ? value.socialShareImagePublicId.trim() || null
        : null,
    social_share_title:
      value.socialShareTitle.trim() ||
      initialSettings.socialShareTitle,
    social_share_description:
      value.socialShareDescription.trim() ||
      initialSettings.socialShareDescription,
  };
}

function readLegacySettings(): StoreSettings | null {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);

    if (!raw) return null;

    const parsed = JSON.parse(raw) as Partial<StoreSettings>;

    return {
      ...initialSettings,
      ...parsed,
      messengerUrl: normalizeExternalUrl(
        parsed.messengerUrl ?? "",
      ),
      socialLinks: normalizeSocialLinks(parsed.socialLinks),
      currency: "VND",
    };
  } catch {
    return null;
  }
}

function applyClientFavicon(url: string) {
  const faviconUrl = url.trim() || "/favicon.svg";
  let element = document.querySelector(
    'link[rel="icon"]',
  ) as HTMLLinkElement | null;

  if (!element) {
    element = document.createElement("link");
    element.rel = "icon";
    document.head.appendChild(element);
  }

  element.href = faviconUrl;
  element.type = url.trim()
    ? "image/png"
    : "image/svg+xml";
}

export function SettingsProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [settings, setSettings] =
    useState<StoreSettings>(initialSettings);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const authUserIdRef = useRef("");

  const loadSettings = useCallback(
    async (session?: Session | null) => {
      const activeSession =
        session === undefined
          ? (await supabase.auth.getSession()).data.session
          : session;

      setLoading(true);

      const { data, error: queryError } = await supabase
        .from("store_settings")
        .select(settingsSelect)
        .eq("id", 1)
        .single();

      if (queryError) {
        setSettings(initialSettings);
        setError(queryError.message);
        setLoading(false);
        return;
      }

      let row = data as unknown as StoreSettingsRow;
      const legacySettings = activeSession
        ? readLegacySettings()
        : null;

      if (legacySettings) {
        const { data: migratedData, error: migrationError } =
          await supabase
            .from("store_settings")
            .update(settingsToRow(legacySettings))
            .eq("id", 1)
            .select(settingsSelect)
            .single();

        if (migrationError) {
          setError(
            `Không thể chuyển cài đặt cũ lên Supabase: ${migrationError.message}`,
          );
        } else {
          row = migratedData as unknown as StoreSettingsRow;
          localStorage.removeItem(LEGACY_STORAGE_KEY);
          setError("");
        }
      } else {
        setError("");
      }

      setSettings(settingsFromRow(row));
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      authUserIdRef.current = getSessionUserId(data.session);

      if (mounted) {
        void loadSettings(data.session);
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
          void loadSettings(session);
        }
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadSettings]);

  useEffect(() => {
    applyClientFavicon(settings.faviconUrl);
  }, [settings.faviconUrl]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      settings,
      loading,
      error,
      refresh: () => loadSettings(),

      async updateSettings(nextSettings) {
        const normalized: StoreSettings = {
          ...nextSettings,
          storeName:
            nextSettings.storeName.trim() ||
            initialSettings.storeName,
          shippingFee: Math.max(
            0,
            Math.round(nextSettings.shippingFee),
          ),
          freeShippingThreshold: Math.max(
            0,
            Math.round(nextSettings.freeShippingThreshold),
          ),
          messengerUrl: normalizeExternalUrl(
            nextSettings.messengerUrl,
          ),
          socialLinks: normalizeSocialLinks(
            nextSettings.socialLinks,
          ),
          logoUrl: nextSettings.logoUrl.trim(),
          logoPublicId: nextSettings.logoPublicId.trim(),
          faviconUrl: nextSettings.faviconUrl.trim(),
          faviconPublicId:
            nextSettings.faviconPublicId.trim(),
          socialShareImageUrl:
            nextSettings.socialShareImageUrl.trim(),
          socialShareImagePublicId:
            nextSettings.socialShareImagePublicId.trim(),
          socialShareTitle:
            nextSettings.socialShareTitle.trim() ||
            initialSettings.socialShareTitle,
          socialShareDescription:
            nextSettings.socialShareDescription.trim() ||
            initialSettings.socialShareDescription,
          currency: "VND",
        };

        const { data, error: updateError } = await supabase
          .from("store_settings")
          .update(settingsToRow(normalized))
          .eq("id", 1)
          .select(settingsSelect)
          .single();

        if (updateError) {
          return {
            success: false,
            message: updateError.message,
          };
        }

        const updated = settingsFromRow(
          data as unknown as StoreSettingsRow,
        );

        setSettings(updated);
        setError("");
        localStorage.removeItem(LEGACY_STORAGE_KEY);

        return {
          success: true,
          message: "Đã lưu cài đặt lên Supabase.",
          data: updated,
        };
      },
    }),
    [error, loadSettings, loading, settings],
  );

  return (
    <SettingsContext.Provider value={value}>
      {children}
    </SettingsContext.Provider>
  );
}

export function useSettings() {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error(
      "useSettings phải được dùng trong SettingsProvider.",
    );
  }

  return context;
}
