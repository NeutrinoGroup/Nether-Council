import { expect, test } from "vitest";
import { CAPTURE_LIMIT_MS, CONNECTION_LIMIT_MS } from "../../packages/party-core/src";
test("capture and finalization fit inside the deployment connection budget", () => {
  expect(CAPTURE_LIMIT_MS + 30_000).toBeLessThan(CONNECTION_LIMIT_MS);
  expect(CONNECTION_LIMIT_MS).toBeLessThan(240_000);
});
