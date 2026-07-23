import AxeBuilder from "@axe-core/playwright";
import { expect, type Page, test } from "@playwright/test";

const consentKey = "gyeop:analytics-consent:v1";
const forbidden = [
  "dynamic-public-secret",
  "second-public-secret",
  "nickname-secret",
  "email@example.com",
  "campaign-secret",
  "fragment-secret",
];

type CapturedHit = { url: string; body: string | null };

async function installFakeGoogleTag(page: Page, hits: CapturedHit[]) {
  await page.route(
    /^https:\/\/www\.googletagmanager\.com\/gtag\/js\?.*/,
    async (route) => {
      await route.fulfill({
        contentType: "application/javascript",
        body: `(() => {
          const queue = window.dataLayer || [];
          let defaults = {};
          const hit = (name, parameters = {}) => {
            if (window["ga-disable-G-TEST123"]) return;
            const payload = { ...defaults, ...parameters };
            const search = new URLSearchParams({
              en: name,
              dl: payload.page_location || "",
              dt: payload.page_title || "",
              dr: payload.page_referrer || "",
            });
            fetch("https://www.google-analytics.com/g/collect?" + search, {
              method: "POST",
              body: "",
              keepalive: true,
            });
          };
          const process = (item) => {
            const [command, name, parameters] = Array.from(item);
            if (command === "set") defaults = { ...defaults, ...name };
            if (command === "config") {
              defaults = { ...defaults, ...parameters };
              document.cookie = "_ga=fake-client; Path=/; SameSite=Lax";
              document.cookie = "_ga_TEST=fake-session; Path=/; SameSite=Lax";
              hit("first_visit");
              hit("session_start");
            }
            if (command === "event") hit(name, parameters);
          };
          for (const item of queue) process(item);
          const push = queue.push.bind(queue);
          queue.push = (item) => {
            const result = push(item);
            process(item);
            return result;
          };
          setTimeout(() => hit("user_engagement"), 20);
        })();`,
      });
    },
  );
  await page.route(
    /^https:\/\/(?:www|region1)\.google-analytics\.com\/g\/collect.*/,
    async (route) => {
      hits.push({
        url: route.request().url(),
        body: route.request().postData(),
      });
      await route.fulfill({ status: 204, body: "" });
    },
  );
}

test("keeps Google entirely off while consent is pending or denied", async ({
  page,
}) => {
  const requests: string[] = [];
  page.on("request", (request) => {
    if (/google-analytics|googletagmanager/.test(request.url())) {
      requests.push(request.url());
    }
  });

  await page.goto("/");
  const banner = page.getByRole("complementary", {
    name: "방문 통계를 선택해 주세요",
  });
  await expect(banner).toBeVisible();
  await expect(page.locator("script[data-gyeop-analytics]")).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(await page.evaluate(() => "dataLayer" in window)).toBe(false);
  expect(
    (await page.context().cookies()).filter(({ name }) =>
      name.startsWith("_ga"),
    ),
  ).toEqual([]);

  for (const name of ["분석 허용", "허용하지 않음"]) {
    const box = await banner.getByRole("button", { name }).boundingBox();
    expect(box?.height).toBeGreaterThanOrEqual(44);
  }
  const accessibility = await new AxeBuilder({ page })
    .include("aside")
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await banner.getByRole("button", { name: "허용하지 않음" }).click();
  await expect(banner).toHaveCount(0);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), consentKey),
  ).toBe("denied");
  await page.reload();
  await expect(page.locator("script[data-gyeop-analytics]")).toHaveCount(0);
  expect(requests).toEqual([]);
});

test("fails closed for an invalid stored consent value", async ({ page }) => {
  await page.addInitScript(
    (key) => localStorage.setItem(key, "yes"),
    consentKey,
  );
  await page.goto("/");
  await expect(
    page.getByRole("complementary", { name: "방문 통계를 선택해 주세요" }),
  ).toBeVisible();
  await expect(page.locator("script[data-gyeop-analytics]")).toHaveCount(0);
  expect(await page.evaluate(() => "dataLayer" in window)).toBe(false);
});

test("queues consent before the tag and sends only sanitized route-class hits", async ({
  page,
}) => {
  const hits: CapturedHit[] = [];
  await installFakeGoogleTag(page, hits);
  await page.goto("/");
  await page.getByRole("button", { name: "분석 허용" }).click();

  await expect.poll(() => hits.length).toBeGreaterThanOrEqual(4);
  const commands = await page.evaluate(() =>
    (window as unknown as { dataLayer: IArguments[] }).dataLayer.map((item) =>
      Array.from(item),
    ),
  );
  expect(commands.slice(0, 5).map(([command]) => command)).toEqual([
    "consent",
    "js",
    "set",
    "config",
    "event",
  ]);
  expect(commands[0]).toEqual([
    "consent",
    "default",
    {
      analytics_storage: "granted",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    },
  ]);
  expect(commands[2][1]).toEqual({
    page_location: expect.stringMatching(/\/$/),
    page_title: "겹 · 홈",
    page_referrer: "",
  });
  expect(commands[3][2]).toEqual({
    page_location: expect.stringMatching(/\/$/),
    page_title: "겹 · 홈",
    page_referrer: "",
    send_page_view: false,
    allow_google_signals: false,
    allow_ad_personalization_signals: false,
    ignore_referrer: true,
    cookie_domain: "none",
    cookie_expires: 5_184_000,
    cookie_update: false,
  });
  expect(commands[3][2]).not.toHaveProperty("analytics_storage");

  const pageViewsBeforeNavigation = hits.filter(({ url }) =>
    url.includes("en=page_view"),
  ).length;
  expect(pageViewsBeforeNavigation).toBe(1);

  await page.evaluate(() =>
    history.pushState({}, "", "/i/dynamic-public-secret"),
  );
  await expect
    .poll(() => hits.filter(({ url }) => url.includes("en=page_view")).length)
    .toBe(pageViewsBeforeNavigation + 1);
  await page.evaluate(() =>
    history.pushState({}, "", "/i/second-public-secret"),
  );
  await expect
    .poll(() => hits.filter(({ url }) => url.includes("en=page_view")).length)
    .toBe(pageViewsBeforeNavigation + 2);

  await page.evaluate(() => {
    history.pushState({}, "", "?campaign=campaign-secret");
    history.pushState({}, "", "#fragment-secret");
  });
  await page.waitForTimeout(100);
  expect(hits.filter(({ url }) => url.includes("en=page_view"))).toHaveLength(
    pageViewsBeforeNavigation + 2,
  );

  const observedEvents = new Set(
    hits.map(({ url }) => new URL(url).searchParams.get("en")),
  );
  for (const event of [
    "page_view",
    "first_visit",
    "session_start",
    "user_engagement",
  ]) {
    expect(observedEvents).toContain(event);
  }
  for (const { url, body } of hits) {
    const search = new URL(url).searchParams;
    expect(search.get("dl")).toMatch(
      /^http:\/\/127\.0\.0\.1:\d+(?:\/|\/i\/:publicId)$/,
    );
    expect(search.get("dr")).toBe("");
    for (const sentinel of forbidden) {
      expect(`${url}\n${body ?? ""}`).not.toContain(sentinel);
    }
  }
  for (const sentinel of forbidden) {
    expect(JSON.stringify(commands)).not.toContain(sentinel);
  }
});

test("revokes consent, removes only GA cookies, and reloads without Google", async ({
  page,
}) => {
  const hits: CapturedHit[] = [];
  const scriptRequests: string[] = [];
  await installFakeGoogleTag(page, hits);
  page.on("request", (request) => {
    if (request.url().includes("googletagmanager.com/gtag/js")) {
      scriptRequests.push(request.url());
    }
  });
  await page.addInitScript((key) => {
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, "granted");
    }
  }, consentKey);
  await page.goto("/privacy");
  await expect.poll(() => hits.length).toBeGreaterThanOrEqual(3);
  await page.evaluate(() => {
    document.cookie = "owner_capability=keep-me; Path=/; SameSite=Lax";
  });
  hits.length = 0;
  scriptRequests.length = 0;

  await page.getByRole("button", { name: "분석 중단" }).click();
  await expect(
    page.getByText("현재 이 브라우저에서 분석을 허용하지 않았어요."),
  ).toBeVisible();
  await page.waitForTimeout(100);

  expect(hits).toEqual([]);
  expect(scriptRequests).toEqual([]);
  expect(
    await page.evaluate((key) => localStorage.getItem(key), consentKey),
  ).toBe("denied");
  const cookies = await page.context().cookies();
  expect(
    cookies.filter(({ name }) => name === "_ga" || name.startsWith("_ga_")),
  ).toEqual([]);
  expect(cookies.find(({ name }) => name === "owner_capability")?.value).toBe(
    "keep-me",
  );
  await expect(page.locator("script[data-gyeop-analytics]")).toHaveCount(0);
});

test("stops active analytics when another tab invalidates consent", async ({
  page,
}) => {
  const hits: CapturedHit[] = [];
  const scriptRequests: string[] = [];
  await installFakeGoogleTag(page, hits);
  page.on("request", (request) => {
    if (request.url().includes("googletagmanager.com/gtag/js")) {
      scriptRequests.push(request.url());
    }
  });
  await page.addInitScript((key) => {
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, "granted");
    }
  }, consentKey);
  await page.goto("/");
  await expect.poll(() => hits.length).toBeGreaterThanOrEqual(3);
  hits.length = 0;
  scriptRequests.length = 0;

  await page.evaluate((key) => {
    localStorage.setItem(key, "invalid");
    window.dispatchEvent(
      new StorageEvent("storage", { key, newValue: "invalid" }),
    );
  }, consentKey);

  await expect(
    page.getByRole("complementary", { name: "방문 통계를 선택해 주세요" }),
  ).toBeVisible();
  await expect(page.locator("script[data-gyeop-analytics]")).toHaveCount(0);
  expect(hits).toEqual([]);
  expect(scriptRequests).toEqual([]);
  expect(
    (await page.context().cookies()).filter(({ name }) =>
      name.startsWith("_ga"),
    ),
  ).toEqual([]);
});

test("fails closed when the browser rejects a revoke write", async ({
  page,
}) => {
  const hits: CapturedHit[] = [];
  await installFakeGoogleTag(page, hits);
  await page.addInitScript((key) => {
    localStorage.setItem(key, "granted");
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name, value) {
      if (name === key && value === "denied") {
        throw new DOMException("blocked", "SecurityError");
      }
      setItem.call(this, name, value);
    };
  }, consentKey);
  await page.goto("/privacy");
  await expect.poll(() => hits.length).toBeGreaterThanOrEqual(3);
  hits.length = 0;

  await page.getByRole("button", { name: "분석 중단" }).click();

  await expect(
    page.getByText("아직 이 브라우저에서 분석 여부를 선택하지 않았어요."),
  ).toBeVisible();
  await expect(
    page.getByRole("complementary", { name: "방문 통계를 선택해 주세요" }),
  ).toBeVisible();
  await expect(page.locator("script[data-gyeop-analytics]")).toHaveCount(0);
  expect(hits).toEqual([]);
  expect(
    (await page.context().cookies()).filter(({ name }) =>
      name.startsWith("_ga"),
    ),
  ).toEqual([]);
});

test("stops active analytics when consent storage becomes unreadable", async ({
  page,
}) => {
  const hits: CapturedHit[] = [];
  await installFakeGoogleTag(page, hits);
  await page.addInitScript((key) => {
    if (localStorage.getItem(key) === null) {
      localStorage.setItem(key, "granted");
    }
    const getItem = Storage.prototype.getItem;
    Storage.prototype.getItem = function (name) {
      if (
        name === key &&
        sessionStorage.getItem("gyeop:test:fail-consent-read") === "1"
      ) {
        throw new DOMException("blocked", "SecurityError");
      }
      return getItem.call(this, name);
    };
  }, consentKey);
  await page.goto("/");
  await expect.poll(() => hits.length).toBeGreaterThanOrEqual(3);
  hits.length = 0;

  await page.evaluate(() => {
    sessionStorage.setItem("gyeop:test:fail-consent-read", "1");
    history.pushState({}, "", "/privacy");
  });

  await expect(
    page.getByRole("complementary", { name: "방문 통계를 선택해 주세요" }),
  ).toBeVisible();
  await expect(page.locator("script[data-gyeop-analytics]")).toHaveCount(0);
  expect(hits).toEqual([]);
  expect(
    (await page.context().cookies()).filter(({ name }) =>
      name.startsWith("_ga"),
    ),
  ).toEqual([]);
});
