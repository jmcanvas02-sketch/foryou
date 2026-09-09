import {
  buildMetaDomainVerificationTag,
  META_DOMAIN_VERIFICATION_NAME,
} from "./_lib/meta-domain-verification";
import {
  buildSiteMetadataTags,
  loadSiteMetadata,
} from "./_lib/site-metadata";
import type { SiteMetadata } from "./_lib/site-metadata";
import type { AdsFunctionEnv } from "./_lib/supabase-server";

type HtmlContentOptions = {
  html?: boolean;
};

type HtmlRewriterElement = {
  append(
    content: string,
    options?: HtmlContentOptions,
  ): void;
  remove(): void;
};

type HtmlRewriterHandler = {
  element(element: HtmlRewriterElement): void;
};

type HtmlRewriterInstance = {
  on(
    selector: string,
    handler: HtmlRewriterHandler,
  ): HtmlRewriterInstance;
  transform(response: Response): Response;
};

declare const HTMLRewriter: {
  new (): HtmlRewriterInstance;
};

type MiddlewareContext = {
  request: Request;
  env: AdsFunctionEnv;
  next(): Promise<Response>;
};

const REMOVE_HANDLER: HtmlRewriterHandler = {
  element(element) {
    element.remove();
  },
};

const DYNAMIC_HEAD_SELECTORS = [
  "title",
  'link[rel="icon"]',
  'link[rel="shortcut icon"]',
  'link[rel="apple-touch-icon"]',
  'meta[name="description"]',
  'meta[property="og:type"]',
  'meta[property="og:locale"]',
  'meta[property="og:site_name"]',
  'meta[property="og:title"]',
  'meta[property="og:description"]',
  'meta[property="og:url"]',
  'meta[property="og:image"]',
  'meta[property="og:image:width"]',
  'meta[property="og:image:height"]',
  'meta[property="og:image:alt"]',
  'meta[name="twitter:card"]',
  'meta[name="twitter:title"]',
  'meta[name="twitter:description"]',
  'meta[name="twitter:image"]',
  `meta[name="${META_DOMAIN_VERIFICATION_NAME}"]`,
];

function isHomepageRequest(request: Request) {
  const pathname = new URL(request.url).pathname;

  return pathname === "/" || pathname === "/index.html";
}

function isHtmlGetRequest(request: Request) {
  return request.method === "GET";
}

function isHtmlResponse(response: Response) {
  if (!response.ok || response.body === null) {
    return false;
  }

  return (
    response.headers
      .get("Content-Type")
      ?.toLowerCase()
      .includes("text/html") ?? false
  );
}

async function safelyLoadSiteMetadata(
  env: AdsFunctionEnv,
) {
  try {
    return await loadSiteMetadata(env);
  } catch (error) {
    console.error(
      "site-metadata-middleware-failed",
      error,
    );

    return null;
  }
}

function safelyBuildVerificationTag(
  metadata: SiteMetadata,
  request: Request,
) {
  if (
    !isHomepageRequest(request) ||
    !metadata.metaDomainVerificationCode
  ) {
    return null;
  }

  try {
    return buildMetaDomainVerificationTag(
      metadata.metaDomainVerificationCode,
    );
  } catch (error) {
    console.error(
      "meta-domain-verification-middleware-failed",
      error,
    );

    return null;
  }
}

export async function onRequest(
  context: MiddlewareContext,
) {
  const response = await context.next();

  if (
    !isHtmlGetRequest(context.request) ||
    !isHtmlResponse(response)
  ) {
    return response;
  }

  const metadata = await safelyLoadSiteMetadata(
    context.env,
  );

  if (!metadata) {
    return response;
  }

  const metadataTags = buildSiteMetadataTags(
    metadata,
    context.request.url,
  );
  const verificationTag = safelyBuildVerificationTag(
    metadata,
    context.request,
  );
  const headContent = verificationTag
    ? `${metadataTags}\n    ${verificationTag}`
    : metadataTags;

  let rewriter = new HTMLRewriter();

  for (const selector of DYNAMIC_HEAD_SELECTORS) {
    rewriter = rewriter.on(
      selector,
      REMOVE_HANDLER,
    );
  }

  return rewriter
    .on("head", {
      element(element) {
        element.append(`\n    ${headContent}`, {
          html: true,
        });
      },
    })
    .transform(response);
}
