export type OAuthErrorCode =
  | "invalid_request"
  | "invalid_client"
  | "invalid_scope"
  | "unsupported_grant_type";

export class OAuthError extends Error {
  constructor(
    public readonly status: number,
    public readonly error: OAuthErrorCode,
    public readonly description: string,
  ) {
    super(description);
    this.name = "OAuthError";
  }

  static invalidRequest(description: string): OAuthError {
    return new OAuthError(400, "invalid_request", description);
  }

  static invalidClient(): OAuthError {
    return new OAuthError(
      401,
      "invalid_client",
      "Client authentication failed",
    );
  }

  static invalidScope(description: string): OAuthError {
    return new OAuthError(400, "invalid_scope", description);
  }

  static unsupportedGrantType(): OAuthError {
    return new OAuthError(
      400,
      "unsupported_grant_type",
      "Only grant_type=client_credentials is supported",
    );
  }
}
