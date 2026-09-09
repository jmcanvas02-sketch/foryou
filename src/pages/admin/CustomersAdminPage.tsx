import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  useCustomers,
} from "../../features/customers/CustomersContext";
import { formatCurrency } from "../../utils/currency";

function normalizePhone(value: string) {
  return value.replace(/\D/g, "");
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

export default function CustomersAdminPage() {
  const {
    customers,
    loading,
    error,
    refresh,
  } = useCustomers();

  const [keyword, setKeyword] = useState("");

  const filteredCustomers = useMemo(() => {
    const normalizedText = keyword
      .trim()
      .toLocaleLowerCase("vi");
    const normalizedDigits = normalizePhone(keyword);

    if (!normalizedText) {
      return customers;
    }

    return customers.filter((customer) => {
      const matchesName = customer.fullName
        .toLocaleLowerCase("vi")
        .includes(normalizedText);

      const matchesPhone = normalizedDigits
        ? normalizePhone(customer.phone).includes(
            normalizedDigits,
          )
        : customer.phone
            .toLocaleLowerCase("vi")
            .includes(normalizedText);

      return matchesName || matchesPhone;
    });
  }, [customers, keyword]);

  const returningCustomers = customers.filter(
    (customer) => customer.totalOrders > 1,
  ).length;

  const completedRevenue = customers.reduce(
    (sum, customer) => sum + customer.completedRevenue,
    0,
  );

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#006397]">
            Khách hàng
          </p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">
            Quản lý khách hàng
          </h1>
          <p className="mt-3 text-sm text-[#707881]">
            Dữ liệu được tổng hợp trực tiếp từ đơn hàng trên
            Supabase theo số điện thoại.
          </p>
        </div>

        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl bg-[#edf4ff] px-4 py-3 text-sm font-bold text-[#006397]"
        >
          Làm mới
        </button>
      </div>

      {error && (
        <p className="mt-5 rounded-2xl bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[#a43c12]">
          {error}
        </p>
      )}

      <div className="mt-7 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-[#707881]">
            Tổng khách hàng
          </p>
          <p className="mt-3 text-3xl font-black text-[#091d2e]">
            {customers.length}
          </p>
        </article>

        <article className="rounded-3xl bg-white p-5 shadow-sm">
          <p className="text-sm font-bold text-[#707881]">
            Khách quay lại
          </p>
          <p className="mt-3 text-3xl font-black text-[#006397]">
            {returningCustomers}
          </p>
        </article>

        <article className="rounded-3xl bg-white p-5 shadow-sm sm:col-span-2 xl:col-span-1">
          <p className="text-sm font-bold text-[#707881]">
            Tổng tiền đơn thành công
          </p>
          <p className="mt-3 text-3xl font-black text-[#14633d]">
            {formatCurrency(completedRevenue)}
          </p>
        </article>
      </div>

      <div className="mt-6 rounded-3xl bg-white p-4 shadow-sm">
        <input
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
          className="h-12 w-full rounded-2xl border border-[#d7dee6] px-4 outline-none focus:border-[#006397]"
          placeholder="Tìm theo tên hoặc số điện thoại"
        />
      </div>

      <div className="mt-6 overflow-hidden rounded-3xl bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-sm">
            <thead className="bg-[#edf4ff] text-[#3f4850]">
              <tr>
                <th className="px-5 py-4">Khách hàng</th>
                <th className="px-5 py-4">Khu vực</th>
                <th className="px-5 py-4">Tổng đơn</th>
                <th className="px-5 py-4">Đơn mới</th>
                <th className="px-5 py-4">Thành công</th>
                <th className="px-5 py-4">Đã hủy</th>
                <th className="px-5 py-4">Tổng đã mua</th>
                <th className="px-5 py-4">Đơn gần nhất</th>
                <th className="px-5 py-4 text-right">
                  Thao tác
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#edf0f3]">
              {loading && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-12 text-center text-[#707881]"
                  >
                    Đang tải khách hàng...
                  </td>
                </tr>
              )}

              {!loading &&
                filteredCustomers.map((customer) => (
                  <tr
                    key={customer.phone}
                    className="hover:bg-[#fafcff]"
                  >
                    <td className="px-5 py-4">
                      <p className="font-black text-[#091d2e]">
                        {customer.fullName}
                      </p>
                      <p className="mt-1 text-xs text-[#707881]">
                        {customer.phone}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-[#3f4850]">
                      {customer.province || "—"}
                    </td>

                    <td className="px-5 py-4 font-bold">
                      {customer.totalOrders}
                    </td>

                    <td className="px-5 py-4 font-bold text-[#006397]">
                      {customer.newOrders}
                    </td>

                    <td className="px-5 py-4 font-bold text-[#14633d]">
                      {customer.completedOrders}
                    </td>

                    <td className="px-5 py-4 font-bold text-[#a43c12]">
                      {customer.cancelledOrders}
                    </td>

                    <td className="px-5 py-4 font-bold">
                      {formatCurrency(customer.completedRevenue)}
                    </td>

                    <td className="whitespace-nowrap px-5 py-4 text-[#3f4850]">
                      <p className="font-bold text-[#006397]">
                        {customer.lastOrderCode}
                      </p>
                      <p className="mt-1 text-xs text-[#707881]">
                        {formatDate(customer.lastOrderAt)}
                      </p>
                    </td>

                    <td className="px-5 py-4 text-right">
                      <Link
                        to={`/admin/khach-hang/${encodeURIComponent(
                          customer.phone,
                        )}`}
                        className="inline-flex rounded-xl bg-[#edf4ff] px-4 py-2 font-bold text-[#006397]"
                      >
                        Lịch sử
                      </Link>
                    </td>
                  </tr>
                ))}

              {!loading && filteredCustomers.length === 0 && (
                <tr>
                  <td
                    colSpan={9}
                    className="px-5 py-12 text-center text-[#707881]"
                  >
                    Không tìm thấy khách hàng phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}