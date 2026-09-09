import { useRef, useState } from "react";
import type { ChangeEvent, DragEvent } from "react";
import type { ProductImage } from "../../types/product";
import { optimizeCloudinaryUrl, uploadProductImage } from "../../lib/cloudinary";

type Props = {
  images: ProductImage[];
  productName: string;
  disabled?: boolean;
  onChange: (images: ProductImage[]) => void;
  onUploadingChange?: (uploading: boolean) => void;
};

const MAX_IMAGES = 12;

function normalizeImages(images: ProductImage[]) {
  return images.map((image, index) => ({
    ...image,
    sortOrder: index,
    isPrimary: images.some((item) => item.isPrimary) ? image.isPrimary : index === 0,
  }));
}

export default function ProductImageManager({
  images,
  productName,
  disabled = false,
  onChange,
  onUploadingChange,
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState("");
  const [draggedId, setDraggedId] = useState<string | null>(null);

  function setUploadingState(value: boolean) {
    setUploading(value);
    onUploadingChange?.(value);
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const selected = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (selected.length === 0) return;

    const availableSlots = Math.max(0, MAX_IMAGES - images.length);
    if (availableSlots === 0) {
      setError(`Mỗi sản phẩm tối đa ${MAX_IMAGES} ảnh.`);
      return;
    }

    const files = selected.slice(0, availableSlots);
    setError("");
    setUploadingState(true);

    const uploaded: ProductImage[] = [];
    try {
      for (let index = 0; index < files.length; index += 1) {
        setProgress(`Đang xử lý ảnh ${index + 1}/${files.length}...`);
        const result = await uploadProductImage(files[index]);
        uploaded.push({
          id: crypto.randomUUID(),
          url: result.url,
          publicId: result.publicId,
          altText: productName.trim() || files[index].name,
          isPrimary: images.length === 0 && index === 0,
          sortOrder: images.length + index,
        });
      }

      onChange(normalizeImages([...images, ...uploaded]));
      setProgress(`Đã tải ${uploaded.length} ảnh.`);
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Không thể tải ảnh.");
    } finally {
      setUploadingState(false);
      window.setTimeout(() => setProgress(""), 1800);
    }
  }

  function setPrimary(id: string) {
    onChange(images.map((image) => ({ ...image, isPrimary: image.id === id })));
  }

  function removeImage(id: string) {
    const target = images.find((image) => image.id === id);
    if (!target || !window.confirm("Xóa ảnh này khỏi sản phẩm?")) return;

    const remaining = images.filter((image) => image.id !== id);
    if (target.isPrimary && remaining.length > 0) remaining[0] = { ...remaining[0], isPrimary: true };
    onChange(normalizeImages(remaining));
  }

  function moveImage(id: string, direction: -1 | 1) {
    const index = images.findIndex((image) => image.id === id);
    const nextIndex = index + direction;
    if (index < 0 || nextIndex < 0 || nextIndex >= images.length) return;
    const next = [...images];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    onChange(normalizeImages(next));
  }

  function handleDrop(event: DragEvent<HTMLDivElement>, targetId: string) {
    event.preventDefault();
    if (!draggedId || draggedId === targetId) return;
    const fromIndex = images.findIndex((image) => image.id === draggedId);
    const targetIndex = images.findIndex((image) => image.id === targetId);
    if (fromIndex < 0 || targetIndex < 0) return;
    const next = [...images];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(targetIndex, 0, moved);
    onChange(normalizeImages(next));
    setDraggedId(null);
  }

  return (
    <article className="rounded-3xl bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h2 className="text-xl font-black">Ảnh sản phẩm</h2>
          <p className="mt-1 text-sm leading-6 text-[#707881]">
            Chọn nhiều ảnh. Hệ thống tự cắt giữa ảnh thành 1:1, resize tối đa 1200px và chuyển WebP.
          </p>
        </div>
        <button
          type="button"
          disabled={disabled || uploading || images.length >= MAX_IMAGES}
          onClick={() => inputRef.current?.click()}
          className="rounded-2xl bg-[#edf4ff] px-5 py-3 text-sm font-bold text-[#006397] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? "Đang tải..." : "+ Chọn ảnh"}
        </button>
        <input ref={inputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFiles} />
      </div>

      {(progress || error) && (
        <p className={`mt-4 rounded-2xl px-4 py-3 text-sm font-semibold ${error ? "bg-[#fff0eb] text-[#a43c12]" : "bg-[#edf4ff] text-[#006397]"}`}>
          {error || progress}
        </p>
      )}

      {images.length > 0 ? (
        <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {images.map((image, index) => (
            <div
              key={image.id}
              draggable={!disabled && !uploading}
              onDragStart={() => setDraggedId(image.id)}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => handleDrop(event, image.id)}
              className={`overflow-hidden rounded-3xl border bg-[#f7f9ff] ${image.isPrimary ? "border-[#006397] ring-2 ring-[#006397]/15" : "border-[#dce3ea]"}`}
            >
              <div className="relative aspect-square overflow-hidden bg-white">
                <img
                  src={optimizeCloudinaryUrl(image.url, 500)}
                  alt={image.altText || productName || `Ảnh sản phẩm ${index + 1}`}
                  className="h-full w-full object-cover"
                  loading="lazy"
                />
                <span className="absolute left-3 top-3 rounded-full bg-black/65 px-3 py-1 text-xs font-bold text-white">#{index + 1}</span>
                {image.isPrimary && <span className="absolute right-3 top-3 rounded-full bg-[#006397] px-3 py-1 text-xs font-bold text-white">Ảnh đại diện</span>}
              </div>

              <div className="space-y-3 p-3">
                <input
                  value={image.altText ?? ""}
                  disabled={disabled || uploading}
                  onChange={(event) => onChange(images.map((item) => item.id === image.id ? { ...item, altText: event.target.value } : item))}
                  className="h-10 w-full rounded-xl border border-[#cfd6dd] bg-white px-3 text-sm outline-none focus:border-[#006397]"
                  placeholder="Mô tả ảnh"
                />
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={image.isPrimary || disabled || uploading} onClick={() => setPrimary(image.id)} className="rounded-xl bg-[#edf4ff] px-3 py-2 text-xs font-bold text-[#006397] disabled:opacity-45">Đặt đại diện</button>
                  <button type="button" disabled={disabled || uploading} onClick={() => removeImage(image.id)} className="rounded-xl bg-[#fff0eb] px-3 py-2 text-xs font-bold text-[#a43c12] disabled:opacity-45">Xóa</button>
                  <button type="button" disabled={index === 0 || disabled || uploading} onClick={() => moveImage(image.id, -1)} className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#3f4850] disabled:opacity-40">← Sang trái</button>
                  <button type="button" disabled={index === images.length - 1 || disabled || uploading} onClick={() => moveImage(image.id, 1)} className="rounded-xl bg-white px-3 py-2 text-xs font-bold text-[#3f4850] disabled:opacity-40">Sang phải →</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <button type="button" disabled={disabled || uploading} onClick={() => inputRef.current?.click()} className="mt-5 grid min-h-52 w-full place-items-center rounded-3xl border-2 border-dashed border-[#bfc7d2] bg-[#f7f9ff] p-6 text-center disabled:cursor-not-allowed">
          <span>
            <span className="block text-5xl">🖼️</span>
            <span className="mt-3 block font-black text-[#091d2e]">Chưa có ảnh sản phẩm</span>
            <span className="mt-2 block text-sm text-[#707881]">Bấm để chọn nhiều ảnh cùng lúc.</span>
          </span>
        </button>
      )}

      <p className="mt-4 text-xs text-[#707881]">Tối đa {MAX_IMAGES} ảnh. Có thể kéo thả để đổi thứ tự.</p>
    </article>
  );
}
