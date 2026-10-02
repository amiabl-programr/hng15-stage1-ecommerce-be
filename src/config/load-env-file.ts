import { config } from 'dotenv';

// quiet: the startup banner and the "injected env (0) from .env" tip are noise on a
// service whose own stdout is structured JSON logs.
config({ quiet: true });