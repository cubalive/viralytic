export class BaseError extends Error {
  constructor(
    public code: string,
    message: string,
    public context: Record<string, unknown> = {},
    public cause?: Error
  ) {
    super(message);
    this.name = this.constructor.name;
  }
  toJSON() {
    return { name: this.name, code: this.code, message: this.message, context: this.context };
  }
}

export class ScraperError extends BaseError {}
export class AIError extends BaseError {}
export class IntegrationError extends BaseError {}
export class QuotaExceededError extends BaseError {}
export class ValidationError extends BaseError {}
