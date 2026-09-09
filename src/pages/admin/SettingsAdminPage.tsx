/* eslint-disable react-hooks/set-state-in-effect */
import { useEffect, useRef, useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useSettings } from "../../features/settings/SettingsContext";
import { uploadSiteBrandImage } from "../../lib/cloudinary";
import type { SiteBrandImageKind } from "../../lib/cloudinary";
import type { StoreSettings } from "../../types/store";
import {
  normalizeExternalUrl,
  storeSocialPlatforms,
} from "../../utils/externalUrl";

type MessageType = "success" | "error";

export default function SettingsAdminPage() {
  const {
    settings,
    loading,
    error,
    refresh,
    updateSettings,
  } = useSettings();

  const [form, setForm] = useState<StoreSettings>(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState<MessageType>("success");
  const [uploadingImage, setUploadingImage] =
    useState<SiteBrandImageKind | null>(null);
  const logoInputRef = useRef<HTMLInputElement>(null);
  const faviconInputRef = useRef<HTMLInputElement>(null);
  const socialImageInputRef =
    useRef<HTMLInputElement>(null);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  function showMessage(text: string, type: MessageType) {
    setMessage(text);
    setMessageType(type);
  }

  async function handleBrandImage(
    kind: SiteBrandImageKind,
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    setMessage("");
    setUploadingImage(kind);

    try {
      const uploaded = await uploadSiteBrandImage(
        file,
        kind,
      );

      setForm((current) => {
        if (kind === "logo") {
          return {
            ...current,
            logoUrl: uploaded.url,
            logoPublicId: uploaded.publicId,
          };
        }

        if (kind === "favicon") {
          return {
            ...current,
            faviconUrl: uploaded.url,
            faviconPublicId: uploaded.publicId,
          };
        }

        return {
          ...current,
          socialShareImageUrl: uploaded.url,
          socialShareImagePublicId:
            uploaded.publicId,
        };
      });

      const uploadMessage =
        kind === "logo"
          ? "Đã tải logo. Bấm Lưu cài đặt để áp dụng."
          : kind === "favicon"
            ? "Đã tải favicon. Bấm Lưu cài đặt để áp dụng."
            : "Đã tải ảnh chia sẻ. Bấm Lưu cài đặt để áp dụng.";

      showMessage(uploadMessage, "success");
    } catch (uploadError) {
      showMessage(
        uploadError instanceof Error
          ? uploadError.message
          : "Không thể tải ảnh.",
        "error",
      );
    } finally {
      setUploadingImage(null);
    }
  }

  function clearBrandImage(kind: SiteBrandImageKind) {
    const label =
      kind === "logo"
        ? "logo website"
        : kind === "favicon"
          ? "favicon"
          : "ảnh thumbnail chia sẻ";

    if (
      !window.confirm(
        `Bỏ ${label} hiện tại và dùng cấu hình mặc định?`,
      )
    ) {
      return;
    }

    setForm((current) => {
      if (kind === "logo") {
        return {
          ...current,
          logoUrl: "",
          logoPublicId: "",
        };
      }

      if (kind === "favicon") {
        return {
          ...current,
          faviconUrl: "",
          faviconPublicId: "",
        };
      }

      return {
        ...current,
        socialShareImageUrl: "",
        socialShareImagePublicId: "",
      };
    });

    showMessage(
      `Đã bỏ ${label}. Bấm Lưu cài đặt để áp dụng.`,
      "success",
    );
  }


  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!form.storeName.trim()) {
      showMessage("Vui lòng nhập tên cửa hàng.", "error");
      return;
    }

    if (
      form.email.trim() &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())
    ) {
      showMessage("Email liên hệ không đúng định dạng.", "error");
      return;
    }

    if (
      form.messengerUrl.trim() &&
      !normalizeExternalUrl(form.messengerUrl)
    ) {
      showMessage(
        "Link Messenger không hợp lệ. Có thể nhập dạng m.me/920062987858914 hoặc link https:// đầy đủ.",
        "error",
      );
      return;
    }

    for (const platform of storeSocialPlatforms) {
      const value = form.socialLinks[platform.key].trim();

      if (value && !normalizeExternalUrl(value)) {
        showMessage(
          `Link ${platform.label} không hợp lệ.`,
          "error",
        );
        return;
      }
    }


    if (
      !form.socialShareTitle.trim() ||
      form.socialShareTitle.trim().length > 120
    ) {
      showMessage(
        "Tiêu đề chia sẻ phải có từ 1 đến 120 ký tự.",
        "error",
      );
      return;
    }

    if (
      !form.socialShareDescription.trim() ||
      form.socialShareDescription.trim().length > 200
    ) {
      showMessage(
        "Mô tả chia sẻ phải có từ 1 đến 200 ký tự.",
        "error",
      );
      return;
    }

    if (
      !Number.isFinite(form.shippingFee) ||
      form.shippingFee < 0
    ) {
      showMessage("Phí vận chuyển không hợp lệ.", "error");
      return;
    }

    if (
      !Number.isFinite(form.freeShippingThreshold) ||
      form.freeShippingThreshold < 0
    ) {
      showMessage(
        "Mốc miễn phí vận chuyển không hợp lệ.",
        "error",
      );
      return;
    }

    if (
      !form.customPrintTitle.trim() ||
      !form.customPrintDescription.trim() ||
      !form.customPrintButtonText.trim()
    ) {
      showMessage(
        "Vui lòng nhập đủ nội dung chính của trang in riêng.",
        "error",
      );
      return;
    }

    setSaving(true);
    const result = await updateSettings(form);
    setSaving(false);

    showMessage(
      result.message,
      result.success ? "success" : "error",
    );
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#006397]">
            Cấu hình
          </p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">
            Cài đặt cửa hàng
          </h1>
        </div>

        <button
          type="button"
          onClick={() => void refresh()}
          className="rounded-xl bg-[#edf4ff] px-4 py-3 text-sm font-bold text-[#006397]"
        >
          Làm mới
        </button>
      </div>

      {loading && (
        <p className="mt-5 rounded-2xl bg-[#edf4ff] px-4 py-3 text-sm font-semibold text-[#006397]">
          Đang tải cài đặt...
        </p>
      )}

      {error && (
        <p className="mt-5 rounded-2xl bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[#a43c12]">
          {error}
        </p>
      )}

      <form onSubmit={submit} className="mt-7 space-y-6">
        <article className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">Thông tin chung</h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-bold">
              Tên cửa hàng
              <input
                value={form.storeName}
                onChange={(event) =>
                  setForm({
                    ...form,
                    storeName: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none focus:border-[#006397]"
              />
            </label>

            <label className="text-sm font-bold">
              Số điện thoại
              <input
                value={form.phone}
                onChange={(event) =>
                  setForm({
                    ...form,
                    phone: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none focus:border-[#006397]"
                placeholder="0912345678"
              />
            </label>

            <label className="text-sm font-bold">
              Email
              <input
                type="email"
                value={form.email}
                onChange={(event) =>
                  setForm({
                    ...form,
                    email: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none focus:border-[#006397]"
              />
            </label>

            <label className="text-sm font-bold">
              Link Messenger
              <input
                value={form.messengerUrl}
                onChange={(event) =>
                  setForm({
                    ...form,
                    messengerUrl: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none focus:border-[#006397]"
                placeholder="m.me/920062987858914"
              />
              <span className="mt-1 block text-xs font-normal leading-5 text-[#707881]">
                Có thể nhập m.me/... hoặc đường dẫn https:// đầy đủ. Hệ thống tự bổ sung https:// khi lưu.
              </span>
            </label>

            <div className="md:col-span-2 rounded-2xl border border-[#dce3ea] bg-[#f7f9ff] p-4">
              <div>
                <h3 className="font-black">Mạng xã hội</h3>
                <p className="mt-1 text-xs leading-5 text-[#707881]">
                  Chỉ những liên kết có nhập dữ liệu mới xuất hiện ở trang Liên hệ và chân trang website.
                </p>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                {storeSocialPlatforms.map((platform) => (
                  <label key={platform.key} className="text-sm font-bold">
                    {platform.label}
                    <input
                      value={form.socialLinks[platform.key]}
                      onChange={(event) =>
                        setForm((current) => ({
                          ...current,
                          socialLinks: {
                            ...current.socialLinks,
                            [platform.key]: event.target.value,
                          },
                        }))
                      }
                      className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] bg-white px-3 font-normal outline-none focus:border-[#006397]"
                      placeholder={platform.placeholder}
                    />
                  </label>
                ))}
              </div>
            </div>

            <label className="text-sm font-bold md:col-span-2">
              Địa chỉ
              <input
                value={form.address}
                onChange={(event) =>
                  setForm({
                    ...form,
                    address: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none focus:border-[#006397]"
              />
            </label>
            <div className="md:col-span-2 rounded-2xl border border-[#dce3ea] bg-[#f7f9ff] p-4">
              <div>
                <h3 className="font-black">Thông tin pháp lý hộ kinh doanh</h3>
                <p className="mt-1 text-xs leading-5 text-[#707881]">
                  Nhập đúng theo giấy chứng nhận đăng ký hộ kinh doanh. Các trường có dữ liệu sẽ được dùng để công khai thông tin người bán trên website.
                </p>
              </div>

              <div className="mt-4 grid gap-4 md:grid-cols-2">
                <label className="text-sm font-bold">
                  Tên pháp lý hộ kinh doanh
                  <input
                    value={form.legalBusinessName}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        legalBusinessName: event.target.value,
                      })
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] bg-white px-3 font-normal outline-none focus:border-[#006397]"
                    placeholder="Nhập đúng theo giấy đăng ký"
                  />
                </label>

                <label className="text-sm font-bold">
                  Tên chủ hộ / người đại diện
                  <input
                    value={form.businessOwnerName}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        businessOwnerName: event.target.value,
                      })
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] bg-white px-3 font-normal outline-none focus:border-[#006397]"
                  />
                </label>

                <label className="text-sm font-bold">
                  Mã số thuế
                  <input
                    value={form.taxCode}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        taxCode: event.target.value,
                      })
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] bg-white px-3 font-normal outline-none focus:border-[#006397]"
                    inputMode="numeric"
                  />
                </label>

                <label className="text-sm font-bold">
                  Số GCN đăng ký hộ kinh doanh
                  <input
                    value={form.businessRegistrationNumber}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        businessRegistrationNumber: event.target.value,
                      })
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] bg-white px-3 font-normal outline-none focus:border-[#006397]"
                  />
                </label>

                <label className="text-sm font-bold">
                  Ngày cấp
                  <input
                    type="date"
                    value={form.businessRegistrationDate}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        businessRegistrationDate: event.target.value,
                      })
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] bg-white px-3 font-normal outline-none focus:border-[#006397]"
                  />
                </label>

                <label className="text-sm font-bold">
                  Nơi cấp
                  <input
                    value={form.businessRegistrationPlace}
                    onChange={(event) =>
                      setForm({
                        ...form,
                        businessRegistrationPlace: event.target.value,
                      })
                    }
                    className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] bg-white px-3 font-normal outline-none focus:border-[#006397]"
                  />
                </label>
              </div>
            </div>

            <label className="text-sm font-bold md:col-span-2">
              Mô tả chân trang
              <textarea
                value={form.footerDescription}
                onChange={(event) =>
                  setForm({
                    ...form,
                    footerDescription: event.target.value,
                  })
                }
                className="mt-2 min-h-24 w-full rounded-xl border border-[#d7dee6] p-3 font-normal outline-none focus:border-[#006397]"
              />
            </label>
          </div>
        </article>

        <article className="rounded-3xl bg-white p-6 shadow-sm">
          <div>
            <h2 className="text-xl font-black">
              Nhận diện website và chia sẻ liên kết
            </h2>
            <p className="mt-2 text-sm leading-6 text-[#707881]">
              Logo hiển thị ở đầu và cuối website. Favicon hiển
              thị trên tab trình duyệt. Ảnh chia sẻ được tự cắt
              thành 1200 × 630 px để dùng cho Facebook,
              Messenger, Zalo và các nền tảng hỗ trợ Open Graph.
            </p>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <section className="rounded-3xl border border-[#dce3ea] bg-[#f7f9ff] p-5">
              <div>
                <h3 className="font-black">Logo website</h3>
                <p className="mt-1 text-xs leading-5 text-[#707881]">
                  Giữ nguyên tỷ lệ và nền trong suốt. Logo sẽ
                  hiển thị tại Header và Footer.
                </p>
              </div>

              <div className="mt-4 grid min-h-28 place-items-center overflow-hidden rounded-2xl border border-[#d7dee6] bg-white p-4">
                {form.logoUrl ? (
                  <img
                    src={form.logoUrl}
                    alt="Xem trước logo website"
                    className="max-h-20 max-w-full object-contain"
                  />
                ) : (
                  <span className="text-center text-xl font-black text-[#006397]">
                    {form.storeName || "InGiDay"}
                  </span>
                )}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={
                    loading ||
                    saving ||
                    uploadingImage !== null
                  }
                  onClick={() =>
                    logoInputRef.current?.click()
                  }
                  className="rounded-xl bg-[#edf4ff] px-4 py-3 text-sm font-bold text-[#006397] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploadingImage === "logo"
                    ? "Đang tải..."
                    : form.logoUrl
                      ? "Thay logo"
                      : "Tải logo"}
                </button>

                <button
                  type="button"
                  disabled={
                    !form.logoUrl ||
                    loading ||
                    saving ||
                    uploadingImage !== null
                  }
                  onClick={() => clearBrandImage("logo")}
                  className="rounded-xl bg-[#fff0eb] px-4 py-3 text-sm font-bold text-[#a43c12] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Dùng tên cửa hàng
                </button>
              </div>

              <input
                ref={logoInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) =>
                  void handleBrandImage("logo", event)
                }
              />
            </section>

            <section className="rounded-3xl border border-[#dce3ea] bg-[#f7f9ff] p-5">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <h3 className="font-black">Favicon</h3>
                  <p className="mt-1 text-xs leading-5 text-[#707881]">
                    Ảnh được cắt vuông và chuyển thành PNG
                    512 × 512 px.
                  </p>
                </div>

                <div className="grid h-20 w-20 place-items-center overflow-hidden rounded-2xl border border-[#d7dee6] bg-white p-2">
                  <img
                    src={form.faviconUrl || "/favicon.svg"}
                    alt="Xem trước favicon"
                    className="h-full w-full object-contain"
                  />
                </div>
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={
                    loading ||
                    saving ||
                    uploadingImage !== null
                  }
                  onClick={() =>
                    faviconInputRef.current?.click()
                  }
                  className="rounded-xl bg-[#edf4ff] px-4 py-3 text-sm font-bold text-[#006397] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploadingImage === "favicon"
                    ? "Đang tải..."
                    : form.faviconUrl
                      ? "Thay favicon"
                      : "Tải favicon"}
                </button>

                <button
                  type="button"
                  disabled={
                    !form.faviconUrl ||
                    loading ||
                    saving ||
                    uploadingImage !== null
                  }
                  onClick={() => clearBrandImage("favicon")}
                  className="rounded-xl bg-[#fff0eb] px-4 py-3 text-sm font-bold text-[#a43c12] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Dùng mặc định
                </button>
              </div>

              <input
                ref={faviconInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) =>
                  void handleBrandImage("favicon", event)
                }
              />
            </section>

            <section className="rounded-3xl border border-[#dce3ea] bg-[#f7f9ff] p-5">
              <div>
                <h3 className="font-black">
                  Ảnh thumbnail khi chia sẻ link
                </h3>
                <p className="mt-1 text-xs leading-5 text-[#707881]">
                  Nên chọn ảnh ngang, chủ thể nằm gần trung tâm.
                </p>
              </div>

              <div className="mt-4 aspect-[1200/630] overflow-hidden rounded-2xl border border-[#d7dee6] bg-white">
                {form.socialShareImageUrl ? (
                  <img
                    src={form.socialShareImageUrl}
                    alt="Xem trước thumbnail chia sẻ"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <div className="grid h-full place-items-center px-5 text-center text-sm font-semibold text-[#707881]">
                    Chưa có ảnh chia sẻ
                  </div>
                )}
              </div>

              <div className="mt-5 flex flex-wrap gap-3">
                <button
                  type="button"
                  disabled={
                    loading ||
                    saving ||
                    uploadingImage !== null
                  }
                  onClick={() =>
                    socialImageInputRef.current?.click()
                  }
                  className="rounded-xl bg-[#edf4ff] px-4 py-3 text-sm font-bold text-[#006397] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {uploadingImage === "social-share"
                    ? "Đang tải..."
                    : form.socialShareImageUrl
                      ? "Thay thumbnail"
                      : "Tải thumbnail"}
                </button>

                <button
                  type="button"
                  disabled={
                    !form.socialShareImageUrl ||
                    loading ||
                    saving ||
                    uploadingImage !== null
                  }
                  onClick={() =>
                    clearBrandImage("social-share")
                  }
                  className="rounded-xl bg-[#fff0eb] px-4 py-3 text-sm font-bold text-[#a43c12] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  Xóa thumbnail
                </button>
              </div>

              <input
                ref={socialImageInputRef}
                type="file"
                accept="image/png,image/jpeg,image/webp"
                className="hidden"
                onChange={(event) =>
                  void handleBrandImage(
                    "social-share",
                    event,
                  )
                }
              />
            </section>
          </div>

          <div className="mt-5 grid gap-4">
            <label className="text-sm font-bold">
              Tiêu đề khi chia sẻ
              <input
                value={form.socialShareTitle}
                maxLength={120}
                onChange={(event) =>
                  setForm({
                    ...form,
                    socialShareTitle: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none focus:border-[#006397]"
              />
              <span className="mt-1 block text-right text-xs font-normal text-[#707881]">
                {form.socialShareTitle.length}/120
              </span>
            </label>

            <label className="text-sm font-bold">
              Mô tả khi chia sẻ
              <textarea
                value={form.socialShareDescription}
                maxLength={200}
                onChange={(event) =>
                  setForm({
                    ...form,
                    socialShareDescription:
                      event.target.value,
                  })
                }
                className="mt-2 min-h-24 w-full rounded-xl border border-[#d7dee6] p-3 font-normal outline-none focus:border-[#006397]"
              />
              <span className="mt-1 block text-right text-xs font-normal text-[#707881]">
                {form.socialShareDescription.length}/200
              </span>
            </label>
          </div>

          <section className="mt-5 overflow-hidden rounded-3xl border border-[#dce3ea] bg-white">
            {form.socialShareImageUrl && (
              <div className="aspect-[1200/630] overflow-hidden bg-[#edf4ff]">
                <img
                  src={form.socialShareImageUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              </div>
            )}
            <div className="p-5">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-[#707881]">
                Xem trước thẻ chia sẻ
              </p>
              <p className="mt-2 text-lg font-black text-[#091d2e]">
                {form.socialShareTitle ||
                  "Tiêu đề khi chia sẻ"}
              </p>
              <p className="mt-2 text-sm leading-6 text-[#59636d]">
                {form.socialShareDescription ||
                  "Mô tả khi chia sẻ liên kết."}
              </p>
            </div>
          </section>

          <p className="mt-4 text-xs leading-5 text-[#707881]">
            Sau khi lưu và deploy, nền tảng mạng xã hội có thể
            giữ ảnh cũ trong bộ nhớ đệm. Cần yêu cầu nền tảng
            quét lại liên kết khi kiểm thử.
          </p>
        </article>

        <article className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">
            Bán hàng và vận chuyển
          </h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-bold">
              Phí vận chuyển mặc định
              <input
                type="number"
                min="0"
                step="1000"
                value={form.shippingFee}
                onChange={(event) =>
                  setForm({
                    ...form,
                    shippingFee: Number(event.target.value),
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none focus:border-[#006397]"
              />
            </label>

            <label className="text-sm font-bold">
              Miễn phí vận chuyển từ
              <input
                type="number"
                min="0"
                step="1000"
                value={form.freeShippingThreshold}
                onChange={(event) =>
                  setForm({
                    ...form,
                    freeShippingThreshold: Number(
                      event.target.value,
                    ),
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none focus:border-[#006397]"
              />
            </label>
          </div>

          <div className="mt-5 grid gap-3">
            <label className="flex items-center gap-3 text-sm font-bold">
              <input
                type="checkbox"
                checked={form.couponEnabled}
                onChange={(event) =>
                  setForm({
                    ...form,
                    couponEnabled: event.target.checked,
                  })
                }
                className="h-5 w-5"
              />
              Cho phép sử dụng mã giảm giá
            </label>

            <label className="flex items-center gap-3 text-sm font-bold">
              <input
                type="checkbox"
                checked={form.stockEnabled}
                onChange={(event) =>
                  setForm({
                    ...form,
                    stockEnabled: event.target.checked,
                  })
                }
                className="h-5 w-5"
              />
              Bật quản lý và tự động trừ tồn kho
            </label>
          </div>
        </article>

        <article className="rounded-3xl bg-white p-6 shadow-sm">
          <h2 className="text-xl font-black">
            Nội dung trang in riêng
          </h2>

          <div className="mt-5 grid gap-4 md:grid-cols-2">
            <label className="text-sm font-bold md:col-span-2">
              Tiêu đề chính
              <input
                value={form.customPrintTitle}
                onChange={(event) =>
                  setForm({
                    ...form,
                    customPrintTitle: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none focus:border-[#006397]"
              />
            </label>

            <label className="text-sm font-bold md:col-span-2">
              Mô tả chính
              <textarea
                value={form.customPrintDescription}
                onChange={(event) =>
                  setForm({
                    ...form,
                    customPrintDescription: event.target.value,
                  })
                }
                className="mt-2 min-h-24 w-full rounded-xl border border-[#d7dee6] p-3 font-normal outline-none focus:border-[#006397]"
              />
            </label>

            <label className="text-sm font-bold md:col-span-2">
              Chữ trên nút Messenger
              <input
                value={form.customPrintButtonText}
                onChange={(event) =>
                  setForm({
                    ...form,
                    customPrintButtonText: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none focus:border-[#006397]"
              />
            </label>

            <label className="text-sm font-bold">
              Bước 1 — Tiêu đề
              <input
                value={form.customPrintStep1Title}
                onChange={(event) =>
                  setForm({
                    ...form,
                    customPrintStep1Title: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none"
              />
            </label>

            <label className="text-sm font-bold">
              Bước 1 — Mô tả
              <textarea
                value={form.customPrintStep1Description}
                onChange={(event) =>
                  setForm({
                    ...form,
                    customPrintStep1Description:
                      event.target.value,
                  })
                }
                className="mt-2 min-h-24 w-full rounded-xl border border-[#d7dee6] p-3 font-normal outline-none"
              />
            </label>

            <label className="text-sm font-bold">
              Bước 2 — Tiêu đề
              <input
                value={form.customPrintStep2Title}
                onChange={(event) =>
                  setForm({
                    ...form,
                    customPrintStep2Title: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none"
              />
            </label>

            <label className="text-sm font-bold">
              Bước 2 — Mô tả
              <textarea
                value={form.customPrintStep2Description}
                onChange={(event) =>
                  setForm({
                    ...form,
                    customPrintStep2Description:
                      event.target.value,
                  })
                }
                className="mt-2 min-h-24 w-full rounded-xl border border-[#d7dee6] p-3 font-normal outline-none"
              />
            </label>

            <label className="text-sm font-bold">
              Bước 3 — Tiêu đề
              <input
                value={form.customPrintStep3Title}
                onChange={(event) =>
                  setForm({
                    ...form,
                    customPrintStep3Title: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none"
              />
            </label>

            <label className="text-sm font-bold">
              Bước 3 — Mô tả
              <textarea
                value={form.customPrintStep3Description}
                onChange={(event) =>
                  setForm({
                    ...form,
                    customPrintStep3Description:
                      event.target.value,
                  })
                }
                className="mt-2 min-h-24 w-full rounded-xl border border-[#d7dee6] p-3 font-normal outline-none"
              />
            </label>
          </div>
        </article>

        {message && (
          <p
            className={`rounded-2xl px-4 py-3 text-sm font-semibold ${
              messageType === "success"
                ? "bg-[#dcf8eb] text-[#14633d]"
                : "bg-[#fff0eb] text-[#a43c12]"
            }`}
          >
            {message}
          </p>
        )}

        <button
          type="submit"
          disabled={saving || loading || uploadingImage !== null}
          className="min-h-12 rounded-2xl bg-[#006397] px-7 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving ? "Đang lưu..." : "Lưu cài đặt"}
        </button>
      </form>
    </section>
  );
}