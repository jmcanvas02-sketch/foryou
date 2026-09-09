export type CustomOptionColor = {
  id: string;
  name: string;
  imageUrl: string;
  colorHex?: string;
  isActive: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type CustomOptionColorInput = {
  name: string;
  imageUrl: string;
  colorHex?: string;
  isActive: boolean;
  sortOrder: number;
};

export type ProductCustomTextOption = {
  enabled: boolean;
  label: string;
  placeholder: string;
  maxLength: number;
  priceDelta: number;
};

export type ProductCustomOptions = {
  productId: string;
  enabled: boolean;
  text: ProductCustomTextOption;
  colors: CustomOptionColor[];
};

export type ProductCustomOptionsInput = {
  enabled: boolean;
  text: ProductCustomTextOption;
  colorIds: string[];
};

export type SelectedCustomOptions = {
  text?: {
    label: string;
    value: string;
    priceDelta: number;
  };
  color?: {
    id: string;
    name: string;
    imageUrl: string;
    colorHex?: string;
  };
};