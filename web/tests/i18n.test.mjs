import test from "node:test";
import assert from "node:assert/strict";
import { translate, interpolate, en, es } from "../src/lib/i18n.ts";

test("every English key has an es translation (full catalog parity)", () => {
  const missing = Object.keys(en).filter((key) => !(key in es));
  assert.deepEqual(missing, [], `add these keys to the es catalog: ${missing.join(", ")}`);
});

test("missing key falls back to English and then to the key itself", () => {
  assert.equal(translate("es", "nav.schedule"), "Horario");
  assert.equal(translate("en", "nav.schedule"), "Schedule");
  assert.equal(translate("es", "definitely.nope"), "definitely.nope");
});

test("interpolation fills named variables and keeps unknown braces", () => {
  assert.equal(interpolate("Saved {count} files", { count: 4 }), "Saved 4 files");
  assert.equal(interpolate("Hello {nobody}"), "Hello {nobody}");
});
