import express, { type Express, type Router } from "express";
import swaggerUi from "swagger-ui-express";
import { openApiSpec } from "./docs/openapi_spec.js";
import { errorHandler, notFoundHandler } from "./middlewares/error_handler.js";

export interface ApiRoute {
  path: string;
  router: Router;
}

export function createApp(
  routes: ApiRoute[],
  isDbConnected: () => boolean,
): Express {
  const app = express();

  app.use(express.json());

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
