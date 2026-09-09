import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import type { LocalOrder } from "../../types/cart";
import { formatCurrency } from "../../utils/currency";

function readLastOrder(): LocalOrder | null {
  try {
    const raw = sessionStorage.getItem("ingiday-last-order");
    return raw ? (JSON.parse(raw) as LocalOrder) : null;
  } catch {
    return null;
  }
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export default function OrderSuccessPage() {
  const [searchParams] = useSearchParams();
  const [order] = useState<LocalOrder | null>(readLastOrder);
  const code = searchParams.get("ma") ?? order?.code ?? "";

  return (
    <main className="storefront-page storefront-success-page sf-container py-10 sm:py-16">
      <section className="relative overflow-hidden rounded-[38px] border border-[rgba(88,63,80,0.07)] bg-[radial-gradient(circle_at_12%_12%,rgba(255,231,239,0.88),transparent_18rem),radial-gradient(circle_at_90%_88%,rgba(223,247,236,0.86),transparent_18rem),#fff] px-5 py-10 text-center shadow-[0_24px_70px_rgba(86,53,74,0.10)] sm:px-10 sm:py-14">
        <span
          className="pointer-events-none absolute left-[8%] top-[16%] text-4xl text-[#b49cff]"
          aria-hidden="true"
        >
          ✦
        </span>
        <span
          className="pointer-events-none absolute right-[9%] top-[18%] text-4xl text-[var(--sf-pink)]"
          aria-hidden="true"
        >
          ♡
        </span>

        <div className="mx-auto grid h-24 w-24 place-items-center rounded-[32px] border border-white/80 bg-[#e3f8ee] text-5xl text-[#24835b] shadow-[0_16px_36px_rgba(52,145,98,0.14)]">
          ✓
        </div>

        <p className="mt-7 text-[11px] font-black uppercase tracking-[0.17em] text-[#24835b]">
          Đặt hàng thành công
        </p>

        <h1 className="mx-auto mt-3 max-w-2xl text-4xl font-black tracking-[-0.055em] text-[var(--sf-ink)] sm:text-5xl">
          InGiDay đã nhận được đơn hàng ♡
        </h1>

        <p className="mx-auto mt-4 max-w-2xl text-sm leading-7 text-[var(--sf-ink-soft)] sm:text-base">
          Shop sẽ kiểm tra thông tin và liên hệ xác nhận trước khi gửi hàng.
        </p>

        {code && (
          <div className="mx-auto mt-7 max-w-md rounded-[24px] border border-[rgba(255,95,143,0.14)] bg-[var(--sf-pink-wash)] p-5">
            <p className="text-xs font-bold text-[var(--sf-ink-soft)]">
              Mã đơn hàng
            </p>
            <strong className="mt-2 block text-2xl font-black tracking-[0.12em] text-[var(--sf-pink-strong)] sm:text-3xl">
              {code}
            </strong>
            <p className="mt-2 text-xs leading-5 text-[var(--sf-ink-soft)]">
              Bạn có thể lưu mã này để tiện trao đổi với shop.
            </p>
          </div>
        )}

        {order && order.code === code && (
          <div className="mx-auto mt-7 max-w-xl rounded-[28px] border border-[var(--sf-border)] bg-white/80 p-5 text-left shadow-[0_12px_30px_rgba(86,53,74,0.05)] backdrop-blur sm:p-6">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[var(--sf-pink-strong)]">
                Đơn hàng của bạn
              </p>
              <h2 className="mt-2 text-xl font-black tracking-[-0.03em] text-[var(--sf-ink)]">
                Thông tin xác nhận
              </h2>
            </div>

            <dl className="mt-5 space-y-4 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--sf-ink-soft)]">
                  Người nhận
                </dt>
                <dd className="text-right font-black text-[var(--sf-ink)]">
                  {order.customer.fullName}
                </dd>
              </div>

              <div className="flex justify-between gap-4">
                <dt className="text-[var(--sf-ink-soft)]">
                  Số điện thoại
                </dt>
                <dd className="text-right font-black text-[var(--sf-ink)]">
                  {order.customer.phone}
                </dd>
              </div>

              <div className="flex justify-between gap-4">
                <dt className="text-[var(--sf-ink-soft)]">
                  Thanh toán
                </dt>
                <dd className="text-right font-black text-[var(--sf-ink)]">
                  COD
                </dd>
              </div>

              <div className="flex justify-between gap-4 border-t border-[var(--sf-border)] pt-4">
                <dt className="font-black text-[var(--sf-ink)]">
                  Tổng tiền
                </dt>
                <dd className="text-lg font-black text-[var(--sf-pink-strong)]">
                  {formatCurrency(order.total)}
                </dd>
              </div>
            </dl>
          </div>
        )}

        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link
            to="/san-pham"
            className="sf-button sf-button--primary"
          >
            Tiếp tục mua sắm
            <ArrowIcon />
          </Link>

          <Link
            to="/"
            className="sf-button border border-[var(--sf-border)] bg-white text-[var(--sf-ink)] shadow-[0_8px_22px_rgba(86,53,74,0.06)] transition hover:-translate-y-0.5 hover:border-[rgba(255,95,143,0.28)] hover:text-[var(--sf-pink-strong)]"
          >
            Về trang chủ
          </Link>
        </div>
      </section>
    </main>
  );
}
