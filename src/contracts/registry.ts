import { z } from 'zod';

import {
  AdminFabricationListSchema as adminFabricationList,
  AdminStatsSchema as adminStats,
  CustomerListSchema as customerList,
  CustomerRowSchema as customerRow,
  UpdateInventorySchema as updateInventory,
  UpdateOrderStatusSchema as updateOrderStatus,
  UpdateProductSchema as updateProduct,
  UpsertCategorySchema as upsertCategory,
  UpsertProductSchema as upsertProduct,
} from './schemas/admin.ts';
import {
  AccountOverviewSchema as accountOverview,
  MeSchema as me,
  ProfileSchema as profile,
  SessionListSchema as sessionList,
  SessionSchema as session,
} from './schemas/auth.ts';
import {
  CategoryListSchema as categoryList,
  CategorySchema as category,
  FeaturedListSchema as featuredList,
  MediaAssetSchema as mediaAsset,
  ProductBySlugSchema as productBySlug,
  ProductListSchema as productList,
  ProductSchema as product,
  ProductVariantSchema as productVariant,
} from './schemas/catalog.ts';
import {
  CustomerSchema as customer,
  CreateOrderRequestSchema as createOrderRequest,
  CustomSpecsSchema as customSpecs,
  OrderItemRequestSchema as orderItemRequest,
  OrderItemSchema as orderItem,
  OrderListSchema as orderList,
  OrderSchema as order,
  CreateOrderResponseSchema as createOrderResponse,
} from './schemas/checkout.ts';
import {
  ErrorBodySchema as errorBody,
  ErrorCodeSchema as errorCode,
  ErrorEnvelopeSchema as errorEnvelope,
  FieldIssueSchema as fieldIssue,
  ImageRoleSchema as imageRole,
  OrderStatusSchema as orderStatus,
  PaymentMethodSchema as paymentMethod,
  PaymentStatusSchema as paymentStatus,
  PermissionStatusSchema as permissionStatus,
  ProductTypeSchema as productType,
  ProfileKindSchema as profileKind,
  UnitTypeSchema as unitType,
  UserRoleSchema as userRole,
} from './schemas/common.ts';
import {
  ContactPreferenceSchema as contactPreference,
  FabricationRequestRowSchema as fabricationRequestRow,
  FabricationRequestSchema as fabricationRequest,
  FabricationStatusSchema as fabricationStatus,
  FabricationSubmittedSchema as fabricationSubmitted,
  ServiceTypeSchema as serviceType,
  UpdateFabricationStatusSchema as updateFabricationStatus,
} from './schemas/fabrication.ts';
import {
  AdminImageListSchema as adminImageList,
  AdminImageSchema as adminImage,
  EntityTypeSchema as entityType,
  SetPermissionSchema as setPermission,
  UpdateImageSchema as updateImage,
  UploadResponseSchema as uploadResponse,
} from './schemas/media.ts';

/**
 * The one place that decides what the published contract contains.
 *
 * Explicit rather than an implicit scan of the schemas directory, because scanning makes
 * *deleting* the last reference to a schema silently drop it from the document. Here a
 * schema that is written but not listed fails `openapi.spec.ts`, so the omission is
 * visible in review instead of reaching the frontend as a missing type.
 */
export type SchemaEntry = {
  readonly id: string;
  readonly schema: z.ZodType;
};

function entry(id: string, schema: z.ZodType): SchemaEntry {
  // z.globalRegistry.add keys on the schema *instance*, which is what makes a nested
  // schema resolve to a $ref: Product and Category both embed this same MediaAsset
  // object, so one registration covers both.
  //
  // `.meta({ id })` is not enough — in Zod 4 it returns a clone, so registering the
  // clone would leave the original (the one embedded in other schemas) without an id
  // and the whole document would silently inline instead of referencing.
  z.globalRegistry.add(schema, { id });
  return { id, schema };
}

/**
 * Ordered by domain. Every response body the endpoint index in notes.md §14 returns has
 * an entry here, which is what makes the contract and the endpoint list checkable
 * against each other.
 */
export const COMPONENT_SCHEMAS: readonly SchemaEntry[] = [
  // common
  entry('ErrorEnvelope', errorEnvelope),
  entry('ErrorBody', errorBody),
  entry('ErrorCode', errorCode),
  entry('FieldIssue', fieldIssue),

  // Enums. Registered individually so each is a $ref the frontend can generate a union
  // from, rather than being copied into every schema that happens to use it.
  entry('ProfileKind', profileKind),
  entry('ImageRole', imageRole),
  entry('PermissionStatus', permissionStatus),
  entry('ProductType', productType),
  entry('UnitType', unitType),
  entry('OrderStatus', orderStatus),
  entry('PaymentStatus', paymentStatus),
  entry('PaymentMethod', paymentMethod),
  entry('UserRole', userRole),
  entry('ServiceType', serviceType),
  entry('ContactPreference', contactPreference),
  entry('FabricationStatus', fabricationStatus),
  entry('EntityType', entityType),

  // auth
  entry('Profile', profile),
  entry('Me', me),
  entry('Session', session),
  entry('SessionList', sessionList),
  entry('AccountOverview', accountOverview),

  // catalog
  entry('MediaAsset', mediaAsset),
  entry('Category', category),
  entry('CategoryList', categoryList),
  entry('ProductVariant', productVariant),
  entry('Product', product),
  entry('ProductList', productList),
  entry('ProductBySlug', productBySlug),
  entry('FeaturedList', featuredList),

  // media (admin)
  entry('AdminImage', adminImage),
  entry('AdminImageList', adminImageList),
  entry('UploadResponse', uploadResponse),
  entry('UpdateImage', updateImage),
  entry('SetPermission', setPermission),

  // checkout
  entry('CustomSpecs', customSpecs),
  entry('OrderItemRequest', orderItemRequest),
  entry('Customer', customer),
  entry('CreateOrderRequest', createOrderRequest),
  entry('OrderItem', orderItem),
  entry('Order', order),
  entry('CreateOrderResponse', createOrderResponse),
  entry('OrderList', orderList),

  // fabrication
  entry('FabricationRequest', fabricationRequest),
  entry('FabricationRequestRow', fabricationRequestRow),
  entry('FabricationSubmitted', fabricationSubmitted),
  entry('UpdateFabricationStatus', updateFabricationStatus),

  // admin
  entry('AdminStats', adminStats),
  entry('UpsertProduct', upsertProduct),
  entry('UpdateProduct', updateProduct),
  entry('UpsertCategory', upsertCategory),
  entry('UpdateOrderStatus', updateOrderStatus),
  entry('UpdateInventory', updateInventory),
  entry('CustomerRow', customerRow),
  entry('CustomerList', customerList),
  entry('AdminFabricationList', adminFabricationList),
];

/**
 * Scalars and query schemas that are deliberately not components. Every entry needs a
 * reason, because a schema appearing in neither list is a schema the frontend was never
 * told about — `openapi.spec.ts` fails on that.
 */
export const NON_COMPONENT_SCHEMAS: Readonly<Record<string, string>> = {
  // Primitives: a single type inlined into its consumers is clearer than a $ref, and a
  // component per uuid would triple the document for nothing.
  UuidSchema: 'primitive, inlined',
  MoneySchema: 'primitive, inlined',
  SlugSchema: 'primitive, inlined',
  AltTextSchema: 'primitive, inlined',
  CursorSchema: 'primitive, inlined',
  LimitSchema: 'primitive, inlined',
  SuccessSchema: 'primitive, inlined',
  // Not a plain relative path: it is the open-redirect guard, and a future endpoint
  // should reference it by name so the rule cannot be re-implemented loosely.
  RelativePathSchema: 'reusable guard; see RelativePath in the open redirect check',

  // Query parameters. These become `parameters` on each operation when the route is
  // wired, not components.
  PaginationQuerySchema: 'query parameters',
  ProductListQuerySchema: 'query parameters',
  GoogleAuthQuerySchema: 'query parameters',
  AdminOrderListQuerySchema: 'query parameters',
  AdminFabricationListQuerySchema: 'query parameters',
  CustomerListQuerySchema: 'query parameters',
  InventoryListQuerySchema: 'query parameters',
  // Cookie payload, never a request or response body.
  OAuthStateSchema: 'internal cookie payload',
};

export function componentIds(): readonly string[] {
  return COMPONENT_SCHEMAS.map(({ id }) => id);
}