const cloudName =
  import.meta.env.VITE_CLOUDINARY_CLOUD_NAME;
const uploadPreset =
  import.meta.env.VITE_CLOUDINARY_UPLOAD_PRESET;

export type CloudinaryUploadResult = {
  url: string;
  publicId: string;
  width: number;
  height: number;
  bytes: number;
};

export type CloudinaryVideoUploadResult =
  CloudinaryUploadResult & {
    posterUrl: string;
    durationSeconds: number;
  };

type ProductVideoMetadata = {
  durationSeconds: number;
  width: number;
  height: number;
};

const MAX_PRODUCT_VIDEO_BYTES = 100_000_000;
const MAX_PRODUCT_VIDEO_DURATION_SECONDS = 60;
const PRODUCT_VIDEO_METADATA_TIMEOUT_MS = 15_000;

export type SiteBrandImageKind =
  | "logo"
  | "favicon"
  | "social-share";

type ImageSource = ImageBitmap | HTMLImageElement;

const MAX_SITE_BRAND_IMAGE_BYTES = 12 * 1024 * 1024;
const SITE_BRAND_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
]);

function ensureCloudinaryConfig() {
  if (!cloudName || !uploadPreset) {
    throw new Error(
      "Thiếu cấu hình Cloudinary trong .env.local.",
    );
  }
}

function assertProductVideo(file: File) {
  if (!file.type.startsWith("video/")) {
    throw new Error(
      `${file.name} không phải là file video.`,
    );
  }

  if (file.size <= 0) {
    throw new Error(
      `File ${file.name} đang trống.`,
    );
  }

  if (file.size > MAX_PRODUCT_VIDEO_BYTES) {
    throw new Error(
      "Video không được vượt quá 100 MB.",
    );
  }
}

function loadProductVideoMetadata(
  file: File,
): Promise<ProductVideoMetadata> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const video = document.createElement("video");
    let settled = false;

    const cleanup = () => {
      window.clearTimeout(timeoutId);
      video.onloadedmetadata = null;
      video.onerror = null;
      video.removeAttribute("src");
      video.load();
      URL.revokeObjectURL(objectUrl);
    };

    const finishWithError = (message: string) => {
      if (settled) return;
      settled = true;
      cleanup();
      reject(new Error(message));
    };

    const timeoutId = window.setTimeout(() => {
      finishWithError(
        `Không thể đọc thông tin video ${file.name}. Hãy dùng MP4 hoặc WebM.`,
      );
    }, PRODUCT_VIDEO_METADATA_TIMEOUT_MS);

    video.preload = "metadata";
    video.muted = true;
    video.playsInline = true;

    video.onloadedmetadata = () => {
      const durationSeconds = video.duration;
      const width = video.videoWidth;
      const height = video.videoHeight;

      if (
        !Number.isFinite(durationSeconds) ||
        durationSeconds <= 0 ||
        width <= 0 ||
        height <= 0
      ) {
        finishWithError(
          `Không thể xác định thời lượng hoặc kích thước video ${file.name}.`,
        );
        return;
      }

      if (
        durationSeconds >
        MAX_PRODUCT_VIDEO_DURATION_SECONDS
      ) {
        finishWithError(
          "Video sản phẩm không được dài quá 60 giây.",
        );
        return;
      }

      if (settled) return;
      settled = true;
      cleanup();
      resolve({
        durationSeconds,
        width,
        height,
      });
    };

    video.onerror = () => {
      finishWithError(
        `Trình duyệt không đọc được video ${file.name}. Hãy dùng MP4 hoặc WebM.`,
      );
    };

    video.src = objectUrl;
    video.load();
  });
}

function buildProductVideoPosterUrl(
  videoUrl: string,
) {
  if (!videoUrl.includes("/video/upload/")) {
    return "";
  }

  const transformed = videoUrl.replace(
    "/video/upload/",
    "/video/upload/w_1200,c_limit,q_auto:good/",
  );

  return transformed.replace(
    /\.[a-z0-9]+(?=($|\?))/i,
    ".jpg",
  );
}

async function loadImageSource(
  file: File,
): Promise<ImageSource> {
  if ("createImageBitmap" in window) {
    return createImageBitmap(file, {
      imageOrientation: "from-image",
    });
  }

  return new Promise((resolve, reject) => {
    const image = new Image();
    const url = URL.createObjectURL(file);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };

    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error(`Không thể đọc ảnh ${file.name}.`));
    };

    image.src = url;
  });
}

function sourceSize(source: ImageSource) {
  return source instanceof ImageBitmap
    ? {
        width: source.width,
        height: source.height,
      }
    : {
        width: source.naturalWidth,
        height: source.naturalHeight,
      };
}


function closeImageSource(source: ImageSource) {
  if (source instanceof ImageBitmap) {
    source.close();
  }
}

function canvasToBlob(
  canvas: HTMLCanvasElement,
  type: "image/jpeg" | "image/png" | "image/webp",
  quality?: number,
) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (result) =>
        result
          ? resolve(result)
          : reject(new Error("Không thể tối ưu ảnh.")),
      type,
      quality,
    );
  });
}

function safeImageBaseName(file: File, fallback: string) {
  return (
    file.name
      .replace(/\.[^.]+$/, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "-") || fallback
  );
}

function assertSiteBrandImage(file: File) {
  if (!SITE_BRAND_IMAGE_TYPES.has(file.type)) {
    throw new Error(
      "Chỉ hỗ trợ ảnh JPG, PNG hoặc WebP.",
    );
  }

  if (file.size > MAX_SITE_BRAND_IMAGE_BYTES) {
    throw new Error(
      "Ảnh không được vượt quá 12 MB.",
    );
  }
}

async function uploadPreparedImage(
  file: File,
): Promise<CloudinaryUploadResult> {
  ensureCloudinaryConfig();

  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/image/upload`,
    {
      method: "POST",
      body: formData,
    },
  );

  const payload = (await response.json()) as {
    secure_url?: string;
    public_id?: string;
    width?: number;
    height?: number;
    bytes?: number;
    error?: {
      message?: string;
    };
  };

  if (
    !response.ok ||
    !payload.secure_url ||
    !payload.public_id
  ) {
    throw new Error(
      payload.error?.message ||
        "Không thể tải ảnh lên Cloudinary.",
    );
  }

  return {
    url: payload.secure_url,
    publicId: payload.public_id,
    width: payload.width ?? 0,
    height: payload.height ?? 0,
    bytes: payload.bytes ?? file.size,
  };
}

export async function prepareSquareWebp(
  file: File,
  size = 1200,
  quality = 0.82,
) {
  if (!file.type.startsWith("image/")) {
    throw new Error(
      `${file.name} không phải là file ảnh.`,
    );
  }

  const source = await loadImageSource(file);
  const { width, height } = sourceSize(source);

  if (!width || !height) {
    closeImageSource(source);

    throw new Error(
      `Không thể xác định kích thước ảnh ${file.name}.`,
    );
  }

  const cropSize = Math.min(width, height);
  const sx = Math.max(0, (width - cropSize) / 2);
  const sy = Math.max(0, (height - cropSize) / 2);
  const outputSize = Math.min(
    size,
    Math.max(1, cropSize),
  );

  const canvas = document.createElement("canvas");
  canvas.width = outputSize;
  canvas.height = outputSize;

  const context = canvas.getContext("2d", {
    alpha: false,
  });

  if (!context) {
    closeImageSource(source);

    throw new Error(
      "Trình duyệt không hỗ trợ xử lý ảnh.",
    );
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, outputSize, outputSize);
  context.drawImage(
    source,
    sx,
    sy,
    cropSize,
    cropSize,
    0,
    0,
    outputSize,
    outputSize,
  );

  closeImageSource(source);

  const blob = await canvasToBlob(
    canvas,
    "image/webp",
    quality,
  );

  const safeBaseName = safeImageBaseName(
    file,
    "san-pham",
  );

  return new File(
    [blob],
    `${safeBaseName}.webp`,
    {
      type: "image/webp",
    },
  );
}

export async function uploadProductImage(
  file: File,
): Promise<CloudinaryUploadResult> {
  const optimizedFile = await prepareSquareWebp(file);
  return uploadPreparedImage(optimizedFile);
}

export async function uploadProductVideo(
  file: File,
): Promise<CloudinaryVideoUploadResult> {
  ensureCloudinaryConfig();
  assertProductVideo(file);

  const metadata = await loadProductVideoMetadata(file);
  const formData = new FormData();
  formData.append("file", file);
  formData.append("upload_preset", uploadPreset);

  const response = await fetch(
    `https://api.cloudinary.com/v1_1/${cloudName}/video/upload`,
    {
      method: "POST",
      body: formData,
    },
  );

  const payload = (await response.json()) as {
    secure_url?: string;
    public_id?: string;
    width?: number;
    height?: number;
    bytes?: number;
    duration?: number;
    error?: {
      message?: string;
    };
  };

  if (
    !response.ok ||
    !payload.secure_url ||
    !payload.public_id
  ) {
    throw new Error(
      payload.error?.message ||
        "Không thể tải video lên Cloudinary.",
    );
  }

  const durationSeconds =
    typeof payload.duration ===
      "number" &&
    Number.isFinite(payload.duration)
      ? payload.duration
      : metadata.durationSeconds;
  const width = payload.width ?? metadata.width;
  const height = payload.height ?? metadata.height;
  const bytes = payload.bytes ?? file.size;

  if (
    durationSeconds <= 0 ||
    durationSeconds >
      MAX_PRODUCT_VIDEO_DURATION_SECONDS ||
    width <= 0 ||
    height <= 0 ||
    bytes <= 0
  ) {
    throw new Error(
      "Cloudinary trả về metadata video không hợp lệ.",
    );
  }

  const posterUrl = buildProductVideoPosterUrl(
    payload.secure_url,
  );

  if (!posterUrl) {
    throw new Error(
      "Không thể tạo ảnh poster cho video.",
    );
  }

  return {
    url: payload.secure_url,
    publicId: payload.public_id,
    posterUrl,
    durationSeconds,
    width,
    height,
    bytes,
  };
}

async function prepareWebsiteLogoPng(file: File) {
  assertSiteBrandImage(file);

  const source = await loadImageSource(file);
  const { width, height } = sourceSize(source);

  if (!width || !height) {
    closeImageSource(source);
    throw new Error(
      `Không thể xác định kích thước ảnh ${file.name}.`,
    );
  }

  const maxWidth = 1200;
  const maxHeight = 480;
  const scale = Math.min(
    1,
    maxWidth / width,
    maxHeight / height,
  );
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");

  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d", {
    alpha: true,
  });

  if (!context) {
    closeImageSource(source);
    throw new Error(
      "Trình duyệt không hỗ trợ xử lý ảnh.",
    );
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, targetWidth, targetHeight);
  context.drawImage(
    source,
    0,
    0,
    width,
    height,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  closeImageSource(source);

  const blob = await canvasToBlob(
    canvas,
    "image/png",
  );
  const safeBaseName = safeImageBaseName(
    file,
    "ingiday-logo",
  );

  return new File(
    [blob],
    `${safeBaseName}-logo.png`,
    {
      type: "image/png",
    },
  );
}

async function prepareFaviconPng(file: File) {
  assertSiteBrandImage(file);

  const source = await loadImageSource(file);
  const { width, height } = sourceSize(source);

  if (!width || !height) {
    closeImageSource(source);
    throw new Error(
      `Không thể xác định kích thước ảnh ${file.name}.`,
    );
  }

  const cropSize = Math.min(width, height);
  const sx = Math.max(0, (width - cropSize) / 2);
  const sy = Math.max(0, (height - cropSize) / 2);
  const canvas = document.createElement("canvas");

  canvas.width = 512;
  canvas.height = 512;

  const context = canvas.getContext("2d", {
    alpha: true,
  });

  if (!context) {
    closeImageSource(source);
    throw new Error(
      "Trình duyệt không hỗ trợ xử lý ảnh.",
    );
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.clearRect(0, 0, 512, 512);
  context.drawImage(
    source,
    sx,
    sy,
    cropSize,
    cropSize,
    0,
    0,
    512,
    512,
  );

  closeImageSource(source);

  const blob = await canvasToBlob(
    canvas,
    "image/png",
  );
  const safeBaseName = safeImageBaseName(
    file,
    "ingiday-favicon",
  );

  return new File(
    [blob],
    `${safeBaseName}-favicon.png`,
    {
      type: "image/png",
    },
  );
}

async function prepareSocialShareJpeg(file: File) {
  assertSiteBrandImage(file);

  const source = await loadImageSource(file);
  const { width, height } = sourceSize(source);

  if (!width || !height) {
    closeImageSource(source);
    throw new Error(
      `Không thể xác định kích thước ảnh ${file.name}.`,
    );
  }

  const targetWidth = 1200;
  const targetHeight = 630;
  const targetRatio = targetWidth / targetHeight;
  const sourceRatio = width / height;

  let sx = 0;
  let sy = 0;
  let cropWidth = width;
  let cropHeight = height;

  if (sourceRatio > targetRatio) {
    cropWidth = height * targetRatio;
    sx = Math.max(0, (width - cropWidth) / 2);
  } else {
    cropHeight = width / targetRatio;
    sy = Math.max(0, (height - cropHeight) / 2);
  }

  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;

  const context = canvas.getContext("2d", {
    alpha: false,
  });

  if (!context) {
    closeImageSource(source);
    throw new Error(
      "Trình duyệt không hỗ trợ xử lý ảnh.",
    );
  }

  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.fillStyle = "#ffffff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(
    source,
    sx,
    sy,
    cropWidth,
    cropHeight,
    0,
    0,
    targetWidth,
    targetHeight,
  );

  closeImageSource(source);

  const blob = await canvasToBlob(
    canvas,
    "image/jpeg",
    0.9,
  );
  const safeBaseName = safeImageBaseName(
    file,
    "ingiday-share",
  );

  return new File(
    [blob],
    `${safeBaseName}-share.jpg`,
    {
      type: "image/jpeg",
    },
  );
}

export async function uploadSiteBrandImage(
  file: File,
  kind: SiteBrandImageKind,
): Promise<CloudinaryUploadResult> {
  const preparedFile =
    kind === "logo"
      ? await prepareWebsiteLogoPng(file)
      : kind === "favicon"
        ? await prepareFaviconPng(file)
        : await prepareSocialShareJpeg(file);

  return uploadPreparedImage(preparedFile);
}

type CloudinaryImageOptions = {
  width: number;
  height?: number;
  crop?: "fill" | "fit" | "limit";
  gravity?: "auto" | "center";
  quality?: "auto" | "auto:eco" | "auto:good";
};

export function buildCloudinaryUrl(
  url: string,
  {
    width,
    height = width,
    crop = "fill",
    gravity = "auto",
    quality = "auto:good",
  }: CloudinaryImageOptions,
) {
  if (
    !url.includes("res.cloudinary.com") ||
    !url.includes("/upload/")
  ) {
    return url;
  }

  const dimensions =
    crop === "limit"
      ? `c_limit,w_${width}`
      : `c_${crop},g_${gravity},w_${width},h_${height}`;

  const transformation = [
    "f_auto",
    `q_${quality}`,
    dimensions,
    "dpr_auto",
  ].join(",");

  return url.replace(
    "/upload/",
    `/upload/${transformation}/`,
  );
}

export function optimizeCloudinaryUrl(
  url: string,
  size = 900,
) {
  return buildCloudinaryUrl(url, {
    width: size,
    height: size,
  });
}

export function getCloudinarySrcSet(
  url: string,
  sizes: number[] = [320, 480, 640, 800, 1080],
) {
  if (
    !url.includes("res.cloudinary.com") ||
    !url.includes("/upload/")
  ) {
    return undefined;
  }

  return sizes
    .map(
      (size) =>
        `${buildCloudinaryUrl(url, {
          width: size,
          height: size,
        })} ${size}w`,
    )
    .join(", ");
}