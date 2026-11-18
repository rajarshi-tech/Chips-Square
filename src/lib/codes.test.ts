import { describe, expect, it } from "vitest";
import { productIdentity, slugify, uniqueSlug } from "./codes";

describe("slugify", () => {
  it("produces readable, stable slugs", () => {
    expect(slugify("Lay's Classic Salted")).toBe("lay-s-classic-salted");
    expect(slugify("Amul Butter 500 g")).toBe("amul-butter-500-g");
    expect(slugify("  Kadak  Chai  ")).toBe("kadak-chai");
  });

  it("strips accents and punctuation instead of dropping words", () => {
    expect(slugify("Café Crème 200 ml")).toBe("cafe-creme-200-ml");
    expect(slugify("Rusk (Toast) — 300g")).toBe("rusk-toast-300g");
  });

  it("never returns an empty or leading-dash slug", () => {
    expect(slugify("   ")).toBe("");
    expect(slugify("!!!")).toBe("");
    expect(slugify("-x-")).toBe("x");
  });

  it("caps length without leaving a trailing dash", () => {
    const slug = slugify("a".repeat(80));
    expect(slug).toHaveLength(60);
    expect(slug.endsWith("-")).toBe(false);
  });
});

describe("uniqueSlug", () => {
  it("keeps the plain slug when it is free", () => {
    expect(uniqueSlug("Lay's Classic Salted", [])).toBe("lay-s-classic-salted");
  });

  it("appends -2, -3 for collisions", () => {
    expect(uniqueSlug("Lay's Classic Salted", ["lay-s-classic-salted"])).toBe(
      "lay-s-classic-salted-2",
    );
    expect(
      uniqueSlug("Lay's Classic Salted", ["lay-s-classic-salted", "lay-s-classic-salted-2"]),
    ).toBe("lay-s-classic-salted-3");
  });

  it("falls back to something usable when the name has no letters", () => {
    expect(uniqueSlug("!!!", [])).toBe("product");
    expect(uniqueSlug("!!!", ["product"])).toBe("product-2");
  });
});

describe("productIdentity", () => {
  it("ignores case, spaces and punctuation", () => {
    expect(productIdentity("Lay's", "Classic Salted", "52 g")).toBe(
      productIdentity("lays", "classic salted", "52g"),
    );
  });

  it("separates products that only differ by size", () => {
    expect(productIdentity("Amul", "Butter", "100 g")).not.toBe(
      productIdentity("Amul", "Butter", "500 g"),
    );
  });
});
