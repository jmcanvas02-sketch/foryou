import { supabase } from "../lib/supabase";
import type {
  CustomOptionColor,
  CustomOptionColorInput,
  ProductCustomOptions,
  ProductCustomOptionsInput,
} from "../types/customProductOptions";

type CustomOptionColorRow = {
  id: string;
  name: string;
  image_url: string;
  color_hex: string | null;
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
};

type ProductCustomOptionRow = {
  product_id: string;
  enabled: boolean;
  text_enabled: boolean;
  text_label: string;
  text_placeholder: string;
  text_max_length: number;
  text_price_delta: number | string;
};

type ProductColorLinkRow = {
  product_id: string;
  color_id: string;
  sort_order: number;
  custom_option_colors: CustomOptionColorRow | CustomOptionColorRow[] | null;
};

const COLOR_SELECT =
  "id,name,image_url,color_hex,active,sort_order,created_at,updated_at";

export function createDefaultProductCustomOptions(
  productId: string,
): ProductCustomOptions {
  return {
    productId,
    enabled: false,
    text: {
      enabled: false,
      label: "Custom text",
      placeholder: "",
      maxLength: 30,
      priceDelta: 0,
    },
    colors: [],
  };
}

function colorFromRow(row: CustomOptionColorRow): CustomOptionColor {
  return {
    id: row.id,
    name: row.name,
    imageUrl: row.image_url,
    colorHex: row.color_hex ?? undefined,
    isActive: row.active,
    sortOrder: row.sort_order,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function colorInputToRow(input: CustomOptionColorInput) {
  return {
    name: input.name.trim(),
    image_url: input.imageUrl.trim(),
    color_hex: input.colorHex?.trim() || null,
    active: input.isActive,
    sort_order: Math.max(0, Math.trunc(input.sortOrder || 0)),
  };
}

function normalizeProductInput(productId: string, input: ProductCustomOptionsInput) {
  return {
    product_id: productId,
    enabled: input.enabled,
    text_enabled: input.text.enabled,
    text_label: input.text.label.trim() || "Custom text",
    text_placeholder: input.text.placeholder.trim(),
    text_max_length: Math.min(
      120,
      Math.max(1, Math.trunc(input.text.maxLength || 30)),
    ),
    text_price_delta: Math.max(0, Math.round(input.text.priceDelta || 0)),
  };
}

function firstColor(
  relation: ProductColorLinkRow["custom_option_colors"],
): CustomOptionColorRow | null {
  if (Array.isArray(relation)) {
    return relation[0] ?? null;
  }
  return relation;
}

function productOptionsFromRow(
  productId: string,
  row: ProductCustomOptionRow | null,
  colors: CustomOptionColor[],
): ProductCustomOptions {
  if (!row) {
    return createDefaultProductCustomOptions(productId);
  }

  return {
    productId,
    enabled: row.enabled,
    text: {
      enabled: row.text_enabled,
      label: row.text_label,
      placeholder: row.text_placeholder,
      maxLength: row.text_max_length,
      priceDelta: Number(row.text_price_delta),
    },
    colors,
  };
}

export async function listCustomOptionColors(
  includeInactive = false,
): Promise<CustomOptionColor[]> {
  let query = supabase
    .from("custom_option_colors")
    .select(COLOR_SELECT)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (!includeInactive) {
    query = query.eq("active", true);
  }

  const { data, error } = await query;
  if (error) {
    throw error;
  }

  return ((data ?? []) as unknown as CustomOptionColorRow[]).map(colorFromRow);
}

export async function createCustomOptionColor(
  input: CustomOptionColorInput,
): Promise<CustomOptionColor> {
  const { data, error } = await supabase
    .from("custom_option_colors")
    .insert(colorInputToRow(input))
    .select(COLOR_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return colorFromRow(data as unknown as CustomOptionColorRow);
}

export async function updateCustomOptionColor(
  colorId: string,
  input: CustomOptionColorInput,
): Promise<CustomOptionColor> {
  const { data, error } = await supabase
    .from("custom_option_colors")
    .update(colorInputToRow(input))
    .eq("id", colorId)
    .select(COLOR_SELECT)
    .single();

  if (error) {
    throw error;
  }

  return colorFromRow(data as unknown as CustomOptionColorRow);
}

export async function disableCustomOptionColor(colorId: string): Promise<void> {
  const { error } = await supabase
    .from("custom_option_colors")
    .update({ active: false })
    .eq("id", colorId);

  if (error) {
    throw error;
  }
}

export async function fetchProductCustomOptions(
  productId: string,
): Promise<ProductCustomOptions> {
  const { data: optionData, error: optionError } = await supabase
    .from("product_custom_options")
    .select(
      "product_id,enabled,text_enabled,text_label,text_placeholder,text_max_length,text_price_delta",
    )
    .eq("product_id", productId)
    .maybeSingle();

  if (optionError) {
    throw optionError;
  }

  const { data: linkData, error: linkError } = await supabase
    .from("product_custom_option_colors")
    .select(
      `product_id,color_id,sort_order,custom_option_colors (${COLOR_SELECT})`,
    )
    .eq("product_id", productId)
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: true });

  if (linkError) {
    throw linkError;
  }

  const colors = ((linkData ?? []) as unknown as ProductColorLinkRow[])
    .map((link) => firstColor(link.custom_option_colors))
    .filter((row): row is CustomOptionColorRow => Boolean(row))
    .map(colorFromRow);

  return productOptionsFromRow(
    productId,
    optionData as unknown as ProductCustomOptionRow | null,
    colors,
  );
}

export async function saveProductCustomOptions(
  productId: string,
  input: ProductCustomOptionsInput,
): Promise<ProductCustomOptions> {
  const normalized = normalizeProductInput(productId, input);

  const { error: optionError } = await supabase
    .from("product_custom_options")
    .upsert(normalized, { onConflict: "product_id" });

  if (optionError) {
    throw optionError;
  }

  const { error: deleteError } = await supabase
    .from("product_custom_option_colors")
    .delete()
    .eq("product_id", productId);

  if (deleteError) {
    throw deleteError;
  }

  const uniqueColorIds = Array.from(
    new Set(input.colorIds.map((colorId) => colorId.trim()).filter(Boolean)),
  );

  if (uniqueColorIds.length > 0) {
    const { error: insertError } = await supabase
      .from("product_custom_option_colors")
      .insert(
        uniqueColorIds.map((colorId, index) => ({
          product_id: productId,
          color_id: colorId,
          sort_order: index,
        })),
      );

    if (insertError) {
      throw insertError;
    }
  }

  return fetchProductCustomOptions(productId);
}