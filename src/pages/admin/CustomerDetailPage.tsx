import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  useCustomers,
} from "../../features/customers/CustomersContext";
import type {
  CustomerOrderSummary,
} from "../../features/customers/CustomersContext";
import type { OrderStatus } from "../../types/store";
import { formatCurrency } from "../../utils/currency";

const statusLabels: Record<OrderStatus, string> = {
  new: "Đơn mới",
  unreachable: "Không gọi được",
  confirmed: "Đã xác nhận",
  preparing: "Đang chuẩn bị",
  prepared: "Đã chuẩn bị",
  shipping: "Đang giao",
  completed: "Thành công",
  cancelled: "Đã hủy",
};

const statusClasses: Record<OrderStatus, string> = {
  new: "bg-[#edf4ff] text-[#006397]",
  unreachable: "bg-[#f2edff] text-[#6241a5]",
  confirmed: "bg-[#fff1b8] text-[#7a5200]",
  preparing: "bg-[#ffe8dc] text-[#a43c12]",
  prepared: "bg-[#e7f6fb] text-[#006b82]",
  shipping: "bg-[#e7e4ff] text-[#493b9f]",
  completed: "bg-[#dcf8eb] text-[#14633d]",
  cancelled: "bg-[#fff0eb] text-[#a43c12]",
};

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function CustomerDetailPage() {
  const { phone = "" } = useParams();
  const decodedPhone = normalizePhone(
    decodeURIComponent(phone),
  );

  const {
    loading: customersLoading,
    getCustomer,
    loadCustomerOrders,
  } = useCustomers();

  const customer = getCustomer(decodedPhone);
  const [orders, setOrders] = useState<CustomerOrderSummary[]>(
    [],
  );
  const [loadingOrders, setLoadingOrders] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    async function load() {
      setLoadingOrders(true);
      setError("");

      const result = await loadCustomerOrders(decodedPhone);

      if (!mounted) return;

      setOrders(result.data);
      setError(result.success ? "" : result.message);
      setLoadingOrders(false);
    }

    void load();

    return () => {
      mounted = false;
    };
  }, [decodedPhone, loadCustomerOrders]);

  if (customersLoading || loadingOrders) {
    return (
      <section className="rounded-3xl bg-white p-8 text-center shadow-sm">
        Đang tải hồ sơ khách hàng...
      </section>
    );
  }

  if (!customer || orders.length === 0) {
    return (
      <section className="rounded-3xl bg-white p-8 text-center shadow-sm">
        <h1 className="text-2xl font-black">
          Không tìm thấy khách hàng
        </h1>

        {error && (
          <p className="mt-3 text-sm font-semibold text-[#a43c12]">
            {error}
          </p>
        )}

        <Link
          to="/admin/khach-hang"
          className="mt-5 inline-flex rounded-xl bg-[#006397] px-5 py-3 font-bold text-white"
        >
          Quay lại danh sách
        </Link>
      </section>
    );
  }

  const latestOrder = orders[0]!;
  const address = [
    customer.addressDetail,
    customer.ward,
    customer.district,
    customer.province,
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section>
      <Link
        to="/admin/khach-hang"
        className="text-sm font-bold text-[#006397]"
      >
        ← Quay lại khách hàng
      </Link>

      <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#006397]">
            Hồ sơ khách hàng
          </p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">
            {customer.fullName}
          </h1>
          <p className="mt-3 font-bold text-[#3f4850]">
            {customer.phone}
          </p>
        </div>

        <p className="rounded-full bg-[#edf4ff] px-4 py-2 text-sm font-bold text-[#006397]">
          Đơn gần nhất: {formatDate(customer.lastOrderAt)}
        </p>
      </div>

      {error && (
        <p className="mt-5 rounded-2xl bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[#a43c12]">
          {error}
        </p>
      )}

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-[#707881]">
            Tổng đơn
          </p>
          <p className="mt-3 text-3xl font-black">
            {customer.totalOrders}
          </p>
        </article>

        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-[#707881]">
            Đơn thành công
          </p>
          <p className="mt-3 text-3xl font-black text-[#14633d]">
            {customer.completedOrders}
          </p>
        </article>

        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-[#707881]">
            Đơn đã hủy
          </p>
          <p className="mt-3 text-3xl font-black text-[#a43c12]">
            {customer.cancelledOrders}
          </p>
        </article>

        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-[#707881]">
            Tổng đã mua
          </p>
          <p className="mt-3 text-3xl font-black text-[#006397]">
            {formatCurrency(customer.completedRevenue)}
          </p>
        </article>
      </div>

      <div className="mt-6 grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px]">
        <article className="overflow-hidden rounded-3xl bg-white shadow-sm">
          <div className="border-b border-[#edf0f3] p-5">
            <h2 className="text-xl font-black">
              Lịch sử đơn hàng
            </h2>
          </div>

          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead className="bg-[#edf4ff] text-[#3f4850]">
                <tr>
                  <th className="px-5 py-4">Mã đơn</th>
                  <th className="px-5 py-4">Sản phẩm</th>
                  <th className="px-5 py-4">Tổng tiền</th>
                  <th className="px-5 py-4">Trạng thái</th>
                  <th className="px-5 py-4">Ngày tạo</th>
                  <th className="px-5 py-4 text-right">
                    Chi tiết
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-[#edf0f3]">
                {orders.map((order) => (
                  <tr
                    key={order.id}
                    className="hover:bg-[#fafcff]"
                  >
                    <td className="px-5 py-4 font-black text-[#006397]">
                      {order.code}
                    </td>

                    <td className="px-5 py-4">
                      {order.itemQuantity}
                    </td>

                    <td className="px-5 py-4 font-bold">
                      {formatCurrency(order.total)}
                    </td>

                    <td className="px-5 py-4">
                      <span
                        className={`inline-flex rounded-full px-3 py-1 text-xs font-bold ${
                          statusClasses[order.status]
                        }`}
                      >
                        {statusLabels[order.status]}
                      </span>
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-[#3f4850]">
                      {formatDate(order.createdAt)}
                    </td>

                    <td className="px-5 py-4 text-right">
                      <Link
                        to={`/admin/don-hang/${order.code}`}
                        className="font-bold text-[#006397]"
                      >
                        Mở đơn
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </article>

        <aside className="space-y-6">
          <article className="rounded-3xl bg-white p-6 shadow-sm">
            <h2 className="text-xl font-black">
              Thông tin gần nhất
            </h2>

            <dl className="mt-5 space-y-4 text-sm">
              <div>
                <dt className="text-[#707881]">Họ tên</dt>
                <dd className="mt-1 font-bold">
                  {customer.fullName}
                </dd>
              </div>

              <div>
                <dt className="text-[#707881]">
                  Số điện thoại
                </dt>
                <dd className="mt-1 font-bold">
                  {customer.phone}
                </dd>
              </div>

              {customer.email && (
                <div>
                  <dt className="text-[#707881]">Email</dt>
                  <dd className="mt-1 font-bold">
                    {customer.email}
                  </dd>
                </div>
              )}

              <div>
                <dt className="text-[#707881]">Địa chỉ</dt>
                <dd className="mt-1 leading-6">
                  {address || "Chưa có địa chỉ"}
                </dd>
              </div>

              {latestOrder.note && (
                <div>
                  <dt className="text-[#707881]">
                    Ghi chú đơn gần nhất
                  </dt>
                  <dd className="mt-1 leading-6">
                    {latestOrder.note}
                  </dd>
                </div>
              )}
            </dl>
          </article>

          <article className="rounded-3xl bg-[#203243] p-6 text-white shadow-sm">
            <p className="text-sm font-bold text-[#b9cada]">
              Ghi chú
            </p>
            <p className="mt-3 text-sm leading-6 text-[#e6eef5]">
              Khách hàng được nhận diện theo số điện thoại.
              Website không yêu cầu khách tạo tài khoản.
            </p>
          </article>
        </aside>
      </div>
    </section>
  );
}