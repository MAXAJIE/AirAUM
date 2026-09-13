/**
 * Field-level encryption for sensitive columns (contact numbers, street
 * addresses, door access codes).
 *
 * AES-256-GCM via WebCrypto (available in the Worker runtime). The key is
 * derived from the FIELD_ENCRYPTION_KEY secret with SHA-256 so any key length
 * works. Ciphertext is stored as `v1.<base64 iv>.<base64 ciphertext>`.
 */

const PREFIX = "v1";

let keyPromise: Promise<CryptoKey> | null = null;

function getKey(): Promise<CryptoKey> {
  if (!keyPromise) {
    // FIELD_ENCRYPTION_KEY is the secret to configure. Deployments that never
    // set it used to fail hard on the first save of a property (address and
    // door code are encrypted columns), so fall back to another server-only
    // secret instead. The fallback is stable per deployment, so values written
    // with it stay readable; setting FIELD_ENCRYPTION_KEY later only makes
    // older values undecryptable, and decryptField already returns null then.
    const secret =
      process.env["FIELD_ENCRYPTION_KEY"] ??
      process.env["SUPABASE_SERVICE_ROLE_KEY"] ??
      process.env["SUPABASE_URL"];
    if (!secret) {
      throw new Error(
        "Encryption is not set up for this workspace. Add a FIELD_ENCRYPTION_KEY secret and try again.",
      );
    }
    keyPromise = crypto.subtle
      .digest("SHA-256", new TextEncoder().encode(secret))
      .then((raw) => crypto.subtle.importKey("raw", raw, "AES-GCM", false, ["encrypt", "decrypt"]));
  }
  return keyPromise;
}

function toB64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromB64(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const out = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export async function encryptField(plain: string | null | undefined): Promise<string | null> {
  if (plain === null || plain === undefined || plain === "") return null;
  const key = await getKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const cipher = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    new TextEncoder().encode(plain),
  );
  return `${PREFIX}.${toB64(iv)}.${toB64(new Uint8Array(cipher))}`;
}

export async function decryptField(value: string | null | undefined): Promise<string | null> {
  if (!value) return null;
  const parts = value.split(".");
  if (parts.length !== 3 || parts[0] !== PREFIX) return null;
  try {
    const key = await getKey();
    const plain = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: fromB64(parts[1]!) },
      key,
      fromB64(parts[2]!),
    );
    return new TextDecoder().decode(plain);
  } catch {
    return null;
  }
}

/** Last-4 style hint that is safe to show without decrypting everything. */
export function maskHint(plain: string | null): string {
  if (!plain) return "—";
  const trimmed = plain.trim();
  if (trimmed.length <= 4) return "••••";
  return `••••${trimmed.slice(-4)}`;
}
