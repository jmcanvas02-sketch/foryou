import { requireAdmin } from "../../../_lib/ads-auth";
import {
  errorResponse,
  HttpError,
  jsonResponse,
} from "../../../_lib/http";
import {
  fetchMetaAdsInsights,
  fetchMetaAdsInsightsDaily,
  listMetaAdsAccounts,
  loadStoredMetaAccessToken,
  publicAccountRow,
} from "../../../_lib/meta-ads-report";
import type {
  MetaAdsAccountRow,
  MetaAdsFunctionEnv,
} from "../../../_lib/meta-ads-report";

type RouteContext = {
  request: Request;
  env: MetaAdsFunctionEnv;
};

type AccountReportResult = {
  account: MetaAdsAccountRow;
  campaigns: Awaited<ReturnType<typeof fetchMetaAdsInsights>>;
  dailySpend: Array<{
    date: string;
    spend: number;
  }>;
};

function parseDate(value: string | null, label: string) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new HttpError(400, `Ngày ${label} không hợp lệ.`);
  }

  const date = new Date(`${value}T00:00:00Z`);

  if (
    Number.isNaN(date.getTime()) ||
    date.toISOString().slice(0, 10) !== value
  ) {
    throw new HttpError(400, `Ngày ${label} không tồn tại.`);
  }

  return date;
}

function validateRange(since: string | null, until: string | null) {
  const start = parseDate(since, "bắt đầu");
  const end = parseDate(until, "kết thúc");

  if (start.getTime() > end.getTime()) {
    throw new HttpError(
      400,
      "Ngày bắt đầu không được lớn hơn ngày kết thúc.",
    );
  }

  const days =
    Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;

  if (days > 90) {
    throw new HttpError(
      400,
      "Mỗi lần báo cáo tối đa 90 ngày để tránh Meta API quá tải.",
    );
  }

  return {
    since: since as string,
    until: until as string,
    days,
  };
}

function accountIdFilter(value: string | null) {
  if (!value || value === "all") {
    return null;
  }

  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  ) {
    throw new HttpError(400, "Bộ lọc tài khoản không hợp lệ.");
  }

  return value;
}

async function loadInBatches(
  env: MetaAdsFunctionEnv,
  accessToken: string,
  accounts: MetaAdsAccountRow[],
  since: string,
  until: string,
  includeDaily: boolean,
) {
  const successes: AccountReportResult[] = [];
  const errors: Array<{
    accountId: string;
    accountName: string;
    message: string;
  }> = [];

  for (let index = 0; index < accounts.length; index += 3) {
    const batch = accounts.slice(index, index + 3);

    const results = await Promise.allSettled(
      batch.map(async (account): Promise<AccountReportResult> => {
        if (includeDaily) {
          const ads = await fetchMetaAdsInsightsDaily(
            env,
            accessToken,
            account,
            since,
            until,
          );

          return {
            account,
            campaigns: ads.campaigns,
            dailySpend: ads.dailySpend,
          };
        }

        return {
          account,
          campaigns: await fetchMetaAdsInsights(
            env,
            accessToken,
            account,
            since,
            until,
          ),
          dailySpend: [],
        };
      }),
    );

    results.forEach((result, resultIndex) => {
      const account = batch.at(resultIndex);

      if (!account) {
        throw new HttpError(
          500,
          "Không thể ghép kết quả Meta với tài khoản quảng cáo.",
        );
      }

      if (result.status === "fulfilled") {
        successes.push(result.value);
        return;
      }

      errors.push({
        accountId: account.id,
        accountName: account.account_name,
        message:
          result.reason instanceof Error
            ? result.reason.message
            : "Không thể đọc dữ liệu tài khoản.",
      });
    });
  }

  return { successes, errors };
}

export async function onRequestGet(context: RouteContext) {
  try {
    await requireAdmin(context.request, context.env);

    const url = new URL(context.request.url);
    const range = validateRange(
      url.searchParams.get("since"),
      url.searchParams.get("until"),
    );
    const selectedAccountId = accountIdFilter(
      url.searchParams.get("accountId"),
    );
    const includeDaily = url.searchParams.get("daily") === "1";

    let accounts = await listMetaAdsAccounts(context.env, {
      enabledOnly: true,
    });

    if (selectedAccountId) {
      accounts = accounts.filter(
        (account) => account.id === selectedAccountId,
      );
    }

    if (accounts.length === 0) {
      return jsonResponse({
        success: true,
        report: {
          since: range.since,
          until: range.until,
          dayCount: range.days,
          generatedAt: new Date().toISOString(),
          totalAccounts: 0,
          totalAds: 0,
          totalCampaigns: 0,
          totalsByCurrency: [],
          dailyTotalsByCurrency: [],
          accounts: [],
          errors: [],
        },
      });
    }

    const stored = await loadStoredMetaAccessToken(context.env);
    const result = await loadInBatches(
      context.env,
      stored.accessToken,
      accounts,
      range.since,
      range.until,
      includeDaily,
    );

    const totalsByCurrency = new Map<string, number>();
    const dailyTotalsByCurrency = new Map<string, number>();

    const accountReports = result.successes
      .map(({ account, campaigns, dailySpend }) => {
        const totalSpend = campaigns.reduce(
          (total, campaign) => total + campaign.spend,
          0,
        );

        if (totalSpend > 0) {
          totalsByCurrency.set(
            account.currency,
            (totalsByCurrency.get(account.currency) ?? 0) + totalSpend,
          );
        }

        if (includeDaily) {
          for (const item of dailySpend) {
            const key = `${item.date}|${account.currency}`;
            dailyTotalsByCurrency.set(
              key,
              (dailyTotalsByCurrency.get(key) ?? 0) + item.spend,
            );
          }
        }

        return {
          ...publicAccountRow(account),
          totalSpend,
          campaignCount: campaigns.length,
          campaigns,
        };
      })
      .filter((account) => account.totalSpend > 0)
      .sort((left, right) => right.totalSpend - left.totalSpend);

    const totalCampaigns = accountReports.reduce(
      (total, account) => total + account.campaignCount,
      0,
    );

    return jsonResponse({
      success: true,
      report: {
        since: range.since,
        until: range.until,
        dayCount: range.days,
        generatedAt: new Date().toISOString(),
        totalAccounts: accountReports.length,
        totalAds: totalCampaigns,
        totalCampaigns,
        totalsByCurrency: [...totalsByCurrency.entries()]
          .map(([currency, spend]) => ({ currency, spend }))
          .sort((left, right) =>
            left.currency.localeCompare(right.currency),
          ),
        dailyTotalsByCurrency: includeDaily
          ? [...dailyTotalsByCurrency.entries()]
              .map(([key, spend]) => {
                const [date, currency] = key.split("|");
                return { date, currency, spend };
              })
              .sort(
                (left, right) =>
                  left.date.localeCompare(right.date) ||
                  left.currency.localeCompare(right.currency),
              )
          : [],
        accounts: accountReports,
        errors: result.errors,
      },
    });
  } catch (error) {
    return errorResponse(error);
  }
}

export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}