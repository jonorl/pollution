import Fastify from "fastify";
import cors from "@fastify/cors";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { aggregatesRoute } from "./routes/aggregates.js";
import { healthRoute } from "./routes/health.js";
import { ingestRoute } from "./routes/ingest.js";
import { readingsRoute } from "./routes/readings.js";

// logger is off in tests, where every request would otherwise print a line.
export function buildApp({ logger = true } = {}) {
  const app = Fastify({ logger }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(cors, { origin: true }); // fine for a pet project; tighten later if needed

  app.register(healthRoute);
  app.register(ingestRoute);
  app.register(readingsRoute);
  app.register(aggregatesRoute);

  return app;
}