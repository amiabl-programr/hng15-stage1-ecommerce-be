import { validEnv } from './valid-env.ts';

// Populate process.env with a complete, valid mock environment for unit tests
Object.assign(process.env, validEnv);
