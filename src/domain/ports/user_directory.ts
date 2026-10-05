import type { Uuid } from "../entities/base_entity.js";
import type { AuthProvider } from "../entities/user_identity.js";

export interface DirectoryUser {
  id: Uuid;
  fullName: string;
  email: string | null;
  phone: string | null;
  status: string;
  emailVerified: boolean;
  phoneVerified: boolean;
}

export interface UserAccess {
  status: string;
  permissions: string[];
}

export interface NewDirectoryUser {
  fullName: string;
  email: string | null;
  phone: string | null;
  registeredFrom: Extract<AuthProvider, "manual" | "phone_otp">;
}

export interface UserDirectory {
  register(data: NewDirectoryUser): Promise<DirectoryUser>;
  findById(id: Uuid): Promise<DirectoryUser | null>;
  findByEmail(email: string): Promise<DirectoryUser | null>;
  getAccess(id: Uuid): Promise<UserAccess | null>;
  verifyEmail(id: Uuid, email: string): Promise<DirectoryUser>;
  verifyPhone(id: Uuid, phone: string): Promise<DirectoryUser>;
  recordLogin(id: Uuid, provider: AuthProvider): Promise<void>;
}
