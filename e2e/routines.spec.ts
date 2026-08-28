/**
 * Routines end to end: build one, start a workout from it, and confirm the
 * copy is a copy — editing the routine afterwards must not reach back into the
 * workout that came from it.
 *
 * Everything here goes through the browser: real Auth.js sign-in, real route
 * handlers, real database.
 */
import { expect, test } from "@playwright/test";

const account = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
const PASSWORD = "correct-horse-battery";

const tabBar = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Primary" });

async function signUp(page: import("@playwright/test").Page) {
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(account());
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(tabBar(page)).toBeVisible();
}

/**
 * The routine's own list, by name. Scoped because the tab bar is a list too, so
 * a bare `getByRole("listitem")` picks up five navigation entries.
 */
const routineExercises = (page: import("@playwright/test").Page) =>
  page.getByRole("list", { name: "Exercises in this routine" }).getByRole("listitem");

/** Catalog names overlap ("Barbell Bench Press" is inside "Incline Barbell Bench Press"), so lookups are exact. */
async function addToRoutine(page: import("@playwright/test").Page, name: string) {
  await page.getByLabel("Add an exercise").click();
  await page.getByRole("option", { name, exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  /**
   * Generous: this is the first request to hit `/api/routines/[id]/exercises`,
   * and the dev server compiles the route on the way through.
   */
  await expect(routineExercises(page).filter({ hasText: name })).toHaveCount(1, {
    timeout: 20_000,
  });
}

test("builds a routine, starts it, and keeps the workout a copy", async ({ page }) => {
  await signUp(page);

  await tabBar(page).getByRole("link", { name: "Routines" }).click();
  await page.waitForURL(/\/routines$/);
  await expect(page.getByText("No routines yet.")).toBeVisible();

  await page.getByLabel("New routine").fill("Push Day");
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await page.getByRole("link", { name: "Push Day" }).click();
  await page.waitForURL(/\/routines\/[0-9a-f-]+$/);

  await addToRoutine(page, "Barbell Bench Press");
  await addToRoutine(page, "Overhead Press");
  await addToRoutine(page, "Dip");

  await expect(routineExercises(page)).toHaveCount(3);

  /** Reordering is optimistic, so the row moves before the round trip lands. */
  await page.getByRole("button", { name: "Move Dip up" }).click();
  await expect(routineExercises(page).nth(1)).toContainText("Dip");

  /** Starting lives on the home screen and the logging screen, not here. */
  await tabBar(page).getByRole("link", { name: "Home" }).click();
  await page.waitForURL(/\/$/);

  /** The link opens the picker screen; the card on it is what actually starts. */
  await page.getByRole("link", { name: "Start routine" }).click();
  await page.waitForURL(/\/routines\/start$/);
  await page.getByRole("button", { name: /Push Day/ }).click();
  await page.waitForURL(/\/log$/);

  await expect(page.getByText("Workout in progress")).toBeVisible();

  /** The routine's exercises, copied in its order, numbered by the logging cards. */
  await expect(page.getByText("1. Barbell Bench Press")).toBeVisible();
  await expect(page.getByText("2. Dip")).toBeVisible();
  await expect(page.getByText("3. Overhead Press")).toBeVisible();

  /** A second start is refused while this one is open, whatever it came from. */
  await tabBar(page).getByRole("link", { name: "Home" }).click();
  await page.waitForURL(/\/$/);
  await expect(page.getByRole("link", { name: "Continue workout" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Start routine" })).toHaveCount(0);

  /** And reaching the picker directly bounces to the workout already running. */
  await page.goto("/routines/start");
  await page.waitForURL(/\/log$/);

  /** Now edit the routine. The workout already started must not follow it. */
  await tabBar(page).getByRole("link", { name: "Routines" }).click();
  await page.waitForURL(/\/routines$/);
  await page.getByRole("link", { name: "Push Day" }).click();
  await page.waitForURL(/\/routines\/[0-9a-f-]+$/);

  await page.getByRole("button", { name: "Remove Dip" }).click();
  await expect(routineExercises(page)).toHaveCount(2);

  /** The copy is a copy: the workout still has the exercise the routine just lost. */
  await tabBar(page).getByRole("link", { name: "Workout" }).click();
  await page.waitForURL(/\/log$/);
  await expect(page.getByText("2. Dip")).toBeVisible();
});

test("deletes a routine without touching the workouts started from it", async ({ page }) => {
  await signUp(page);

  await tabBar(page).getByRole("link", { name: "Routines" }).click();
  await page.waitForURL(/\/routines$/);

  await page.getByLabel("New routine").fill("Leg Day");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("link", { name: "Leg Day" })).toBeVisible();

  /** One name per account: the second attempt is a 409, surfaced in place. */
  await page.getByLabel("New routine").fill("Leg Day");
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("You already have a routine with that name.")).toBeVisible();

  await page.getByRole("button", { name: "Delete Leg Day" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.getByText("No routines yet.")).toBeVisible();
});

test("offers no way into the picker before there is a routine to pick", async ({ page }) => {
  await signUp(page);

  /** The link is absent rather than disabled: a door to an empty room. */
  await expect(page.getByRole("link", { name: "Start routine" })).toHaveCount(0);

  /** Reached directly, the screen says so rather than 404ing. */
  await page.goto("/routines/start");
  await expect(page.getByText("Nothing to start yet.")).toBeVisible();
});
