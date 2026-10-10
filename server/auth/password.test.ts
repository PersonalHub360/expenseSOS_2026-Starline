import assert from "node:assert/strict";
import { test } from "node:test";
import { hashPassword, verifyPassword } from "./password";

test("password hashes verify only the original password", async () => {
  const hash = await hashPassword("correct-horse-battery");
  assert.equal(hash.startsWith("scrypt$"), true);
  assert.equal(await verifyPassword("correct-horse-battery", hash), true);
  assert.equal(await verifyPassword("wrong-horse-battery", hash), false);
  assert.equal(await verifyPassword("correct-horse-battery", "plain-text"), false);
});
