import express, { type Express, type Router } from "express";
import cors from "cors";
import helmet from "helmet";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./docs/openapi_spec.js";
import { errorHandler, notFoundHandler } from "./middlewares/error_handler.js";
import { createRequestLogger } from "./middlewares/request_logger.js";

export interface ApiRoute {
  path: string;
  router: Router;
}

export interface HttpOptions {
  corsOrigins?: string[];
  trustProxy?: boolean | number | string;
  logRequests?: boolean;
}

export function createApp(
  routes: ApiRoute[],
  isDbConnected: () => boolean,
  {
    corsOrigins = [],
    trustProxy = false,
    logRequests = false,
  }: HttpOptions = {},
): Express {
  const app = express();

  app.set("trust proxy", trustProxy);
  if (logRequests) app.use(createRequestLogger("auth-service"));
  app.use(helmet());
  app.use(cors({ origin: corsOrigins, credentials: true }));

  app.use(express.json());
  app.use(express.urlencoded({ extended: false }));

  app.get("/docs/openapi.json", (_req, res) => {
    res.json(openApiSpec);
  });
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "auth-service",
      db: isDbConnected() ? "connected" : "disconnected",
    });
  });

  for (const { path, router } of routes) {
    app.use(path, router);
  }

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}
