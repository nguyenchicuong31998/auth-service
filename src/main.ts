import { createRoutes } from "./container.js";
import { env } from "./infrastructure/config/env.js";
import {
  connectMongo,
  disconnectMongo,
  isMongoConnected,
} from "./infrastructure/database/mongodb/connection.js";
import { createApp } from "./presentation/app.js";

async function bootstrap(): Promise<void> {
  const routes = createRoutes();
  await connectMongo();
  console.log(`Connected to MongoDB (${env.mongodbDbName})`);

  const app = createApp(routes, isMongoConnected, env.http);
  const server = app.listen(env.port, () => {
    console.log(`auth-service listening on http://localhost:${env.port}`);
  });

  const shutdown = (signal: NodeJS.Signals) => {
    console.log(`${signal} received, shutting down...`);
    server.close(async () => {
      await disconnectMongo();
      process.exit(0);
    });
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
}

bootstrap().catch((error) => {
  console.error("Failed to start auth-service:", error);
  process.exit(1);
});
