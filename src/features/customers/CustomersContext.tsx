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
import type { OrderStatus } from "../../types/store";

export type CustomerSummary = {
  phone: string;
  fullName: string;
  email: string;
  province: string;
  district: string;
  ward: string;
  addressDetail: string;
  totalOrders: number;
  newOrders: number;
  completedOrders: number;
  cancelledOrders: number;
  completedRevenue: number;
  firstOrderAt: string;
  lastOrderAt: string;
  lastOrderCode: string;
  lastOrderStatus: OrderStatus;
  lastOrderTotal: number;
};

export type CustomerOrderSummary = {
  id: string;
  code: string;
  fullName: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  addressDetail: string;
  note: string;
  total: number;
  status: OrderStatus;
  itemQuantity: number;
  createdAt: string;
};

type CustomerSummaryRow = {
  customer_phone: string;
  customer_name: string;
  customer_email: string | null;
  province: string | null;
  district: string | null;
  ward: string | null;
  address_line: string | null;
  total_orders: number | string;
  new_orders: number | string;
  completed_orders: number | string;
  cancelled_orders: number | string;
  completed_revenue: number | string;
  first_order_at: string;
  last_order_at: string;
  last_order_code: string;
  last_order_status: OrderStatus;
  last_order_total: number | string;
};

type CustomerOrderRow = {
  id: string;
  order_code: string;
  customer_name: string;
  customer_phone: string;
  province: string;
  district: string;
  ward: string;
  address_line: string;
  note: string | null;
  total_amount: number | string;
  status: OrderStatus;
  created_at: string;
  order_items: Array<{
    quantity: number;
  }> | null;
};

type CustomerOrdersResult = {
  success: boolean;
  message: string;
  data: CustomerOrderSummary[];
};

type CustomersContextValue = {
  customers: CustomerSummary[];
  loading: boolean;
  error: string;
  refresh: () => Promise<void>;
  getCustomer: (phone: string) => CustomerSummary | undefined;
  loadCustomerOrders: (
    phone: string,
  ) => Promise<CustomerOrdersResult>;
};

const CustomersContext =
  createContext<CustomersContextValue | null>(null);

const customerSummarySelect = `
  customer_phone,
  customer_name,
  customer_email,
  province,
  district,
  ward,
  address_line,
  total_orders,
  new_orders,
  completed_orders,
  cancelled_orders,
  completed_revenue,
  first_order_at,
  last_order_at,
  last_order_code,
  last_order_status,
  last_order_total
`;

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function customerFromRow(
  row: CustomerSummaryRow,
): CustomerSummary {
  return {
    phone: row.customer_phone,
    fullName: row.customer_name,
    email: row.customer_email ?? "",
    province: row.province ?? "",
    district: row.district ?? "",
    ward: row.ward ?? "",
    addressDetail: row.address_line ?? "",
    totalOrders: Number(row.total_orders),
    newOrders: Number(row.new_orders),
    completedOrders: Number(row.completed_orders),
    cancelledOrders: Number(row.cancelled_orders),
    completedRevenue: Number(row.completed_revenue),
    firstOrderAt: row.first_order_at,
    lastOrderAt: row.last_order_at,
    lastOrderCode: row.last_order_code,
    lastOrderStatus: row.last_order_status,
    lastOrderTotal: Number(row.last_order_total),
  };
}

function customerOrderFromRow(
  row: CustomerOrderRow,
): CustomerOrderSummary {
  return {
    id: row.id,
    code: row.order_code,
    fullName: row.customer_name,
    phone: row.customer_phone,
    province: row.province,
    district: row.district,
    ward: row.ward,
    addressDetail: row.address_line,
    note: row.note ?? "",
    total: Number(row.total_amount),
    status: row.status,
    itemQuantity: (row.order_items ?? []).reduce(
      (sum, item) => sum + item.quantity,
      0,
    ),
    createdAt: row.created_at,
  };
}

export function CustomersProvider({
  children,
}: {
  children: ReactNode;
}) {
  const [customers, setCustomers] = useState<CustomerSummary[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const authUserIdRef = useRef("");

  const loadCustomers = useCallback(
    async (session?: Session | null) => {
      const activeSession =
        session === undefined
          ? (await supabase.auth.getSession()).data.session
          : session;

      if (!activeSession) {
        setCustomers([]);
        setError("");
        setLoading(false);
        return;
      }

      setLoading(true);

      const { data, error: queryError } = await supabase
        .from("customer_summary")
        .select(customerSummarySelect)
        .order("last_order_at", { ascending: false });

      if (queryError) {
        setCustomers([]);
        setError(queryError.message);
        setLoading(false);
        return;
      }

      setCustomers(
        ((data ?? []) as unknown as CustomerSummaryRow[]).map(
          customerFromRow,
        ),
      );
      setError("");
      setLoading(false);
    },
    [],
  );

  useEffect(() => {
    let mounted = true;

    void supabase.auth.getSession().then(({ data }) => {
      authUserIdRef.current = getSessionUserId(data.session);

      if (mounted) {
        void loadCustomers(data.session);
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
          void loadCustomers(session);
        }
      }, 0);
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [loadCustomers]);

  const value = useMemo<CustomersContextValue>(
    () => ({
      customers,
      loading,
      error,
      refresh: () => loadCustomers(),

      getCustomer(phone) {
        const normalized = normalizePhone(phone);

        return customers.find(
          (customer) =>
            normalizePhone(customer.phone) === normalized,
        );
      },

      async loadCustomerOrders(phone) {
        const normalized = normalizePhone(phone);

        if (!/^0\d{9}$/.test(normalized)) {
          return {
            success: false,
            message: "Số điện thoại khách hàng không hợp lệ.",
            data: [],
          };
        }

        const { data, error: queryError } = await supabase
          .from("orders")
          .select(`
            id,
            order_code,
            customer_name,
            customer_phone,
            province,
            district,
            ward,
            address_line,
            note,
            total_amount,
            status,
            created_at,
            order_items (
              quantity
            )
          `)
          .eq("customer_phone", normalized)
          .order("created_at", { ascending: false });

        if (queryError) {
          return {
            success: false,
            message: queryError.message,
            data: [],
          };
        }

        return {
          success: true,
          message: "Đã tải lịch sử khách hàng.",
          data: (
            (data ?? []) as unknown as CustomerOrderRow[]
          ).map(customerOrderFromRow),
        };
      },
    }),
    [customers, error, loadCustomers, loading],
  );

  return (
    <CustomersContext.Provider value={value}>
      {children}
    </CustomersContext.Provider>
  );
}

export function useCustomers() {
  const context = useContext(CustomersContext);

  if (!context) {
    throw new Error(
      "useCustomers phải được dùng trong CustomersProvider.",
    );
  }

  return context;
}