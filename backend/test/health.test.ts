import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { prisma } from "../src/db/client.js";
import { buildApp } from "../src/app.js";
import { resetHealthCache } from "../src/routes/health.js";

jest.mock("../src/db/client.js", () => ({ prisma: { $queryRaw: jest.fn() } }));

const queryRaw = jest.mocked(prisma.$queryRaw);
const app = buildApp({ logger: false });
const health = () => app.inject({ method: "GET", url: "/health" });

beforeEach(() => {
  resetHealthCache();
  process.env.GIT_SHA = "abc1234";
});

afterEach(() => {
  jest.useRealTimers();
  delete process.env.GIT_SHA;
});

describe("GET /health", () => {
  it("reports ok and the build's commit when the database answers", async () => {
    queryRaw.mockResolvedValue([{ "?column?": 1 }] as never);
    const res = await health();
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok", database: "ok", version: "abc1234" });
  });

  it("answers 503 when the database is unreachable", async () => {
    queryRaw.mockRejectedValue(new Error("Can't reach database server") as never);
    const res = await health();
    expect(res.statusCode).toBe(503);
    expect(res.json()).toEqual({ status: "error", database: "unreachable", version: "abc1234" });
  });

  it("says dev when the image was built without a commit", async () => {
    delete process.env.GIT_SHA;
    queryRaw.mockResolvedValue([] as never);
    expect((await health()).json().version).toBe("dev");
  });

  it("checks the database at most once every 5 seconds", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    queryRaw.mockResolvedValue([] as never);

    await health();
    await health();
    expect(queryRaw).toHaveBeenCalledTimes(1);

    jest.advanceTimersByTime(5000);
    await health();
    expect(queryRaw).toHaveBeenCalledTimes(2);
  });

  it("notices recovery once the cached failure expires", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] });
    queryRaw.mockRejectedValueOnce(new Error("down") as never).mockResolvedValue([] as never);

    expect((await health()).statusCode).toBe(503);
    jest.advanceTimersByTime(5000);
    expect((await health()).statusCode).toBe(200);
  });
});
