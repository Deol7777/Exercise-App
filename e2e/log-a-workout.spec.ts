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

async function signUp(page: import("@playwright/test").Page, email: string) {
  await page.goto("/sign-up");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: "Create account" }).click();
  await expect(page.getByText("Signed in as")).toBeVisible();
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

  await page.getByRole("link", { name: "Open the log" }).click();
  await expect(page.getByText("No workout in progress")).toBeVisible();

  await page.getByRole("button", { name: "Start workout" }).click();
  await expect(page.getByText("Workout in progress")).toBeVisible();

  await page.getByLabel("Add an exercise").click();
  await page.getByRole("option", { name: "Barbell Bench Press", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await expect(page.getByText("1. Barbell Bench Press")).toBeVisible();
  await expect(page.getByText("No sets yet.")).toBeVisible();

  await page.getByLabel("Reps", { exact: true }).fill("5");
  await page.getByLabel("Weight (kg)").fill("80");
  await page.getByRole("button", { name: "Log set" }).click();

  await expect(page.getByText("5 × 80 kg")).toBeVisible();
  await expect(page.getByText("1 working set · 400 kg volume")).toBeVisible();

  await page.getByRole("button", { name: "Finish workout" }).click();
  await expect(page.getByText("No workout in progress")).toBeVisible();

  await page.getByRole("link", { name: "History" }).click();
  await expect(page.getByText("1 exercises · 1 sets")).toBeVisible();

  await page.getByRole("link", { name: /exercises · 1 sets/ }).click();
  await expect(page.getByText("400 kg · 1 working sets")).toBeVisible();
  await expect(page.getByText("5 × 80 kg")).toBeVisible();
});

test("corrects a set, and shows every weight in the chosen unit", async ({ page }) => {
  await signUp(page, account());

  await page.getByRole("link", { name: "Open the log" }).click();
  await page.getByRole("button", { name: "Start workout" }).click();
  await page.getByLabel("Add an exercise").click();
  await page.getByRole("option", { name: "Deadlift", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();

  await page.getByLabel("Reps", { exact: true }).fill("5");
  await page.getByLabel("Weight (kg)").fill("100");
  await page.getByRole("button", { name: "Log set" }).click();
  await expect(page.getByText("5 × 100 kg")).toBeVisible();

  /** A weight typed one digit out, corrected in place. */
  await page.getByRole("button", { name: "Edit set 1" }).click();
  await page.getByLabel("Weight for set 1").fill("102.5");
  await page.getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("5 × 102.5 kg")).toBeVisible();

  await page.goto("/");
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
  await expect(page.getByLabel("Weight (lb)")).toBeVisible();

  await page.goto("/progress");
  await expect(page.getByText("226 lb × 5")).toBeVisible();
});

test("keeps one user's log away from another", async ({ page, context }) => {
  await signUp(page, account());
  await page.getByRole("link", { name: "Open the log" }).click();
  await page.getByRole("button", { name: "Start workout" }).click();
  await page.getByLabel("Add an exercise").click();
  await page.getByRole("option", { name: "Back Squat", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();

  const url = page.url();

  await context.clearCookies();
  await signUp(page, account());

  await page.goto("/log");
  await expect(page.getByText("No workout in progress")).toBeVisible();

  await page.goto("/history");
  await expect(page.getByText("Nothing logged yet")).toBeVisible();

  await page.goto(url);
  await expect(page.getByText("No workout in progress")).toBeVisible();
});

test("deletes an account, and everything in it", async ({ page }) => {
  const email = account();
  await signUp(page, email);

  await page.getByRole("link", { name: "Open the log" }).click();
  await page.getByRole("button", { name: "Start workout" }).click();
  await page.getByLabel("Add an exercise").click();
  await page.getByRole("option", { name: "Deadlift", exact: true }).click();
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await page.getByRole("button", { name: "Log set" }).click();

  await page.goto("/");
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
  await expect(page.getByText("Signed in as")).toBeHidden();
});
