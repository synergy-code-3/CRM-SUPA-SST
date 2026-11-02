import { describe, expect, it } from "vitest";
import { pideInverso } from "./api";

describe("pideInverso", () => {
  it("solo con inverso=1 en la URL", () => {
    expect(pideInverso(new Request("http://x/api?inverso=1"))).toBe(true);
    expect(pideInverso(new Request("http://x/api?inverso=0"))).toBe(false);
    expect(pideInverso(new Request("http://x/api?inverso=true"))).toBe(false);
    expect(pideInverso(new Request("http://x/api"))).toBe(false);
  });
});
