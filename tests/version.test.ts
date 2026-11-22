import { expect, it } from "vitest";
import { appVersion } from "@/lib/version";

it("usa los 7 primeros caracteres del commit de Railway", () => {
  expect(appVersion({ RAILWAY_GIT_COMMIT_SHA: "abcdef1234" })).toBe("abcdef1");
});

it("sin commit, la versión es local", () => {
  expect(appVersion({})).toBe("local");
});
