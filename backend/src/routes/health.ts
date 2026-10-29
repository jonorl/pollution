import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod";
import { z } from "zod";
import { prisma } from "../db/client.js";

// Polling can't hammer Postgres: the database answer is reused for a few seconds.
const CACHE_MS = 5000;
let lastCheck: { at: number; ok: boolean } | undefined;

async function databaseOk() {
  if (lastCheck && Date.now() - lastCheck.at < CACHE_MS) return lastCheck.ok;
  const ok = await prisma.$queryRaw`SELECT 1`.then(
    () => true,
    () => false
  );
  lastCheck = { at: Date.now(), ok };
  return ok;
}

export function resetHealthCache() {
  lastCheck = undefined;
}

const healthResponse = z.object({
  status: z.enum(["ok", "error"]),
  database: z.enum(["ok", "unreachable"]),
  version: z.string(),
});

export const healthRoute: FastifyPluginAsyncZod = async (app) => {
  // version is the commit the image was built from, so a deploy can tell the new container is the one answering.
  app.get("/health", { schema: { response: { 200: healthResponse, 503: healthResponse } } }, async (_request, reply) => {
    const ok = await databaseOk();
    return reply.code(ok ? 200 : 503).send({
      status: ok ? "ok" : "error",
      database: ok ? "ok" : "unreachable",
      version: process.env.GIT_SHA ?? "dev",
    });
  });
};
