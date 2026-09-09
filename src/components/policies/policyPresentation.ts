export type PolicyVisual = {
  icon: string;
  eyebrow: string;
  accent: string;
  accentSoft: string;
  gradient: string;
};

export const POLICY_LINKS = [
  {
    slug: "chinh-sach-giao-hang",
    label: "Chính sách giao hàng",
    shortLabel: "Giao hàng",
  },
  {
    slug: "chinh-sach-doi-tra",
    label: "Chính sách đổi trả",
    shortLabel: "Đổi trả",
  },
  {
    slug: "chinh-sach-bao-hanh",
    label: "Chính sách bảo hành",
    shortLabel: "Bảo hành",
  },
  {
    slug: "chinh-sach-bao-mat",
    label: "Chính sách bảo mật",
    shortLabel: "Bảo mật",
  },
  {
    slug: "dieu-khoan-su-dung",
    label: "Điều khoản sử dụng",
    shortLabel: "Điều khoản",
  },
] as const;

const VISUALS: Record<string, PolicyVisual> = {
  "chinh-sach-giao-hang": {
    icon: "🚚",
    eyebrow: "Giao nhận rõ ràng",
    accent: "#006397",
    accentSoft: "#dff4ff",
    gradient:
      "linear-gradient(135deg, #dff4ff 0%, #eef8ff 52%, #fff0e8 100%)",
  },
  "chinh-sach-doi-tra": {
    icon: "🔄",
    eyebrow: "Hỗ trợ minh bạch",
    accent: "#b34b24",
    accentSoft: "#fff0e8",
    gradient:
      "linear-gradient(135deg, #fff0e8 0%, #fff8f2 52%, #e8f6ff 100%)",
  },
  "chinh-sach-bao-hanh": {
    icon: "🛠️",
    eyebrow: "An tâm sử dụng",
    accent: "#3b6f4e",
    accentSoft: "#e4f6ea",
    gradient:
      "linear-gradient(135deg, #e4f6ea 0%, #f4fbf6 52%, #fff2dd 100%)",
  },
  "chinh-sach-bao-mat": {
    icon: "🔒",
    eyebrow: "Thông tin được bảo vệ",
    accent: "#6250a7",
    accentSoft: "#eeeaff",
    gradient:
      "linear-gradient(135deg, #eeeaff 0%, #f8f6ff 52%, #e4f6ff 100%)",
  },
  "dieu-khoan-su-dung": {
    icon: "📋",
    eyebrow: "Quy định dễ hiểu",
    accent: "#8d5f12",
    accentSoft: "#fff2cf",
    gradient:
      "linear-gradient(135deg, #fff2cf 0%, #fff9e9 52%, #e9f6ff 100%)",
  },
};

const FALLBACK_VISUAL: PolicyVisual = {
  icon: "📌",
  eyebrow: "Thông tin InGiDay",
  accent: "#006397",
  accentSoft: "#dff4ff",
  gradient:
    "linear-gradient(135deg, #dff4ff 0%, #f5f9ff 55%, #ffeaf3 100%)",
};

export function getPolicyVisual(
  slug: string,
): PolicyVisual {
  return VISUALS[slug] ?? FALLBACK_VISUAL;
}