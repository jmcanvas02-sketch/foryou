import { useEffect } from "react";

type PageMetaOptions = {
  title: string;
  description?: string;
  canonicalPath?: string;
};

function ensureDescriptionMeta() {
  let element = document.querySelector(
    'meta[name="description"]',
  ) as HTMLMetaElement | null;

  if (!element) {
    element = document.createElement("meta");
    element.name = "description";
    document.head.appendChild(element);
  }

  return element;
}

function ensureCanonicalLink() {
  let element = document.querySelector(
    'link[rel="canonical"]',
  ) as HTMLLinkElement | null;

  if (!element) {
    element = document.createElement("link");
    element.rel = "canonical";
    document.head.appendChild(element);
  }

  return element;
}

export function usePageMeta({
  title,
  description = "",
  canonicalPath,
}: PageMetaOptions) {
  useEffect(() => {
    const descriptionMeta =
      ensureDescriptionMeta();
    const canonicalLink =
      ensureCanonicalLink();

    document.title = title;
    descriptionMeta.content = description;

    canonicalLink.href = new URL(
      canonicalPath ??
        window.location.pathname,
      window.location.origin,
    ).toString();
  }, [canonicalPath, description, title]);
}