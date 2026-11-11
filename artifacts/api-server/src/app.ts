import express, { type Express, type ErrorRequestHandler } from "express";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { ZodError } from "zod";
import { PublicError } from "./services/network";
import { clerkMiddleware } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import {
  CLERK_PROXY_PATH,
  clerkProxyMiddleware,
  getClerkProxyHost,
} from "./middlewares/clerkProxyMiddleware";

const app: Express = express();

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(express.json({ limit: "32kb" }));
app.use(express.urlencoded({ extended: true }));

const clerkAuth = clerkMiddleware((req) => ({
  publishableKey: publishableKeyFromHost(
    getClerkProxyHost(req) ?? "",
    process.env.CLERK_PUBLISHABLE_KEY,
  ),
}));

// Auth is optional for scans. If Clerk is unavailable, continue as an
// anonymous request; saved-history routes still require a verified user ID.
app.use((req, res, next) => {
  try {
    clerkAuth(req, res, (error) => {
      if (!error) { next(); return; }
      if (res.headersSent) { next(error); return; }
      logger.warn({ errorType: error instanceof Error ? error.name : "Unknown" }, "Optional Clerk authentication unavailable");
      next();
    });
  } catch (error) {
    logger.warn({ errorType: error instanceof Error ? error.name : "Unknown" }, "Optional Clerk authentication unavailable");
    next();
  }
});

app.use("/api", router);
const handleError: ErrorRequestHandler = (err, req, res, _next) => {
  if (err instanceof PublicError) { res.status(err.status).json({ error: err.message }); return; }
  if (err instanceof ZodError || err instanceof SyntaxError) {
    res.status(400).json({ error: "Invalid request. Check the URL or selected scan, issue and element." }); return;
  }
  if (err?.type === "entity.too.large") { res.status(413).json({ error: "Request body is too large." }); return; }
  req.log.error({ errorType: err instanceof Error ? err.name : "Unknown" }, "Request failed");
  res.status(500).json({ error: "An unexpected error occurred. Try again or start a new scan." });
};
app.use(handleError);

export default app;
