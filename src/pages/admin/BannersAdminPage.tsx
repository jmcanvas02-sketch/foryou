import { useState } from "react";
import type { ChangeEvent, FormEvent } from "react";
import { useBanners } from "../../features/banners/BannersContext";
import type { Banner, BannerInput } from "../../types/store";

const defaultBackground =
  "linear-gradient(135deg, #d9eaff 0%, #edf4ff 55%, #ffe1ef 100%)";

const emptyForm: BannerInput = {
  internalName: "",
  badge: "Sáng tạo không giới hạn",
  title: "",
  description: "",
  primaryLabel: "Khám phá ngay →",
  primaryLink: "/san-pham",
  secondaryLabel: "Yêu cầu in riêng",
  secondaryLink: "/in-rieng",
  emoji: "🐲",
  background: defaultBackground,
  imageUrl: "",
  imagePublicId: "",
  imageAlt: "",
  startsAt: "",
  endsAt: "",
  active: true,
  sortOrder: 1,
};

type CloudinaryUploadResponse = {
  secure_url?: string;
  public_id?: string;
  error?: {
    message?: string;
  };
};

type MessageType = "success" | "error";

function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new Image();

    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("Không thể đọc ảnh."));
    };

    image.src = objectUrl;
  });
}

async function prepareBannerImage(file: File) {
  const image = await loadImage(file);
  const targetRatio = 16 / 9;
  const sourceRatio = image.naturalWidth / image.naturalHeight;

  let cropWidth = image.naturalWidth;
  let cropHeight = image.naturalHeight;
  let sourceX = 0;
  let sourceY = 0;

  if (sourceRatio > targetRatio) {
    cropWidth = image.naturalHeight * targetRatio;
    sourceX = (image.naturalWidth - cropWidth) / 2;
  } else {
    cropHeight = image.naturalWidth / targetRatio;
    sourceY = (image.naturalHeight - cropHeight) / 2;
  }

  const outputWidth = Math.max(640, Math.min(1800, Math.round(cropWidth)));
  const outputHeight = Math.round(outputWidth / targetRatio);
  const canvas = document.createElement("canvas");
  canvas.width = outputWidth;
  canvas.height = outputHeight;

  const context = canvas.getContext("2d");

  if (!context) {
    throw new Error("Trình duyệt không hỗ trợ xử lý ảnh.");
  }

  context.drawImage(
    image,
    sourceX,
    sourceY,
    cropWidth,
    cropHeight,
    0,
    0,
    outputWidth,
    outputHeight,
  );

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error("Không thể nén ảnh banner."));
        }
      },
      "image/webp",
      0.86,
    );
  });
}

async function uploadBannerImage(file: File) {
  const cloudName = import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
  const uploadPreset = import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

  if (!cloudName || !uploadPreset) {
    throw new Error("Thiếu cấu hình Cloudinary trong .env.local.");
  }

  const preparedImage = await prepareBannerImage(file);
  const formData = new FormData();
  formData.append(
    "file",
    new File([preparedImage], `banner-${Date.now()}.webp`, {
      type: "image/webp",
    }),
  );
  formData.append("upload_preset", uploadPreset);
  formData.append("tags", "ingiday,banner");

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: "POST",
      body: formData,
    },
  );

  const result = (await response.json()) as CloudinaryUploadResponse;

  if (!response.ok || !result.secure_url) {
    throw new Error(
      result.error?.message ?? "Không thể tải ảnh lên Cloudinary.",
    );
  }

  return {
    url: result.secure_url,
    publicId: result.public_id ?? "",
  };
}

export default function BannersAdminPage() {
  const {
    banners,
    loading,
    error,
    refresh,
    createBanner,
    updateBanner,
    deleteBanner,
    toggleBanner,
  } = useBanners();

  const [form, setForm] = useState<BannerInput>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [messageType, setMessageType] =
    useState<MessageType>("success");
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  function showMessage(text: string, type: MessageType) {
    setMessage(text);
    setMessageType(type);
  }

  function reset(clearMessage = true) {
    setForm(emptyForm);
    setEditingId(null);

    if (clearMessage) {
      setMessage("");
    }
  }

  function edit(banner: Banner) {
    setEditingId(banner.id);
    setForm({
      internalName: banner.internalName,
      badge: banner.badge,
      title: banner.title,
      description: banner.description,
      primaryLabel: banner.primaryLabel,
      primaryLink: banner.primaryLink,
      secondaryLabel: banner.secondaryLabel,
      secondaryLink: banner.secondaryLink,
      emoji: banner.emoji,
      background: banner.background,
      imageUrl: banner.imageUrl ?? "",
      imagePublicId: banner.imagePublicId ?? "",
      imageAlt: banner.imageAlt ?? "",
      startsAt: banner.startsAt ?? "",
      endsAt: banner.endsAt ?? "",
      active: banner.active,
      sortOrder: banner.sortOrder,
    });
    setMessage("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function handleImageChange(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    event.target.value = "";

    if (!file) return;

    if (!file.type.startsWith("image/")) {
      showMessage("Vui lòng chọn đúng file ảnh.", "error");
      return;
    }

    if (file.size > 15 * 1024 * 1024) {
      showMessage("Ảnh gốc không được vượt quá 15 MB.", "error");
      return;
    }

    setUploading(true);
    setMessage("");

    try {
      const uploaded = await uploadBannerImage(file);
      setForm((current) => ({
        ...current,
        imageUrl: uploaded.url,
        imagePublicId: uploaded.publicId,
        imageAlt:
          current.imageAlt ||
          current.title ||
          current.internalName ||
          "Banner InGiDay",
      }));
      showMessage(
        "Đã tải ảnh banner lên Cloudinary và cắt theo tỷ lệ 16:9.",
        "success",
      );
    } catch (uploadError) {
      showMessage(
        uploadError instanceof Error
          ? uploadError.message
          : "Không thể tải ảnh banner.",
        "error",
      );
    } finally {
      setUploading(false);
    }
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage("");

    if (!form.internalName.trim()) {
      showMessage("Vui lòng nhập tên nội bộ.", "error");
      return;
    }

    if (!form.title.trim()) {
      showMessage("Vui lòng nhập tiêu đề banner.", "error");
      return;
    }

    if (
      form.startsAt &&
      form.endsAt &&
      form.endsAt < form.startsAt
    ) {
      showMessage(
        "Ngày kết thúc phải bằng hoặc sau ngày bắt đầu.",
        "error",
      );
      return;
    }

    setSaving(true);

    const normalized: BannerInput = {
      ...form,
      sortOrder: Math.max(0, Math.round(form.sortOrder)),
    };

    const result = editingId
      ? await updateBanner(editingId, normalized)
      : await createBanner(normalized);

    setSaving(false);

    if (!result.success) {
      showMessage(result.message, "error");
      return;
    }

    reset(false);
    showMessage(result.message, "success");
  }

  async function handleToggle(banner: Banner) {
    setBusyId(banner.id);
    const result = await toggleBanner(banner.id);
    setBusyId(null);
    showMessage(result.message, result.success ? "success" : "error");
  }

  async function handleDelete(banner: Banner) {
    if (!confirm(`Xóa banner ${banner.internalName}?`)) return;

    setBusyId(banner.id);
    const result = await deleteBanner(banner.id);
    setBusyId(null);

    if (editingId === banner.id && result.success) {
      reset(false);
    }

    showMessage(result.message, result.success ? "success" : "error");
  }

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-[#006397]">
            Giao diện
          </p>
          <h1 className="mt-2 text-3xl font-black sm:text-4xl">
            Quản lý banner
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

      {error && (
        <p className="mt-5 rounded-2xl bg-[#fff0eb] px-4 py-3 text-sm font-semibold text-[#a43c12]">
          {error}
        </p>
      )}

      <form
        onSubmit={submit}
        className="mt-7 rounded-3xl bg-white p-6 shadow-sm"
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xl font-black">
            {editingId ? "Sửa banner" : "Thêm banner"}
          </h2>

          {editingId && (
            <button
              type="button"
              onClick={() => reset()}
              className="text-sm font-bold text-[#006397]"
            >
              Hủy sửa
            </button>
          )}
        </div>

        <div className="mt-5 grid gap-5 lg:grid-cols-[360px_1fr]">
          <div>
            <div
              className="relative aspect-video overflow-hidden rounded-3xl border border-[#d7dee6]"
              style={{ background: form.background }}
            >
              {form.imageUrl ? (
                <img
                  src={form.imageUrl}
                  alt={form.imageAlt || form.title || "Banner"}
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="grid h-full place-items-center text-7xl">
                  {form.emoji || "🐲"}
                </div>
              )}
            </div>

            <label className="mt-4 flex min-h-12 cursor-pointer items-center justify-center rounded-2xl bg-[#006397] px-5 text-center text-sm font-bold text-white">
              {uploading ? "Đang tải và nén ảnh..." : "Chọn ảnh banner"}
              <input
                type="file"
                accept="image/*"
                disabled={uploading}
                onChange={(event) => void handleImageChange(event)}
                className="hidden"
              />
            </label>

            <p className="mt-2 text-xs leading-5 text-[#707881]">
              Ảnh được cắt giữa theo tỷ lệ 16:9, chuyển WebP và thu nhỏ trước
              khi tải lên Cloudinary.
            </p>

            {form.imageUrl && (
              <button
                type="button"
                onClick={() =>
                  setForm((current) => ({
                    ...current,
                    imageUrl: "",
                    imagePublicId: "",
                    imageAlt: "",
                  }))
                }
                className="mt-3 text-sm font-bold text-[#a43c12]"
              >
                Bỏ ảnh khỏi banner
              </button>
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <label className="text-sm font-bold">
              Tên nội bộ
              <input
                value={form.internalName}
                onChange={(event) =>
                  setForm({
                    ...form,
                    internalName: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none focus:border-[#006397]"
              />
            </label>

            <label className="text-sm font-bold">
              Nhãn nhỏ
              <input
                value={form.badge}
                onChange={(event) =>
                  setForm({ ...form, badge: event.target.value })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none focus:border-[#006397]"
              />
            </label>

            <label className="text-sm font-bold md:col-span-2">
              Tiêu đề
              <input
                value={form.title}
                onChange={(event) =>
                  setForm({ ...form, title: event.target.value })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none focus:border-[#006397]"
              />
            </label>

            <label className="text-sm font-bold md:col-span-2">
              Mô tả
              <textarea
                value={form.description}
                onChange={(event) =>
                  setForm({
                    ...form,
                    description: event.target.value,
                  })
                }
                className="mt-2 min-h-24 w-full rounded-xl border border-[#d7dee6] p-3 font-normal outline-none focus:border-[#006397]"
              />
            </label>

            <label className="text-sm font-bold">
              Nút chính
              <input
                value={form.primaryLabel}
                onChange={(event) =>
                  setForm({
                    ...form,
                    primaryLabel: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none"
              />
            </label>

            <label className="text-sm font-bold">
              Link nút chính
              <input
                value={form.primaryLink}
                onChange={(event) =>
                  setForm({
                    ...form,
                    primaryLink: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none"
              />
            </label>

            <label className="text-sm font-bold">
              Nút phụ
              <input
                value={form.secondaryLabel}
                onChange={(event) =>
                  setForm({
                    ...form,
                    secondaryLabel: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none"
              />
            </label>

            <label className="text-sm font-bold">
              Link nút phụ
              <input
                value={form.secondaryLink}
                onChange={(event) =>
                  setForm({
                    ...form,
                    secondaryLink: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none"
              />
            </label>

            <label className="text-sm font-bold">
              Biểu tượng dự phòng
              <input
                value={form.emoji}
                onChange={(event) =>
                  setForm({ ...form, emoji: event.target.value })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none"
              />
            </label>

            <label className="text-sm font-bold">
              Thứ tự hiển thị
              <input
                type="number"
                min="0"
                value={form.sortOrder}
                onChange={(event) =>
                  setForm({
                    ...form,
                    sortOrder: Number(event.target.value),
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none"
              />
            </label>

            <label className="text-sm font-bold md:col-span-2">
              Mô tả ảnh
              <input
                value={form.imageAlt ?? ""}
                onChange={(event) =>
                  setForm({
                    ...form,
                    imageAlt: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none"
                placeholder="Mô tả ngắn nội dung ảnh"
              />
            </label>

            <label className="text-sm font-bold md:col-span-2">
              Nền CSS
              <input
                value={form.background}
                onChange={(event) =>
                  setForm({
                    ...form,
                    background: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-mono text-xs font-normal outline-none"
              />
            </label>

            <label className="text-sm font-bold">
              Ngày bắt đầu
              <input
                type="date"
                value={form.startsAt ?? ""}
                onChange={(event) =>
                  setForm({
                    ...form,
                    startsAt: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none"
              />
            </label>

            <label className="text-sm font-bold">
              Ngày kết thúc
              <input
                type="date"
                value={form.endsAt ?? ""}
                onChange={(event) =>
                  setForm({
                    ...form,
                    endsAt: event.target.value,
                  })
                }
                className="mt-2 h-11 w-full rounded-xl border border-[#d7dee6] px-3 font-normal outline-none"
              />
            </label>
          </div>
        </div>

        <label className="mt-5 flex items-center gap-3 text-sm font-bold">
          <input
            type="checkbox"
            checked={form.active}
            onChange={(event) =>
              setForm({ ...form, active: event.target.checked })
            }
            className="h-5 w-5"
          />
          Hiển thị banner
        </label>

        {message && (
          <p
            className={`mt-4 rounded-xl px-4 py-3 text-sm font-semibold ${
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
          disabled={saving || uploading}
          className="mt-5 min-h-11 rounded-xl bg-[#006397] px-6 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
        >
          {saving
            ? "Đang lưu..."
            : editingId
              ? "Lưu thay đổi"
              : "Thêm banner"}
        </button>
      </form>

      <div className="mt-6 grid gap-5 xl:grid-cols-2">
        {loading && (
          <div className="rounded-3xl bg-white p-10 text-center text-[#707881] shadow-sm xl:col-span-2">
            Đang tải banner...
          </div>
        )}

        {!loading &&
          [...banners]
            .sort((left, right) => left.sortOrder - right.sortOrder)
            .map((banner) => (
              <article
                key={banner.id}
                className="overflow-hidden rounded-3xl bg-white shadow-sm"
              >
                <div
                  className="relative aspect-[16/7] overflow-hidden"
                  style={{ background: banner.background }}
                >
                  {banner.imageUrl ? (
                    <img
                      src={banner.imageUrl}
                      alt={banner.imageAlt || banner.title}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <div className="grid h-full place-items-center text-7xl">
                      {banner.emoji}
                    </div>
                  )}

                  <div className="absolute inset-0 bg-gradient-to-t from-black/45 via-transparent to-transparent" />
                  <span className="absolute left-4 top-4 rounded-full bg-white/85 px-3 py-1 text-xs font-bold">
                    {banner.badge}
                  </span>
                  <h2 className="absolute bottom-4 left-4 right-4 text-xl font-black text-white">
                    {banner.title}
                  </h2>
                </div>

                <div className="p-5">
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <p className="font-black">{banner.internalName}</p>
                      <p className="mt-1 text-xs text-[#707881]">
                        Thứ tự {banner.sortOrder} ·{" "}
                        {banner.active ? "Đang hiển thị" : "Đang ẩn"}
                      </p>
                    </div>

                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={busyId === banner.id}
                        onClick={() => edit(banner)}
                        className="rounded-xl bg-[#edf4ff] px-3 py-2 text-sm font-bold text-[#006397] disabled:opacity-50"
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        disabled={busyId === banner.id}
                        onClick={() => void handleToggle(banner)}
                        className="rounded-xl bg-[#fff7f1] px-3 py-2 text-sm font-bold text-[#a43c12] disabled:opacity-50"
                      >
                        {banner.active ? "Ẩn" : "Hiện"}
                      </button>
                      <button
                        type="button"
                        disabled={busyId === banner.id}
                        onClick={() => void handleDelete(banner)}
                        className="rounded-xl bg-[#fff0eb] px-3 py-2 text-sm font-bold text-[#a43c12] disabled:opacity-50"
                      >
                        Xóa
                      </button>
                    </div>
                  </div>
                </div>
              </article>
            ))}

        {!loading && banners.length === 0 && (
          <div className="rounded-3xl bg-white p-10 text-center text-[#707881] shadow-sm xl:col-span-2">
            Chưa có banner.
          </div>
        )}
      </div>
    </section>
  );
}