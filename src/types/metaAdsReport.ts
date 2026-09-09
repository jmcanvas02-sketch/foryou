export type MetaAdsConnectionStatus = {
  configured: boolean;
  tokenLastFour: string | null;
  status: "connected" | "error" | "disconnected";
  lastVerifiedAt: string | null;
  lastError: string;
  updatedAt: string | null;
};

export type MetaAdsReportAccount = {
  id: string;
  adAccountId: string;
  accountName: string;
  currency: string;
  timezoneName: string;
  accountStatus: number | null;
  isEnabled: boolean;
  lastVerifiedAt: string | null;
  lastError: string;
  createdAt: string;
  updatedAt: string;
};

export type MetaAdsReportCampaign = {
  campaignId: string;
  campaignName: string;
  spend: number;
};

export type MetaAdsReportAccountGroup = MetaAdsReportAccount & {
  totalSpend: number;
  campaignCount: number;
  campaigns: MetaAdsReportCampaign[];
};

export type MetaAdsCurrencyTotal = {
  currency: string;
  spend: number;
};

export type MetaAdsDailyCurrencyTotal = {
  date: string;
  currency: string;
  spend: number;
};

export type MetaAdsReportError = {
  accountId: string;
  accountName: string;
  message: string;
};

export type MetaAdsCostReport = {
  since: string;
  until: string;
  dayCount: number;
  generatedAt: string;
  totalAccounts: number;
  totalAds: number;
  totalsByCurrency: MetaAdsCurrencyTotal[];
  dailyTotalsByCurrency: MetaAdsDailyCurrencyTotal[];
  accounts: MetaAdsReportAccountGroup[];
  errors: MetaAdsReportError[];
};

export type MetaAdsDatePreset = "today" | "last7" | "custom";