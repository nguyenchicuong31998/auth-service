import type { Uuid } from "../entities/base_entity.js";
import type { AuthProvider, UserIdentity } from "../entities/user_identity.js";

export type NewUserIdentity = Pick<
  UserIdentity,
  "userId" | "provider" | "providerAccountId" | "password"
>;

export interface UserIdentityRepository {
  create(data: NewUserIdentity): Promise<UserIdentity>;
  findByProviderAccount(
    provider: AuthProvider,
    providerAccountId: string,
  ): Promise<UserIdentity | null>;
  findAllByUser(userId: Uuid, provider: AuthProvider): Promise<UserIdentity[]>;
  updatePassword(id: Uuid, password: string): Promise<void>;
  markUsed(id: Uuid, at: Date): Promise<void>;
}
