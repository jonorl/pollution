import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../db/client.js";

const querySchema = z.object({
  limit: z.coerce.number().int().min(1).max(500).default(100),
  deviceId: z.string().optional(),
});

export const readingsRoute: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/readings",
    { schema: { querystring: querySchema } },
    async (request) => {
      const { limit, deviceId } = request.query;

      return prisma.reading.findMany({
        where: deviceId ? { deviceId } : undefined,
        orderBy: { createdAt: "desc" },
        take: limit,
      });
    }
  );
};