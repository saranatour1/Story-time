import { describe, expect, test } from "vite-plus/test";
import openapi from "../../public/openapi.json";
import { apiCatalog, authForAgents } from "./agents";

const catalogUrl = "https://example.com/.well-known/api-catalog";

describe("agent discovery", () => {
  test("the API catalog is a linkset on the site's own origin", async () => {
    const response = apiCatalog(new Request(catalogUrl));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toContain("application/linkset+json");
    expect(await response.json()).toEqual({
      linkset: [
        {
          anchor: "https://example.com/api",
          "service-desc": [{ href: "https://example.com/openapi.json", type: "application/json" }],
          "service-doc": [{ href: "https://example.com/llms.txt", type: "text/markdown" }],
        },
      ],
    });
  });

  test("HEAD on the catalog has the Link header and no body", async () => {
    const response = apiCatalog(new Request(catalogUrl, { method: "HEAD" }));
    expect(response.headers.get("Link")).toContain('rel="api-catalog"');
    expect(await response.text()).toBe("");
  });

  test("auth.md starts with a heading that names auth.md", async () => {
    const text = await authForAgents().text();
    expect(text.split("\n")[0]).toMatch(/^# .*auth\.md/);
  });

  // The file is written by hand, so a new or renamed route has to show up here.
  test("openapi.json lists every route under /api", () => {
    const routes = Object.keys(import.meta.glob("../routes/api/*.ts")).map((file) =>
      file
        .replace("../routes", "")
        .replace(/\.ts$/, "")
        .replaceAll(".", "/")
        .replace("$id", "{id}"),
    );
    expect(Object.keys(openapi.paths).sort()).toEqual(routes.sort());
  });
});
