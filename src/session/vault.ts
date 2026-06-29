// Encryption-at-rest for the credential vault (#50). Pure Web Crypto (AES-GCM), so it runs
// identically on Node 20 and on Cloudflare Workers — NO node:fs / node imports here. The key
// is provided by the caller: a keyfile under ~/.makerperks/ in local mode (src/local/
// vault-key.ts), the `VAULT_KEY` worker secret hosted (#51). The plaintext is sealed here and
// opened only server-side. It reaches the agent only DANGER-TIERED (#91): a danger ≤ 2 flow's
// credential is opened into the application package so the agent can authenticate; danger ≥ 3
// (payment / real identity) is never exposed. See openspec/changes/add-profile-vault + add-live-application.

/** A sealed secret: base64 AES-GCM ciphertext + the per-entry random IV it was sealed with. */
export interface SealedSecret {
  ciphertext: string;
  iv: string;
}

/** Seal/open bound to one AES-GCM key. Construct with `vaultCrypto(key)`. */
export interface VaultCrypto {
  seal(plaintext: string): Promise<SealedSecret>;
  open(sealed: SealedSecret): Promise<string>;
}

const AES_GCM = "AES-GCM";
const IV_BYTES = 12; // standard AES-GCM nonce length
const KEY_BYTES = 32; // AES-256

// Runtime-neutral base64 (no node Buffer) so this module stays Workers-safe.
function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary);
}

function fromBase64(b64: string): Uint8Array {
  const binary = atob(b64);
  const out = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) out[i] = binary.charCodeAt(i);
  return out;
}

export { toBase64, fromBase64 };

/** 32 cryptographically-random bytes for a fresh AES-256 vault key. */
export function generateVaultKeyBytes(): Uint8Array {
  return crypto.getRandomValues(new Uint8Array(KEY_BYTES));
}

/** Import raw key bytes as a non-extractable AES-GCM CryptoKey for seal/open. */
export function importVaultKey(raw: Uint8Array): Promise<CryptoKey> {
  if (raw.length !== KEY_BYTES) {
    throw new Error(`vault key must be ${KEY_BYTES} bytes, got ${raw.length}`);
  }
  return crypto.subtle.importKey("raw", raw, AES_GCM, false, ["encrypt", "decrypt"]);
}

/** Build a VaultCrypto bound to `key`. A fresh random IV is used per `seal`. */
export function vaultCrypto(key: CryptoKey): VaultCrypto {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  return {
    async seal(plaintext) {
      const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES));
      const ciphertext = await crypto.subtle.encrypt(
        { name: AES_GCM, iv },
        key,
        encoder.encode(plaintext),
      );
      return { ciphertext: toBase64(new Uint8Array(ciphertext)), iv: toBase64(iv) };
    },
    async open(sealed) {
      const plaintext = await crypto.subtle.decrypt(
        { name: AES_GCM, iv: fromBase64(sealed.iv) },
        key,
        fromBase64(sealed.ciphertext),
      );
      return decoder.decode(plaintext);
    },
  };
}
