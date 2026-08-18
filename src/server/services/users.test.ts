/**
 * Registration and the credential check. The timing equalisation in
 * `verifyCredentials` is not asserted here — it is a property of the code path,
 * and a clock-based assertion would be flaky.
 */
import { describe, expect, it } from "vitest";

import { getWeightUnit, registerUser, setWeightUnit, verifyCredentials } from "./users";

const password = "correct-horse-battery";

describe("registerUser", () => {
  it("creates an account and trims the name", async () => {
    const user = await registerUser({
      email: "new@example.test",
      password,
      name: "  Dana  ",
    });

    expect(user).toMatchObject({ email: "new@example.test", name: "Dana" });
    expect(user.id).toBeTruthy();
  });

  it("stores no name when one is not given", async () => {
    const user = await registerUser({ email: "anon@example.test", password });
    expect(user.name).toBeNull();
  });

  it("refuses an email that already exists, whatever its case", async () => {
    await registerUser({ email: "taken@example.test", password });

    await expect(registerUser({ email: "TAKEN@example.test", password })).rejects.toMatchObject({
      code: "conflict",
    });
  });


  it("survives two registrations racing for the same email", async () => {
    /** Both calls pass the existence check; the loser hits the unique index. */
    const results = await Promise.allSettled([
      registerUser({ email: "race@example.test", password }),
      registerUser({ email: "race@example.test", password }),
    ]);

    const rejected = results.filter((result) => result.status === "rejected");
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(rejected).toHaveLength(1);
    expect(rejected[0].reason).toMatchObject({ code: "conflict" });
  });
});

describe("verifyCredentials", () => {
  it("returns the user for the right password", async () => {
    const created = await registerUser({ email: "known@example.test", password });

    const verified = await verifyCredentials({ email: "known@example.test", password });
    expect(verified?.id).toBe(created.id);
  });

  it("matches the email case-insensitively", async () => {
    await registerUser({ email: "casing@example.test", password });

    const verified = await verifyCredentials({ email: "CASING@example.test", password });
    expect(verified).not.toBeNull();
  });

  it("returns null for a wrong password and for an unknown email alike", async () => {
    await registerUser({ email: "someone@example.test", password });

    expect(await verifyCredentials({ email: "someone@example.test", password: "wrong" })).toBeNull();
    expect(await verifyCredentials({ email: "nobody@example.test", password })).toBeNull();
  });
});

describe("the display unit", () => {
  it("is kilograms until it is changed", async () => {
    const user = await registerUser({ email: "units@example.test", password });

    expect(await getWeightUnit(user.id)).toBe("kg");
  });

  it("changes, and stays changed", async () => {
    const user = await registerUser({ email: "pounds@example.test", password });

    expect(await setWeightUnit(user.id, "lb")).toBe("lb");
    expect(await getWeightUnit(user.id)).toBe("lb");
  });

  it("is not_found for an account that does not exist", async () => {
    await expect(getWeightUnit("00000000-0000-4000-8000-000000000000")).rejects.toMatchObject({
      code: "not_found",
    });
    await expect(
      setWeightUnit("00000000-0000-4000-8000-000000000000", "lb"),
    ).rejects.toMatchObject({ code: "not_found" });
  });
});
