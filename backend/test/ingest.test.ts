import { jest, describe, it, expect, beforeEach, afterEach } from "@jest/globals";
import { prisma } from "../src/db/client.js";
import { buildApp } from "../src/app.js";

jest.mock("../src/db/client.js", () => ({ prisma: { reading: { create: jest.fn() } } }));

const create = jest.mocked(prisma.reading.create);
const app = buildApp({ logger: false });

const reading = { deviceId: "esp32-01", pm1_0: 4, pm2_5: 9, pm10: 12, temperature_c: 24.5, humidity_pct: 61 };
const ingest = (body: unknown, apiKey?: string) =>
  app.inject({
    method: "POST",
    url: "/ingest",
    payload: body as object,
    headers: apiKey === undefined ? {} : { "x-api-key": apiKey },
  });

beforeEach(() => {
  process.env.POLLUTION_INGEST_API_KEY = "secret";
});

afterEach(() => {
  delete process.env.POLLUTION_INGEST_API_KEY;
});

describe("POST /ingest", () => {
  it("stores a reading sent with the right key", async () => {
    create.mockResolvedValue({ id: 42 } as never);
    const res = await ingest(reading, "secret");
    expect(res.statusCode).toBe(201);
    expect(res.json()).toEqual({ id: 42 });
    expect(create).toHaveBeenCalledWith({ data: reading });
  });

  it("fills in the default device for firmware that doesn't send one", async () => {
    create.mockResolvedValue({ id: 1 } as never);
    const { deviceId: _, ...withoutDevice } = reading;
    await ingest(withoutDevice, "secret");
    expect(create.mock.calls[0][0].data.deviceId).toBe("esp32-01");
  });

  it.each([
    ["no key", undefined],
    ["the wrong key", "guess"],
  ])("refuses a reading with %s", async (_label, key) => {
    expect((await ingest(reading, key)).statusCode).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it("refuses everyone when the server has no key configured", async () => {
    delete process.env.POLLUTION_INGEST_API_KEY;
    expect((await ingest(reading, "")).statusCode).toBe(401);
    expect((await ingest(reading)).statusCode).toBe(401);
    expect(create).not.toHaveBeenCalled();
  });

  it.each([
    ["a negative concentration", { ...reading, pm2_5: -1 }],
    ["a fractional concentration", { ...reading, pm10: 1.5 }],
    ["a temperature beyond the DHT22's range", { ...reading, temperature_c: 95 }],
    ["humidity above 100%", { ...reading, humidity_pct: 101 }],
    ["a missing PM2.5", { pm1_0: 1, pm10: 2 }],
  ])("rejects %s", async (_label, body) => {
    expect((await ingest(body, "secret")).statusCode).toBe(400);
    expect(create).not.toHaveBeenCalled();
  });
});
