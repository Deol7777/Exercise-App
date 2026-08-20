/**
 * The journey the app exists for: sign up, log a workout set by set, read it
 * back. Everything here goes through the browser — real Auth.js sign-in, real
 * route handlers, real database.
 */
import { expect, test } from "@playwright/test";
import { Pool } from "pg";

import { TEST_DATABASE_URL } from "./global-setup";

/**
 * Catalog names overlap ("Barbell Bench Press" is a substring of "Incline
 * Barbell Bench Press"), so every option lookup here is exact.
 *
 * Unique per run, because these accounts are created for real.
 */
const account = () => `e2e-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.test`;
const PASSWORD = "correct-horse-battery";

/**
 * Adds an exercise to the running workout. Picking one navigates straight to
 * its stepper, which is where sets are logged.
 */
async function addExercise(page: import("@playwright/test").Page, name: string) {
  await page.getByLabel("Add an exercise").click();
  await page.getByRole("option", { name, exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.waitForURL(/\/log\/[0-9a-f-]+$/);
}

/**
 * Logs one set on the stepper. The fields are typable as well as tappable,
 * because reaching 100 kg two-and-a-half at a time is forty taps.
 */
async function logSet(
  page: import("@playwright/test").Page,
  { weight, reps, unit = "kg" }: { weight: string; reps: string; unit?: string },
) {
  /** `exact`, or the label also matches the "Increase Weight (kg)" buttons. */
  await page.getByLabel(`Weight (${unit})`, { exact: true }).fill(weight);
  await page.getByLabel("Reps", { exact: true }).fill(reps);
  await page.getByRole("button", { name: "Complete set" }).click();
}

async function signUp(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  /** The tab bar renders only for a signed-in user, so it is the arrival signal. */
  await expect(tabBar(page)).toBeVisible();
}

const tabBar = (page: import("@playwright/test").Page) =>
  page.getByRole("navigation", { name: "Primary" });

const TAB_URLS = {
  Home: /\/$/,
  Workout: /\/log$/,
  Browse: /\/browse$/,
  History: /\/history$/,
  Progress: /\/progress$/,
} as const;

/**
 * Clicks a tab and waits for the destination to commit.
 *
 * Both halves matter. The click is scoped to the bar because its labels repeat
 * on the pages it lands on — "History" is a tab *and* a link on the logging
 * screen. The wait is there because "Start workout" exists on the home screen
 * as well as the logging screen: acting straight after the click can hit the
 * home button while the navigation is still in flight, which starts a session
 * and leaves the next one to fail as a conflict.
 */
async function openTab(
  page: import("@playwright/test").Page,
  name: keyof typeof TAB_URLS,
) {
  await tabBar(page).getByRole("link", { name }).click();
  await page.waitForURL(TAB_URLS[name]);
}

test("signs up, logs a workout, and reads it back", async ({ page }) => {
  const email = account();
  await signUp(page, email);

  /**
   * The account exists in the *test* database — which is also the check that
   * the server under test is not talking to Neon.
   */
  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    const { rows } = await pool.query("select id from users where email = $1", [email]);
    expect(rows).toHaveLength(1);
  } finally {
    await pool.end();
  }

  await openTab(page, "Workout");
  await expect(page.getByText("No workout in progress")).toBeVisible();

  await page.getByRole("button", { name: "Start workout" }).click();
  await expect(page.getByText("Workout in progress")).toBeVisible();

  await addExercise(page, "Barbell Bench Press");
  await expect(page.getByText("Exercise 1 of 1")).toBeVisible();

  await logSet(page, { weight: "80", reps: "5" });
  await expect(page.getByRole("button", { name: "Set 1" })).toContainText("80 kg × 5");

  /** The same set, back on the list the stepper was reached from. */
  await openTab(page, "Workout");
  await expect(page.getByText("1. Barbell Bench Press")).toBeVisible();
  await expect(page.getByText("5 × 80 kg")).toBeVisible();
  await expect(page.getByText("1 working set · 400 kg volume")).toBeVisible();

  /** Finishing is behind a confirmation dialog, so it takes two taps. */
  await page.getByRole("button", { name: "Finish workout" }).click();
  await page.getByRole("button", { name: "Yeah, I'm done" }).click();
  await expect(page.getByText("No workout in progress")).toBeVisible();

  await openTab(page, "History");
  await expect(page.getByText("1 exercises · 1 sets")).toBeVisible();

  await page.getByRole("link", { name: /exercises · 1 sets/ }).click();
  await expect(page.getByText("400 kg · 1 working sets")).toBeVisible();
  await expect(page.getByText("5 × 80 kg")).toBeVisible();
});

test("corrects a set, and shows every weight in the chosen unit", async ({ page }) => {
  await signUp(page, account());

  await openTab(page, "Workout");
  await page.getByRole("button", { name: "Start workout" }).click();
  await addExercise(page, "Deadlift");

  await logSet(page, { weight: "100", reps: "5" });
  await expect(page.getByRole("button", { name: "Set 1" })).toContainText("100 kg × 5");

  /** A weight typed one digit out: tapping the set loads it back to be fixed. */
  await page.getByRole("button", { name: "Set 1" }).click();
  await page.getByLabel("Weight (kg)", { exact: true }).fill("102.5");
  await page.getByRole("button", { name: "Update set" }).click();
  await expect(page.getByRole("button", { name: "Set 1" })).toContainText("102.5 kg × 5");

  await page.goto("/settings");
  await page.getByLabel("Display unit").click();
  /**
   * Waiting for the request, not the control: the select updates itself
   * optimistically, so navigating on the label alone can outrun the write.
   */
  await Promise.all([
    page.waitForResponse(
      (response) =>
        response.url().includes("/api/users/me") && response.request().method() === "PATCH",
    ),
    page.getByRole("option", { name: "Pounds" }).click(),
  ]);

  await page.goto("/log");
  /** 102.5 kg is 225.97 lb, shown to one decimal place. */
  await expect(page.getByText("5 × 226 lb")).toBeVisible();

  /** And the stepper it was logged on is in pounds too. */
  await page.getByRole("link", { name: "Log Deadlift" }).click();
  await expect(page.getByLabel("Weight (lb)", { exact: true })).toHaveValue("226");

  await page.goto("/progress");
  await expect(page.getByText("226 lb × 5")).toBeVisible();
});

test("keeps one user's log away from another", async ({ page, context }) => {
  await signUp(page, account());
  await openTab(page, "Workout");
  await page.getByRole("button", { name: "Start workout" }).click();
  await addExercise(page, "Back Squat");

  /** The stepper for this user's entry, by id. */
  const entryUrl = page.url();

  await context.clearCookies();
  await signUp(page, account());

  await page.goto("/log");
  await expect(page.getByText("No workout in progress")).toBeVisible();

  await page.goto("/history");
  await expect(page.getByText("Nothing logged yet")).toBeVisible();

  /** Somebody else's exercise entry does not exist, rather than being refused. */
  const response = await page.goto(entryUrl);
  expect(response?.status()).toBe(404);
});

test("deletes an account, and everything in it", async ({ page }) => {
  const email = account();
  await signUp(page, email);

  await openTab(page, "Workout");
  await page.getByRole("button", { name: "Start workout" }).click();
  await addExercise(page, "Deadlift");
  await logSet(page, { weight: "100", reps: "5" });
  await expect(page.getByRole("button", { name: "Set 1" })).toBeVisible();

  await page.goto("/settings");
  await page.getByRole("button", { name: "Delete account" }).click();
  await expect(page.getByRole("button", { name: "Delete everything" })).toBeDisabled();

  /** The confirmation is typing the address; anything else leaves it disabled. */
  await page.getByLabel(`Type ${email} to confirm`).fill("something else");
  await expect(page.getByRole("button", { name: "Delete everything" })).toBeDisabled();

  await page.getByLabel(`Type ${email} to confirm`).fill(email);
  await page.getByRole("button", { name: "Delete everything" }).click();

  await expect(page).toHaveURL(/\/sign-in/);

  /** The account is gone, so the old password no longer signs anyone in. */
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await expect(page.getByText("That email and password do not match an account.")).toBeVisible();

  const pool = new Pool({ connectionString: TEST_DATABASE_URL });
  try {
    const { rows } = await pool.query("select id from users where email = $1", [email]);
    expect(rows).toHaveLength(0);
  } finally {
    await pool.end();
  }
});

test("a session that outlives its account lands on sign-in, not an error", async ({ page }) => {
  const email = account();
  await signUp(page, email);

  /**
   * Delete through the API while keeping the cookie: exactly what another
   * device holding the same JWT would have after the account is deleted
   * elsewhere. Sessions are JWTs, so nothing invalidates it (ADR 0007).
   */
  const deleted = await page.request.delete("/api/users/me");
  expect(deleted.status()).toBe(204);

  await page.goto("/log");
  await expect(page).toHaveURL(/\/sign-in/);

  await page.goto("/progress");
  await expect(page).toHaveURL(/\/sign-in/);

  await page.goto("/history");
  await expect(page).toHaveURL(/\/sign-in/);

  /** The landing page renders as signed out rather than failing. */
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Sign in" })).toBeVisible();
  await expect(tabBar(page)).toBeHidden();
});

test("logs a set from the stepper, and corrects it there", async ({ page }) => {
  await signUp(page, account());
  await openTab(page, "Workout");
  await page.getByRole("button", { name: "Start workout" }).click();
  /** Picking an exercise goes straight to its stepper. */
  await addExercise(page, "Barbell Bench Press");
  await expect(page.getByText("Exercise 1 of 1")).toBeVisible();

  /** And the whole card on the list is the way back in. */
  await openTab(page, "Workout");
  await page.getByRole("link", { name: "Log Barbell Bench Press" }).click();
  await expect(page).toHaveURL(/\/log\/[0-9a-f-]+$/);

  /**
   * With nothing logged and no history for this exercise, the stepper opens on
   * a bare bar: 20 kg for 8. Weight moves a plate at a time, reps one at a time.
   */
  await page.getByRole("button", { name: "Increase Weight (kg)" }).click();
  await page.getByRole("button", { name: "Increase Reps" }).click();
  await page.getByRole("button", { name: "Complete set" }).click();

  await expect(page.getByRole("button", { name: "Set 1" })).toContainText("22.5 kg × 9");

  /** Tapping a logged set loads it back into the stepper to be corrected. */
  await page.getByRole("button", { name: "Set 1" }).click();
  await page.getByRole("button", { name: "Decrease Weight (kg)" }).click();
  await page.getByRole("button", { name: "Update set" }).click();
  await expect(page.getByRole("button", { name: "Set 1" })).toContainText("20 kg × 9");

  /**
   * The fields take numbers and nothing else. Typed letters never land, so a
   * weight can never be coerced from nonsense into a silent zero — and an empty
   * field blocks the button rather than logging one.
   */
  const weight = page.getByLabel("Weight (kg)", { exact: true });
  await weight.fill("");
  await weight.pressSequentially("12a.b5kg");
  await expect(weight).toHaveValue("12.5");

  const reps = page.getByLabel("Reps", { exact: true });
  await reps.fill("");
  await reps.pressSequentially("7.5x");
  await expect(reps).toHaveValue("75");

  await weight.fill("");
  await expect(page.getByRole("button", { name: "Complete set" })).toBeDisabled();
  await expect(page.getByText("Enter a weight.")).toBeVisible();

  /** The same set, on the screen the stepper was reached from. */
  await openTab(page, "Workout");
  await expect(page.getByText("9 × 20 kg")).toBeVisible();
  await expect(page.getByText("1 working set · 180 kg volume")).toBeVisible();
});
