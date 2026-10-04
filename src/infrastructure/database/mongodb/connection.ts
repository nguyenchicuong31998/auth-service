import dns from "node:dns";
import mongoose from "mongoose";
import { env } from "../../config/env.js";

export async function connectMongo(): Promise<void> {
  if (env.dnsServers.length > 0) dns.setServers(env.dnsServers);
  await mongoose.connect(env.mongodbUri, { dbName: env.mongodbDbName });
  await Promise.all(
    Object.values(mongoose.models).map((model) => model.init()),
  );
}

export function disconnectMongo(): Promise<void> {
  return mongoose.disconnect();
}

export function isMongoConnected(): boolean {
  return mongoose.connection.readyState === mongoose.ConnectionStates.connected;
}
