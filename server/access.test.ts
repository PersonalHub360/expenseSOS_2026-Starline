import assert from "node:assert/strict";
import { test } from "node:test";
import { allows, roleCatalog } from "./access";
import { refuseProductionDemo } from "./seed-guard";

test("viewer can read properties and cannot administer users", () => {
  const viewer = roleCatalog.find((role) => role.key === "viewer");
  const properties = viewer?.permissions.find((item) => item.module === "properties");
  const users = viewer?.permissions.find((item) => item.module === "users");
  assert.equal(allows(properties, "view"), true);
  assert.equal(allows(properties, "add"), false);
  assert.equal(allows(users, "view"), false);
});

test("super admin can delete users and admin cannot", () => {
  const superAdmin = roleCatalog.find((role) => role.key === "super_admin");
  const admin = roleCatalog.find((role) => role.key === "admin");
  assert.equal(allows(superAdmin?.permissions.find((item) => item.module === "users"), "delete"), true);
  assert.equal(allows(admin?.permissions.find((item) => item.module === "users"), "delete"), false);
});

test("demo seed is refused in production", () => {
  assert.throws(() => refuseProductionDemo("production"), /production/);
  assert.doesNotThrow(() => refuseProductionDemo("development"));
});
