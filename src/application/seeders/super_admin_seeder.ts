import type { PasswordHasher } from "../../domain/ports/password_hasher.js";
import type { UserDirectory } from "../../domain/ports/user_directory.js";
import type { UserIdentityRepository } from "../../domain/repositories/user_identity_repository.js";

export interface SuperAdminCredentials {
  email: string;
  password: string;
}

export interface SeedResult {
  email: string;
  created: boolean;
}

export class SuperAdminSeeder {
  constructor(
    private readonly identities: UserIdentityRepository,
    private readonly users: UserDirectory,
    private readonly passwords: PasswordHasher,
  ) {}

  async run({ email, password }: SuperAdminCredentials): Promise<SeedResult> {
    if (await this.identities.findByProviderAccount("manual", email)) {
      return { email, created: false };
    }
    const user = await this.users.findByEmail(email);
    if (!user) {
      throw new Error(
        `User ${email} not found in user-service. Run "npm run seed" in user-service first.`,
      );
    }
    await this.identities.create({
      userId: user.id,
      provider: "manual",
      providerAccountId: email,
      password: await this.passwords.hash(password),
    });
    return { email, created: true };
  }
}
