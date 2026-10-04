import type { Uuid } from "./base_entity.js";

export const AUTH_PROVIDERS = [
  "manual",
  "phone_otp",
  "google",
  "facebook",
  "apple",
] as const;
export type AuthProvider = (typeof AUTH_PROVIDERS)[number];

export interface UserIdentity {
  id: Uuid;
  userId: Uuid;
  provider: AuthProvider;
  providerAccountId: string;
  password: string | null;
  lastUsedAt: Date | null;
  createdAt: Date;
  updatedAt: Date | null;
}
