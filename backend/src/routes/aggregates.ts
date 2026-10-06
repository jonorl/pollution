import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../db/client.js";

// Postgres does the averaging so a fortnight costs the browser ~4k rows instead of ~20k.
// "createdAt" is a UTC timestamp without time zone (Prisma's convention), hence the AT TIME ZONE 'UTC'.

const BIN_MINUTES = [1, 5, 10, 15, 30, 60];

const binsQuery = z.object({
  days: z.coerce.number().int().min(1).max(31).default(14),
  minutes: z.coerce
    .number()
    .int()
    .refine((m) => BIN_MINUTES.includes(m), { message: `minutes must be one of ${BIN_MINUTES.join(", ")}` })
    .default(5),
});

const TIME_ZONES = new Set(Intl.supportedValuesOf("timeZone"));

const dailyQuery = z.object({
  days: z.coerce.number().int().min(1).max(400).default(182),
  // Days are counted in the viewer's zone, so "Monday" means their Monday.
  tz: z
    .string()
    .refine((tz) => tz === "UTC" || TIME_ZONES.has(tz), { message: "tz must be an IANA time zone" })
    .default("UTC"),
});

interface BinRow {
  t: Date;
  pm1: number;
  pm25: number;
  pm10: number;
  temp: number | null;
  n: number;
}

interface DayRow {
  day: string;
  pm1: number;
  pm25: number;
  pm10: number;
  temp: number | null;
  n: number;
}

export const aggregatesRoute: FastifyPluginAsyncZod = async (app) => {
  // Mean readings per fixed-size time bucket; `t` is the bucket's start and `n` the minutes in it.
  app.get("/readings/bins", { schema: { querystring: binsQuery } }, async (request) => {
    const { days, minutes } = request.query;
    const seconds = minutes * 60;

    return prisma.$queryRaw<BinRow[]>`
      SELECT to_timestamp((floor(extract(epoch FROM "createdAt") / ${seconds}::int) * ${seconds}::int)::float8) AS t,
             avg("pm1_0")::float8 AS pm1,
             avg("pm2_5")::float8 AS pm25,
             avg("pm10")::float8 AS pm10,
             avg("temperature_c")::float8 AS temp,
             count(*)::int AS n
      FROM "Reading"
      WHERE "createdAt" > (now() AT TIME ZONE 'UTC') - make_interval(days => ${days}::int)
      GROUP BY 1
      ORDER BY 1`;
  });

  // Mean readings per calendar day in `tz`; `day` is YYYY-MM-DD and `n` the minutes recorded that day.
  app.get("/readings/daily", { schema: { querystring: dailyQuery } }, async (request) => {
    const { days, tz } = request.query;

    return prisma.$queryRaw<DayRow[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'UTC') AT TIME ZONE ${tz}, 'YYYY-MM-DD') AS day,
             avg("pm1_0")::float8 AS pm1,
             avg("pm2_5")::float8 AS pm25,
             avg("pm10")::float8 AS pm10,
             avg("temperature_c")::float8 AS temp,
             count(*)::int AS n
      FROM "Reading"
      WHERE "createdAt" > (now() AT TIME ZONE 'UTC') - make_interval(days => ${days}::int + 1)
      GROUP BY 1
      ORDER BY 1`;
  });
};
