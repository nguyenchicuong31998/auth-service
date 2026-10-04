import { parseCreateOAuthClientInput } from "./application/validators/oauth_client_validator.js";
import { createOAuthClientAdmin } from "./container.js";
import { env } from "./infrastructure/config/env.js";
import {
  connectMongo,
  disconnectMongo,
} from "./infrastructure/database/mongodb/connection.js";

async function createClient(): Promise<void> {
  const [name, ...scopes] = process.argv.slice(2);
  const input = parseCreateOAuthClientInput({ name, scopes });
  const ownerEmail = env.superAdmin.email;
  if (!ownerEmail) throw new Error("SUPER_ADMIN_EMAIL is not set");

  await connectMongo();
  const { clients, users } = createOAuthClientAdmin();
  const owner = await users.findByEmail(ownerEmail);
  if (!owner) throw new Error(`Owner ${ownerEmail} not found in user-service`);
  const client = await clients.create(owner.id, input);

  console.log("OAuth client created. Store the secret now, it is shown once:");
  console.log(`OAUTH_CLIENT_ID=${client.clientId}`);
  console.log(`OAUTH_CLIENT_SECRET=${client.clientSecret}`);
  console.log(`# scopes: ${client.scopes.join(" ")}`);
}

createClient()
  .catch((error: Error) => {
    console.error(`Failed to create OAuth client: ${error.message}`);
    console.error(
      "Usage: npm run oauth-client:create -- <name> <scope> [scope...]",
    );
    process.exitCode = 1;
  })
  .finally(disconnectMongo);
