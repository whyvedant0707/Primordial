import app from "./app";
import { logger } from "./lib/logger";
import { initializeHistory } from "./services/store";

const rawPort = process.env["PORT"];

// Allowlisted booleans only: never log environment objects or provider values.
// These are the actual server process settings, not frontend/build-time config.
logger.info({
  configurationPresence: {
    OPENAI_BASE_URL: Boolean(process.env.OPENAI_BASE_URL?.trim()),
    OPENAI_MODEL: Boolean(process.env.OPENAI_MODEL?.trim()),
    OPENAI_API_KEY: Boolean(process.env.OPENAI_API_KEY?.trim()),
  },
  developmentMode: process.env.NODE_ENV === "development",
  replitRuntime: Boolean(process.env.REPL_ID),
}, "API startup configuration presence (not a provider connectivity check)");

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

await initializeHistory();
app.listen(port, (err) => {
  if (err) {
    logger.error({ err }, "Error listening on port");
    process.exit(1);
  }

  logger.info({ port }, "Server listening");
});
