import { test } from "vitest";
import assert from "node:assert/strict";
import { currentMonthRef, todayRef } from "./dates";

test("currentMonthRef 2026-10-01T01:00Z -> setembro (22h do dia 30 em SP)", () => {
  const ref = currentMonthRef(new Date("2026-10-01T01:00:00Z"));
  assert.equal(ref.year, 2026);
  assert.equal(ref.month, 9);
});

test("currentMonthRef 2026-10-01T03:00Z -> outubro (00:00 do dia 1 em SP)", () => {
  const ref = currentMonthRef(new Date("2026-10-01T03:00:00Z"));
  assert.equal(ref.year, 2026);
  assert.equal(ref.month, 10);
});

test("currentMonthRef 2026-10-01T04:00Z -> outubro (01h em SP)", () => {
  const ref = currentMonthRef(new Date("2026-10-01T04:00:00Z"));
  assert.equal(ref.year, 2026);
  assert.equal(ref.month, 10);
});

test("currentMonthRef 2027-01-01T01:00Z -> dezembro 2026 (22h do dia 31 em SP)", () => {
  const ref = currentMonthRef(new Date("2027-01-01T01:00:00Z"));
  assert.equal(ref.year, 2026);
  assert.equal(ref.month, 12);
});

test("currentMonthRef 2026-12-31T23:00Z -> dezembro (20h do dia 31 em SP)", () => {
  const ref = currentMonthRef(new Date("2026-12-31T23:00:00Z"));
  assert.equal(ref.year, 2026);
  assert.equal(ref.month, 12);
});

test("todayRef 2026-10-01T01:00Z -> 2026-09-30", () => {
  const today = todayRef(new Date("2026-10-01T01:00:00Z"));
  assert.equal(today, "2026-09-30");
});

test("todayRef 2026-10-01T03:00Z -> 2026-10-01", () => {
  const today = todayRef(new Date("2026-10-01T03:00:00Z"));
  assert.equal(today, "2026-10-01");
});

test("todayRef 2026-10-01T04:00Z -> 2026-10-01", () => {
  const today = todayRef(new Date("2026-10-01T04:00:00Z"));
  assert.equal(today, "2026-10-01");
});

test("todayRef 2027-01-01T01:00Z -> 2026-12-31", () => {
  const today = todayRef(new Date("2027-01-01T01:00:00Z"));
  assert.equal(today, "2026-12-31");
});

test("todayRef 2026-12-31T23:00Z -> 2026-12-31", () => {
  const today = todayRef(new Date("2026-12-31T23:00:00Z"));
  assert.equal(today, "2026-12-31");
});