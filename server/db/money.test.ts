import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";
import { test } from "node:test";

const schema = readFileSync(new URL("./schema.ts", import.meta.url), "utf8");

test("money columns use numeric precision instead of floating point", () => {
  assert.match(schema, /numeric\(name, \{ precision: 14, scale: 2 \}\)/);
  assert.doesNotMatch(schema, /\b(real|doublePrecision)\s*\(/);
});

test("generated migration stores amounts as numeric(14, 2)", () => {
  const files = readdirSync(new URL("../../drizzle", import.meta.url)).filter((name) => name.endsWith(".sql"));
  assert.ok(files.length > 0);
  const sql = files.map((name) => readFileSync(new URL(`../../drizzle/${name}`, import.meta.url), "utf8")).join("\n");
  assert.match(sql, /numeric\(14,\s*2\)/);
  assert.doesNotMatch(sql, /\b(real|double precision|float)\b/i);
});
