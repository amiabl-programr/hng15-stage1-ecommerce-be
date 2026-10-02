export {};

declare global {
  namespace Express {
    interface Request {
      /**
       * Correlation id for this request. Stamped by middlewares/request-id.ts and
       * logged with every error, so a report from a user maps to log lines without
       * exposing anything about them.
       */
      requestId: string;
    }
  }
}