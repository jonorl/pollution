import Fastify from "fastify";
import cors from "@fastify/cors";
import {
  serializerCompiler,
  validatorCompiler,
  type ZodTypeProvider,
} from "fastify-type-provider-zod";
import { ingestRoute } from "./routes/ingest.js";
import { readingsRoute } from "./routes/readings.js";

export function buildApp() {
  const app = Fastify({ logger: true }).withTypeProvider<ZodTypeProvider>();

  app.setValidatorCompiler(validatorCompiler);
  app.setSerializerCompiler(serializerCompiler);

  app.register(cors, { origin: true }); // fine for a pet project; tighten later if needed

  app.register(ingestRoute);
  app.register(readingsRoute);

  return app;
}