import { expect, test } from "@playwright/test";

const requiredHeaders = {
  "strict-transport-security": "max-age=31536000",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

for (const path of ["/", "/api/not-found"]) {
  test(`adds security headers to ${path}`, async ({ request }) => {
    const response = await request.get(path);
    for (const [name, value] of Object.entries(requiredHeaders)) {
      expect(response.headers()[name]).toBe(value);
    }
    const csp = response.headers()["content-security-policy"];
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("form-action 'self'");
    expect(csp).not.toContain("*");
  });
}
