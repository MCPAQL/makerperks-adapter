import test from "node:test";
import assert from "node:assert/strict";

import {
  normalizeUntrustedText,
  normalizeOptionalText,
  normalizeTextList,
  normalizeActionUrl,
  registrableDomain,
  sameRegistrableDomain,
  isExposureUrlAllowed,
  parseFormHostsEnv,
  buildProvenance,
  sha256Hex,
  UNTRUSTED_LIMITS,
} from "../dist/data/untrusted.js";

const CTRL = String.fromCharCode(7); // U+0007 bell (control)
const ZWSP = String.fromCharCode(0x200b); // zero-width space
const RLO = String.fromCharCode(0x202e); // right-to-left override (bidi)
const COMBINING_ACUTE = String.fromCharCode(0x301);
const E_ACUTE = String.fromCharCode(0xe9); // precomposed e-acute
const ELLIPSIS = String.fromCharCode(0x2026);

// --- normalization ---

test("normalizeUntrustedText strips control, zero-width, and bidi chars but keeps wording", () => {
  const dirty = "Apply" + CTRL + " here" + ZWSP + " now" + RLO + " reversed";
  assert.equal(normalizeUntrustedText(dirty), "Apply here now reversed");
});

test("normalizeUntrustedText keeps newlines and tabs (multi-line instructions survive)", () => {
  assert.equal(normalizeUntrustedText("line 1\nline 2\tend"), "line 1\nline 2\tend");
});

test("normalizeUntrustedText strips a carriage return (U+000D)", () => {
  assert.equal(normalizeUntrustedText("a\r\nb"), "a\nb");
});

test("normalizeUntrustedText applies NFC and trims", () => {
  // 'e' + combining acute (U+0301) normalizes (NFC) to precomposed U+00E9
  assert.equal(
    normalizeUntrustedText("  cafe" + COMBINING_ACUTE + "  "),
    "caf" + E_ACUTE,
  );
});

test("normalizeUntrustedText caps length with an ellipsis", () => {
  const long = "x".repeat(UNTRUSTED_LIMITS.title + 50);
  const out = normalizeUntrustedText(long, UNTRUSTED_LIMITS.title);
  assert.equal(out.length, UNTRUSTED_LIMITS.title);
  assert.ok(out.endsWith(ELLIPSIS));
});

test("normalizeUntrustedText returns '' for non-strings", () => {
  assert.equal(normalizeUntrustedText(undefined), "");
  assert.equal(normalizeUntrustedText(42), "");
});

test("normalizeOptionalText collapses empty / all-stripped input to undefined", () => {
  assert.equal(normalizeOptionalText(ZWSP), undefined);
  assert.equal(normalizeOptionalText("   "), undefined);
  assert.equal(normalizeOptionalText("real"), "real");
});

test("normalizeTextList normalizes each entry and drops empties", () => {
  assert.deepEqual(normalizeTextList(["a ", "  ", "b"]), ["a", "b"]);
  assert.deepEqual(normalizeTextList("not an array"), []);
});

// --- action_url scheme constraint ---

test("normalizeActionUrl accepts https and mailto, faithfully", () => {
  assert.equal(
    normalizeActionUrl("https://apply.example/path"),
    "https://apply.example/path",
  );
  assert.equal(
    normalizeActionUrl("  https://apply.example  "),
    "https://apply.example",
  );
  assert.equal(
    normalizeActionUrl("mailto:apply@example.com"),
    "mailto:apply@example.com",
  );
});

test("normalizeActionUrl drops unsafe schemes and junk", () => {
  for (const bad of [
    "javascript:alert(1)",
    "data:text/html,<script>",
    "file:///etc/passwd",
    "http://insecure.example",
    "not a url",
    "",
  ]) {
    assert.equal(normalizeActionUrl(bad), undefined, bad);
  }
});

// --- registrable domain + same-domain ---

test("registrableDomain handles plain and multi-part suffixes", () => {
  assert.equal(registrableDomain("apply.stripe.com"), "stripe.com");
  assert.equal(registrableDomain("stripe.com"), "stripe.com");
  assert.equal(registrableDomain("forms.apply.example.co.uk"), "example.co.uk");
});

test("sameRegistrableDomain matches exact, subdomain, and siblings; rejects different + bare hosts", () => {
  assert.ok(sameRegistrableDomain("stripe.com", "stripe.com"));
  assert.ok(sameRegistrableDomain("apply.stripe.com", "stripe.com"));
  assert.ok(sameRegistrableDomain("a.stripe.com", "b.stripe.com"));
  assert.ok(!sameRegistrableDomain("stripe.com", "evil.com"));
  assert.ok(!sameRegistrableDomain("localhost", "localhost")); // no registrable domain
});

// --- exposure gate ---

test("isExposureUrlAllowed: on-domain allowed, off-domain denied", () => {
  assert.ok(
    isExposureUrlAllowed({
      actionUrl: "https://apply.stripe.com/x",
      anchorUrl: "https://stripe.com",
    }),
  );
  assert.ok(
    !isExposureUrlAllowed({
      actionUrl: "https://evil.com/x",
      anchorUrl: "https://stripe.com",
    }),
  );
});

test("isExposureUrlAllowed: form-host allowlist permits an off-domain host", () => {
  assert.ok(
    isExposureUrlAllowed({
      actionUrl: "https://acme.typeform.com/to/x",
      anchorUrl: "https://stripe.com",
      formHosts: ["*.typeform.com"],
    }),
  );
});

test("isExposureUrlAllowed: an exact form-host entry does NOT admit a sibling tenant (#97 P1)", () => {
  // Allowlisting one tenant on a shared host must not also allow an unrelated sibling tenant.
  const base = {
    anchorUrl: "https://stripe.com",
    formHosts: ["acme.forms.vendor.com"],
  };
  assert.ok(
    isExposureUrlAllowed({ ...base, actionUrl: "https://acme.forms.vendor.com/x" }),
    "the exact allowlisted host is permitted",
  );
  assert.ok(
    isExposureUrlAllowed({ ...base, actionUrl: "https://sub.acme.forms.vendor.com/x" }),
    "a subdomain of the allowlisted host is permitted",
  );
  assert.ok(
    !isExposureUrlAllowed({ ...base, actionUrl: "https://evil.forms.vendor.com/x" }),
    "a sibling tenant on the same platform is rejected",
  );
});

test("isExposureUrlAllowed: missing or host-less URL is denied (fail safe)", () => {
  assert.ok(!isExposureUrlAllowed({ anchorUrl: "https://stripe.com" }));
  assert.ok(
    !isExposureUrlAllowed({ actionUrl: "mailto:a@b.com", anchorUrl: "https://b.com" }),
  );
});

test("parseFormHostsEnv splits, trims, and ignores blanks", () => {
  assert.deepEqual(parseFormHostsEnv(" *.typeform.com, docs.google.com ,"), [
    "*.typeform.com",
    "docs.google.com",
  ]);
  assert.deepEqual(parseFormHostsEnv(undefined), []);
  assert.deepEqual(parseFormHostsEnv(""), []);
});

// --- provenance + integrity ---

test("buildProvenance carries trust, fields, feed, and notice", () => {
  const p = buildProvenance(["title", "action_url"], {
    feed: "f1",
    feedTrust: "trusted",
  });
  assert.equal(p.trust, "untrusted-third-party");
  assert.equal(p.feed, "f1");
  assert.equal(p.feed_trust, "trusted");
  assert.deepEqual(p.untrusted_fields, ["title", "action_url"]);
  assert.match(p.notice, /not instructions/);
});

test("sha256Hex matches a known vector", async () => {
  // sha256("abc")
  assert.equal(
    await sha256Hex("abc"),
    "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
  );
});
