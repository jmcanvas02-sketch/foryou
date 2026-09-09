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
import type { Coupon, CouponInput } from "../../types/store";

const LEGACY_STORAGE_KEY = "ingiday-coupons";

type CouponRow = {
  id: string;
  code: string;
  discount_type: "fixed" | "percent";
  discount_value: number | string;
  minimum_order_value: number | string;
  maximum_discount: number | string | null;
  usage_limit: number | null;
  used_count: number;
  starts_at: string | null;
  ends_at: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
};

type CouponValidation = {
  valid: boolean;
  message: string;
  coupon?: Coupon;
  discount: number;
};

type CouponActionResult = {
  success: boolean;
  message: string;
  data?: Coupon;
};

type CouponValidationRpc = {
  valid?: boolean;
  message?: string;
  discount?: number | string;
  coupon?: Coupon;
};

type CouponsContextValue = {
  coupons: Coupon[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  createCoupon: (input: CouponInput) => Promise<CouponActionResult>;
  updateCoupon: (
    id: string,
    input: CouponInput,
  ) => Promise<CouponActionResult>;
  deleteCoupon: (id: string) => Promise<CouponActionResult>;
  toggleCoupon: (id: string) => Promise<CouponActionResult>;
  validateCoupon: (
    code: string,
    subtotal: number,
  ) => Promise<CouponValidation>;
  markCouponUsed: (id: string) => void;
};

const CouponsContext = createContext<CouponsContextValue | null>(null);

const couponSelect = `
  id,
  code,
  discount_type,
  discount_value,
  minimum_order_value,
  maximum_discount,
  usage_limit,
  used_count,
  starts_at,
  ends_at,
  active,
  created_at,
  updated_at
`;

function normalizeCode(code: string) {
  return code.trim().toUpperCase().replace(/\s+/g, "");
}

function dateInput(value: string | null) {
  return value ? value.slice(0, 10) : undefined;
}

function couponFromRow(row: CouponRow): Coupon {
  return {
    id: row.id,
    code: row.code,
    type: row.discount_type === "percent" ? "percentage" : "fixed",
    value: Number(row.discount_value),
    minOrder: Number(row.minimum_order_value),
    maxDiscount:
      row.maximum_discount === null
        ? undefined
        : Number(row.maximum_discount),
    usageLimit: row.usage_limit ?? undefined,
    usedCount: row.used_count,
    startsAt: dateInput(row.starts_at),
    endsAt: dateInput(row.ends_at),
    active: row.active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function couponInputToRow(input: CouponInput) {
  return {
    code: normalizeCode(input.code),
    discount_type: input.type === "percentage" ? "percent" : "fixed",
    discount_value: input.value,
    minimum_order_value: input.minOrder,
    maximum_discount:
      input.maxDiscount && input.maxDiscount > 0
        ? input.maxDiscount
        : null,
    usage_limit:
      input.usageLimit && input.usageLimit > 0
        ? input.usageLimit
        : null,
    starts_at: input.startsAt
      ? `${input.startsAt}T00:00:00+07:00`
      : null,
    ends_at: input.endsAt
      ? `${input.endsAt}T23:59:59+07:00`
      : null,
    active: input.active,
  };
}

function readLegacyCoupons(): Coupon[] {
  try {
    const raw = localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!raw) return [];

    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as Coupon[]) : [];
  } catch {
    return [];
  }
}

export function CouponsProvider({ children }: { children: ReactNode }) {
  const [coupons, setCoupons] = useState<Coupon[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const authUserIdRef = useRef("");

  const loadCoupons = useCallback(async (session?: Session | null) => {
    const activeSession =
      session === undefined
        ? (await supabase.auth.getSession()).data.session
        : session;

    if (!activeSession) {
      setCoupons([]);
      setError("");
      setLoading(false);
      return;
    }

    setLoading(true);

    const { data, error: queryError } = await supabase
      .from("coupons")
      .select(couponSelect)
      .order("created_at", { ascending: false });

    if (queryError) {
      setCoupons([]);
      setError(queryError.message);
      setLoading(false);
      return;
    }

    let rows = (data ?? []) as unknown as CouponRow[];
    const legacyCoupons = readLegacyCoupons();

    if (legacyCoupons.length > 0) {
      const existingCodes = new Set(
        rows.map((row) => normalizeCode(row.code)),
      );
      const missingCoupons = legacyCoupons.filter(
        (coupon) => !existingCodes.has(normalizeCode(coupon.code)),
      );

      if (missingCoupons.length > 0) {
        const legacyRows = missingCoupons.map((coupon) => ({
          ...couponInputToRow({
            code: coupon.code,
            type: coupon.type,
            value: coupon.value,
            minOrder: coupon.minOrder,
            maxDiscount: coupon.maxDiscount,
            usageLimit: coupon.usageLimit,
            startsAt: coupon.startsAt,
            endsAt: coupon.endsAt,
            active: coupon.active,
          }),
          used_count: Math.max(0, coupon.usedCount || 0),
        }));

        const { data: migratedData, error: migrationError } = await supabase
          .from("coupons")
          .insert(legacyRows)
          .select(couponSelect);

        if (migrationError) {
          setError(
            `Không thể chuyển mã cũ lên Supabase: ${migrationError.message}`,
          );
        } else {
          rows = [
            ...((migratedData ?? []) as unknown as CouponRow[]),
            ...rows,
          ];
          localStorage.removeItem(LEGACY_STORAGE_KEY);
        }
      } else {
        localStorage.removeItem(LEGACY_STORAGE_KEY);
      }
    }

    setCoupons(rows.map(couponFromRow));
    setLoading(false);
  }, []);

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      authUserIdRef.current = getSessionUserId(data.session);

      if (mounted) {
        void loadCoupons(data.session);
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
          void loadCoupons(session);
        }
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadCoupons]);

  const value = useMemo<CouponsContextValue>(
    () => ({
      coupons,
      loading,
      error,
      refresh: () => loadCoupons(),

      async createCoupon(input) {
        const { data, error: insertError } = await supabase
          .from("coupons")
          .insert(couponInputToRow(input))
          .select(couponSelect)
          .single();

        if (insertError) {
          return {
            success: false,
            message:
              insertError.code === "23505"
                ? "Mã giảm giá đã tồn tại."
                : insertError.message,
          };
        }

        const created = couponFromRow(data as unknown as CouponRow);
        setCoupons((current) => [created, ...current]);

        return {
          success: true,
          message: "Đã tạo mã giảm giá.",
          data: created,
        };
      },

      async updateCoupon(id, input) {
        const { data, error: updateError } = await supabase
          .from("coupons")
          .update(couponInputToRow(input))
          .eq("id", id)
          .select(couponSelect)
          .single();

        if (updateError) {
          return {
            success: false,
            message:
              updateError.code === "23505"
                ? "Mã giảm giá đã tồn tại."
                : updateError.message,
          };
        }

        const updated = couponFromRow(data as unknown as CouponRow);
        setCoupons((current) =>
          current.map((coupon) => (coupon.id === id ? updated : coupon)),
        );

        return {
          success: true,
          message: "Đã lưu thay đổi.",
          data: updated,
        };
      },

      async deleteCoupon(id) {
        const { error: deleteError } = await supabase
          .from("coupons")
          .delete()
          .eq("id", id);

        if (deleteError) {
          return {
            success: false,
            message: deleteError.message,
          };
        }

        setCoupons((current) =>
          current.filter((coupon) => coupon.id !== id),
        );

        return {
          success: true,
          message: "Đã xóa mã giảm giá.",
        };
      },

      async toggleCoupon(id) {
        const currentCoupon = coupons.find((coupon) => coupon.id === id);

        if (!currentCoupon) {
          return {
            success: false,
            message: "Không tìm thấy mã giảm giá.",
          };
        }

        const { data, error: updateError } = await supabase
          .from("coupons")
          .update({ active: !currentCoupon.active })
          .eq("id", id)
          .select(couponSelect)
          .single();

        if (updateError) {
          return {
            success: false,
            message: updateError.message,
          };
        }

        const updated = couponFromRow(data as unknown as CouponRow);
        setCoupons((current) =>
          current.map((coupon) => (coupon.id === id ? updated : coupon)),
        );

        return {
          success: true,
          message: updated.active
            ? "Đã bật mã giảm giá."
            : "Đã tắt mã giảm giá.",
          data: updated,
        };
      },

      async validateCoupon(code, subtotal) {
        const normalized = normalizeCode(code);

        if (!normalized) {
          return {
            valid: false,
            message: "Vui lòng nhập mã giảm giá.",
            discount: 0,
          };
        }

        const { data, error: rpcError } = await supabase.rpc(
          "validate_store_coupon",
          {
            p_code: normalized,
            p_subtotal: Math.max(0, subtotal),
          },
        );

        if (rpcError) {
          return {
            valid: false,
            message: rpcError.message || "Không thể kiểm tra mã giảm giá.",
            discount: 0,
          };
        }

        const result = (data ?? {}) as CouponValidationRpc;

        return {
          valid: result.valid === true,
          message:
            result.message ??
            (result.valid
              ? "Áp dụng mã giảm giá thành công."
              : "Mã giảm giá không hợp lệ."),
          coupon: result.coupon,
          discount: Number(result.discount ?? 0),
        };
      },

      markCouponUsed() {
        // Số lượt sử dụng được tăng an toàn trong create_store_order().
      },
    }),
    [coupons, error, loadCoupons, loading],
  );

  return (
    <CouponsContext.Provider value={value}>
      {children}
    </CouponsContext.Provider>
  );
}

export function useCoupons() {
  const context = useContext(CouponsContext);

  if (!context) {
    throw new Error("useCoupons phải được dùng trong CouponsProvider.");
  }

  return context;
}