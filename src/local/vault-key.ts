// NODE-ONLY: load (or first-time generate) the local-mode vault key from a keyfile under the
// maker's machine — the #34 local personal-tool deployment. Mirrors the ~/.ssh pattern: one
// random 256-bit key, persisted 0600 in a 0700 dir, reused across runs. This is the ONLY place
// the vault touches the filesystem; the crypto itself (src/session/vault.ts) is pure Web Crypto
// and Workers-safe, and the hosted endpoint uses the VAULT_KEY secret instead (#51). This module
// must NOT be imported by the Workers bundle.
// See openspec/changes/add-profile-vault (capability `credential-vault`, #19).

import { mkdir, readFile, writeFile, chmod } from "node:fs/promises";
import { join } from "node:path";
import {
  fromBase64,
  generateVaultKeyBytes,
  importVaultKey,
  toBase64,
} from "../session/vault.js";

const KEY_FILENAME = "vault.key";

/**
 * Return the AES-GCM CryptoKey for `dir` (default the caller passes ~/.makerperks). On first run
 * the key is generated and persisted 0600; afterwards it is read back. A read error other than
 * "missing" is rethrown rather than silently regenerated — regenerating would orphan every
 * already-encrypted secret.
 */
export async function loadLocalVaultKey(dir: string): Promise<CryptoKey> {
  const keyPath = join(dir, KEY_FILENAME);
  try {
    const b64 = (await readFile(keyPath, "utf8")).trim();
    return await importVaultKey(fromBase64(b64));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    await mkdir(dir, { recursive: true, mode: 0o700 });
    const bytes = generateVaultKeyBytes();
    await writeFile(keyPath, toBase64(bytes), { mode: 0o600 });
    await chmod(keyPath, 0o600); // enforce perms even if umask widened the create mode
    return await importVaultKey(bytes);
  }
}
