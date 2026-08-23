import { randomBytes } from "node:crypto";

/** ID curto, ordenável por tempo e seguro para URL (26 chars). */
export function createId(): string {
  const time = Date.now().toString(36).padStart(9, "0");
  const rand = randomBytes(9).toString("hex").slice(0, 17);
  return `${time}${rand}`;
}
