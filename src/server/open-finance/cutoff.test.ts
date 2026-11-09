import { describe, expect, it } from "vitest";
import { anchorPluggyCivilDate } from "./cutoff";

describe("Pluggy civil dates", () => {
  it("anchors Sao Paulo's civil date at noon UTC", () => {
    expect(anchorPluggyCivilDate("2026-09-01").toISOString()).toBe("2026-09-01T12:00:00.000Z");
    expect(anchorPluggyCivilDate("2026-09-01T02:30:00.000Z").toISOString()).toBe("2026-08-31T12:00:00.000Z");
  });
});
