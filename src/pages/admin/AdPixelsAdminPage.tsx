import {
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { FormEvent } from "react";

import {
  countProductAdAssignments,
  createAdDataSource,
  checkMetaDomainVerificationOnHomepage,
  deleteAdDataSource,
  deleteAdDataSourceToken,
  deleteMetaDomainVerification,
  listAdDataSources,
  loadMetaDomainVerification,
  saveAdDataSourceToken,
  saveMetaDomainVerification,
  testMetaCapiConnection,
  updateAdDataSource,
} from "../../services/ads";
import {
  AD_EVENT_NAMES,
} from "../../types/ads";
import type {
  MetaCapiTestResult,
} from "../../services/ads";
import type {
  AdDataSource,
  AdDataSourceInput,
  AdEventName,
  AdPlatform,
  MetaDomainVerificationCheck,
  MetaDomainVerificationConfig,
} from "../../types/ads";

const platformInfo: Record<
  AdPlatform,
  {
    label: string;
    description: string;
    badgeClass: string;
  }
> = {
  meta: {
    label: "Meta",
    description: "Meta Pixel và Conversions API",
    badgeClass: "bg-[#e8f2ff] text-[#1769aa]",
  },
  tiktok: {
    label: "TikTok",
    description: "TikTok Pixel và Events API",
    badgeClass: "bg-[#eef0f3] text-[#15191d]",
  },
};

const eventLabels: Record<AdEventName, string> = {
  PageView: "Xem trang",
  ViewContent: "Xem sản phẩm",
  Search: "Tìm kiếm",
  AddToCart: "Thêm vào giỏ",
  InitiateCheckout: "Bắt đầu thanh toán",
  Purchase: "Mua hàng",
};

function defaultInput(
  platform: AdPlatform,
): AdDataSourceInput {
  return {
    platform,
    name: "",
    pixelId: "",
    isDefault: false,
    isActive: true,
    browserEnabled: true,
    serverEnabled: true,
    testMode: true,
    testEventCode: "",
    apiVersion: "",
    purchaseTrigger: "order_created",
    eventSettings: AD_EVENT_NAMES.map(
      (eventName) => ({
        eventName,
        browserEnabled: true,
        serverEnabled:
          eventName !== "PageView" &&
          eventName !== "Search",
      }),
    ),
  };
}

function inputFromSource(
  source: AdDataSource,
): AdDataSourceInput {
  return {
    platform: source.platform,
    name: source.name,
    pixelId: source.pixelId,
    isDefault: source.isDefault,
    isActive: source.isActive,
    browserEnabled: source.browserEnabled,
    serverEnabled: source.serverEnabled,
    testMode: source.testMode,
    testEventCode: source.testEventCode,
    apiVersion: source.apiVersion,
    purchaseTrigger: source.purchaseTrigger,
    eventSettings: source.eventSettings.map(
      (setting) => ({ ...setting }),
    ),
  };
}

function statusLabel(source: AdDataSource) {
  if (!source.isActive) {
    return "Tạm tắt";
  }

  return source.isDefault
    ? "Mặc định toàn website"
    : "Đang hoạt động";
}

export default function AdPixelsAdminPage() {
  const [sources, setSources] = useState<
    AdDataSource[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState("");
  const [removingTokenId, setRemovingTokenId] =
    useState("");
  const [accessToken, setAccessToken] = useState("");
  const [metaTestCodes, setMetaTestCodes] = useState<
    Record<string, string>
  >({});
  const [testingMetaId, setTestingMetaId] = useState("");
  const [metaTestResults, setMetaTestResults] = useState<
    Record<string, MetaCapiTestResult | undefined>
  >({});
  const [
    domainVerification,
    setDomainVerification,
  ] = useState<MetaDomainVerificationConfig | null>(
    null,
  );
  const [
    domainVerificationValue,
    setDomainVerificationValue,
  ] = useState("");
  const [
    domainVerificationCheck,
    setDomainVerificationCheck,
  ] = useState<MetaDomainVerificationCheck | null>(
    null,
  );
  const [
    domainVerificationLoading,
    setDomainVerificationLoading,
  ] = useState(true);
  const [
    domainVerificationSaving,
    setDomainVerificationSaving,
  ] = useState(false);
  const [
    domainVerificationChecking,
    setDomainVerificationChecking,
  ] = useState(false);
  const [
    domainVerificationRemoving,
    setDomainVerificationRemoving,
  ] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [editingId, setEditingId] = useState<
    string | null
  >(null);
  const [form, setForm] = useState<
    AdDataSourceInput | null
  >(null);

  const loadSources = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      setSources(await listAdDataSources());
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Không thể tải danh sách Pixel.",
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const loadDomainVerification = useCallback(
    async () => {
      setDomainVerificationLoading(true);

      try {
        const config =
          await loadMetaDomainVerification();

        setDomainVerification(config);
        setDomainVerificationValue(
          config.tag ?? config.code ?? "",
        );
        setDomainVerificationCheck(null);
      } catch (loadError) {
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Không thể tải cấu hình xác minh tên miền Meta.",
        );
      } finally {
        setDomainVerificationLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void loadSources();
      void loadDomainVerification();
    }, 0);

    return () => {
      window.clearTimeout(timerId);
    };
  }, [loadDomainVerification, loadSources]);

  const groupedSources = useMemo(
    () => ({
      meta: sources.filter(
        (source) => source.platform === "meta",
      ),
      tiktok: sources.filter(
        (source) => source.platform === "tiktok",
      ),
    }),
    [sources],
  );

  const editingSource = editingId
    ? sources.find((source) => source.id === editingId)
    : undefined;

  function openCreate(platform: AdPlatform) {
    setEditingId(null);
    setForm(defaultInput(platform));
    setAccessToken("");
    setError("");
    setNotice("");
  }

  function openEdit(source: AdDataSource) {
    setEditingId(source.id);
    setForm(inputFromSource(source));
    setAccessToken("");
    setError("");
    setNotice("");
  }

  function closeForm() {
    if (!saving) {
      setEditingId(null);
      setForm(null);
      setAccessToken("");
    }
  }

  function updateEvent(
    eventName: AdEventName,
    field: "browserEnabled" | "serverEnabled",
    checked: boolean,
  ) {
    setForm((current) =>
      current
        ? {
            ...current,
            eventSettings: current.eventSettings.map(
              (setting) =>
                setting.eventName === eventName
                  ? {
                      ...setting,
                      [field]: checked,
                    }
                  : setting,
            ),
          }
        : current,
    );
  }

  async function submit(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();

    if (!form) {
      return;
    }

    if (!form.name.trim()) {
      setError("Vui lòng nhập tên cấu hình Pixel.");
      return;
    }

    if (!form.pixelId.trim()) {
      setError("Vui lòng nhập Pixel ID hoặc Pixel Code.");
      return;
    }

    setSaving(true);
    setError("");
    setNotice("");

    try {
      let sourceId = editingId;

      if (sourceId) {
        await updateAdDataSource(sourceId, form);
      } else {
        sourceId = await createAdDataSource(form);
      }

      if (accessToken.trim()) {
        await saveAdDataSourceToken(
          sourceId,
          accessToken,
        );
      }

      setNotice(
        editingId
          ? accessToken.trim()
            ? "Đã cập nhật Pixel và Access Token."
            : "Đã cập nhật Pixel quảng cáo."
          : accessToken.trim()
            ? "Đã thêm Pixel và Access Token."
            : "Đã thêm Pixel quảng cáo.",
      );
      setEditingId(null);
      setForm(null);
      setAccessToken("");
      await loadSources();
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Không thể lưu Pixel quảng cáo.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function remove(source: AdDataSource) {
    setDeletingId(source.id);
    setError("");
    setNotice("");

    try {
      const assignmentCount =
        await countProductAdAssignments(source.id);
      const detail = assignmentCount > 0
        ? ` Pixel này đang gắn với ${assignmentCount} sản phẩm. Các sản phẩm đó sẽ tự quay về Pixel mặc định.`
        : "";

      const confirmed = window.confirm(
        `Xóa “${source.name}”?${detail}`,
      );

      if (!confirmed) {
        return;
      }

      await deleteAdDataSource(source.id);
      setNotice("Đã xóa Pixel quảng cáo.");

      if (editingId === source.id) {
        setEditingId(null);
        setForm(null);
      }

      await loadSources();
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Không thể xóa Pixel quảng cáo.",
      );
    } finally {
      setDeletingId("");
    }
  }

  async function removeToken(
    source: AdDataSource,
  ) {
    const confirmed = window.confirm(
      `Xóa Access Token của “${source.name}”? CAPI / Events API sẽ không gửi được cho đến khi token mới được thiết lập.`,
    );

    if (!confirmed) {
      return;
    }

    setRemovingTokenId(source.id);
    setError("");
    setNotice("");

    try {
      await deleteAdDataSourceToken(source.id);
      setNotice("Đã xóa Access Token.");
      await loadSources();
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Không thể xóa Access Token.",
      );
    } finally {
      setRemovingTokenId("");
    }
  }

  async function testMetaCapi(
    source: AdDataSource,
  ) {
    const testEventCode =
      (metaTestCodes[source.id] ?? "")
        .trim()
        .toUpperCase();

    if (!/^TEST\d{1,20}$/.test(testEventCode)) {
      setError(
        "Mã sự kiện thử nghiệm Meta phải có dạng TEST và các chữ số, ví dụ TEST78712.",
      );
      return;
    }

    setTestingMetaId(source.id);
    setError("");
    setNotice("");
    setMetaTestResults((current) => ({
      ...current,
      [source.id]: undefined,
    }));

    try {
      const result = await testMetaCapiConnection(
        source.id,
        testEventCode,
      );

      setMetaTestCodes((current) => ({
        ...current,
        [source.id]: testEventCode,
      }));
      setMetaTestResults((current) => ({
        ...current,
        [source.id]: result,
      }));
      await loadSources();
    } catch (testError) {
      setError(
        testError instanceof Error
          ? testError.message
          : "Không thể kiểm tra Meta CAPI.",
      );
    } finally {
      setTestingMetaId("");
    }
  }

  async function runDomainVerificationCheck(
    code: string,
  ) {
    setDomainVerificationChecking(true);
    setDomainVerificationCheck(null);

    try {
      const result =
        await checkMetaDomainVerificationOnHomepage(
          code,
        );

      setDomainVerificationCheck(result);

      return result;
    } finally {
      setDomainVerificationChecking(false);
    }
  }

  async function submitDomainVerification(
    event: FormEvent<HTMLFormElement>,
  ) {
    event.preventDefault();
    setDomainVerificationSaving(true);
    setError("");
    setNotice("");
    setDomainVerificationCheck(null);

    try {
      const saved =
        await saveMetaDomainVerification(
          domainVerificationValue,
        );

      setDomainVerification(saved);
      setDomainVerificationValue(
        saved.tag ?? saved.code ?? "",
      );

      if (!saved.code) {
        throw new Error(
          "Không nhận được mã xác minh sau khi lưu.",
        );
      }

      try {
        const checked =
          await runDomainVerificationCheck(
            saved.code,
          );

        setNotice(
          checked.verified
            ? "Đã lưu và xác nhận thẻ Meta trong HTML trang chủ."
            : "Đã lưu mã xác minh, nhưng HTML trang chủ chưa hiển thị đúng thẻ.",
        );
      } catch (checkError) {
        setNotice(
          "Đã lưu mã xác minh, nhưng chưa thể kiểm tra HTML trang chủ.",
        );
        setDomainVerificationCheck({
          verified: false,
          foundCode: null,
          message:
            checkError instanceof Error
              ? checkError.message
              : "Không thể kiểm tra HTML trang chủ.",
        });
      }
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Không thể lưu xác minh tên miền Meta.",
      );
    } finally {
      setDomainVerificationSaving(false);
    }
  }

  async function checkDomainVerification() {
    if (!domainVerification?.code) {
      setError(
        "Chưa có mã xác minh tên miền Meta để kiểm tra.",
      );
      return;
    }

    setError("");
    setNotice("");

    try {
      const checked =
        await runDomainVerificationCheck(
          domainVerification.code,
        );

      setNotice(
        checked.verified
          ? "Đã xác nhận thẻ Meta trong HTML trang chủ."
          : "HTML trang chủ chưa hiển thị đúng thẻ Meta.",
      );
    } catch (checkError) {
      setError(
        checkError instanceof Error
          ? checkError.message
          : "Không thể kiểm tra HTML trang chủ.",
      );
    }
  }

  async function removeDomainVerification() {
    const confirmed = window.confirm(
      "Xóa mã xác minh tên miền Meta khỏi website?",
    );

    if (!confirmed) {
      return;
    }

    setDomainVerificationRemoving(true);
    setError("");
    setNotice("");
    setDomainVerificationCheck(null);

    try {
      const removed =
        await deleteMetaDomainVerification();

      setDomainVerification(removed);
      setDomainVerificationValue("");
      setNotice(
        "Đã xóa mã xác minh tên miền Meta.",
      );
    } catch (removeError) {
      setError(
        removeError instanceof Error
          ? removeError.message
          : "Không thể xóa xác minh tên miền Meta.",
      );
    } finally {
      setDomainVerificationRemoving(false);
    }
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#006397]">
            Quảng cáo
          </p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">
            Pixel quảng cáo
          </h1>
          <p className="mt-3 max-w-3xl text-sm leading-6 text-[#707881]">
            Quản lý Meta Pixel, TikTok Pixel và Access Token mã hóa mà không cần sửa mã nguồn.
          </p>
        </div>
      </div>

      {error && (
        <p className="mt-6 rounded-2xl bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[#a43c12]">
          {error}
        </p>
      )}

      {notice && (
        <p className="mt-6 rounded-2xl bg-[#ecf8f1] px-4 py-3 text-sm font-semibold text-[#23734d]">
          {notice}
        </p>
      )}

      <form
        onSubmit={submitDomainVerification}
        className="mt-7 rounded-3xl border border-[#dbe5ef] bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="inline-flex rounded-full bg-[#e8f2ff] px-3 py-1 text-xs font-black text-[#1769aa]">
              Meta
            </p>
            <h2 className="mt-3 text-2xl font-black">
              Xác minh tên miền Meta
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[#707881]">
              Dán nguyên thẻ Meta hoặc chỉ mã trong thuộc tính content. Hệ thống chỉ lưu mã an toàn và chèn thẻ vào phần &lt;head&gt; của HTML trang chủ.
            </p>
          </div>

          <span className={`rounded-full px-3 py-1 text-xs font-black ${
            domainVerification?.configured
              ? "bg-[#ecf8f1] text-[#23734d]"
              : "bg-[#f1f3f5] text-[#707881]"
          }`}>
            {domainVerificationLoading
              ? "Đang tải..."
              : domainVerification?.configured
                ? "Đã thiết lập"
                : "Chưa thiết lập"}
          </span>
        </div>

        <label className="mt-6 block text-sm font-bold">
          Thẻ Meta hoặc mã xác minh
          <textarea
            value={domainVerificationValue}
            onChange={(event) => {
              setDomainVerificationValue(
                event.target.value,
              );
              setDomainVerificationCheck(null);
            }}
            disabled={
              domainVerificationLoading ||
              domainVerificationSaving ||
              domainVerificationRemoving
            }
            rows={4}
            className="mt-2 w-full rounded-2xl border border-[#cfd6dd] bg-[#f7f9ff] px-4 py-3 font-mono text-sm font-normal leading-6 outline-none focus:border-[#006397] disabled:opacity-60"
            placeholder={'<meta name="facebook-domain-verification" content="mã_xác_minh_của_bạn" />'}
          />
        </label>

        {domainVerification?.code && (
          <div className="mt-4 rounded-2xl bg-[#f7f9ff] p-4">
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-[#707881]">
              Thẻ đang lưu
            </p>
            <code className="mt-2 block break-all text-sm text-[#39434c]">
              {domainVerification.tag}
            </code>
          </div>
        )}

        {domainVerificationCheck && (
          <div className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${
            domainVerificationCheck.verified
              ? "bg-[#ecf8f1] text-[#23734d]"
              : "bg-[#fff7e8] text-[#8a5a00]"
          }`}>
            <p>
              {domainVerificationCheck.verified
                ? "Đã hiển thị trong HTML"
                : "Chưa hiển thị đúng trong HTML"}
            </p>
            <p className="mt-1 font-normal leading-6">
              {domainVerificationCheck.message}
            </p>
            {domainVerificationCheck.foundCode && (
              <p className="mt-1 break-all font-mono text-xs font-normal">
                Mã tìm thấy:{" "}
                {domainVerificationCheck.foundCode}
              </p>
            )}
          </div>
        )}

        <div className="mt-5 flex flex-wrap gap-3">
          <button
            type="submit"
            disabled={
              domainVerificationLoading ||
              domainVerificationSaving ||
              domainVerificationChecking ||
              domainVerificationRemoving
            }
            className="rounded-2xl bg-[#006397] px-5 py-3 text-sm font-bold text-white disabled:opacity-60"
          >
            {domainVerificationSaving
              ? "Đang lưu..."
              : domainVerificationChecking
                ? "Đang kiểm tra..."
                : "Lưu và kiểm tra"}
          </button>

          {domainVerification?.configured && (
            <button
              type="button"
              onClick={() =>
                void checkDomainVerification()
              }
              disabled={
                domainVerificationChecking ||
                domainVerificationSaving ||
                domainVerificationRemoving
              }
              className="rounded-2xl bg-[#edf4ff] px-5 py-3 text-sm font-bold text-[#006397] disabled:opacity-60"
            >
              {domainVerificationChecking
                ? "Đang kiểm tra..."
                : "Kiểm tra lại"}
            </button>
          )}

          {domainVerification?.configured && (
            <button
              type="button"
              onClick={() =>
                void removeDomainVerification()
              }
              disabled={
                domainVerificationRemoving ||
                domainVerificationSaving ||
                domainVerificationChecking
              }
              className="rounded-2xl bg-[#fff0eb] px-5 py-3 text-sm font-bold text-[#a43c12] disabled:opacity-60"
            >
              {domainVerificationRemoving
                ? "Đang xóa..."
                : "Xóa mã xác minh"}
            </button>
          )}
        </div>

        <p className="mt-4 text-xs leading-5 text-[#707881]">
          Sau khi trạng thái báo “Đã hiển thị trong HTML”, mở Meta Business Manager và bấm xác minh tên miền.
        </p>
      </form>

      {form && (
        <form
          onSubmit={submit}
          className="mt-7 rounded-3xl bg-white p-6 shadow-sm"
        >
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${platformInfo[form.platform].badgeClass}`}>
                {platformInfo[form.platform].label}
              </p>
              <h2 className="mt-3 text-2xl font-black">
                {editingId
                  ? "Sửa cấu hình Pixel"
                  : "Thêm Pixel mới"}
              </h2>
            </div>
            <button
              type="button"
              onClick={closeForm}
              className="rounded-xl bg-[#f1f4f7] px-4 py-2 text-sm font-bold text-[#3f4850]"
            >
              Đóng
            </button>
          </div>

          <div className="mt-6 grid gap-5 md:grid-cols-2">
            <label className="text-sm font-bold">
              Tên dễ nhớ
              <input
                value={form.name}
                onChange={(event) =>
                  setForm({
                    ...form,
                    name: event.target.value,
                  })
                }
                className="mt-2 h-12 w-full rounded-2xl border border-[#cfd6dd] bg-[#f7f9ff] px-4 font-normal outline-none focus:border-[#006397]"
                placeholder="Ví dụ: Meta Pixel chính"
              />
            </label>

            <label className="text-sm font-bold">
              {form.platform === "meta"
                ? "Meta Pixel ID"
                : "TikTok Pixel Code"}
              <input
                value={form.pixelId}
                onChange={(event) =>
                  setForm({
                    ...form,
                    pixelId: event.target.value,
                  })
                }
                className="mt-2 h-12 w-full rounded-2xl border border-[#cfd6dd] bg-[#f7f9ff] px-4 font-normal outline-none focus:border-[#006397]"
                placeholder={
                  form.platform === "meta"
                    ? "Nhập Pixel ID"
                    : "Nhập Pixel Code"
                }
              />
            </label>

            <label className="text-sm font-bold">
              Phiên bản API
              <input
                value={form.apiVersion}
                onChange={(event) =>
                  setForm({
                    ...form,
                    apiVersion: event.target.value,
                  })
                }
                className="mt-2 h-12 w-full rounded-2xl border border-[#cfd6dd] bg-[#f7f9ff] px-4 font-normal outline-none focus:border-[#006397]"
                placeholder="Để trống và cấu hình khi bật CAPI"
              />
            </label>

            <label className="text-sm font-bold">
              Mã sự kiện kiểm thử
              <input
                value={form.testEventCode}
                onChange={(event) =>
                  setForm({
                    ...form,
                    testEventCode: event.target.value,
                  })
                }
                className="mt-2 h-12 w-full rounded-2xl border border-[#cfd6dd] bg-[#f7f9ff] px-4 font-normal outline-none focus:border-[#006397]"
                placeholder="Có thể để trống"
              />
            </label>

            <label className="text-sm font-bold md:col-span-2">
              Gửi Purchase khi
              <select
                value={form.purchaseTrigger}
                onChange={(event) =>
                  setForm({
                    ...form,
                    purchaseTrigger: event.target.value as AdDataSourceInput["purchaseTrigger"],
                  })
                }
                className="mt-2 h-12 w-full rounded-2xl border border-[#cfd6dd] bg-[#f7f9ff] px-4 font-normal outline-none focus:border-[#006397]"
              >
                <option value="order_created">
                  Đơn được tạo thành công
                </option>
                <option value="order_confirmed">
                  Nhân viên xác nhận đơn
                </option>
                <option value="order_completed">
                  Đơn hoàn thành
                </option>
              </select>
            </label>
          </div>

          <div className="mt-6 rounded-3xl border border-[#dce3ea] bg-[#f7f9ff] p-5">
            <label className="block text-sm font-bold">
              Access Token
              <input
                type="password"
                value={accessToken}
                onChange={(event) =>
                  setAccessToken(event.target.value)
                }
                autoComplete="new-password"
                className="mt-2 h-12 w-full rounded-2xl border border-[#cfd6dd] bg-white px-4 font-normal outline-none focus:border-[#006397]"
                placeholder={
                  editingSource?.tokenConfigured
                    ? "Để trống để giữ token hiện tại"
                    : "Nhập Access Token"
                }
              />
            </label>
            <div className="mt-3 flex flex-wrap items-center justify-between gap-3 text-xs text-[#707881]">
              <p>
                Token được gửi thẳng tới Cloudflare Function, mã hóa AES-GCM và không thể đọc lại trong admin.
              </p>
              {editingSource && (
                <p className="font-bold text-[#3f4850]">
                  Trạng thái:{" "}
                  {editingSource.tokenConfigured
                    ? "Đã thiết lập"
                    : "Chưa thiết lập"}
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            {[
              ["isActive", "Đang hoạt động"],
              ["isDefault", "Pixel mặc định"],
              ["browserEnabled", "Browser Pixel"],
              ["serverEnabled", "CAPI / Events API"],
              ["testMode", "Chế độ kiểm thử"],
            ].map(([field, label]) => (
              <label
                key={field}
                className="flex items-center gap-3 rounded-2xl bg-[#f7f9ff] p-4 text-sm font-bold"
              >
                <input
                  type="checkbox"
                  checked={Boolean(
                    form[
                      field as keyof AdDataSourceInput
                    ],
                  )}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      [field]: event.target.checked,
                    })
                  }
                  className="h-5 w-5 accent-[#006397]"
                />
                {label}
              </label>
            ))}
          </div>

          <div className="mt-7 overflow-hidden rounded-3xl border border-[#dce3ea]">
            <div className="grid grid-cols-[1fr_110px_110px] bg-[#f1f5f9] px-4 py-3 text-xs font-black uppercase tracking-[0.12em] text-[#59636d]">
              <span>Sự kiện</span>
              <span className="text-center">Browser</span>
              <span className="text-center">Server</span>
            </div>
            {form.eventSettings.map((setting) => (
              <div
                key={setting.eventName}
                className="grid grid-cols-[1fr_110px_110px] items-center border-t border-[#e4e9ee] px-4 py-3 text-sm"
              >
                <div>
                  <p className="font-bold">
                    {eventLabels[setting.eventName]}
                  </p>
                  <p className="text-xs text-[#707881]">
                    {setting.eventName}
                  </p>
                </div>
                <div className="text-center">
                  <input
                    type="checkbox"
                    checked={setting.browserEnabled}
                    onChange={(event) =>
                      updateEvent(
                        setting.eventName,
                        "browserEnabled",
                        event.target.checked,
                      )
                    }
                    className="h-5 w-5 accent-[#006397]"
                  />
                </div>
                <div className="text-center">
                  <input
                    type="checkbox"
                    checked={setting.serverEnabled}
                    onChange={(event) =>
                      updateEvent(
                        setting.eventName,
                        "serverEnabled",
                        event.target.checked,
                      )
                    }
                    className="h-5 w-5 accent-[#006397]"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="min-h-12 rounded-2xl bg-[#fe7e4f] px-7 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
            >
              {saving ? "Đang lưu..." : "Lưu cấu hình"}
            </button>
          </div>
        </form>
      )}

      <div className="mt-8 grid gap-7 xl:grid-cols-2">
        {(["meta", "tiktok"] as const).map(
          (platform) => {
            const info = platformInfo[platform];
            const platformSources =
              groupedSources[platform];

            return (
              <article
                key={platform}
                className="rounded-3xl bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <p className={`inline-flex rounded-full px-3 py-1 text-xs font-black ${info.badgeClass}`}>
                      {info.label}
                    </p>
                    <h2 className="mt-3 text-2xl font-black">
                      {info.description}
                    </h2>
                    <p className="mt-1 text-sm text-[#707881]">
                      {platformSources.length} cấu hình
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openCreate(platform)}
                    className="rounded-2xl bg-[#006397] px-5 py-3 text-sm font-bold text-white"
                  >
                    + Thêm Pixel
                  </button>
                </div>

                <div className="mt-6 space-y-4">
                  {loading && (
                    <div className="rounded-2xl bg-[#f7f9ff] p-6 text-center text-sm text-[#707881]">
                      Đang tải cấu hình...
                    </div>
                  )}

                  {!loading &&
                    platformSources.length === 0 && (
                      <div className="rounded-2xl border border-dashed border-[#bfc7d2] p-6 text-center text-sm text-[#707881]">
                        Chưa có Pixel nào.
                      </div>
                    )}

                  {platformSources.map((source) => (
                    <div
                      key={source.id}
                      className="rounded-3xl border border-[#dce3ea] p-5"
                    >
                      <div className="flex flex-wrap items-start justify-between gap-4">
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="text-lg font-black">
                              {source.name}
                            </h3>
                            <span className={`rounded-full px-2.5 py-1 text-xs font-bold ${source.isActive ? "bg-[#ecf8f1] text-[#23734d]" : "bg-[#f1f3f5] text-[#707881]"}`}>
                              {statusLabel(source)}
                            </span>
                          </div>
                          <p className="mt-2 break-all font-mono text-sm text-[#59636d]">
                            {source.pixelId}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => openEdit(source)}
                            className="rounded-xl bg-[#edf4ff] px-4 py-2 text-sm font-bold text-[#006397]"
                          >
                            Sửa
                          </button>
                          <button
                            type="button"
                            disabled={deletingId === source.id}
                            onClick={() => void remove(source)}
                            className="rounded-xl bg-[#fff0eb] px-4 py-2 text-sm font-bold text-[#a43c12] disabled:opacity-60"
                          >
                            {deletingId === source.id
                              ? "Đang xóa..."
                              : "Xóa"}
                          </button>
                        </div>
                      </div>

                      <div className="mt-4 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-2xl bg-[#f7f9ff] p-4 text-sm">
                          <p className="font-bold">Kênh gửi</p>
                          <p className="mt-1 text-[#707881]">
                            Browser: {source.browserEnabled ? "Bật" : "Tắt"} · Server: {source.serverEnabled ? "Bật" : "Tắt"}
                          </p>
                        </div>
                        <div className="rounded-2xl bg-[#f7f9ff] p-4 text-sm">
                          <div className="flex flex-wrap items-start justify-between gap-3">
                            <div>
                              <p className="font-bold">Access Token</p>
                              <p className="mt-1 text-[#707881]">
                                {source.tokenConfigured
                                  ? "Đã thiết lập và mã hóa"
                                  : "Chưa thiết lập"}
                              </p>
                              {source.tokenUpdatedAt && (
                                <p className="mt-1 text-xs text-[#8a929a]">
                                  Cập nhật:{" "}
                                  {new Date(
                                    source.tokenUpdatedAt,
                                  ).toLocaleString("vi-VN")}
                                </p>
                              )}
                            </div>
                            {source.tokenConfigured && (
                              <button
                                type="button"
                                disabled={
                                  removingTokenId === source.id
                                }
                                onClick={() =>
                                  void removeToken(source)
                                }
                                className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#a43c12] shadow-sm disabled:opacity-60"
                              >
                                {removingTokenId === source.id
                                  ? "Đang xóa..."
                                  : "Xóa token"}
                              </button>
                            )}
                          </div>
                        </div>
                      </div>

                      {source.platform === "meta" && (
                        <div className="mt-4 rounded-2xl border border-[#cfe0ef] bg-[#f7fbff] p-4">
                          <p className="font-bold">
                            Kiểm tra Meta CAPI
                          </p>
                          <p className="mt-1 text-sm leading-6 text-[#707881]">
                            Nhập mã trong Meta Events Manager → Test Events. Mã chỉ dùng cho lần kiểm tra này và không được lưu vào cấu hình production.
                          </p>

                          <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                            <input
                              value={
                                metaTestCodes[source.id] ?? ""
                              }
                              onChange={(event) =>
                                setMetaTestCodes((current) => ({
                                  ...current,
                                  [source.id]:
                                    event.target.value.toUpperCase(),
                                }))
                              }
                              disabled={testingMetaId === source.id}
                              className="h-12 flex-1 rounded-2xl border border-[#cfd6dd] bg-white px-4 font-mono text-sm outline-none focus:border-[#006397] disabled:opacity-60"
                              placeholder="TEST78712"
                              autoComplete="off"
                            />
                            <button
                              type="button"
                              disabled={
                                testingMetaId === source.id ||
                                !source.tokenConfigured
                              }
                              onClick={() =>
                                void testMetaCapi(source)
                              }
                              className="h-12 rounded-2xl bg-[#1769aa] px-5 text-sm font-bold text-white disabled:opacity-60"
                            >
                              {testingMetaId === source.id
                                ? "Đang gửi Meta..."
                                : "Kiểm tra Meta CAPI"}
                            </button>
                          </div>

                          {!source.tokenConfigured && (
                            <p className="mt-3 text-sm font-semibold text-[#a43c12]">
                              Cần thiết lập Access Token trước khi kiểm tra.
                            </p>
                          )}

                          {metaTestResults[source.id] && (
                            <div className={`mt-4 rounded-2xl px-4 py-3 text-sm ${
                              metaTestResults[source.id]?.success
                                ? "bg-[#ecf8f1] text-[#23734d]"
                                : "bg-[#fff0eb] text-[#a43c12]"
                            }`}>
                              <p className="font-black">
                                {metaTestResults[source.id]?.success
                                  ? "Kết nối Meta CAPI thành công"
                                  : "Meta CAPI từ chối sự kiện"}
                              </p>
                              <p className="mt-2 leading-6">
                                {metaTestResults[source.id]?.message}
                              </p>
                              <div className="mt-3 space-y-1 font-mono text-xs leading-5">
                                <p>
                                  test_event_code: {metaTestResults[source.id]?.testEventCode}
                                </p>
                                <p>
                                  HTTP: {metaTestResults[source.id]?.status}
                                </p>
                                <p>
                                  events_received: {metaTestResults[source.id]?.eventsReceived ?? "—"}
                                </p>
                                {metaTestResults[source.id]?.metaErrorCode && (
                                  <p>
                                    Meta code: {metaTestResults[source.id]?.metaErrorCode}
                                  </p>
                                )}
                                {metaTestResults[source.id]?.metaErrorSubcode !== null &&
                                  metaTestResults[source.id]?.metaErrorSubcode !== undefined && (
                                    <p>
                                      Meta subcode: {metaTestResults[source.id]?.metaErrorSubcode}
                                    </p>
                                  )}
                                {metaTestResults[source.id]?.metaErrorType && (
                                  <p>
                                    Meta type: {metaTestResults[source.id]?.metaErrorType}
                                  </p>
                                )}
                                {metaTestResults[source.id]?.fbtraceId && (
                                  <p className="break-all">
                                    fbtrace_id: {metaTestResults[source.id]?.fbtraceId}
                                  </p>
                                )}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </article>
            );
          },
        )}
      </div>
    </section>
  );
}
