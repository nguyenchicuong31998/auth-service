import type { Uuid } from "../../domain/entities/base_entity.js";
import { DuplicateKeyError } from "../../domain/errors/duplicate_key_error.js";
import { UserServiceError } from "../../domain/errors/user_service_error.js";
import type {
  DirectoryUser,
  NewDirectoryUser,
  UserDirectory,
} from "../../domain/ports/user_directory.js";
import type { ServiceTokenProvider } from "../security/service_token_provider.js";

const TIMEOUT_MS = 5000;

const unavailable = () =>
  new UserServiceError(503, "User service is unavailable");

function toDirectoryUser(body: unknown): DirectoryUser {
  const { id, fullName, email, status } = body as DirectoryUser;
  return { id, fullName, email: email ?? null, status };
}

export class UserServiceClient implements UserDirectory {
  constructor(
    private readonly baseUrl: string,
    private readonly serviceTokens: ServiceTokenProvider,
  ) {}

  async register(data: NewDirectoryUser): Promise<DirectoryUser> {
    const res = await this.request("POST", "/api/users", {
      ...data,
      registeredFrom: "manual",
    });
    if (res.status === 409) throw new DuplicateKeyError("email");
    if (res.status === 400) {
      const { message } = (await res.json()) as { message: string };
      throw new UserServiceError(400, message);
    }
    return toDirectoryUser(await this.json(res));
  }

  async findById(id: Uuid): Promise<DirectoryUser | null> {
    const res = await this.request(
      "GET",
      `/api/users/${encodeURIComponent(id)}`,
    );
    if (res.status === 404) return null;
    return toDirectoryUser(await this.json(res));
  }

  async findByEmail(email: string): Promise<DirectoryUser | null> {
    const query = new URLSearchParams({ email, limit: "1" });
    const res = await this.request("GET", `/api/users?${query}`);
    const page = (await this.json(res)) as { items: unknown[] };
    return page.items[0] ? toDirectoryUser(page.items[0]) : null;
  }

  private async request(
    method: string,
    path: string,
    body?: unknown,
  ): Promise<Response> {
    const token = await this.serviceTokens.getToken();
    try {
      return await fetch(new URL(path, this.baseUrl), {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
    } catch {
      throw unavailable();
    }
  }

  private async json(res: Response): Promise<unknown> {
    if (!res.ok) throw unavailable();
    return res.json();
  }
}
