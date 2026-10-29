import { jest, describe, it, expect } from "@jest/globals";
import { prisma } from "../src/db/client.js";
import { buildApp } from "../src/app.js";

jest.mock("../src/db/client.js", () => ({
  prisma: { reading: { findMany: jest.fn() }, $queryRaw: jest.fn() },
}));

const findMany = jest.mocked(prisma.reading.findMany);
const queryRaw = jest.mocked(prisma.$queryRaw);
const app = buildApp({ logger: false });
const get = (url: string) => app.inject({ method: "GET", url });

describe("GET /readings", () => {
  it("returns the newest 100 readings by default", async () => {
    findMany.mockResolvedValue([] as never);
    expect((await get("/readings")).statusCode).toBe(200);
    expect(findMany).toHaveBeenCalledWith({ where: {}, orderBy: { createdAt: "desc" }, take: 100 });
  });

  it("filters by device and by readings strictly after since", async () => {
    findMany.mockResolvedValue([] as never);
    await get("/readings?deviceId=esp32-02&since=2026-10-01T00:00:00.000Z&limit=5");
    expect(findMany).toHaveBeenCalledWith({
      where: { deviceId: "esp32-02", createdAt: { gt: new Date("2026-10-01T00:00:00.000Z") } },
      orderBy: { createdAt: "desc" },
      take: 5,
    });
  });

  it.each(["limit=0", "limit=2001", "since=yesterday"])("rejects %s", async (query) => {
    expect((await get(`/readings?${query}`)).statusCode).toBe(400);
    expect(findMany).not.toHaveBeenCalled();
  });
});

describe("GET /readings/bins", () => {
  it("averages a fortnight in 5-minute buckets by default", async () => {
    queryRaw.mockResolvedValue([] as never);
    expect((await get("/readings/bins")).statusCode).toBe(200);
    // Tagged template: the interpolated values follow the strings array.
    expect(queryRaw.mock.calls[0].slice(1)).toEqual([300, 300, 14]);
  });

  it.each(["minutes=7", "days=0", "days=32"])("rejects %s", async (query) => {
    expect((await get(`/readings/bins?${query}`)).statusCode).toBe(400);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});

describe("GET /readings/daily", () => {
  it("counts days in the time zone it is given", async () => {
    queryRaw.mockResolvedValue([] as never);
    expect((await get("/readings/daily?tz=Africa/Kampala&days=30")).statusCode).toBe(200);
    expect(queryRaw.mock.calls[0].slice(1)).toEqual(["Africa/Kampala", 30]);
  });

  it("rejects a time zone that isn't IANA", async () => {
    expect((await get("/readings/daily?tz=Mars/Olympus")).statusCode).toBe(400);
    expect(queryRaw).not.toHaveBeenCalled();
  });
});
