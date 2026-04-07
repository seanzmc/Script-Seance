export class AuthError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const authError = (status, code, message, details) => (
  new AuthError(status, code, message, details)
);
