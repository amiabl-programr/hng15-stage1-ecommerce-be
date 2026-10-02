import { createSchema } from 'zod-openapi';

import { COMPONENT_SCHEMAS } from './registry.ts';

/**
 * Builds the OpenAPI document from the zod contracts.
 *
 * Library code rather than script code so a test can assert against it without running
 * the CLI. `scripts/generate-openapi.ts` is the thin wrapper that writes or checks it.
 */

// Derived from createSchema rather than imported: the package's type exports resolve
// under a different moduleResolution than this project uses.
type Components = ReturnType<typeof createSchema>['components'];

export const OPENAPI_VERSION = '3.1.0';
export const API_TITLE = 'Roofing Construction Shop API';
export const API_VERSION = '0.1.0';

function byId(a: string, b: string): number {
  return a < b ? -1 : 1;
}

export function buildComponents(): Components {
  const components: Components = {};

  for (const { id, schema } of COMPONENT_SCHEMAS) {
    // createSchema returns the component itself plus everything it references, so
    // MediaAsset reaches the document once even though Product and Category both use it.
    for (const [name, component] of Object.entries(
      createSchema(schema, { openapiVersion: OPENAPI_VERSION }).components,
    )) {
      components[name] = component;
    }

    if (components[id] === undefined) {
      throw new Error(`registry entry "${id}" produced no component`);
    }
  }

  // Sorted so the committed file has a stable diff. A generated file that reshuffles
  // itself on every run makes review impossible.
  return Object.fromEntries(Object.entries(components).sort(([a], [b]) => byId(a, b)));
}

export function buildDocument(): Record<string, unknown> {
  return {
    openapi: OPENAPI_VERSION,
    info: {
      title: API_TITLE,
      version: API_VERSION,
      description:
        'Generated from the zod contracts in src/contracts. Do not edit by hand — run ' +
        '`pnpm openapi:generate`. Response bodies keep `{ success: true, ...data }` and ' +
        'errors use `{ error: { code, message, fields } }`.',
    },
    // Paths land here as each phase wires its routes. The contracts precede the
    // endpoints deliberately, so a route cannot invent a shape the frontend has already
    // generated a type for.
    paths: {},
    components: { schemas: buildComponents() },
  };
}

export function serialise(): string {
  return `${JSON.stringify(buildDocument(), null, 2)}\n`;
}