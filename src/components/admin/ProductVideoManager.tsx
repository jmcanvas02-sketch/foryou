import { useRef, useState } from "react";
import type {
  ChangeEvent,
  DragEvent,
} from "react";
import {
  optimizeCloudinaryUrl,
  uploadProductVideo,
} from "../../lib/cloudinary";
import type { ProductVideo } from "../../types/product";

type Props = {
  videos: ProductVideo[];
  productName: string;
  disabled?: boolean;
  onChange: (videos: ProductVideo[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
};

const MAX_VIDEOS = 12;

function normalizeVideos(videos: ProductVideo[]) {
  return videos.map((video, index) => ({
    ...video,
    sortOrder: index,
  }));
}

function formatDuration(seconds: number) {
  const roundedSeconds = Math.max(
    0,
    Math.round(seconds),
  );
  const minutes = Math.floor(roundedSeconds / 60);
  const remainingSeconds = roundedSeconds % 60;

  return `${minutes}:${String(remainingSeconds).padStart(2, "0")}`;
}

function formatBytes(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) {
    return "Không rõ dung lượng";
  }

  const megabytes = bytes / (1024 * 1024);

  return megabytes >= 1
    ? `${megabytes.toFixed(1)} MB`
    : `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export default function ProductVideoManager({
  videos,
  productName,
  disabled = false,
  onChange,
  onUploadingChange,
}: Props) {
  const addInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [draggedId, setDraggedId] =
    useState<string | null>(null);
  const [previewId, setPreviewId] =
    useState<string | null>(null);
  const [replacingId, setReplacingId] =
    useState<string | null>(null);

  function setUploadingState(value: boolean) {
    setUploading(value);
    onUploadingChange?.(value);
  }

  async function handleAddFiles(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const selected = Array.from(
      event.target.files ?? [],
    );
    event.target.value = "";

    if (selected.length === 0) return;

    const availableSlots = Math.max(
      0,
      MAX_VIDEOS - videos.length,
    );

    if (availableSlots === 0) {
      setError(
        `Mỗi sản phẩm tối đa ${MAX_VIDEOS} video.`,
      );
      return;
    }

    const files = selected.slice(0, availableSlots);
    const uploaded: ProductVideo[] = [];

    setError("");
    setProgress("");
    setUploadingState(true);

    try {
      for (
        let index = 0;
        index < files.length;
        index += 1
      ) {
        const file = files[index];

        setProgress(
          `Đang tải video ${index + 1}/${files.length}: ${file.name}`,
        );

        const result = await uploadProductVideo(file);

        uploaded.push({
          id: crypto.randomUUID(),
          url: result.url,
          publicId: result.publicId,
          posterUrl: result.posterUrl,
          altText:
            productName.trim() ||
            file.name.replace(/\.[^.]+$/, ""),
          sortOrder: videos.length + index,
          durationSeconds: result.durationSeconds,
          width: result.width,
          height: result.height,
          bytes: result.bytes,
        });
      }

      setProgress(
        `Đã tải ${uploaded.length} video.`,
      );
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Không thể tải video.",
      );
    } finally {
      if (uploaded.length > 0) {
        onChange(
          normalizeVideos([
            ...videos,
            ...uploaded,
          ]),
        );
      }

      setUploadingState(false);
      window.setTimeout(
        () => setProgress(""),
        1800,
      );
    }
  }

  function requestReplace(id: string) {
    setReplacingId(id);
    replaceInputRef.current?.click();
  }

  async function handleReplaceFile(
    event: ChangeEvent<HTMLInputElement>,
  ) {
    const file = event.target.files?.[0];
    const targetId = replacingId;

    event.target.value = "";
    setReplacingId(null);

    if (!file || !targetId) return;

    const target = videos.find(
      (video) => video.id === targetId,
    );

    if (!target) {
      setError("Không tìm thấy video cần thay.");
      return;
    }

    setError("");
    setProgress(`Đang thay video: ${file.name}`);
    setUploadingState(true);

    try {
      const result = await uploadProductVideo(file);

      onChange(
        normalizeVideos(
          videos.map((video) =>
            video.id === targetId
              ? {
                  ...video,
                  url: result.url,
                  publicId: result.publicId,
                  posterUrl: result.posterUrl,
                  altText:
                    video.altText ||
                    productName.trim() ||
                    file.name.replace(/\.[^.]+$/, ""),
                  durationSeconds:
                    result.durationSeconds,
                  width: result.width,
                  height: result.height,
                  bytes: result.bytes,
                }
              : video,
          ),
        ),
      );

      setPreviewId(null);
      setProgress("Đã thay video.");
    } catch (uploadError) {
      setError(
        uploadError instanceof Error
          ? uploadError.message
          : "Không thể thay video.",
      );
    } finally {
      setUploadingState(false);
      window.setTimeout(
        () => setProgress(""),
        1800,
      );
    }
  }

  function removeVideo(id: string) {
    const target = videos.find(
      (video) => video.id === id,
    );

    if (
      !target ||
      !window.confirm(
        "Xóa video này khỏi sản phẩm?",
      )
    ) {
      return;
    }

    if (previewId === id) {
      setPreviewId(null);
    }

    onChange(
      normalizeVideos(
        videos.filter(
          (video) => video.id !== id,
        ),
      ),
    );
  }

  function moveVideo(
    id: string,
    direction: -1 | 1,
  ) {
    const index = videos.findIndex(
      (video) => video.id === id,
    );
    const nextIndex = index + direction;

    if (
      index < 0 ||
      nextIndex < 0 ||
      nextIndex >= videos.length
    ) {
      return;
    }

    const next = [...videos];

    [next[index], next[nextIndex]] = [
      next[nextIndex],
      next[index],
    ];

    onChange(normalizeVideos(next));
  }

  function handleDrop(
    event: DragEvent<HTMLDivElement>,
    targetId: string,
  ) {
    event.preventDefault();

    if (
      !draggedId ||
      draggedId === targetId
    ) {
      return;
    }

    const fromIndex = videos.findIndex(
      (video) => video.id === draggedId,
    );
    const targetIndex = videos.findIndex(
      (video) => video.id === targetId,
    );

    if (
      fromIndex < 0 ||
      targetIndex < 0
    ) {
      return;
    }

    const next = [...videos];
    const [moved] = next.splice(
      fromIndex,
      1,
    );

    next.splice(targetIndex, 0, moved);
    onChange(normalizeVideos(next));
    setDraggedId(null);
  }

  return (
    <article className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black">
            Video sản phẩm
          </h2>
          <p className="mt-1 text-sm leading-6 text-[#707881]">
            Chọn nhiều video MP4 hoặc WebM. Mỗi video tối đa
            60 giây và 100 MB.
          </p>
        </div>

        <button
          type="button"
          disabled={
            disabled ||
            uploading ||
            videos.length >= MAX_VIDEOS
          }
          onClick={() =>
            addInputRef.current?.click()
          }
          className="rounded-2xl bg-[#edf4ff] px-5 py-3 text-sm font-bold text-[#006397] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading
            ? "Đang tải..."
            : "+ Chọn video"}
        </button>

        <input
          ref={addInputRef}
          type="file"
          accept="video/mp4,video/webm"
          multiple
          className="hidden"
          onChange={handleAddFiles}
        />

        <input
          ref={replaceInputRef}
          type="file"
          accept="video/mp4,video/webm"
          className="hidden"
          onChange={handleReplaceFile}
        />
      </div>

      {(progress || error) && (
        <p
          className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${
            error
              ? "bg-[#fff0eb] text-[#a43c12]"
              : "bg-[#edf4ff] text-[#006397]"
          }`}
        >
          {error || progress}
        </p>
      )}

      {videos.length > 0 ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {videos.map((video, index) => {
            const isPreviewing =
              previewId === video.id;

            return (
              <div
                key={video.id}
                draggable={
                  !disabled && !uploading
                }
                onDragStart={() =>
                  setDraggedId(video.id)
                }
                onDragEnd={() =>
                  setDraggedId(null)
                }
                onDragOver={(event) =>
                  event.preventDefault()
                }
                onDrop={(event) =>
                  handleDrop(event, video.id)
                }
                className="overflow-hidden rounded-3xl border border-[#dce3ea] bg-[#f7f9ff]"
              >
                <div className="relative aspect-video overflow-hidden bg-black">
                  {isPreviewing ? (
                    <video
                      key={video.url}
                      src={video.url}
                      poster={video.posterUrl}
                      controls
                      playsInline
                      preload="metadata"
                      className="h-full w-full object-contain"
                    >
                      Trình duyệt không hỗ trợ video.
                    </video>
                  ) : (
                    <>
                      <img
                        src={optimizeCloudinaryUrl(
                          video.posterUrl,
                          600,
                        )}
                        alt={
                          video.altText ||
                          productName ||
                          `Video sản phẩm ${index + 1}`
                        }
                        className="h-full w-full object-cover"
                        loading="lazy"
                      />
                      <button
                        type="button"
                        disabled={
                          disabled || uploading
                        }
                        onClick={() =>
                          setPreviewId(video.id)
                        }
                        className="absolute inset-0 grid place-items-center bg-black/10 disabled:cursor-not-allowed"
                        aria-label={`Xem video ${index + 1}`}
                      >
                        <span className="grid h-14 w-14 place-items-center rounded-full bg-black/70 pl-1 text-2xl text-white shadow-lg">
                          ▶
                        </span>
                      </button>
                    </>
                  )}

                  <span className="absolute left-3 top-3 rounded-full bg-black/65 px-3 py-1 text-xs font-bold text-white">
                    #{index + 1}
                  </span>

                  {isPreviewing && (
                    <button
                      type="button"
                      onClick={() =>
                        setPreviewId(null)
                      }
                      className="absolute right-3 top-3 rounded-full bg-black/65 px-3 py-1 text-xs font-bold text-white"
                    >
                      Đóng xem trước
                    </button>
                  )}
                </div>

                <div className="space-y-3 p-3">
                  <div className="flex flex-wrap gap-2 text-xs font-semibold text-[#59636d]">
                    <span className="rounded-full bg-white px-3 py-1">
                      {formatDuration(
                        video.durationSeconds,
                      )}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1">
                      {video.width}×{video.height}
                    </span>
                    <span className="rounded-full bg-white px-3 py-1">
                      {formatBytes(video.bytes)}
                    </span>
                  </div>

                  <input
                    value={video.altText ?? ""}
                    disabled={
                      disabled || uploading
                    }
                    onChange={(event) =>
                      onChange(
                        videos.map((item) =>
                          item.id === video.id
                            ? {
                                ...item,
                                altText:
                                  event.target.value,
                              }
                            : item,
                        ),
                      )
                    }
                    className="h-10 w-full rounded-xl border border-[#cfd6dd] bg-white px-3 text-sm outline-none focus:border-[#006397]"
                    placeholder="Mô tả video"
                  />

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      disabled={
                        disabled || uploading
                      }
                      onClick={() =>
                        requestReplace(video.id)
                      }
                      className="rounded-xl bg-[#edf4ff] px-3 py-2 text-xs font-bold text-[#006397] disabled:opacity-45"
                    >
                      Thay video
                    </button>

                    <button
                      type="button"
                      disabled={
                        disabled || uploading
                      }
                      onClick={() =>
                        removeVideo(video.id)
                      }
                      className="rounded-xl bg-[#fff0eb] px-3 py-2 text-xs font-bold text-[#a43c12] disabled:opacity-45"
                    >
                      Xóa
                    </button>

                    <button
                      type="button"
                      disabled={
                        index === 0 ||
                        disabled ||
                        uploading
                      }
                      onClick={() =>
                        moveVideo(video.id, -1)
                      }
                      className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#3f4850] disabled:opacity-40"
                    >
                      ← Sang trái
                    </button>

                    <button
                      type="button"
                      disabled={
                        index ===
                          videos.length - 1 ||
                        disabled ||
                        uploading
                      }
                      onClick={() =>
                        moveVideo(video.id, 1)
                      }
                      className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#3f4850] disabled:opacity-40"
                    >
                      Sang phải →
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <button
          type="button"
          disabled={disabled || uploading}
          onClick={() =>
            addInputRef.current?.click()
          }
          className="mt-5 grid min-h-52 w-full place-items-center rounded-3xl border-2 border-dashed border-[#bfc7d2] bg-[#f7f9ff] p-6 text-center disabled:cursor-not-allowed"
        >
          <span>
            <span className="block text-5xl">
              🎬
            </span>
            <span className="mt-3 block font-black text-[#091d2e]">
              Chưa có video sản phẩm
            </span>
            <span className="mt-2 block text-sm text-[#707881]">
              Bấm để chọn nhiều video cùng lúc.
            </span>
          </span>
        </button>
      )}

      <p className="mt-4 text-xs text-[#707881]">
        Tối đa {MAX_VIDEOS} video. Chỉ video đang xem trước
        mới tải nguồn phát; có thể kéo thả để đổi thứ tự.
      </p>
    </article>
  );
}