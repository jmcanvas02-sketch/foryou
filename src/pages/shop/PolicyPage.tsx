/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import PolicyArticle from "../../components/policies/PolicyArticle";
import {
  POLICY_LINKS,
  getPolicyVisual,
} from "../../components/policies/policyPresentation";
import { usePageMeta } from "../../hooks/usePageMeta";
import { fetchPublicPolicy } from "../../services/policies";
import type { SitePolicy } from "../../types/policy";

type PolicyPageProps = {
  policySlug: string;
};

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

export default function PolicyPage({
  policySlug,
}: PolicyPageProps) {
  const [policy, setPolicy] = useState<SitePolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retryVersion, setRetryVersion] = useState(0);

  usePageMeta({
    title: policy?.seoTitle || "Chính sách | InGiDay",
    description:
      policy?.seoDescription || "Thông tin chính sách của InGiDay.",
    canonicalPath: `/${policySlug}`,
  });

  useEffect(() => {
    let active = true;

    setLoading(true);
    setError("");
    setPolicy(null);

    void fetchPublicPolicy(
      policySlug,
      retryVersion > 0,
    )
      .then((result) => {
        if (active) {
          setPolicy(result);
        }
      })
      .catch((loadError: unknown) => {
        if (active) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Không thể tải chính sách.",
          );
        }
      })
      .finally(() => {
        if (active) {
          setLoading(false);
        }
      });

    return () => {
      active = false;
    };
  }, [policySlug, retryVersion]);

  if (loading) {
    return (
      <main className="storefront-page storefront-policy-page sf-container py-10 sm:py-16" aria-label="Đang tải chính sách">
        <div className="overflow-hidden rounded-[36px] border border-[rgba(88,63,80,0.07)] bg-white shadow-[0_20px_54px_rgba(86,53,74,0.08)]">
          <div className="h-56 animate-pulse bg-[linear-gradient(100deg,#f5eff2_18%,#fff_34%,#f5eff2_50%)] bg-[length:260%_100%]" />

          <div className="space-y-4 p-6 sm:p-10">
            {Array.from({ length: 4 }).map((_item, index) => (
              <div
                key={index}
                className={`h-5 animate-pulse rounded-full bg-[#f0e9ed] ${
                  index === 3 ? "w-3/5" : "w-full"
                }`}
                aria-hidden="true"
              />
            ))}
          </div>
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className="storefront-page storefront-policy-page sf-container py-10 sm:py-16">
        <section className="grid min-h-[460px] place-items-center rounded-[36px] border border-[rgba(214,117,80,0.18)] bg-[radial-gradient(circle_at_50%_0%,rgba(255,231,239,0.86),transparent_18rem),#fff] p-8 text-center shadow-[0_20px_54px_rgba(86,53,74,0.07)]">
          <div>
            <span
              className="text-6xl text-[var(--sf-pink)]"
              aria-hidden="true"
            >
              ♡
            </span>
            <h1 className="mt-5 text-3xl font-black tracking-[-0.045em] text-[var(--sf-ink)] sm:text-4xl">
              Không thể tải chính sách
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--sf-ink-soft)]">
              {error}
            </p>
            <button
              type="button"
              onClick={() =>
                setRetryVersion((current) => current + 1)
              }
              className="sf-button sf-button--primary mt-7"
            >
              Thử lại
            </button>
          </div>
        </section>
      </main>
    );
  }

  if (!policy) {
    return (
      <main className="storefront-page storefront-policy-page sf-container py-10 sm:py-16">
        <section className="grid min-h-[460px] place-items-center rounded-[36px] border border-dashed border-[rgba(255,95,143,0.28)] bg-[radial-gradient(circle_at_50%_0%,rgba(255,231,239,0.86),transparent_18rem),#fff] p-8 text-center shadow-[0_20px_54px_rgba(86,53,74,0.07)]">
          <div>
            <span
              className="text-6xl text-[var(--sf-pink)]"
              aria-hidden="true"
            >
              ?
            </span>
            <h1 className="mt-5 text-3xl font-black tracking-[-0.045em] text-[var(--sf-ink)] sm:text-4xl">
              Chính sách chưa được công bố
            </h1>
            <p className="mx-auto mt-3 max-w-lg text-sm leading-6 text-[var(--sf-ink-soft)]">
              Nội dung này hiện chưa sẵn sàng. Bạn có thể quay lại trang chủ và tiếp tục khám phá cửa hàng.
            </p>
            <Link
              to="/"
              className="sf-button sf-button--primary mt-7"
            >
              Về trang chủ
            </Link>
          </div>
        </section>
      </main>
    );
  }

  const relatedPolicies = POLICY_LINKS.filter(
    (item) => item.slug !== policy.slug,
  );
  const currentVisual = getPolicyVisual(policy.slug);

  return (
    <main className="storefront-page storefront-policy-page pb-20">
      <section className="border-b border-[rgba(88,63,80,0.06)] bg-[linear-gradient(135deg,#fff8f2_0%,#fff1f5_56%,#f5f1ff_100%)]">
        <div className="sf-container py-10 sm:py-14">
          <nav
            className="flex items-center gap-2 text-xs font-semibold text-[var(--sf-ink-soft)]"
            aria-label="Đường dẫn"
          >
            <Link
              to="/"
              className="text-inherit no-underline transition hover:text-[var(--sf-pink-strong)]"
            >
              Trang chủ
            </Link>
            <span>/</span>
            <strong className="min-w-0 truncate text-[var(--sf-ink)]">
              {policy.title}
            </strong>
          </nav>

          <div className="mt-8 flex max-w-4xl items-start gap-5">
            <span
              className="grid h-16 w-16 flex-none place-items-center rounded-[22px] border border-white/80 bg-white/82 text-3xl shadow-[0_12px_30px_rgba(86,53,74,0.08)] backdrop-blur"
              aria-hidden="true"
            >
              {currentVisual.icon}
            </span>

            <div>
              <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--sf-pink-strong)]">
                Thông tin InGiDay
              </p>
              <h1 className="mt-3 text-4xl font-black tracking-[-0.055em] text-[var(--sf-ink)] sm:text-5xl">
                {policy.title}
              </h1>
              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--sf-ink-soft)]">
                Nội dung được công bố trực tiếp từ phần quản trị chính sách của cửa hàng.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="sf-container pt-8">
        <div className="rounded-[34px] border border-[rgba(88,63,80,0.07)] bg-white p-5 shadow-[0_20px_54px_rgba(86,53,74,0.08)] sm:p-8 lg:p-10">
          <PolicyArticle policy={policy} />
        </div>

        <section className="mt-10 rounded-[34px] border border-[rgba(88,63,80,0.07)] bg-white p-5 shadow-[0_18px_48px_rgba(86,53,74,0.07)] sm:p-8">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <p className="text-[10px] font-black uppercase tracking-[0.15em] text-[var(--sf-pink-strong)]">
                Tham khảo thêm
              </p>
              <h2 className="mt-2 text-2xl font-black tracking-[-0.04em] text-[var(--sf-ink)] sm:text-3xl">
                Các chính sách khác
              </h2>
            </div>

            <Link
              to="/san-pham"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border border-[rgba(255,95,143,0.18)] bg-[var(--sf-pink-wash)] px-5 text-sm font-black text-[var(--sf-pink-strong)] no-underline transition hover:-translate-y-0.5 hover:border-[rgba(255,95,143,0.34)]"
            >
              Tiếp tục mua sắm
              <ArrowIcon />
            </Link>
          </div>

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {relatedPolicies.map((item) => {
              const visual = getPolicyVisual(item.slug);

              return (
                <Link
                  key={item.slug}
                  to={`/${item.slug}`}
                  className="group min-w-0 rounded-[24px] border border-[rgba(88,63,80,0.06)] bg-[#fcfaf9] p-5 text-inherit no-underline transition duration-300 ease-out hover:-translate-y-1 hover:border-[rgba(255,95,143,0.16)] hover:shadow-[0_16px_36px_rgba(86,53,74,0.08)]"
                >
                  <span
                    className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--sf-pink-soft)] text-2xl"
                    aria-hidden="true"
                  >
                    {visual.icon}
                  </span>

                  <h3 className="mt-5 text-base font-black tracking-[-0.025em] text-[var(--sf-ink)]">
                    {item.shortLabel}
                  </h3>

                  <p className="mt-2 text-xs leading-5 text-[var(--sf-ink-soft)]">
                    Xem thông tin chi tiết
                  </p>

                  <span className="mt-5 inline-flex items-center gap-2 text-xs font-black text-[var(--sf-pink-strong)]">
                    Xem chính sách
                    <ArrowIcon />
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      </section>
    </main>
  );
}
