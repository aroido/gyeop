import { expect, type Page } from "@playwright/test";

export async function confirmEligibility(page: Page) {
  await expect(
    page.getByRole("heading", {
      name: "겹은 만 19세 이상만 이용할 수 있어요",
    }),
  ).toBeFocused();
  const confirm = page.getByRole("button", { name: "확인하고 계속" });
  await expect(confirm).toBeDisabled();
  await page
    .getByRole("checkbox", {
      name: "만 19세 이상이며 대한민국에서 이용 중이에요.",
    })
    .check();
  await confirm.click();
}
