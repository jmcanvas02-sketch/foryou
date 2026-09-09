import {
  errorResponse,
  HttpError,
} from "../_lib/http";
import {
  supabaseServerFetch,
  type AdsFunctionEnv,
} from "../_lib/supabase-server";

type FeedContext = {
  env: AdsFunctionEnv;
};

type ProductRow = {
  id: string;
  sku: string | null;
  name: string;
  slug: string;
  description: string | null;
  price: number | string;
  stock: number | string;
  status: string;
};

type ProductImageRow = {
  product_id: string;
  image_url: string;
  is_primary: boolean;
  sort_order: number;
};

type FeedItem = {
  id: string;
  title: string;
  description: string;
  availability: "in stock" | "out of stock";
  condition: "new";
  price: string;
  link: string;
  image_link: string;
  brand: "IGD";
};

const SITE_ORIGIN = "https://ingiday.xyz";
const MAX_TITLE_LENGTH = 150;
const MAX_DESCRIPTION_LENGTH = 5_000;

const FEED_COLUMNS: Array<keyof FeedItem> = [
  "id",
  "title",
  "description",
  "availability",
  "condition",
  "price",
  "link",
  "image_link",
  "brand",
];

function normalizeText(
  value: string | null | undefined,
  maximumLength: number,
) {
  return (value ?? "")
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maximumLength);
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}

function absoluteHttpUrl(value: string) {
  try {
    const url = new URL(value, SITE_ORIGIN);

    if (
      url.protocol !== "https:" &&
      url.protocol !== "http:"
    ) {
      return null;
    }

    return url.toString();
  } catch {
    return null;
  }
}

function numericValue(value: number | string) {
  const number = Number(value);

  return Number.isFinite(number) ? number : null;
}

async function fetchRows<T>(
  env: AdsFunctionEnv,
  path: string,
  resourceName: string,
): Promise<T[]> {
  const response = await supabaseServerFetch(
    env,
    path,
    {
      method: "GET",
    },
  );

  if (!response.ok) {
    console.error(
      "meta-product-feed-supabase-failed",
      resourceName,
      response.status,
    );

    throw new HttpError(
      502,
      "Không thể tải dữ liệu nguồn cấp sản phẩm.",
    );
  }

  const payload = (await response.json()) as unknown;

  if (!Array.isArray(payload)) {
    throw new HttpError(
      502,
      "Dữ liệu nguồn cấp sản phẩm không hợp lệ.",
    );
  }

  return payload as T[];
}

function primaryImageByProduct(
  images: ProductImageRow[],
) {
  const sortedImages = [...images].sort((left, right) => {
    if (left.product_id !== right.product_id) {
      return left.product_id.localeCompare(right.product_id);
    }

    if (left.is_primary !== right.is_primary) {
      return left.is_primary ? -1 : 1;
    }

    return left.sort_order - right.sort_order;
  });

  const result = new Map<string, string>();

  for (const image of sortedImages) {
    if (!result.has(image.product_id)) {
      result.set(image.product_id, image.image_url);
    }
  }

  return result;
}

function toFeedItem(
  product: ProductRow,
  imageUrl: string | undefined,
): FeedItem | null {
  const sku = normalizeText(product.sku, 100);
  const title = normalizeText(
    product.name,
    MAX_TITLE_LENGTH,
  );
  const slug = product.slug.trim();
  const price = numericValue(product.price);
  const stock = numericValue(product.stock);
  const normalizedImageUrl = imageUrl
    ? absoluteHttpUrl(imageUrl)
    : null;

  if (
    !sku ||
    !title ||
    !slug ||
    price === null ||
    price < 0 ||
    !normalizedImageUrl
  ) {
    return null;
  }

  const description =
    normalizeText(
      product.description,
      MAX_DESCRIPTION_LENGTH,
    ) || title;

  const availability =
    product.status === "out_of_stock" ||
    stock === null ||
    stock <= 0
      ? "out of stock"
      : "in stock";

  return {
    id: sku,
    title,
    description,
    availability,
    condition: "new",
    price: `${Math.round(price)} VND`,
    link: `${SITE_ORIGIN}/san-pham/${encodeURIComponent(slug)}`,
    image_link: normalizedImageUrl,
    brand: "IGD",
  };
}

function createCsv(items: FeedItem[]) {
  const rows = [
    FEED_COLUMNS.map(csvCell).join(","),
    ...items.map((item) =>
      FEED_COLUMNS.map((column) =>
        csvCell(item[column]),
      ).join(","),
    ),
  ];

  return `\uFEFF${rows.join("\r\n")}\r\n`;
}

export async function onRequestGet(
  context: FeedContext,
) {
  try {
    const productQuery = new URLSearchParams({
      select:
        "id,sku,name,slug,description,price,stock,status",
      status: "in.(active,out_of_stock)",
      order: "created_at.asc",
    });

    const imageQuery = new URLSearchParams({
      select:
        "product_id,image_url,is_primary,sort_order",
      order:
        "product_id.asc,is_primary.desc,sort_order.asc",
    });

    const [products, images] = await Promise.all([
      fetchRows<ProductRow>(
        context.env,
        `/rest/v1/products?${productQuery.toString()}`,
        "products",
      ),
      fetchRows<ProductImageRow>(
        context.env,
        `/rest/v1/product_images?${imageQuery.toString()}`,
        "product_images",
      ),
    ]);

    const imageMap = primaryImageByProduct(images);
    const items = products
      .map((product) =>
        toFeedItem(
          product,
          imageMap.get(product.id),
        ),
      )
      .filter(
        (item): item is FeedItem =>
          item !== null,
      );

    if (items.length !== products.length) {
      console.warn(
        "meta-product-feed-skipped-products",
        products.length - items.length,
      );
    }

    return new Response(createCsv(items), {
      status: 200,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Cache-Control":
          "public, max-age=300, s-maxage=300",
        "Content-Disposition":
          'inline; filename="ingiday-meta-product-feed.csv"',
        "Content-Type":
          "text/csv; charset=utf-8",
        "Referrer-Policy": "no-referrer",
        "X-Content-Type-Options": "nosniff",
        "X-Robots-Tag": "noindex, nofollow",
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}