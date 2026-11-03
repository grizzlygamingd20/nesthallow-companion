import { test } from "node:test";
import assert from "node:assert/strict";
import { isKeeper, keeperEmail } from "../lib/keeper.ts";

const env = { KEEPER_EMAIL: " Keeper@Example.com " };

test("only the configured, verified email is the Keeper", () => {
  assert.equal(isKeeper("keeper@example.com", true, env), true);
  assert.equal(isKeeper("KEEPER@example.com", true, env), true);
  assert.equal(isKeeper("someone@example.com", true, env), false);
  assert.equal(isKeeper("keeper@example.com", false, env), false, "unverified Google email");
  assert.equal(isKeeper("keeper@example.com", undefined, env), false);
  assert.equal(isKeeper(null, true, env), false);
});

test("no KEEPER_EMAIL means nobody gets in", () => {
  assert.equal(keeperEmail({}), null);
  assert.equal(isKeeper("keeper@example.com", true, {}), false);
  assert.equal(isKeeper("keeper@example.com", true, { KEEPER_EMAIL: "not-an-email" }), false);
});
