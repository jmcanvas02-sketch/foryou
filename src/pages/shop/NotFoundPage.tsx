import { useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import { usePageMeta } from "../../hooks/usePageMeta";

function SearchIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="11" cy="11" r="6.5" />
      <path d="m16 16 4 4" />
    </svg>
  );
}

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export default function NotFoundPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");

  usePageMeta({
    title: "Không tìm thấy trang | InGiDay",
    description: "Trang bạn đang tìm không tồn tại trên InGiDay.",
  });

  function handleSearch(event: FormEvent) {
    event.preventDefault();

    const normalizedQuery = query.trim();

    navigate(
      normalizedQuery
        ? `/san-pham?q=${encodeURIComponent(normalizedQuery)}`
        : "/san-pham",
    );
  }

  return (
    <main className="storefront-page storefront-not-found-page sf-container py-10 sm:py-16">
      <section className="relative grid min-h-[560px] place-items-center overflow-hidden rounded-[38px] border border-[rgba(88,63,80,0.07)] bg-[radial-gradient(circle_at_12%_12%,rgba(255,231,239,0.9),transparent_18rem),radial-gradient(circle_at_88%_88%,rgba(223,247,236,0.88),transparent_18rem),#fff] p-6 text-center shadow-[0_24px_70px_rgba(86,53,74,0.10)] sm:p-10">
        <span
          className="pointer-events-none absolute left-[8%] top-[14%] text-5xl text-[#b49cff]"
          aria-hidden="true"
        >
          ✦
        </span>
        <span
          className="pointer-events-none absolute right-[9%] top-[16%] text-5xl text-[var(--sf-pink)]"
          aria-hidden="true"
        >
          ♡
        </span>

        <div className="w-full max-w-2xl">
          <div
            className="mx-auto grid h-28 w-28 place-items-center rounded-[36px] border border-white/80 bg-[linear-gradient(145deg,#ffddea,#eee5ff)] text-4xl font-black tracking-[-0.06em] text-[var(--sf-ink)] shadow-[0_18px_44px_rgba(86,53,74,0.14)]"
            aria-hidden="true"
          >
            404
          </div>

          <p className="mt-7 text-[11px] font-black uppercase tracking-[0.17em] text-[var(--sf-pink-strong)]">
            Lỗi 404
          </p>

          <h1 className="mt-3 text-4xl font-black tracking-[-0.055em] text-[var(--sf-ink)] sm:text-5xl">
            Trang này đi lạc mất rồi ♡
          </h1>

          <p className="mx-auto mt-4 max-w-xl text-sm leading-7 text-[var(--sf-ink-soft)] sm:text-base">
            Đường dẫn có thể đã thay đổi hoặc không còn tồn tại. Hãy tìm sản phẩm khác hoặc quay lại cửa hàng.
          </p>

          <form
            onSubmit={handleSearch}
            className="mx-auto mt-7 flex max-w-xl items-center gap-2 rounded-full border border-[var(--sf-border)] bg-[#faf6f8] p-2 pl-4 shadow-[0_12px_30px_rgba(86,53,74,0.06)] transition focus-within:border-[rgba(255,95,143,0.42)] focus-within:bg-white focus-within:shadow-[0_0_0_5px_rgba(255,95,143,0.08)]"
          >
            <SearchIcon />

            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="h-11 min-w-0 flex-1 border-0 bg-transparent px-1 text-[var(--sf-ink)] outline-none placeholder:text-[#9a909b]"
              placeholder="Tìm sản phẩm..."
              aria-label="Tìm sản phẩm"
            />

            <button
              type="submit"
              className="min-h-11 shrink-0 rounded-full bg-[var(--sf-pink)] px-5 text-sm font-black text-white shadow-[0_8px_20px_rgba(255,95,143,0.22)] transition hover:bg-[var(--sf-pink-strong)]"
            >
              Tìm kiếm
            </button>
          </form>

          <div className="mt-7 flex flex-wrap justify-center gap-3">
            <Link
              to="/"
              className="sf-button border border-[var(--sf-border)] bg-white text-[var(--sf-ink)] shadow-[0_8px_22px_rgba(86,53,74,0.06)] transition hover:-translate-y-0.5 hover:border-[rgba(255,95,143,0.28)] hover:text-[var(--sf-pink-strong)]"
            >
              Về trang chủ
            </Link>

            <Link
              to="/san-pham"
              className="sf-button sf-button--primary"
            >
              Xem tất cả sản phẩm
              <ArrowIcon />
            </Link>
          </div>
        </div>
      </section>
    </main>
  );
}
