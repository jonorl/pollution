import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../db/client.js";

const ingestBodySchema = z.object({
  deviceId: z.string().default("esp32-01"),
  pm1_0: z.number().int().nonnegative(),
  pm2_5: z.number().int().nonnegative(),
  pm10: z.number().int().nonnegative(),
  // Particle counts per 0.1 L; optional so firmware that predates them keeps working.
  n0_3: z.number().int().nonnegative().optional(),
  n0_5: z.number().int().nonnegative().optional(),
  n1_0: z.number().int().nonnegative().optional(),
  n2_5: z.number().int().nonnegative().optional(),
  n5_0: z.number().int().nonnegative().optional(),
  n10: z.number().int().nonnegative().optional(),
  // The TMP36's rated range; anything outside it is a wiring fault, not weather.
  temperature_c: z.number().min(-40).max(125).optional(),
});

export const ingestRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/ingest",
    {
      schema: {
        body: ingestBodySchema,
        response: {
          201: z.object({ id: z.number() }),
          401: z.null(),
        },
      },
    },
    async (request, reply) => {
      const apiKey = request.headers["x-api-key"];
      if (apiKey !== process.env.INGEST_API_KEY) {
        return reply.code(401).send(null);
      }

      const reading = await prisma.reading.create({ data: request.body });

      return reply.code(201).send({ id: reading.id });
    }
  );
};