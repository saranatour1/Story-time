import { expect, test } from "vite-plus/test";
import { can, returnsTo } from "./agents";

test("the consent page names where the answer goes by its host, never by what the link says", () => {
  expect(returnsTo("https://claude.ai/api/mcp/auth_callback")).toBe("claude.ai");
  expect(returnsTo("https://claude.ai.evil.example/cb?x=claude.ai")).toBe("claude.ai.evil.example");
  expect(returnsTo("http://localhost:51234/callback")).toBe("an app on this computer");
  expect(returnsTo("http://127.0.0.1:8080/cb")).toBe("an app on this computer");
  expect(returnsTo("cursor://anysphere.cursor-mcp/oauth/callback")).toBe("an app on this device");
  expect(returnsTo("not a url")).toBe("an unknown address");
});

test("a connection that can't write is shown as read only", () => {
  expect(can(["moments:read", "moments:write"])).toBe("Can read and change");
  expect(can(["moments:read"])).toBe("Can read");
});
