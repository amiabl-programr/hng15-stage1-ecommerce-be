import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

import { z } from 'zod';

import { buildDocument, serialise } from '../../../src/contracts/document.ts';
import { NON_COMPONENT_SCHEMAS, componentIds } from '../../../src/contracts/registry.ts';
import * as admin from '../../../src/contracts/schemas/admin.ts';
import * as auth from '../../../src/contracts/schemas/auth.ts';
import * as catalog from '../../../src/contracts/schemas/catalog.ts';
import * as checkout from '../../../src/contracts/schemas/checkout.ts';
import * as common from '../../../src/contracts/schemas/common.ts';
import * as fabrication from '../../../src/contracts/schemas/fabrication.ts';
import * as media from '../../../src/contracts/schemas/media.ts';

/**
 * The published document is the entire handoff to a frontend in another repository, so
 * these tests check the properties that make it trustworthy rather than snapshotting
 * 120 KB of JSON. A full snapshot would fail on every harmless reordering and be
 * unreadable in review anyway.
 */

type Json = Record<string, unknown>;

const document = buildDocument();
const schemas = (document['components'] as Json)['schemas'] as Record<string, Json>;

const SCHEMA_MODULES: Record<string, Record<string, unknown>> = {
  common,
  auth,
  catalog,
  checkout,
  media,
  fabrication,
  admin,
};

/** Registered as its own component so a frontend can generate a union from it. */
const ENUM_IDS = [
  'ErrorCode',
  'ProfileKind',
  'ImageRole',
  'PermissionStatus',
  'ProductType',
  'UnitType',
  'OrderStatus',
  'PaymentStatus',
  'PaymentMethod',
  'UserRole',
  'ServiceType',
  'ContactPreference',
  'FabricationStatus',
  'EntityType',
];

/** Every component that must be an array of literals, whatever it is called. */
const ENUM_COMPONENTS = Object.entries(schemas)
  .filter(([, schema]) => schema['enum'] !== undefined)
  .map(([id]) => id);

describe('enum components', () => {
  it('discovers every enum in the document', () => {
    expect(ENUM_COMPONENTS.sort()).toEqual([...ENUM_IDS].sort());
  });
});

function collectRefs(value: unknown, into: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectRefs(item, into);
    }
    return into;
  }

  if (typeof value !== 'object' || value === null) {
    return into;
  }

  const record = value as Json;
  if (typeof record['$ref'] === 'string') {
    into.push(record['$ref']);
  }
  for (const child of Object.values(record)) {
    collectRefs(child, into);
  }

  return into;
}

function collectEnums(value: unknown, into: unknown[] = []): unknown[] {
  if (Array.isArray(value)) {
    for (const item of value) {
      collectEnums(item, into);
    }
    return into;
  }

  if (typeof value !== 'object' || value === null) {
    return into;
  }

  const record = value as Json;
  if (record['enum'] !== undefined) {
    into.push(record['enum']);
  }
  for (const child of Object.values(record)) {
    collectEnums(child, into);
  }

  return into;
}

describe('document shape', () => {
  it('is an OpenAPI 3.1 document', () => {
    expect(document['openapi']).toBe('3.1.0');
  });

  it('names itself and its version', () => {
    expect(document['info']).toMatchObject({ title: 'Roofing Construction Shop API', version: '0.1.0' });
  });

  it('tells a reader not to edit it by hand', () => {
    expect((document['info'] as Json)['description']).toMatch(/Do not edit by hand/);
  });

  it('declares paths, empty until the routes are wired', () => {
    expect(document['paths']).toEqual({});
  });
});

describe('component registry', () => {
  it('publishes every registered schema', () => {
    for (const id of componentIds()) {
      expect([id, schemas[id] !== undefined]).toEqual([id, true]);
    }
  });

  it('has no duplicate ids', () => {
    expect(new Set(componentIds()).size).toBe(componentIds().length);
  });

  it('emits components in a stable sorted order so diffs stay readable', () => {
    expect(Object.keys(schemas)).toEqual([...Object.keys(schemas)].sort());
  });

  it('produces no component that was never registered', () => {
    // createSchema also emits transitively referenced schemas. Any of those outside the
    // registry means something is reachable in the document but unreviewed.
    const registered = new Set(componentIds());
    const extra = Object.keys(schemas).filter((id) => !registered.has(id));

    expect(extra).toEqual([]);
  });
});

describe('registry coverage', () => {
  const exported: { module: string; name: string; id: string }[] = [];

  for (const [moduleName, mod] of Object.entries(SCHEMA_MODULES)) {
    for (const [key, value] of Object.entries(mod)) {
      if (key.endsWith('Schema') && value instanceof z.ZodType) {
        exported.push({ module: moduleName, name: key, id: key.slice(0, -'Schema'.length) });
      }
    }
  }

  it('finds the schemas to check', () => {
    expect(exported.length).toBeGreaterThan(40);
  });

  it('accounts for every exported schema as a component or an explained omission', () => {
    const registered = new Set(componentIds());
    const unaccounted = exported
      .filter(({ id, name }) => !registered.has(id) && !(name in NON_COMPONENT_SCHEMAS))
      .map(({ module, name }) => `${module}/${name}`);

    expect(unaccounted).toEqual([]);
  });

  it('gives every omission a reason', () => {
    for (const [name, reason] of Object.entries(NON_COMPONENT_SCHEMAS)) {
      expect([name, typeof reason === 'string' && reason.length > 0]).toEqual([name, true]);
    }
  });

  it('has no allowlist entry that is now a component', () => {
    const registered = new Set(componentIds());
    const stale = Object.keys(NON_COMPONENT_SCHEMAS)
      .map((name) => name.replace(/Schema$/, ''))
      .filter((id) => registered.has(id));

    expect(stale).toEqual([]);
  });

  it('has no allowlist entry for a schema that no longer exists', () => {
    const exportedNames = new Set(exported.map(({ name }) => name));
    const orphans = Object.keys(NON_COMPONENT_SCHEMAS).filter((name) => !exportedNames.has(name));

    expect(orphans).toEqual([]);
  });
});

describe('reference integrity', () => {
  it('has no dangling $ref', () => {
    const dangling = collectRefs(schemas)
      .map((ref) => ref.replace('#/components/schemas/', ''))
      .filter((id) => schemas[id] === undefined);

    expect([...new Set(dangling)]).toEqual([]);
  });

  it('only references the local components section', () => {
    const external = collectRefs(schemas).filter((ref) => !ref.startsWith('#/components/schemas/'));

    expect(external).toEqual([]);
  });

  it('references the enums instead of copying their values', () => {
    // A copied enum means the frontend could generate a type that drifts from the
    // database constraint, because there is no single component to point at.
    const inlined: string[] = [];

    for (const [id, schema] of Object.entries(schemas)) {
      if (ENUM_COMPONENTS.includes(id)) {
        continue;
      }
      if (collectEnums(schema).length > 0) {
        inlined.push(id);
      }
    }

    expect(inlined).toEqual([]);
  });

  it('publishes every enum as a component with its values', () => {
    for (const id of ENUM_IDS) {
      expect([id, schemas[id]?.['enum']]).toEqual([id, expect.any(Array)]);
    }
  });

  it('shares one MediaAsset between Product and Category rather than copying it', () => {
    const refs = collectRefs(schemas).filter((ref) => ref.endsWith('/MediaAsset'));

    expect(refs.length).toBeGreaterThanOrEqual(2);
  });
});

describe('strictness reaches the document', () => {
  const strictIds = [
    'CreateOrderRequest',
    'OrderItemRequest',
    'Customer',
    'CustomSpecs',
    'UpdateImage',
    'SetPermission',
    'UpdateOrderStatus',
    'UpdateInventory',
    'UpdateProduct',
    'UpsertProduct',
    'UpsertCategory',
    'FabricationRequest',
    'UpdateFabricationStatus',
  ];

  it.each(strictIds)('%s is additionalProperties:false, so unknown keys are rejected', (id) => {
    expect(schemas[id]?.['additionalProperties']).toBe(false);
  });

  it('CreateOrderRequest has no money property anywhere in its tree', () => {
    const forbidden = ['price', 'unitPrice', 'lineTotal', 'subtotal', 'deliveryFee', 'total', 'amount'];
    const json = JSON.stringify(schemas['CreateOrderRequest']);

    for (const field of forbidden) {
      expect([field, json.includes(`"${field}"`)]).toEqual([field, false]);
    }
  });
});

describe('committed artefact', () => {
  it('openapi.json on disk matches the contracts', async () => {
    const committed = await readFile(resolve('openapi.json'), 'utf8').catch(() => '');

    expect(committed).toBe(serialise());
  });

  it('ends with a newline so the file is well-behaved in git', () => {
    expect(serialise().endsWith('}\n')).toBe(true);
  });

  it('is valid JSON that parses to the same document', async () => {
    const committed = await readFile(resolve('openapi.json'), 'utf8');

    expect(JSON.parse(committed)).toEqual(JSON.parse(serialise()));
  });
});