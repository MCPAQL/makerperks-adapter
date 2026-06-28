// The single, named derivation from an authenticated OAuth subject (the GitHub user id in
// `this.props.userId`) to the per-user profile/vault Durable Object name (#51). This is the
// security-critical seam: if it ever dropped the subject or collapsed two subjects to one
// name, every user's profile + vault would share one DO. Keeping it a pure, guarded function
// makes that invariant unit-testable (see test/workers/isolation.test.ts).

const PREFIX = "user:";

/**
 * Map an authenticated subject to its DO name. Injective and stable. THROWS on an empty or
 * non-string subject — the dangerous failure mode is anon → "" → one shared DO, so we refuse
 * it loudly rather than silently collapse identities.
 */
export function deriveDoName(subject: string): string {
  if (typeof subject !== "string" || subject.trim() === "") {
    throw new Error("cannot derive a profile DO name from an empty subject");
  }
  return `${PREFIX}${subject}`;
}
