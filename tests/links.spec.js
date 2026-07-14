// @ts-check
import { test, expect } from "@playwright/test";

/*
 * Link contract for the site: every link a visitor can see must be clickable
 * and point at its intended destination. External destinations are asserted by
 * href (tests never navigate off-site); in-page anchors are actually clicked
 * and must bring their target section into view.
 *
 * TODO(brooks): when the real scheduling link replaces the placeholder, update
 * BOOKING_URL here — the tests then enforce the real destination.
 */
const BOOKING_URL = "https://example.com/book";

// Visible, clickable, and pointing at the right place — without navigating away.
// click({ trial: true }) runs Playwright's full actionability checks (visible,
// stable, not covered by another element) but doesn't perform the click.
async function expectClickableWithHref(link, href) {
  await expect(link).toBeVisible();
  await expect(link).toHaveAttribute("href", href);
  await link.click({ trial: true });
}

test.describe("home page links", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
  });

  test("every link has a real destination", async ({ page }) => {
    const links = page.locator("a");
    for (const link of await links.all()) {
      const href = await link.getAttribute("href");
      expect(href, "every <a> must have an href").toBeTruthy();
      expect(href, "no dead '#' links").not.toBe("#");
    }
  });

  test("nav links scroll their section into view", async ({ page }) => {
    const sections = [
      { label: "The Gap", target: "#familiar" },
      { label: "How It Works", target: "#how" },
      { label: "Engagements", target: "#engagements" },
      { label: "About", target: "#about" },
    ];
    for (const { label, target } of sections) {
      const link = page.locator(".site-nav").getByRole("link", { name: label });
      await expectClickableWithHref(link, target);
      await link.click();
      await expect(page.locator(target)).toBeInViewport();
    }
  });

  test("hero secondary CTA scrolls to how-it-works", async ({ page }) => {
    const link = page.getByRole("link", { name: "See how it works" });
    await expectClickableWithHref(link, "#how");
    await link.click();
    await expect(page.locator("#how")).toBeInViewport();
  });

  test("all booking CTAs point at the scheduling link", async ({ page }) => {
    const ctas = page.getByRole("link", { name: /book a call/i });
    await expect(ctas).toHaveCount(3); // header, hero, closing section
    for (const cta of await ctas.all()) {
      await expectClickableWithHref(cta, BOOKING_URL);
    }
  });

  test("partner link points at UpShift HQ", async ({ page }) => {
    const link = page.getByRole("link", { name: "UpShift HQ" });
    await expectClickableWithHref(link, "https://upshifthq.com/");
  });

  test("social links point at Brooks' profiles", async ({ page }) => {
    const socials = [
      { name: /twitter/i, href: "https://twitter.com/brookzerker" },
      { name: /twitch/i, href: "https://www.twitch.tv/brookzerker" },
      { name: /youtube/i, href: "https://www.youtube.com/@BrooksBuilds" },
    ];
    for (const { name, href } of socials) {
      await expectClickableWithHref(page.getByRole("link", { name }), href);
    }
  });

  test("logo links back to the top", async ({ page }) => {
    await expectClickableWithHref(
      page.getByRole("link", { name: /brooks builds — home/i }),
      "#top",
    );
  });

  test("page loads without console errors", async ({ page }) => {
    const errors = [];
    page.on("pageerror", (err) => errors.push(String(err)));
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    await page.goto("/");
    await page.waitForLoadState("networkidle");
    expect(errors).toEqual([]);
  });
});

test.describe("404 page links", () => {
  test("back-home button and logo return to the site root", async ({ page }) => {
    await page.goto("/404.html");
    await expectClickableWithHref(page.getByRole("link", { name: "Back to the site" }), "/");
    await expectClickableWithHref(page.getByRole("link", { name: /brooks builds — home/i }), "/");
    await page.getByRole("link", { name: "Back to the site" }).click();
    await expect(page).toHaveURL("http://127.0.0.1:4173/");
  });
});
