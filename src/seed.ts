import { createSeeder } from "./container.js";
import { env } from "./infrastructure/config/env.js";
import {
  connectMongo,
  disconnectMongo,
} from "./infrastructure/database/mongodb/connection.js";

async function seed(): Promise<void> {
  const { email, password } = env.superAdmin;
  if (!email) throw new Error("SUPER_ADMIN_EMAIL is not set");
  if (!password) throw new Error("SUPER_ADMIN_PASSWORD is not set");

  await connectMongo();
  console.log(`Connected to MongoDB (${env.mongodbDbName})`);

  const result = await createSeeder().run({ email, password });
  console.log(
    result.created
      ? `SUPER_ADMIN password login created: ${result.email}`
      : `SUPER_ADMIN password login already exists: ${result.email}`,
  );
}

seed()
  .then(() => console.log("Seed completed"))
  .catch((error) => {
    console.error("Seed failed:", error);
    process.exitCode = 1;
  })
  .finally(disconnectMongo);
