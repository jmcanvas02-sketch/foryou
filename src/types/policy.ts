export type SitePolicy = {
  slug: string;
  title: string;
  content: string;
  seoTitle: string;
  seoDescription: string;
  active: boolean;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
};

export type SitePolicyInput = Pick<
  SitePolicy,
  | "title"
  | "content"
  | "seoTitle"
  | "seoDescription"
  | "active"
>;