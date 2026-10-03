import type {
  ImageRole,
  OrderStatus,
  PaymentMethod,
  PaymentStatus,
  PermissionStatus,
  ProductType,
  ProfileKind,
  UnitType,
  UserRole,
} from '../contracts/schemas/common.ts';

export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          google_id: string | null;
          email: string;
          full_name: string | null;
          avatar_url: string | null;
          role: UserRole;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | undefined;
          google_id?: string | null | undefined;
          email: string;
          full_name?: string | null | undefined;
          avatar_url?: string | null | undefined;
          role?: UserRole | undefined;
          created_at?: string | undefined;
          updated_at?: string | undefined;
        };
        Update: {
          id?: string | undefined;
          google_id?: string | null | undefined;
          email?: string | undefined;
          full_name?: string | null | undefined;
          avatar_url?: string | null | undefined;
          role?: UserRole | undefined;
          created_at?: string | undefined;
          updated_at?: string | undefined;
        };
        Relationships: [];
      };
      sessions: {
        Row: {
          id: string;
          token_hash: string;
          profile_id: string;
          created_at: string;
          last_seen_at: string;
          expires_at: string;
          revoked_at: string | null;
          user_agent: string | null;
          ip: string | null;
        };
        Insert: {
          id?: string | undefined;
          token_hash: string;
          profile_id: string;
          created_at?: string | undefined;
          last_seen_at?: string | undefined;
          expires_at: string;
          revoked_at?: string | null | undefined;
          user_agent?: string | null | undefined;
          ip?: string | null | undefined;
        };
        Update: {
          id?: string | undefined;
          token_hash?: string | undefined;
          profile_id?: string | undefined;
          created_at?: string | undefined;
          last_seen_at?: string | undefined;
          expires_at?: string | undefined;
          revoked_at?: string | null | undefined;
          user_agent?: string | null | undefined;
          ip?: string | null | undefined;
        };
        Relationships: [
          {
            foreignKeyName: 'sessions_profile_id_fkey';
            columns: ['profile_id'];
            isOneToOne: false;
            referencedRelation: 'profiles';
            referencedColumns: ['id'];
          },
        ];
      };
      categories: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          profile_kind: ProfileKind;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | undefined;
          name: string;
          slug: string;
          description?: string | null | undefined;
          profile_kind?: ProfileKind | undefined;
          created_at?: string | undefined;
          updated_at?: string | undefined;
        };
        Update: {
          id?: string | undefined;
          name?: string | undefined;
          slug?: string | undefined;
          description?: string | null | undefined;
          profile_kind?: ProfileKind | undefined;
          created_at?: string | undefined;
          updated_at?: string | undefined;
        };
        Relationships: [];
      };
      products: {
        Row: {
          id: string;
          category_id: string | null;
          name: string;
          slug: string;
          description: string;
          base_price: number | string;
          min_order_quantity: number;
          is_active: boolean;
          product_type: ProductType;
          unit_type: UnitType;
          profile_kind: ProfileKind;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | undefined;
          category_id?: string | null | undefined;
          name: string;
          slug: string;
          description: string;
          base_price: number | string;
          min_order_quantity?: number | undefined;
          is_active?: boolean | undefined;
          product_type?: ProductType | undefined;
          unit_type?: UnitType | undefined;
          profile_kind?: ProfileKind | undefined;
          created_at?: string | undefined;
          updated_at?: string | undefined;
        };
        Update: {
          id?: string | undefined;
          category_id?: string | null | undefined;
          name?: string | undefined;
          slug?: string | undefined;
          description?: string | undefined;
          base_price?: number | string | undefined;
          min_order_quantity?: number | undefined;
          is_active?: boolean | undefined;
          product_type?: ProductType | undefined;
          unit_type?: UnitType | undefined;
          profile_kind?: ProfileKind | undefined;
          created_at?: string | undefined;
          updated_at?: string | undefined;
        };
        Relationships: [];
      };
      product_variants: {
        Row: {
          id: string;
          product_id: string;
          name: string;
          sku: string;
          price_override: number | string | null;
          stock_quantity: number;
          is_active: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | undefined;
          product_id: string;
          name: string;
          sku: string;
          price_override?: number | string | null | undefined;
          stock_quantity?: number | undefined;
          is_active?: boolean | undefined;
          created_at?: string | undefined;
          updated_at?: string | undefined;
        };
        Update: {
          id?: string | undefined;
          product_id?: string | undefined;
          name?: string | undefined;
          sku?: string | undefined;
          price_override?: number | string | null | undefined;
          stock_quantity?: number | undefined;
          is_active?: boolean | undefined;
          created_at?: string | undefined;
          updated_at?: string | undefined;
        };
        Relationships: [];
      };
      product_images: {
        Row: {
          id: string;
          product_id: string;
          storage_path: string;
          alt_text: string;
          role: ImageRole;
          width: number | null;
          height: number | null;
          bytes: number | null;
          mime_type: string | null;
          blurhash: string | null;
          source: string;
          source_url: string | null;
          license: string;
          permission_status: PermissionStatus;
          display_order: number;
          is_primary: boolean;
          uploaded_by: string | null;
          deleted_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | undefined;
          product_id: string;
          storage_path: string;
          alt_text: string;
          role?: ImageRole | undefined;
          width?: number | null | undefined;
          height?: number | null | undefined;
          bytes?: number | null | undefined;
          mime_type?: string | null | undefined;
          blurhash?: string | null | undefined;
          source?: string | undefined;
          source_url?: string | null | undefined;
          license?: string | undefined;
          permission_status?: PermissionStatus | undefined;
          display_order?: number | undefined;
          is_primary?: boolean | undefined;
          uploaded_by?: string | null | undefined;
          deleted_at?: string | null | undefined;
          created_at?: string | undefined;
          updated_at?: string | undefined;
        };
        Update: {
          id?: string | undefined;
          product_id?: string | undefined;
          storage_path?: string | undefined;
          alt_text?: string | undefined;
          role?: ImageRole | undefined;
          width?: number | null | undefined;
          height?: number | null | undefined;
          bytes?: number | null | undefined;
          mime_type?: string | null | undefined;
          blurhash?: string | null | undefined;
          source?: string | undefined;
          source_url?: string | null | undefined;
          license?: string | undefined;
          permission_status?: PermissionStatus | undefined;
          display_order?: number | undefined;
          is_primary?: boolean | undefined;
          uploaded_by?: string | null | undefined;
          deleted_at?: string | null | undefined;
          created_at?: string | undefined;
          updated_at?: string | undefined;
        };
        Relationships: [];
      };
      category_images: {
        Row: {
          id: string;
          category_id: string;
          storage_path: string;
          alt_text: string;
          display_order: number;
          is_primary: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | undefined;
          category_id: string;
          storage_path: string;
          alt_text: string;
          display_order?: number | undefined;
          is_primary?: boolean | undefined;
          created_at?: string | undefined;
          updated_at?: string | undefined;
        };
        Update: {
          id?: string | undefined;
          category_id?: string | undefined;
          storage_path?: string | undefined;
          alt_text?: string | undefined;
          display_order?: number | undefined;
          is_primary?: boolean | undefined;
          created_at?: string | undefined;
          updated_at?: string | undefined;
        };
        Relationships: [];
      };
      orders: {
        Row: {
          id: string;
          order_number: string;
          profile_id: string | null;
          status: OrderStatus;
          payment_status: PaymentStatus;
          subtotal: number | string;
          delivery_fee: number | string;
          total_amount: number | string;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          delivery_address: Json;
          payment_method: PaymentMethod;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | undefined;
          order_number?: string | undefined;
          profile_id?: string | null | undefined;
          status?: OrderStatus | undefined;
          payment_status?: PaymentStatus | undefined;
          subtotal: number | string;
          delivery_fee: number | string;
          total_amount: number | string;
          customer_name: string;
          customer_email: string;
          customer_phone: string;
          delivery_address: Json;
          payment_method?: PaymentMethod | undefined;
          created_at?: string | undefined;
          updated_at?: string | undefined;
        };
        Update: {
          id?: string | undefined;
          order_number?: string | undefined;
          profile_id?: string | null | undefined;
          status?: OrderStatus | undefined;
          payment_status?: PaymentStatus | undefined;
          subtotal?: number | string | undefined;
          delivery_fee?: number | string | undefined;
          total_amount?: number | string | undefined;
          customer_name?: string | undefined;
          customer_email?: string | undefined;
          customer_phone?: string | undefined;
          delivery_address?: Json | undefined;
          payment_method?: PaymentMethod | undefined;
          created_at?: string | undefined;
          updated_at?: string | undefined;
        };
        Relationships: [];
      };
      order_items: {
        Row: {
          id: string;
          order_id: string;
          product_id: string | null;
          variant_id: string | null;
          product_name: string;
          unit_price: number | string;
          quantity: number;
          line_total: number | string;
          custom_specs: Json | null;
          created_at: string;
        };
        Insert: {
          id?: string | undefined;
          order_id: string;
          product_id?: string | null | undefined;
          variant_id?: string | null | undefined;
          product_name: string;
          unit_price: number | string;
          quantity: number;
          line_total: number | string;
          custom_specs?: Json | null | undefined;
          created_at?: string | undefined;
        };
        Update: {
          id?: string | undefined;
          order_id?: string | undefined;
          product_id?: string | null | undefined;
          variant_id?: string | null | undefined;
          product_name?: string | undefined;
          unit_price?: number | string | undefined;
          quantity?: number | undefined;
          line_total?: number | string | undefined;
          custom_specs?: Json | null | undefined;
          created_at?: string | undefined;
        };
        Relationships: [];
      };
      audit_log: {
        Row: {
          id: number;
          actor_id: string | null;
          action: string;
          entity_type: string;
          entity_id: string | null;
          before: Json | null;
          after: Json | null;
          ip: string | null;
          created_at: string;
        };
        Insert: {
          id?: number | undefined;
          actor_id?: string | null | undefined;
          action: string;
          entity_type: string;
          entity_id?: string | null | undefined;
          before?: Json | null | undefined;
          after?: Json | null | undefined;
          ip?: string | null | undefined;
          created_at?: string | undefined;
        };
        Update: {
          id?: number | undefined;
          actor_id?: string | null | undefined;
          action?: string | undefined;
          entity_type?: string | undefined;
          entity_id?: string | null | undefined;
          before?: Json | null | undefined;
          after?: Json | null | undefined;
          ip?: string | null | undefined;
          created_at?: string | undefined;
        };
        Relationships: [];
      };
      email_outbox: {
        Row: {
          id: string;
          template: string;
          to_email: string;
          subject: string;
          html_body: string;
          text_body: string | null;
          order_id: string | null;
          attempts: number;
          last_error: string | null;
          sent_at: string | null;
          created_at: string;
        };
        Insert: {
          id?: string | undefined;
          template: string;
          to_email: string;
          subject: string;
          html_body: string;
          text_body?: string | null | undefined;
          order_id?: string | null | undefined;
          attempts?: number | undefined;
          last_error?: string | null | undefined;
          sent_at?: string | null | undefined;
          created_at?: string | undefined;
        };
        Update: {
          id?: string | undefined;
          template?: string | undefined;
          to_email?: string | undefined;
          subject?: string | undefined;
          html_body?: string | undefined;
          text_body?: string | null | undefined;
          order_id?: string | null | undefined;
          attempts?: number | undefined;
          last_error?: string | null | undefined;
          sent_at?: string | null | undefined;
          created_at?: string | undefined;
        };
        Relationships: [];
      };
      fabrication_requests: {
        Row: {
          id: string;
          service_type: string;
          full_name: string;
          email: string;
          phone: string;
          city: string;
          state: string;
          description: string;
          measurements: string | null;
          budget: number | string | null;
          preferred_contact: string;
          status: string;
          estimated_quote: number | string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string | undefined;
          service_type: string;
          full_name: string;
          email: string;
          phone: string;
          city: string;
          state: string;
          description: string;
          measurements?: string | null | undefined;
          budget?: number | string | null | undefined;
          preferred_contact?: string | undefined;
          status?: string | undefined;
          estimated_quote?: number | string | null | undefined;
          created_at?: string | undefined;
          updated_at?: string | undefined;
        };
        Update: {
          id?: string | undefined;
          service_type?: string | undefined;
          full_name?: string | undefined;
          email?: string | undefined;
          phone?: string | undefined;
          city?: string | undefined;
          state?: string | undefined;
          description?: string | undefined;
          measurements?: string | null | undefined;
          budget?: number | string | null | undefined;
          preferred_contact?: string | undefined;
          status?: string | undefined;
          estimated_quote?: number | string | null | undefined;
          created_at?: string | undefined;
          updated_at?: string | undefined;
        };
        Relationships: [];
      };
    };
    Views: {
      category_images_public: {
        Row: {
          id: string;
          category_id: string;
          storage_path: string;
          alt_text: string;
          display_order: number;
          is_primary: boolean;
        };
        Relationships: [];
      };
      products_public: {
        Row: {
          id: string;
          category_id: string;
          name: string;
          slug: string;
          description: string;
          base_price: number | string;
          min_order_quantity: number;
          is_active: boolean;
          product_type: ProductType;
          unit_type: UnitType;
          profile_kind: ProfileKind;
          created_at: string;
          updated_at: string;
        };
        Relationships: [];
      };
      product_images_public: {
        Row: {
          id: string;
          product_id: string;
          storage_path: string;
          alt_text: string;
          role: ImageRole;
          width: number | null;
          height: number | null;
          bytes: number | null;
          mime_type: string | null;
          blurhash: string | null;
          source: string;
          source_url: string | null;
          license: string;
          permission_status: PermissionStatus;
          display_order: number;
          is_primary: boolean;
          uploaded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Relationships: [];
      };
    };
    Functions: {
      attach_product_image: {
        Args: {
          p_product_id: string;
          p_storage_path: string;
          p_alt_text: string;
          p_role: ImageRole;
          p_width: number | null;
          p_height: number | null;
          p_bytes: number | null;
          p_mime_type: string | null;
          p_blurhash: string | null;
          p_source: string;
          p_source_url: string | null;
          p_license: string;
        };
        Returns: Json;
      };
      set_primary_product_image: {
        Args: {
          p_image_id: string;
        };
        Returns: void;
      };
      remove_product_image: {
        Args: {
          p_image_id: string;
        };
        Returns: void;
      };
      decrement_variant_inventory: {
        Args: {
          p_variant_id: string;
          p_quantity: number;
        };
        Returns: number;
      };
      create_order: {
        Args: {
          p_profile_id: string | null;
          p_customer: Json;
          p_items: Json;
        };
        Returns: Json;
      };
    };
    Enums: {
      image_role: ImageRole;
      order_status: OrderStatus;
      payment_method: PaymentMethod;
      payment_status: PaymentStatus;
      permission_status: PermissionStatus;
      product_type: ProductType;
      profile_kind: ProfileKind;
      unit_type: UnitType;
      user_role: UserRole;
    };
    CompositeTypes: Record<string, never>;
  };
};