import "dotenv/config";
import { buildApp } from "./app.js";

const app = buildApp();
const port = Number(process.env.PORT_POLLUTION ?? 3000);

app.listen({ port, host: "0.0.0.0" }, (err) => {
  if (err) {
    app.log.error(err);
    process.exit(1);
  }
});
