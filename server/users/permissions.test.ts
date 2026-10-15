import assert from "node:assert/strict";
import test from "node:test";
import { modules } from "../access";
import { normalizePermissions, permissionCeilingError, roleKeyFromName } from "./validate";

test("a role name becomes a stable key", () => {
  assert.equal(roleKeyFromName("Site Manager"), "site_manager");
  assert.equal(roleKeyFromName("  HR  "), "hr");
  assert.equal(roleKeyFromName("1"), null);
});

test("granting add also keeps view", () => {
  const [dashboard] = normalizePermissions([{ module: "dashboard", canView: false, canAdd: true, canEdit: false, canDelete: false }]);
  assert.equal(dashboard?.canView, true);
  assert.equal(dashboard?.canAdd, true);
  assert.equal(normalizePermissions([]).length, modules.length);
});

test("a narrower role cannot grant a permission it lacks", () => {
  const actor = normalizePermissions([{ module: "users", canView: true, canAdd: true, canEdit: true, canDelete: false }]);
  const blocked = permissionCeilingError(actor, [
    { module: "users", canView: true, canAdd: true, canEdit: true, canDelete: true },
  ]);
  assert.match(blocked ?? "", /permissions you already have/);
  assert.equal(
    permissionCeilingError(actor, [{ module: "users", canView: true, canAdd: true, canEdit: false, canDelete: false }]),
    null,
  );
});
