import { useSettings } from "../../features/settings/SettingsContext";

function ArrowIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 12h14" />
      <path d="m13 6 6 6-6 6" />
    </svg>
  );
}

function MessageIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M5 5h14v10H9l-4 4V5Z" />
      <path d="M8 9h8" />
      <path d="M8 12h5" />
    </svg>
  );
}

export default function CustomPrintPage() {
  const { settings, loading } = useSettings();
  const messengerUrl = settings.messengerUrl || "#";

  const steps = [
    {
      title: settings.customPrintStep1Title,
      description: settings.customPrintStep1Description,
    },
    {
      title: settings.customPrintStep2Title,
      description: settings.customPrintStep2Description,
    },
    {
      title: settings.customPrintStep3Title,
      description: settings.customPrintStep3Description,
    },
  ];

  return (
    <main className="storefront-page storefront-custom-page pb-20">
      <section className="border-b border-[rgba(88,63,80,0.06)] bg-[linear-gradient(135deg,#fff8f2_0%,#fff0f5_54%,#f2edff_100%)]">
        <div className="sf-container grid min-h-[540px] items-center gap-10 py-12 lg:grid-cols-[minmax(0,1.02fr)_minmax(390px,0.98fr)] lg:py-16">
          <div>
            <span className="inline-flex items-center gap-2 text-[11px] font-black uppercase tracking-[0.16em] text-[var(--sf-pink-strong)]">
              <span className="h-2 w-2 rounded-full bg-[var(--sf-pink)] shadow-[0_0_0_5px_rgba(255,95,143,0.10)]" />
              In theo yêu cầu
            </span>

            <h1 className="mt-5 max-w-3xl text-4xl font-black tracking-[-0.06em] text-[var(--sf-ink)] sm:text-5xl lg:text-6xl">
              {settings.customPrintTitle}
            </h1>

            <p className="mt-5 max-w-2xl text-base leading-7 text-[var(--sf-ink-soft)]">
              {settings.customPrintDescription}
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href={messengerUrl}
                target="_blank"
                rel="noreferrer"
                onClick={(event) => {
                  if (!settings.messengerUrl) {
                    event.preventDefault();
                  }
                }}
                className="sf-button sf-button--primary"
              >
                <MessageIcon />
                {loading
                  ? "Đang tải thông tin..."
                  : settings.customPrintButtonText}
              </a>

              <a
                href="#quy-trinh"
                className="sf-button border border-[var(--sf-border)] bg-white text-[var(--sf-ink)] shadow-[0_8px_22px_rgba(86,53,74,0.06)] transition hover:-translate-y-0.5 hover:border-[rgba(255,95,143,0.28)] hover:text-[var(--sf-pink-strong)]"
              >
                Xem quy trình
                <ArrowIcon />
              </a>
            </div>

            {!settings.messengerUrl && !loading && (
              <p
                className="mt-4 max-w-xl rounded-2xl border border-[rgba(214,117,80,0.18)] bg-[#fff5ed] px-4 py-3 text-sm font-semibold text-[#884426]"
                role="status"
              >
                Link Messenger chưa được thiết lập trong trang quản trị.
              </p>
            )}
          </div>

          <div
            className="relative min-h-[390px] overflow-hidden rounded-[38px] border border-white/80 bg-[radial-gradient(circle_at_26%_24%,rgba(255,255,255,0.94),transparent_10rem),radial-gradient(circle_at_76%_72%,rgba(223,247,236,0.92),transparent_13rem),linear-gradient(145deg,#ffddea,#eee5ff)] shadow-[0_28px_70px_rgba(86,53,74,0.14)]"
            aria-hidden="true"
          >
            <span className="absolute left-[9%] top-[12%] text-5xl text-white">
              ✦
            </span>
            <span className="absolute right-[10%] top-[12%] text-5xl text-[var(--sf-pink)]">
              ♡
            </span>

            <div className="absolute left-1/2 top-1/2 grid h-56 w-56 -translate-x-1/2 -translate-y-1/2 -rotate-6 place-items-center rounded-[42%_58%_62%_38%/52%_40%_60%_48%] border-[18px] border-white/70 bg-[linear-gradient(145deg,#ffd4e4,#eee2ff_48%,#dff7ec)] shadow-[0_28px_58px_rgba(86,53,74,0.18)]">
              <div className="flex items-center gap-3 text-[var(--sf-ink)]">
                <strong className="text-4xl font-black tracking-[-0.08em]">
                  3D
                </strong>
                <span className="text-4xl font-black text-[var(--sf-pink)]">
                  +
                </span>
                <strong className="text-4xl font-black tracking-[-0.08em]">
                  YOU
                </strong>
              </div>
            </div>

            <span className="absolute bottom-[14%] left-[8%] rounded-full border border-white/80 bg-white/85 px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-[var(--sf-ink)] shadow-lg backdrop-blur">
              one of one
            </span>

            <span className="absolute right-[7%] top-[24%] rounded-full border border-white/80 bg-white/85 px-5 py-3 text-xs font-black uppercase tracking-[0.1em] text-[var(--sf-ink)] shadow-lg backdrop-blur">
              your idea
            </span>
          </div>
        </div>
      </section>

      <section
        id="quy-trinh"
        className="sf-container scroll-mt-32 pt-12 sm:pt-16"
      >
        <div className="rounded-[36px] border border-[rgba(88,63,80,0.07)] bg-white p-6 shadow-[0_20px_54px_rgba(86,53,74,0.08)] sm:p-9">
          <div className="max-w-2xl">
            <p className="text-[11px] font-black uppercase tracking-[0.16em] text-[var(--sf-pink-strong)]">
              Từ ý tưởng đến sản phẩm
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-[-0.045em] text-[var(--sf-ink)] sm:text-4xl">
              Ba bước gọn gàng, dễ trao đổi ♡
            </h2>
            <p className="mt-3 text-sm leading-6 text-[var(--sf-ink-soft)]">
              Không cần biết dựng 3D. Bạn chỉ cần gửi ý tưởng, phần còn lại cùng InGiDay trao đổi từng bước.
            </p>
          </div>

          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {steps.map((step, index) => (
              <article
                key={`${step.title}-${index}`}
                className="relative min-w-0 overflow-hidden rounded-[28px] border border-[rgba(88,63,80,0.06)] bg-[#fcfaf9] p-6"
              >
                <span className="absolute -right-8 -top-8 h-28 w-28 rounded-full border-2 border-white" />

                <span className="relative grid h-12 w-12 place-items-center rounded-2xl bg-[var(--sf-pink-soft)] text-sm font-black text-[var(--sf-pink-strong)]">
                  0{index + 1}
                </span>

                <h3 className="relative mt-6 text-xl font-black tracking-[-0.03em] text-[var(--sf-ink)]">
                  {step.title}
                </h3>

                <p className="relative mt-3 text-sm leading-6 text-[var(--sf-ink-soft)]">
                  {step.description}
                </p>
              </article>
            ))}
          </div>

          <div className="mt-7 flex flex-col items-start justify-between gap-5 rounded-[26px] bg-[linear-gradient(135deg,var(--sf-pink-wash),#fff8f2)] p-5 sm:flex-row sm:items-center sm:p-6">
            <div>
              <p className="font-black text-[var(--sf-ink)]">
                Có một ý tưởng đang chờ được in thành hình?
              </p>
              <p className="mt-1 text-sm leading-6 text-[var(--sf-ink-soft)]">
                Gửi hình tham khảo hoặc mô tả ngắn để bắt đầu trao đổi.
              </p>
            </div>

            <a
              href={messengerUrl}
              target="_blank"
              rel="noreferrer"
              onClick={(event) => {
                if (!settings.messengerUrl) {
                  event.preventDefault();
                }
              }}
              className="sf-button sf-button--primary shrink-0"
            >
              {loading
                ? "Đang tải thông tin..."
                : settings.customPrintButtonText}
              <ArrowIcon />
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
