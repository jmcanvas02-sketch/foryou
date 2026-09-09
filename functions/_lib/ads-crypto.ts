import { HttpError } from "./http";

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function decodeBase64(value: string) {
  const normalized = value
    .trim()
    .replace(/-/g, "+")
    .replace(/_/g, "/");
  const padding =
    normalized.length % 4 === 0
      ? ""
      : "=".repeat(4 - (normalized.length % 4));

  try {
    const binary = atob(normalized + padding);
    const bytes = new Uint8Array(binary.length);

    for (
      let index = 0;
      index < binary.length;
      index += 1
    ) {
      bytes[index] = binary.charCodeAt(index);
    }

    return bytes;
  } catch {
    throw new HttpError(
      500,
      "ADS_TOKEN_ENCRYPTION_KEY không đúng định dạng Base64.",
    );
  }
}

function encodeBase64(bytes: Uint8Array) {
  let binary = "";

  for (
    let index = 0;
    index < bytes.length;
    index += 1
  ) {
    binary += String.fromCharCode(bytes[index]);
  }

  return btoa(binary);
}

async function importEncryptionKey(
  encodedKey: string,
) {
  const keyBytes = decodeBase64(encodedKey);

  if (keyBytes.byteLength !== 32) {
    throw new HttpError(
      500,
      "ADS_TOKEN_ENCRYPTION_KEY phải là khóa 256 bit được mã hóa Base64.",
    );
  }

  return crypto.subtle.importKey(
    "raw",
    keyBytes,
    {
      name: "AES-GCM",
    },
    false,
    [
      "encrypt",
      "decrypt",
    ],
  );
}

export async function encryptAccessToken(
  accessToken: string,
  encodedKey: string,
) {
  const key =
    await importEncryptionKey(encodedKey);
  const initializationVector =
    crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv: initializationVector,
    },
    key,
    encoder.encode(accessToken),
  );

  return {
    ciphertext: encodeBase64(
      new Uint8Array(ciphertext),
    ),
    initializationVector: encodeBase64(
      initializationVector,
    ),
    algorithm: "AES-GCM" as const,
  };
}

export async function decryptAccessToken(
  ciphertext: string,
  initializationVector: string,
  encodedKey: string,
) {
  const key =
    await importEncryptionKey(encodedKey);

  try {
    const plaintext = await crypto.subtle.decrypt(
      {
        name: "AES-GCM",
        iv: decodeBase64(initializationVector),
      },
      key,
      decodeBase64(ciphertext),
    );

    return decoder.decode(plaintext);
  } catch {
    throw new HttpError(
      500,
      "Không thể giải mã Access Token.",
    );
  }
}
