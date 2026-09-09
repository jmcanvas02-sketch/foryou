/* eslint-disable react-hooks/set-state-in-effect */
import {
  useEffect,
  useState,
} from "react";
import type { FormEvent } from "react";

import PolicyArticle from "../../components/policies/PolicyArticle";
import {
  fetchAdminPolicies,
  updateSitePolicy,
} from "../../services/policies";
import type { SitePolicy } from "../../types/policy";

function clonePolicy(policy: SitePolicy) {
  return {
    ...policy,
  };
}

export default function PoliciesAdminPage() {
  const [policies, setPolicies] = useState<
    SitePolicy[]
  >([]);
  const [selectedSlug, setSelectedSlug] =
    useState("");
  const [draft, setDraft] =
    useState<SitePolicy | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function loadPolicies() {
    setLoading(true);
    setError("");

    try {
      const result =
        await fetchAdminPolicies();

      setPolicies(result);

      const firstPolicy =
        result.find(
          (item) =>
            item.slug === selectedSlug,
        ) ?? result[0];

      if (firstPolicy) {
        setSelectedSlug(firstPolicy.slug);
        setDraft(clonePolicy(firstPolicy));
      }
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Không thể tải chính sách.",
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadPolicies();
  }, []);

  function selectPolicy(slug: string) {
    const policy = policies.find(
      (item) => item.slug === slug,
    );

    if (!policy) {
      return;
    }

    setSelectedSlug(slug);
    setDraft(clonePolicy(policy));
    setError("");
    setMessage("");
  }

  async function handleSubmit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!draft) {
      return;
    }

    if (!draft.title.trim()) {
      setError(
        "Vui lòng nhập tiêu đề chính sách.",
      );
      return;
    }

    if (!draft.content.trim()) {
      setError(
        "Vui lòng nhập nội dung chính sách.",
      );
      return;
    }

    setSaving(true);
    setError("");
    setMessage("");

    const result = await updateSitePolicy(
      draft.slug,
      {
        title: draft.title,
        content: draft.content,
        seoTitle: draft.seoTitle,
        seoDescription:
          draft.seoDescription,
        active: draft.active,
      },
    );

    setSaving(false);

    if (!result.success || !result.data) {
      setError(result.message);
      return;
    }

    const updated = result.data;

    setPolicies((current) =>
      current.map((item) =>
        item.slug === updated.slug
          ? updated
          : item,
      ),
    );
    setDraft(clonePolicy(updated));
    setMessage("Đã lưu chính sách.");
  }

  if (loading) {
    return (
      <section className="p-6">
        <div className="h-10 w-64 animate-pulse rounded bg-[#eaf0f6]" />
        <div className="mt-7 h-[680px] animate-pulse rounded-3xl bg-[#eaf0f6]" />
      </section>
    );
  }

  return (
    <section className="p-4 sm:p-6 lg:p-7">
      <div>
        <p className="text-sm font-bold uppercase tracking-[0.18em] text-[#006397]">
          Nội dung website
        </p>
        <h1 className="mt-2 text-3xl font-black">
          Chính sách
        </h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[#707881]">
          Soạn nội dung và xem trước trước khi
          công bố.
        </p>
      </div>

      {error && (
        <p
          className="mt-5 rounded-2xl bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[#a43c12]"
          role="alert"
        >
          {error}
        </p>
      )}

      {message && (
        <p className="mt-5 rounded-2xl bg-[#dcf8eb] px-4 py-3 text-sm font-semibold text-[#14633d]">
          {message}
        </p>
      )}

      <div className="mt-7 grid gap-6 xl:grid-cols-[240px_minmax(0,1fr)]">
        <aside className="h-fit rounded-3xl bg-white p-3 shadow-sm xl:sticky xl:top-5">
          <p className="px-3 pb-3 pt-2 text-xs font-black uppercase tracking-[0.18em] text-[#707881]">
            Trang chính sách
          </p>

          <div className="space-y-2">
            {policies.map((policy) => (
              <button
                key={policy.slug}
                type="button"
                onClick={() =>
                  selectPolicy(policy.slug)
                }
                className={`w-full rounded-2xl px-4 py-3 text-left transition ${
                  selectedSlug === policy.slug
                    ? "bg-[#006397] text-white"
                    : "hover:bg-[#edf4ff]"
                }`}
              >
                <span className="block font-bold">
                  {policy.title}
                </span>
                <span
                  className={`mt-1 block text-xs ${
                    selectedSlug === policy.slug
                      ? "text-[#dceeff]"
                      : "text-[#707881]"
                  }`}
                >
                  {policy.active
                    ? "Đang hiển thị"
                    : "Đang ẩn"}
                </span>
              </button>
            ))}
          </div>
        </aside>

        {draft ? (
          <div className="grid min-w-0 gap-6 2xl:grid-cols-[minmax(0,1fr)_minmax(420px,0.9fr)]">
            <form
              onSubmit={handleSubmit}
              className="min-w-0 rounded-3xl bg-white p-5 shadow-sm sm:p-7"
            >
              <div className="rounded-2xl border border-[#dce8f2] bg-[#f4f9fd] p-4 text-sm leading-6 text-[#46525c]">
                <p className="font-black text-[#006397]">
                  Quy tắc định dạng
                </p>
                <p className="mt-2">
                  Mỗi mục bắt đầu bằng{" "}
                  <code className="rounded bg-white px-2 py-1 font-bold">
                    ## Tiêu đề
                  </code>
                  . Để trống một dòng giữa các
                  đoạn. Danh sách dùng{" "}
                  <code className="rounded bg-white px-2 py-1 font-bold">
                    - Nội dung
                  </code>
                  .
                </p>
              </div>

              <div className="mt-6 grid gap-5">
                <label className="text-sm font-bold">
                  Tiêu đề
                  <input
                    value={draft.title}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              title:
                                event.target
                                  .value,
                            }
                          : current,
                      )
                    }
                    className="mt-2 h-12 w-full rounded-2xl border border-[#cfd6dd] bg-[#f7f9ff] px-4 font-normal outline-none focus:border-[#006397]"
                  />
                </label>

                <label className="text-sm font-bold">
                  Nội dung
                  <textarea
                    value={draft.content}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              content:
                                event.target
                                  .value,
                            }
                          : current,
                      )
                    }
                    className="mt-2 min-h-[520px] w-full resize-y rounded-2xl border border-[#cfd6dd] bg-[#f7f9ff] p-4 font-normal leading-7 outline-none focus:border-[#006397]"
                  />
                </label>

                <label className="text-sm font-bold">
                  Tiêu đề SEO
                  <input
                    value={draft.seoTitle}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              seoTitle:
                                event.target
                                  .value,
                            }
                          : current,
                      )
                    }
                    className="mt-2 h-12 w-full rounded-2xl border border-[#cfd6dd] bg-[#f7f9ff] px-4 font-normal outline-none focus:border-[#006397]"
                  />
                </label>

                <label className="text-sm font-bold">
                  Mô tả SEO
                  <textarea
                    value={
                      draft.seoDescription
                    }
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              seoDescription:
                                event.target
                                  .value,
                            }
                          : current,
                      )
                    }
                    className="mt-2 min-h-24 w-full resize-y rounded-2xl border border-[#cfd6dd] bg-[#f7f9ff] p-4 font-normal leading-6 outline-none focus:border-[#006397]"
                  />
                </label>

                <label className="flex items-center gap-3 rounded-2xl bg-[#f7f9ff] p-4 text-sm font-bold">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(event) =>
                      setDraft((current) =>
                        current
                          ? {
                              ...current,
                              active:
                                event.target
                                  .checked,
                            }
                          : current,
                      )
                    }
                    className="h-5 w-5 accent-[#006397]"
                  />
                  Hiển thị trên website
                </label>
              </div>

              <button
                type="submit"
                disabled={saving}
                className="mt-6 min-h-12 rounded-2xl bg-[#fe7e4f] px-7 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              >
                {saving
                  ? "Đang lưu..."
                  : "Lưu chính sách"}
              </button>
            </form>

            <aside className="min-w-0 2xl:sticky 2xl:top-5 2xl:h-fit">
              <div className="rounded-2xl bg-[#10283a] px-5 py-4 text-white">
                <p className="text-xs font-black uppercase tracking-[0.18em] text-[#b9d9ee]">
                  Bản xem trước
                </p>
              </div>

              <div className="mt-3 max-h-[78vh] overflow-y-auto rounded-3xl border border-[#dfe7ed] bg-[#f7fbff] p-4">
                <PolicyArticle
                  policy={draft}
                  preview
                />
              </div>
            </aside>
          </div>
        ) : (
          <div className="rounded-3xl bg-white p-10 text-center text-[#707881]">
            Chưa có chính sách.
          </div>
        )}
      </div>
    </section>
  );
}