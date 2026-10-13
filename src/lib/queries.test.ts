import { describe, expect, test } from "vitest";
import { signInGate } from "./queries";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("signInGate", () => {
  test("waits until sign-in is known, then runs only when signed in", async () => {
    const gate = signInGate();
    const ran: string[] = [];
    gate.whenSignedIn(() => ran.push("early"));
    await settle();
    expect(ran).toEqual([]);

    gate.set(true);
    await settle();
    expect(ran).toEqual(["early"]);

    gate.set(false);
    gate.whenSignedIn(() => ran.push("after sign-out"));
    await settle();
    expect(ran).toEqual(["early"]);
  });

  test("signed out from the start runs nothing", async () => {
    const gate = signInGate();
    let ran = false;
    gate.whenSignedIn(() => (ran = true));
    gate.set(false);
    await settle();
    expect(ran).toBe(false);
  });
});
