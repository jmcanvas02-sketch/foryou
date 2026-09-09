import { useMemo } from "react";

import type { SitePolicy } from "../../types/policy";
import {
  getPolicyVisual,
} from "./policyPresentation";

type PolicySection = {
  id: string;
  title: string;
  blocks: string[];
};

type PolicyArticleProps = {
  policy: SitePolicy;
  preview?: boolean;
};

function createAnchor(
  value: string,
  index: number,
) {
  const normalized = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  return `${normalized || "muc"}-${index + 1}`;
}

function parsePolicyContent(
  content: string,
): PolicySection[] {
  const lines = content
    .replace(/\r\n?/g, "\n")
    .split("\n");

  const sections: PolicySection[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  function flushSection() {
    const blocks: string[] = [];
    let paragraph: string[] = [];
    let bullets: string[] = [];

    function flushParagraph() {
      if (paragraph.length === 0) {
        return;
      }

      blocks.push(paragraph.join(" ").trim());
      paragraph = [];
    }

    function flushBullets() {
      if (bullets.length === 0) {
        return;
      }

      blocks.push(bullets.join("\n"));
      bullets = [];
    }

    currentLines.forEach((rawLine) => {
      const line = rawLine.trim();

      if (!line) {
        flushParagraph();
        flushBullets();
        return;
      }

      if (/^[-•]\s+/.test(line)) {
        flushParagraph();
        bullets.push(line);
        return;
      }

      flushBullets();
      paragraph.push(line);
    });

    flushParagraph();
    flushBullets();

    if (!currentTitle && blocks.length === 0) {
      currentLines = [];
      return;
    }

    const title =
      currentTitle || "Thông tin chung";

    sections.push({
      id: createAnchor(
        title,
        sections.length,
      ),
      title,
      blocks,
    });

    currentTitle = "";
    currentLines = [];
  }

  lines.forEach((rawLine) => {
    const line = rawLine.trim();
    const headingMatch = line.match(
      /^##\s+(.+?)\s*$/,
    );

    if (headingMatch) {
      if (
        currentTitle ||
        currentLines.some(
          (item) => item.trim() !== "",
        )
      ) {
        flushSection();
      }

      currentTitle = headingMatch[1];
      return;
    }

    currentLines.push(rawLine);
  });

  if (
    currentTitle ||
    currentLines.some(
      (item) => item.trim() !== "",
    )
  ) {
    flushSection();
  }

  return sections;
}

function ContentBlock({
  block,
}: {
  block: string;
}) {
  const lines = block
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const isBulletList =
    lines.length > 0 &&
    lines.every((line) =>
      /^[-•]\s+/.test(line),
    );

  if (isBulletList) {
    return (
      <ul className="space-y-3">
        {lines.map((line, index) => (
          <li
            key={`${line}-${index}`}
            className="flex items-start gap-3 text-[15px] leading-7 text-[#46525c] sm:text-base"
          >
            <span
              aria-hidden="true"
              className="mt-[10px] h-1.5 w-1.5 shrink-0 rounded-full bg-[#006397]"
            />
            <span>
              {line.replace(/^[-•]\s+/, "")}
            </span>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <p className="text-[15px] leading-8 text-[#46525c] sm:text-base">
      {block}
    </p>
  );
}

export default function PolicyArticle({
  policy,
  preview = false,
}: PolicyArticleProps) {
  const sections = useMemo(
    () => parsePolicyContent(policy.content),
    [policy.content],
  );
  const visual = getPolicyVisual(policy.slug);
  const updatedAt = new Intl.DateTimeFormat(
    "vi-VN",
    {
      dateStyle: "long",
    },
  ).format(new Date(policy.updatedAt));

  return (
    <div className="space-y-7">
      <header
        className={`relative overflow-hidden border border-white/70 ${
          preview
            ? "rounded-3xl px-5 py-6"
            : "rounded-[30px] px-6 py-8 sm:px-9 sm:py-10"
        }`}
        style={{
          background: visual.gradient,
        }}
      >
        <div className="relative z-10">
          <div className="flex items-center gap-4">
            <div
              className={`grid shrink-0 place-items-center rounded-2xl border border-white/80 bg-white/85 shadow-sm ${
                preview
                  ? "h-12 w-12 text-2xl"
                  : "h-14 w-14 text-3xl"
              }`}
            >
              {visual.icon}
            </div>

            <div>
              <p
                className="text-xs font-black uppercase tracking-[0.18em]"
                style={{
                  color: visual.accent,
                }}
              >
                {visual.eyebrow}
              </p>
              <p className="mt-1 text-sm font-medium text-[#64717b]">
                Thông tin chính thức từ InGiDay
              </p>
            </div>
          </div>

          <h1
            className={`font-black tracking-[-0.035em] text-[#0b2234] ${
              preview
                ? "mt-5 text-2xl leading-tight"
                : "mt-6 text-3xl leading-tight sm:text-[42px]"
            }`}
          >
            {policy.title}
          </h1>

          {policy.seoDescription && (
            <p
              className={`max-w-3xl text-[#4d5a64] ${
                preview
                  ? "mt-3 text-sm leading-6"
                  : "mt-4 text-base leading-7 sm:text-lg"
              }`}
            >
              {policy.seoDescription}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-semibold text-[#65717a]">
            <span className="rounded-full border border-white/80 bg-white/75 px-3 py-2">
              Cập nhật {updatedAt}
            </span>
            <span className="rounded-full border border-white/70 bg-white/60 px-3 py-2">
              {sections.length} mục
            </span>
          </div>
        </div>
      </header>

      <div
        className={
          preview
            ? "space-y-4"
            : "lg:grid lg:grid-cols-[220px_minmax(0,1fr)] lg:items-start lg:gap-7"
        }
      >
        {!preview && sections.length > 0 && (
          <>
            <aside className="hidden lg:block">
              <div className="sticky top-24 rounded-3xl border border-[#e3eaf0] bg-white p-3 shadow-[0_12px_34px_-28px_rgba(0,99,151,0.5)]">
                <p className="px-3 pb-2 pt-2 text-[11px] font-black uppercase tracking-[0.18em] text-[#7a858e]">
                  Nội dung chính
                </p>

                <nav className="space-y-1">
                  {sections.map(
                    (section, index) => (
                      <a
                        key={section.id}
                        href={`#${section.id}`}
                        className="flex items-start gap-3 rounded-2xl px-3 py-3 text-sm font-bold leading-5 text-[#46525c] transition hover:bg-[#eef7ff] hover:text-[#006397]"
                      >
                        <span
                          className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-[11px] font-black"
                          style={{
                            backgroundColor:
                              visual.accentSoft,
                            color: visual.accent,
                          }}
                        >
                          {index + 1}
                        </span>
                        <span className="pt-1">
                          {section.title}
                        </span>
                      </a>
                    ),
                  )}
                </nav>
              </div>
            </aside>

            <nav className="mb-5 flex gap-2 overflow-x-auto pb-2 lg:hidden">
              {sections.map(
                (section, index) => (
                  <a
                    key={section.id}
                    href={`#${section.id}`}
                    className="shrink-0 rounded-full border border-[#e0e7ed] bg-white px-4 py-2.5 text-sm font-bold text-[#46525c] shadow-sm"
                  >
                    {index + 1}.{" "}
                    {section.title}
                  </a>
                ),
              )}
            </nav>
          </>
        )}

        <div
          className={
            preview
              ? "space-y-4"
              : "space-y-4"
          }
        >
          {sections.map((section, index) => (
            <section
              key={section.id}
              id={
                preview
                  ? undefined
                  : section.id
              }
              className={`scroll-mt-24 border border-[#e2e9ef] bg-white ${
                preview
                  ? "rounded-2xl px-4 py-5"
                  : "rounded-[24px] px-5 py-6 shadow-[0_12px_36px_-31px_rgba(0,99,151,0.5)] sm:px-7 sm:py-7"
              }`}
            >
              <div className="flex items-start gap-4">
                <div
                  className={`grid shrink-0 place-items-center rounded-xl font-black ${
                    preview
                      ? "h-9 w-9 text-xs"
                      : "h-10 w-10 text-sm"
                  }`}
                  style={{
                    backgroundColor:
                      visual.accentSoft,
                    color: visual.accent,
                  }}
                >
                  {String(index + 1).padStart(
                    2,
                    "0",
                  )}
                </div>

                <div className="min-w-0 flex-1">
                  <h2
                    className={`font-black leading-snug text-[#10283a] ${
                      preview
                        ? "text-lg"
                        : "text-xl sm:text-2xl"
                    }`}
                  >
                    {section.title}
                  </h2>

                  <div
                    className={`space-y-4 ${
                      preview
                        ? "mt-3"
                        : "mt-4"
                    }`}
                  >
                    {section.blocks.length > 0 ? (
                      section.blocks.map(
                        (block, blockIndex) => (
                          <ContentBlock
                            key={`${block}-${blockIndex}`}
                            block={block}
                          />
                        ),
                      )
                    ) : (
                      <p className="text-sm italic text-[#7b8790]">
                        Nội dung đang được cập
                        nhật.
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </section>
          ))}
        </div>
      </div>
    </div>
  );
}