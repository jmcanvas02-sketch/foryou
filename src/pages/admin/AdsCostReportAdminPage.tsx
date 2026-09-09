import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  addMetaAdsReportAccount,
  deleteMetaAdsConnection,
  deleteMetaAdsReportAccount,
  listMetaAdsReportAccounts,
  loadMetaAdsConnection,
  loadMetaAdsCostReport,
  saveMetaAdsConnection,
  setMetaAdsReportAccountEnabled,
  testMetaAdsConnection,
  verifyMetaAdsReportAccount,
} from "../../services/metaAdsReport";
import type {
  MetaAdsConnectionStatus,
  MetaAdsCostReport,
  MetaAdsDatePreset,
  MetaAdsReportAccount,
  MetaAdsReportAccountGroup,
} from "../../types/metaAdsReport";

type TabId = "report" | "connection" | "accounts";

const EMPTY_CONNECTION: MetaAdsConnectionStatus = {
  configured: false,
  tokenLastFour: null,
  status: "disconnected",
  lastVerifiedAt: null,
  lastError: "",
  updatedAt: null,
};

function dateInputValue(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function presetDates(preset: Exclude<MetaAdsDatePreset, "custom">) {
  const end = new Date();
  const start = new Date(end);

  if (preset === "last7") {
    start.setDate(start.getDate() - 6);
  }

  return {
    since: dateInputValue(start),
    until: dateInputValue(end),
  };
}

function formatMoney(value: number, currency: string) {
  try {
    return new Intl.NumberFormat("vi-VN", {
      style: "currency",
      currency,
      maximumFractionDigits: currency === "VND" ? 0 : 2,
    }).format(value);
  } catch {
    return `${new Intl.NumberFormat("vi-VN", {
      maximumFractionDigits: 2,
    }).format(value)} ${currency}`;
  }
}

function formatDateTime(value: string | null) {
  if (!value) return "Chưa có";

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có";

  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function connectionLabel(connection: MetaAdsConnectionStatus) {
  if (!connection.configured) return "Meta chưa kết nối";
  if (connection.status === "error") return "Kết nối Meta có lỗi";
  return "Meta đã kết nối";
}

function connectionClass(connection: MetaAdsConnectionStatus) {
  if (!connection.configured) {
    return "border-[#e4e8ee] bg-white text-[#718296]";
  }

  if (connection.status === "error") {
    return "border-[#ffd5cd] bg-[#fff3f0] text-[#c34d38]";
  }

  return "border-[#ccebdd] bg-[#edf9f3] text-[#17875b]";
}

function StatusMessage({
  error,
  notice,
}: {
  error: string;
  notice: string;
}) {
  if (!error && !notice) return null;

  return (
    <div
      className={`rounded-2xl border px-4 py-3 text-sm font-semibold ${
        error
          ? "border-[#ffd5cd] bg-[#fff3f0] text-[#b84431]"
          : "border-[#ccebdd] bg-[#edf9f3] text-[#167a53]"
      }`}
    >
      {error || notice}
    </div>
  );
}

function SpendTotal({
  totals,
}: {
  totals: Array<{ currency: string; spend: number }>;
}) {
  if (totals.length === 0) {
    return <span>0 ₫</span>;
  }

  return (
    <span className="grid gap-1">
      {totals.map((item) => (
        <span key={item.currency}>
          {formatMoney(item.spend, item.currency)}
        </span>
      ))}
    </span>
  );
}

export default function AdsCostReportAdminPage() {
  const initialDates = useMemo(() => presetDates("today"), []);
  const [tab, setTab] = useState<TabId>("report");
  const [connection, setConnection] =
    useState<MetaAdsConnectionStatus>(EMPTY_CONNECTION);
  const [accounts, setAccounts] = useState<MetaAdsReportAccount[]>([]);
  const [report, setReport] = useState<MetaAdsCostReport | null>(null);
  const [preset, setPreset] = useState<MetaAdsDatePreset>("today");
  const [since, setSince] = useState(initialDates.since);
  const [until, setUntil] = useState(initialDates.until);
  const [accountFilter, setAccountFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [tokenInput, setTokenInput] = useState("");
  const [showToken, setShowToken] = useState(false);
  const [newAccountId, setNewAccountId] = useState("");
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");

  const showMessage = useCallback((message: string, isError = false) => {
    if (isError) {
      setError(message);
      setNotice("");
      return;
    }

    setNotice(message);
    setError("");
  }, []);

  const refreshReport = useCallback(
    async (options?: { quiet?: boolean }) => {
      if (!since || !until) {
        showMessage("Vui lòng chọn đủ ngày bắt đầu và kết thúc.", true);
        return;
      }

      if (since > until) {
        showMessage("Ngày bắt đầu không được lớn hơn ngày kết thúc.", true);
        return;
      }

      if (!options?.quiet) setBusy(true);

      try {
        const nextReport = await loadMetaAdsCostReport({
          since,
          until,
        });
        setReport(nextReport);
        if (!options?.quiet) {
          showMessage("Đã cập nhật báo cáo chi phí từ Meta.");
        }
      } catch (loadError) {
        showMessage(
          loadError instanceof Error
            ? loadError.message
            : "Không thể tải báo cáo chi phí Ads.",
          true,
        );
      } finally {
        if (!options?.quiet) setBusy(false);
      }
    },
    [showMessage, since, until],
  );

  useEffect(() => {
    let mounted = true;

    void (async () => {
      try {
        const [nextConnection, nextAccounts] = await Promise.all([
          loadMetaAdsConnection(),
          listMetaAdsReportAccounts(),
        ]);

        if (!mounted) return;

        setConnection(nextConnection);
        setAccounts(nextAccounts);

        if (
          nextConnection.configured &&
          nextAccounts.some((account) => account.isEnabled)
        ) {
          const nextReport = await loadMetaAdsCostReport({
            since: initialDates.since,
            until: initialDates.until,
          });

          if (mounted) setReport(nextReport);
        }
      } catch (loadError) {
        if (!mounted) return;
        showMessage(
          loadError instanceof Error
            ? loadError.message
            : "Không thể tải cấu hình báo cáo Ads.",
          true,
        );
      } finally {
        if (mounted) setLoading(false);
      }
    })();

    return () => {
      mounted = false;
    };
  }, [initialDates.since, initialDates.until, showMessage]);

  function selectPreset(nextPreset: MetaAdsDatePreset) {
    setPreset(nextPreset);

    if (nextPreset === "custom") return;

    const dates = presetDates(nextPreset);
    setSince(dates.since);
    setUntil(dates.until);
  }

  const filteredGroups = useMemo(() => {
    if (!report) return [];

    const keyword = search.trim().toLowerCase();

    return report.accounts
      .filter(
        (account) =>
          accountFilter === "all" || account.id === accountFilter,
      )
      .map((account) => {
        const sourceCampaigns = Array.isArray(account.campaigns)
          ? account.campaigns
          : [];
        const campaigns = keyword
          ? sourceCampaigns.filter((campaign) =>
              campaign.campaignName
                .toLowerCase()
                .includes(keyword),
            )
          : sourceCampaigns;

        return {
          ...account,
          campaigns,
          campaignCount: campaigns.length,
          totalSpend: campaigns.reduce((total, campaign) => total + campaign.spend, 0),
        };
      })
      .filter((account) => account.campaignCount > 0)
      .sort((left, right) => right.totalSpend - left.totalSpend);
  }, [accountFilter, report, search]);

  const visibleTotals = useMemo(() => {
    const totals = new Map<string, number>();

    filteredGroups.forEach((account) => {
      totals.set(
        account.currency,
        (totals.get(account.currency) ?? 0) + account.totalSpend,
      );
    });

    return [...totals.entries()].map(([currency, spend]) => ({
      currency,
      spend,
    }));
  }, [filteredGroups]);

  const visibleAdCount = filteredGroups.reduce(
    (total, account) => total + account.campaignCount,
    0,
  );

  async function handleSaveToken() {
    if (!tokenInput.trim()) {
      showMessage("Vui lòng nhập Meta Access Token.", true);
      return;
    }

    setBusy(true);

    try {
      const result = await saveMetaAdsConnection(tokenInput);
      setConnection(result.connection);
      setTokenInput("");
      setShowToken(false);
      showMessage(result.message);
    } catch (saveError) {
      showMessage(
        saveError instanceof Error
          ? saveError.message
          : "Không thể lưu Meta Access Token.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleTestConnection() {
    setBusy(true);

    try {
      const result = await testMetaAdsConnection();
      setConnection(result.connection);
      showMessage(result.message);
    } catch (testError) {
      showMessage(
        testError instanceof Error
          ? testError.message
          : "Không thể kiểm tra kết nối Meta.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteConnection() {
    if (!window.confirm("Xóa Meta Access Token đang lưu?")) return;

    setBusy(true);

    try {
      const message = await deleteMetaAdsConnection();
      setConnection(EMPTY_CONNECTION);
      setReport(null);
      showMessage(message);
    } catch (deleteError) {
      showMessage(
        deleteError instanceof Error
          ? deleteError.message
          : "Không thể xóa kết nối Meta.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleAddAccount() {
    if (!newAccountId.trim()) {
      showMessage("Vui lòng nhập ID tài khoản quảng cáo.", true);
      return;
    }

    setBusy(true);

    try {
      const result = await addMetaAdsReportAccount(newAccountId);
      setAccounts((current) => [...current, result.account]);
      setNewAccountId("");
      showMessage(result.message);
    } catch (addError) {
      showMessage(
        addError instanceof Error
          ? addError.message
          : "Không thể thêm tài khoản quảng cáo.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleToggleAccount(account: MetaAdsReportAccount) {
    setBusy(true);

    try {
      const result = await setMetaAdsReportAccountEnabled(
        account.id,
        !account.isEnabled,
      );
      setAccounts((current) =>
        current.map((item) =>
          item.id === result.account.id ? result.account : item,
        ),
      );
      showMessage(result.message);
      await refreshReport({ quiet: true });
    } catch (toggleError) {
      showMessage(
        toggleError instanceof Error
          ? toggleError.message
          : "Không thể cập nhật tài khoản.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyAccount(account: MetaAdsReportAccount) {
    setBusy(true);

    try {
      const result = await verifyMetaAdsReportAccount(account.id);
      setAccounts((current) =>
        current.map((item) =>
          item.id === result.account.id ? result.account : item,
        ),
      );
      showMessage(result.message);
    } catch (verifyError) {
      showMessage(
        verifyError instanceof Error
          ? verifyError.message
          : "Không thể kiểm tra tài khoản quảng cáo.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  async function handleDeleteAccount(account: MetaAdsReportAccount) {
    if (
      !window.confirm(
        `Xóa tài khoản “${account.accountName}” khỏi danh sách báo cáo?`,
      )
    ) {
      return;
    }

    setBusy(true);

    try {
      const message = await deleteMetaAdsReportAccount(account.id);
      setAccounts((current) =>
        current.filter((item) => item.id !== account.id),
      );
      if (accountFilter === account.id) setAccountFilter("all");
      showMessage(message);
      await refreshReport({ quiet: true });
    } catch (deleteError) {
      showMessage(
        deleteError instanceof Error
          ? deleteError.message
          : "Không thể xóa tài khoản quảng cáo.",
        true,
      );
    } finally {
      setBusy(false);
    }
  }

  function accountCard(account: MetaAdsReportAccountGroup) {
    const accountShareTotal = account.totalSpend || 1;

    return (
      <article
        key={account.id}
        className="overflow-hidden rounded-3xl border border-[#e7ebf0] bg-white shadow-[0_12px_32px_rgba(24,45,70,0.05)]"
      >
        <header className="flex flex-col gap-3 border-b border-[#edf1f5] px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-base font-black text-[#10283b]">
              {account.accountName}
            </h3>
            <p className="mt-1 text-xs text-[#7d8c9b]">
              {account.adAccountId} · {account.campaignCount} chiến dịch có chi phí
            </p>
          </div>
          <div className="sm:text-right">
            <strong className="text-xl font-black text-[#10283b]">
              {formatMoney(account.totalSpend, account.currency)}
            </strong>
            <p className="mt-1 text-xs text-[#7d8c9b]">
              {account.currency} · {account.timezoneName}
            </p>
          </div>
        </header>

        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left text-sm">
            <thead className="bg-[#fafbfd] text-[11px] uppercase tracking-[0.04em] text-[#8795a4]">
              <tr>
<th className="px-5 py-3 font-bold">Chiến dịch</th>
                <th className="w-[170px] px-5 py-3 font-bold">Tỷ trọng</th>
                <th className="px-5 py-3 text-right font-bold">Chi phí</th>
              </tr>
            </thead>
            <tbody>
              {account.campaigns.map((campaign) => {
                const percentage = (campaign.spend / accountShareTotal) * 100;

                return (
                  <tr
                    key={campaign.campaignId}
                    className="border-t border-[#edf1f5] text-[#31475a]"
                  >
                    <td className="px-5 py-4 font-bold text-[#10283b]">
                      {campaign.campaignName}
                    </td>
                    <td className="px-5 py-4">
                      <div className="h-2 overflow-hidden rounded-full bg-[#edf0f4]">
                        <span
                          className="block h-full rounded-full bg-[#fe7e4f]"
                          style={{ width: `${Math.min(100, percentage)}%` }}
                        />
                      </div>
                      <div className="mt-1.5 text-right text-[10px] text-[#8b98a6]">
                        {new Intl.NumberFormat("vi-VN", {
                          maximumFractionDigits: 1,
                        }).format(percentage)}%
                      </div>
                    </td>
                    <td className="px-5 py-4 text-right font-black text-[#10283b]">
                      {formatMoney(campaign.spend, account.currency)}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </article>
    );
  }

  return (
    <div className="mx-auto grid w-full max-w-[1380px] gap-5 pb-12">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h1 className="text-2xl font-black tracking-[-0.03em] text-[#10283b] sm:text-3xl">
            Báo cáo Chi phí Ads
          </h1>
          <p className="mt-2 text-sm text-[#718296]">
            Theo dõi chi phí từng quảng cáo trong các tài khoản Meta đã chọn.
          </p>
        </div>
        <span
          className={`inline-flex w-fit items-center gap-2 rounded-xl border px-3 py-2 text-xs font-bold ${connectionClass(connection)}`}
        >
          <span className="h-2 w-2 rounded-full bg-current" />
          {connectionLabel(connection)}
        </span>
      </div>

      <StatusMessage error={error} notice={notice} />

      <div className="flex w-fit max-w-full gap-1 overflow-x-auto rounded-2xl bg-[#e9edf2] p-1.5">
        {(
          [
            ["report", "Báo cáo"],
            ["connection", "Kết nối Meta"],
            ["accounts", `Tài khoản báo cáo (${accounts.length})`],
          ] as Array<[TabId, string]>
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            onClick={() => setTab(id)}
            className={`whitespace-nowrap rounded-xl px-4 py-2.5 text-sm font-bold transition ${
              tab === id
                ? "bg-white text-[#10283b] shadow-sm"
                : "text-[#718296] hover:text-[#10283b]"
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="rounded-3xl border border-[#e7ebf0] bg-white p-10 text-center text-sm font-semibold text-[#718296]">
          Đang tải cấu hình báo cáo Ads…
        </div>
      ) : null}

      {!loading && tab === "report" ? (
        <section className="grid gap-4">
          <div className="grid gap-4 rounded-3xl border border-[#e7ebf0] bg-white p-4 shadow-[0_12px_32px_rgba(24,45,70,0.05)] xl:grid-cols-[auto_minmax(250px,1fr)_220px_auto] xl:items-end">
            <div>
              <span className="text-xs font-bold text-[#718296]">
                Thời gian báo cáo
              </span>
              <div className="mt-2 flex flex-wrap gap-2">
                {(
                  [
                    ["today", "Hôm nay"],
                    ["last7", "7 ngày qua"],
                    ["custom", "Chọn khoảng"],
                  ] as Array<[MetaAdsDatePreset, string]>
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectPreset(id)}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                      preset === id
                        ? "border-[#fe7e4f] bg-[#fff1eb] text-[#d75d32]"
                        : "border-[#e4e8ee] bg-white text-[#68798a]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {preset === "custom" ? (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1.5 text-xs font-bold text-[#718296]">
                  Từ ngày
                  <input
                    type="date"
                    value={since}
                    onChange={(event) => setSince(event.target.value)}
                    className="min-h-11 rounded-xl border border-[#dfe5eb] bg-white px-3 text-sm text-[#10283b] outline-none focus:border-[#fe7e4f]"
                  />
                </label>
                <label className="grid gap-1.5 text-xs font-bold text-[#718296]">
                  Đến ngày
                  <input
                    type="date"
                    value={until}
                    onChange={(event) => setUntil(event.target.value)}
                    className="min-h-11 rounded-xl border border-[#dfe5eb] bg-white px-3 text-sm text-[#10283b] outline-none focus:border-[#fe7e4f]"
                  />
                </label>
              </div>
            ) : (
              <div className="grid gap-1.5 text-xs font-bold text-[#718296]">
                Khoảng đang xem
                <div className="flex min-h-11 items-center rounded-xl border border-[#dfe5eb] bg-[#f7f9fb] px-3 text-sm font-semibold text-[#10283b]">
                  {since === until ? since : `${since} → ${until}`}
                </div>
              </div>
            )}

            <label className="grid gap-1.5 text-xs font-bold text-[#718296]">
              Tài khoản
              <select
                value={accountFilter}
                onChange={(event) => setAccountFilter(event.target.value)}
                className="min-h-11 rounded-xl border border-[#dfe5eb] bg-white px-3 text-sm text-[#10283b] outline-none focus:border-[#fe7e4f]"
              >
                <option value="all">Tất cả tài khoản</option>
                {accounts
                  .filter((account) => account.isEnabled)
                  .map((account) => (
                    <option key={account.id} value={account.id}>
                      {account.accountName}
                    </option>
                  ))}
              </select>
            </label>

            <button
              type="button"
              disabled={busy || !connection.configured}
              onClick={() => void refreshReport()}
              className="min-h-11 rounded-xl bg-[#fe7e4f] px-5 text-sm font-black text-white transition hover:bg-[#ef6f42] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Đang cập nhật…" : "Cập nhật báo cáo"}
            </button>

            <label className="grid gap-1.5 text-xs font-bold text-[#718296] xl:col-span-4">
              Tìm quảng cáo
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Nhập tên quảng cáo hoặc chiến dịch…"
                className="min-h-11 rounded-xl border border-[#dfe5eb] bg-white px-3 text-sm text-[#10283b] outline-none focus:border-[#fe7e4f]"
              />
            </label>
          </div>

          <div className="grid gap-3 md:grid-cols-3">
            <article className="rounded-3xl bg-[#203243] p-5 text-white shadow-[0_12px_32px_rgba(24,45,70,0.10)]">
              <p className="text-xs font-bold text-white/65">Tổng chi phí</p>
              <div className="mt-3 text-2xl font-black tracking-[-0.03em]">
                <SpendTotal totals={visibleTotals} />
              </div>
              <p className="mt-2 text-xs text-white/60">
                Theo bộ lọc hiện tại
              </p>
            </article>
            <article className="rounded-3xl border border-[#e7ebf0] bg-white p-5 shadow-[0_12px_32px_rgba(24,45,70,0.05)]">
              <p className="text-xs font-bold text-[#718296]">
                Tài khoản phát sinh chi phí
              </p>
              <strong className="mt-3 block text-3xl font-black text-[#10283b]">
                {filteredGroups.length}
              </strong>
              <p className="mt-2 text-xs text-[#8a98a6]">
                Trong danh sách đang bật
              </p>
            </article>
            <article className="rounded-3xl border border-[#e7ebf0] bg-white p-5 shadow-[0_12px_32px_rgba(24,45,70,0.05)]">
              <p className="text-xs font-bold text-[#718296]">
                Quảng cáo có chi phí
              </p>
              <strong className="mt-3 block text-3xl font-black text-[#10283b]">
                {visibleAdCount}
              </strong>
              <p className="mt-2 text-xs text-[#8a98a6]">
                Cập nhật {formatDateTime(report?.generatedAt ?? null)}
              </p>
            </article>
          </div>

          {report?.errors.length ? (
            <div className="rounded-2xl border border-[#ffe0b8] bg-[#fff9ed] px-4 py-3 text-sm text-[#9b6518]">
              {report.errors.map((item) => (
                <p key={item.accountId}>
                  <strong>{item.accountName}:</strong> {item.message}
                </p>
              ))}
            </div>
          ) : null}

          {!connection.configured ? (
            <div className="rounded-3xl border border-dashed border-[#ccd5de] bg-white p-8 text-center">
              <strong className="text-[#10283b]">Chưa kết nối Meta</strong>
              <p className="mt-2 text-sm text-[#718296]">
                Hãy lưu Access Token ở tab Kết nối Meta trước.
              </p>
              <button
                type="button"
                onClick={() => setTab("connection")}
                className="mt-4 rounded-xl bg-[#fe7e4f] px-4 py-2.5 text-sm font-bold text-white"
              >
                Mở Kết nối Meta
              </button>
            </div>
          ) : filteredGroups.length ? (
            <div className="grid gap-4">
              {filteredGroups.map(accountCard)}
            </div>
          ) : (
            <div className="rounded-3xl border border-dashed border-[#ccd5de] bg-white p-8 text-center">
              <strong className="text-[#10283b]">
                Chưa có quảng cáo phát sinh chi phí
              </strong>
              <p className="mt-2 text-sm text-[#718296]">
                Đổi khoảng thời gian, bộ lọc hoặc thêm tài khoản quảng cáo.
              </p>
            </div>
          )}
        </section>
      ) : null}

      {!loading && tab === "connection" ? (
        <section className="grid gap-4 xl:grid-cols-[minmax(0,1.15fr)_minmax(300px,.85fr)]">
          <article className="rounded-3xl border border-[#e7ebf0] bg-white p-5 shadow-[0_12px_32px_rgba(24,45,70,0.05)]">
            <h2 className="text-lg font-black text-[#10283b]">
              Kết nối Meta
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#718296]">
              Token được quản lý riêng và dùng chung cho các tài khoản trong danh sách báo cáo.
            </p>

            <div className={`mt-5 rounded-2xl border p-4 ${connectionClass(connection)}`}>
              <strong className="block text-sm">
                {connectionLabel(connection)}
              </strong>
              <p className="mt-1.5 text-xs leading-5 opacity-80">
                {connection.configured
                  ? `Token đang lưu: ••••••••${connection.tokenLastFour ?? ""} · Kiểm tra gần nhất ${formatDateTime(connection.lastVerifiedAt)}`
                  : "Chưa có Meta Access Token được lưu."}
              </p>
              {connection.lastError ? (
                <p className="mt-2 text-xs font-semibold">
                  {connection.lastError}
                </p>
              ) : null}
            </div>

            <label className="mt-5 grid gap-1.5 text-xs font-bold text-[#718296]">
              Meta Access Token mới
              <div className="flex gap-2">
                <input
                  type={showToken ? "text" : "password"}
                  value={tokenInput}
                  onChange={(event) => setTokenInput(event.target.value)}
                  autoComplete="off"
                  placeholder="Dán token có quyền ads_read"
                  className="min-h-11 min-w-0 flex-1 rounded-xl border border-[#dfe5eb] bg-white px-3 text-sm text-[#10283b] outline-none focus:border-[#fe7e4f]"
                />
                <button
                  type="button"
                  onClick={() => setShowToken((current) => !current)}
                  className="rounded-xl border border-[#dfe5eb] bg-white px-3 text-xs font-bold text-[#617386]"
                >
                  {showToken ? "Ẩn" : "Hiện"}
                </button>
              </div>
            </label>

            <div className="mt-4 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => void handleSaveToken()}
                className="rounded-xl bg-[#fe7e4f] px-4 py-2.5 text-sm font-black text-white disabled:opacity-50"
              >
                Kiểm tra và lưu token
              </button>
              <button
                type="button"
                disabled={busy || !connection.configured}
                onClick={() => void handleTestConnection()}
                className="rounded-xl border border-[#dfe5eb] bg-white px-4 py-2.5 text-sm font-bold text-[#31475a] disabled:opacity-50"
              >
                Kiểm tra lại
              </button>
              <button
                type="button"
                disabled={busy || !connection.configured}
                onClick={() => void handleDeleteConnection()}
                className="rounded-xl border border-[#ffd5cd] bg-[#fff3f0] px-4 py-2.5 text-sm font-bold text-[#b84431] disabled:opacity-50"
              >
                Xóa kết nối
              </button>
            </div>
          </article>

          <aside className="rounded-3xl border border-[#e7ebf0] bg-white p-5 shadow-[0_12px_32px_rgba(24,45,70,0.05)]">
            <h2 className="text-base font-black text-[#10283b]">
              Cách hoạt động
            </h2>
            <div className="mt-4 grid gap-3 text-sm leading-6 text-[#68798a]">
              <p>Token chỉ được gửi tới Cloudflare Function để kiểm tra và mã hóa.</p>
              <p>Token đầy đủ không được trả lại frontend sau khi lưu.</p>
              <p>
                ID tài khoản quảng cáo được thêm riêng tại tab{" "}
                <strong className="text-[#10283b]">Tài khoản báo cáo</strong>.
              </p>
            </div>
          </aside>
        </section>
      ) : null}

      {!loading && tab === "accounts" ? (
        <section className="rounded-3xl border border-[#e7ebf0] bg-white p-5 shadow-[0_12px_32px_rgba(24,45,70,0.05)]">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-lg font-black text-[#10283b]">
                Danh sách tài khoản báo cáo
              </h2>
              <p className="mt-2 text-sm text-[#718296]">
                Thêm, xóa hoặc tạm tắt tài khoản khỏi báo cáo.
              </p>
            </div>
            <span className="w-fit rounded-full bg-[#fff1eb] px-3 py-1.5 text-xs font-black text-[#d75d32]">
              {accounts.length} tài khoản
            </span>
          </div>

          <div className="mt-5 grid gap-3 rounded-2xl border border-[#e7ebf0] bg-[#fafbfd] p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <label className="grid gap-1.5 text-xs font-bold text-[#718296]">
              ID tài khoản quảng cáo
              <input
                type="text"
                value={newAccountId}
                onChange={(event) => setNewAccountId(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") void handleAddAccount();
                }}
                placeholder="Ví dụ: act_123456789012345"
                className="min-h-11 rounded-xl border border-[#dfe5eb] bg-white px-3 text-sm text-[#10283b] outline-none focus:border-[#fe7e4f]"
              />
            </label>
            <button
              type="button"
              disabled={busy || !connection.configured}
              onClick={() => void handleAddAccount()}
              className="min-h-11 rounded-xl bg-[#fe7e4f] px-5 text-sm font-black text-white disabled:opacity-50"
            >
              Kiểm tra và thêm
            </button>
          </div>

          {!connection.configured ? (
            <p className="mt-3 text-xs font-semibold text-[#b76b20]">
              Cần kết nối Meta trước khi thêm tài khoản quảng cáo.
            </p>
          ) : null}

          <div className="mt-5 grid gap-3">
            {accounts.map((account) => (
              <article
                key={account.id}
                className="grid gap-4 rounded-2xl border border-[#e7ebf0] p-4 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center"
              >
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <strong className="text-sm font-black text-[#10283b]">
                      {account.accountName}
                    </strong>
                    <span
                      className={`rounded-full px-2 py-1 text-[10px] font-black ${
                        account.isEnabled
                          ? "bg-[#edf9f3] text-[#17875b]"
                          : "bg-[#f0f2f5] text-[#718296]"
                      }`}
                    >
                      {account.isEnabled ? "Đang báo cáo" : "Đã tạm tắt"}
                    </span>
                  </div>
                  <p className="mt-1.5 text-xs text-[#718296]">
                    {account.adAccountId} · {account.currency} ·{" "}
                    {account.timezoneName}
                  </p>
                  <p className="mt-1 text-[11px] text-[#95a1ae]">
                    Kiểm tra gần nhất: {formatDateTime(account.lastVerifiedAt)}
                  </p>
                </div>

                <label className="flex items-center gap-2 text-xs font-bold text-[#4d6275]">
                  <input
                    type="checkbox"
                    checked={account.isEnabled}
                    disabled={busy}
                    onChange={() => void handleToggleAccount(account)}
                    className="h-4 w-4 accent-[#fe7e4f]"
                  />
                  Đưa vào báo cáo
                </label>

                <div className="flex flex-wrap gap-2">
                  <button
                    type="button"
                    disabled={busy || !connection.configured}
                    onClick={() => void handleVerifyAccount(account)}
                    className="rounded-xl border border-[#dfe5eb] bg-white px-3 py-2 text-xs font-bold text-[#31475a] disabled:opacity-50"
                  >
                    Kiểm tra
                  </button>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => void handleDeleteAccount(account)}
                    className="rounded-xl border border-[#ffd5cd] bg-[#fff3f0] px-3 py-2 text-xs font-bold text-[#b84431] disabled:opacity-50"
                  >
                    Xóa
                  </button>
                </div>
              </article>
            ))}

            {accounts.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[#ccd5de] p-8 text-center text-sm text-[#718296]">
                Chưa có tài khoản quảng cáo trong danh sách báo cáo.
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}