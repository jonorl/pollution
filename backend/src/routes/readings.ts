import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../db/client.js";

const querySchema = z.object({
  // 2000 covers a full day at one reading a minute (1440) with room to spare.
  limit: z.coerce.number().int().min(1).max(2000).default(100),
  deviceId: z.string().optional(),
  // Exclusive, so a client can poll with its newest createdAt and get only new rows.
  since: z.coerce.date().optional(),
});

export const readingsRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/readings",
    { schema: { querystring: querySchema } },
    async (request) => {
      const { limit, deviceId, since } = request.query;

      return prisma.reading.findMany({
        where: {
          ...(deviceId ? { deviceId } : {}),
          ...(since ? { createdAt: { gt: since } } : {}),
        },
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    }
  );
};
