import type { Uuid } from "../entities/base_entity.js";

export interface DirectoryUser {
  id: Uuid;
  fullName: string;
  email: string | null;
  status: string;
}

export interface NewDirectoryUser {
  fullName: string;
  email: string;
}

export interface UserDirectory {
  register(data: NewDirectoryUser): Promise<DirectoryUser>;
  findById(id: Uuid): Promise<DirectoryUser | null>;
  findByEmail(email: string): Promise<DirectoryUser | null>;
}
