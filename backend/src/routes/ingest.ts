import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../db/client.js";

const ingestBodySchema = z.object({
  deviceId: z.string().default("esp32-01"),
  pm1_0: z.number().int().nonnegative(),
  pm2_5: z.number().int().nonnegative(),
  pm10: z.number().int().nonnegative(),
});

export const ingestRoute: FastifyPluginAsyncZod = async (app) => {
  app.post(
    "/ingest",
    {
      schema: {
        body: ingestBodySchema,
        response: {
          201: z.object({ id: z.number() }),
        //   401: z.object(),
        },
      },
    },
    async (request, reply) => {
      const apiKey = request.headers["x-api-key"];
      if (apiKey !== process.env.INGEST_API_KEY) {
        return reply.code(401).send();
      }

      const { deviceId, pm1_0, pm2_5, pm10 } = request.body;

      const reading = await prisma.reading.create({
        data: { deviceId, pm1_0, pm2_5, pm10 },
      });

      return reply.code(201).send({ id: reading.id });
    }
  );
};