import { describe, expect, it } from "vitest";
import { defaultPartnerName } from "./partners";

describe("defaultPartnerName", () => {
  it("uses the account name when there is one", () => {
    expect(defaultPartnerName({ name: "Priya", email: "priya@example.com" })).toBe("Priya");
  });

  it("ignores a blank name", () => {
    expect(defaultPartnerName({ name: "   ", email: "priya@example.com" })).toBe("Priya");
  });

  it("tidies the email local part into words", () => {
    expect(defaultPartnerName({ name: null, email: "rajarshi.roy@example.com" })).toBe(
      "Rajarshi Roy",
    );
    expect(defaultPartnerName({ name: null, email: "a_b-c+d@example.com" })).toBe("A B C D");
  });

  it("never returns an empty partner name", () => {
    expect(defaultPartnerName({ name: null, email: "@example.com" })).toBe("Partner");
  });
});
