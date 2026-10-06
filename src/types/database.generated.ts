
export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[]

export type Database = {
  
  "graphql_public": {
          Tables: {
            [_ in never]: never
          }
          Views: {
            [_ in never]: never
          }
          Functions: {
            "graphql":
{ Args: { "extensions"?: Json,"operationName"?: string,"query"?: string,"variables"?: Json }; Returns: Json
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        },"public": {
          Tables: {
            "activity_events": {
                  Row: {
                    "actor_profile_id": string | null,"blockchain_reference": string | null,"created_at": string,"description": string | null,"event_type": string,"id": string,"metadata": NonNullable<Json>,"tenancy_id": string,"title": string
                  }
                  Insert: {
                    "actor_profile_id"?: string | null,"blockchain_reference"?: string | null,"created_at"?: string,"description"?: string | null,"event_type": string,"id"?: string,"metadata"?: NonNullable<Json>,"tenancy_id": string,"title": string
                  }
                  Update: {
                    "actor_profile_id"?: string | null,"blockchain_reference"?: string | null,"created_at"?: string,"description"?: string | null,"event_type"?: string,"id"?: string,"metadata"?: NonNullable<Json>,"tenancy_id"?: string,"title"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "activity_events_actor_profile_id_fkey"
      columns: ["actor_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_events_actor_profile_id_fkey"
      columns: ["actor_profile_id"]
isOneToOne: false
      referencedRelation: "v_shared_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "activity_events_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    }
                  ]
                },"deductions": {
                  Row: {
                    "amount": number,"created_at": string,"description": string,"id": string,"proposed_by_profile_id": string,"reason_category": string,"responded_at": string | null,"status": string,"tenancy_id": string,"updated_at": string
                  }
                  Insert: {
                    "amount": number,"created_at"?: string,"description": string,"id"?: string,"proposed_by_profile_id": string,"reason_category": string,"responded_at"?: string | null,"status"?: string,"tenancy_id": string,"updated_at"?: string
                  }
                  Update: {
                    "amount"?: number,"created_at"?: string,"description"?: string,"id"?: string,"proposed_by_profile_id"?: string,"reason_category"?: string,"responded_at"?: string | null,"status"?: string,"tenancy_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deductions_proposed_by_profile_id_fkey"
      columns: ["proposed_by_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deductions_proposed_by_profile_id_fkey"
      columns: ["proposed_by_profile_id"]
isOneToOne: false
      referencedRelation: "v_shared_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "deductions_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    }
                  ]
                },"deposit_records": {
                  Row: {
                    "agreement_address": string,"created_at": string,"deposited_amount": number | null,"funded_at": string | null,"funding_signature": string | null,"id": string,"initialization_signature": string | null,"mint_address": string,"onchain_status": string,"required_amount": number,"tenancy_id": string,"updated_at": string,"vault_address": string,"verified_at": string
                  }
                  Insert: {
                    "agreement_address": string,"created_at"?: string,"deposited_amount"?: number | null,"funded_at"?: string | null,"funding_signature"?: string | null,"id"?: string,"initialization_signature"?: string | null,"mint_address": string,"onchain_status"?: string,"required_amount": number,"tenancy_id": string,"updated_at"?: string,"vault_address": string,"verified_at"?: string
                  }
                  Update: {
                    "agreement_address"?: string,"created_at"?: string,"deposited_amount"?: number | null,"funded_at"?: string | null,"funding_signature"?: string | null,"id"?: string,"initialization_signature"?: string | null,"mint_address"?: string,"onchain_status"?: string,"required_amount"?: number,"tenancy_id"?: string,"updated_at"?: string,"vault_address"?: string,"verified_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "deposit_records_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: true
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    }
                  ]
                },"disputes": {
                  Row: {
                    "created_at": string,"deduction_id": string,"id": string,"opened_at": string,"opened_by_profile_id": string,"reason": string,"resolution_notes": string | null,"resolved_at": string | null,"resolved_by_profile_id": string | null,"status": string,"tenancy_id": string,"updated_at": string
                  }
                  Insert: {
                    "created_at"?: string,"deduction_id": string,"id"?: string,"opened_at"?: string,"opened_by_profile_id": string,"reason": string,"resolution_notes"?: string | null,"resolved_at"?: string | null,"resolved_by_profile_id"?: string | null,"status"?: string,"tenancy_id": string,"updated_at"?: string
                  }
                  Update: {
                    "created_at"?: string,"deduction_id"?: string,"id"?: string,"opened_at"?: string,"opened_by_profile_id"?: string,"reason"?: string,"resolution_notes"?: string | null,"resolved_at"?: string | null,"resolved_by_profile_id"?: string | null,"status"?: string,"tenancy_id"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "disputes_deduction_id_fkey"
      columns: ["deduction_id"]
isOneToOne: false
      referencedRelation: "deductions"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "disputes_opened_by_profile_id_fkey"
      columns: ["opened_by_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "disputes_opened_by_profile_id_fkey"
      columns: ["opened_by_profile_id"]
isOneToOne: false
      referencedRelation: "v_shared_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "disputes_resolved_by_profile_id_fkey"
      columns: ["resolved_by_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "disputes_resolved_by_profile_id_fkey"
      columns: ["resolved_by_profile_id"]
isOneToOne: false
      referencedRelation: "v_shared_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "disputes_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    }
                  ]
                },"evidence": {
                  Row: {
                    "caption": string,"category": string,"created_at": string,"deduction_id": string | null,"evidence_context": string,"file_url": string | null,"id": string,"tenancy_id": string,"uploaded_by_profile_id": string
                  }
                  Insert: {
                    "caption": string,"category": string,"created_at"?: string,"deduction_id"?: string | null,"evidence_context": string,"file_url"?: string | null,"id"?: string,"tenancy_id": string,"uploaded_by_profile_id": string
                  }
                  Update: {
                    "caption"?: string,"category"?: string,"created_at"?: string,"deduction_id"?: string | null,"evidence_context"?: string,"file_url"?: string | null,"id"?: string,"tenancy_id"?: string,"uploaded_by_profile_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "evidence_deduction_same_tenancy"
      columns: ["deduction_id","tenancy_id"]
isOneToOne: false
      referencedRelation: "deductions"
      referencedColumns: ["id","tenancy_id"]
    },{
      foreignKeyName: "evidence_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_uploaded_by_profile_id_fkey"
      columns: ["uploaded_by_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "evidence_uploaded_by_profile_id_fkey"
      columns: ["uploaded_by_profile_id"]
isOneToOne: false
      referencedRelation: "v_shared_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"notifications": {
                  Row: {
                    "body": string | null,"created_at": string,"id": string,"profile_id": string,"read_at": string | null,"tenancy_id": string | null,"title": string,"type": string
                  }
                  Insert: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"profile_id": string,"read_at"?: string | null,"tenancy_id"?: string | null,"title": string,"type": string
                  }
                  Update: {
                    "body"?: string | null,"created_at"?: string,"id"?: string,"profile_id"?: string,"read_at"?: string | null,"tenancy_id"?: string | null,"title"?: string,"type"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "notifications_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "v_shared_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "notifications_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    }
                  ]
                },"profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string,"email": string,"full_name": string,"id": string,"updated_at": string,"wallet_address": string | null
                  }
                  Insert: {
                    "avatar_url"?: string | null,"created_at"?: string,"email": string,"full_name": string,"id"?: string,"updated_at"?: string,"wallet_address"?: string | null
                  }
                  Update: {
                    "avatar_url"?: string | null,"created_at"?: string,"email"?: string,"full_name"?: string,"id"?: string,"updated_at"?: string,"wallet_address"?: string | null
                  }
                  Relationships: [
                    
                  ]
                },"properties": {
                  Row: {
                    "address_line_1": string,"address_line_2": string | null,"bedrooms": number | null,"city": string,"country": string,"county": string | null,"cover_image_url": string | null,"created_at": string,"created_by_profile_id": string,"id": string,"postal_code": string | null,"property_type": string,"updated_at": string
                  }
                  Insert: {
                    "address_line_1": string,"address_line_2"?: string | null,"bedrooms"?: number | null,"city": string,"country"?: string,"county"?: string | null,"cover_image_url"?: string | null,"created_at"?: string,"created_by_profile_id": string,"id"?: string,"postal_code"?: string | null,"property_type": string,"updated_at"?: string
                  }
                  Update: {
                    "address_line_1"?: string,"address_line_2"?: string | null,"bedrooms"?: number | null,"city"?: string,"country"?: string,"county"?: string | null,"cover_image_url"?: string | null,"created_at"?: string,"created_by_profile_id"?: string,"id"?: string,"postal_code"?: string | null,"property_type"?: string,"updated_at"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "properties_created_by_profile_id_fkey"
      columns: ["created_by_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "properties_created_by_profile_id_fkey"
      columns: ["created_by_profile_id"]
isOneToOne: false
      referencedRelation: "v_shared_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"settlements": {
                  Row: {
                    "blockchain_transaction": string | null,"created_at": string,"id": string,"landlord_amount": number,"landlord_approved": boolean,"original_deposit_amount": number,"settled_at": string | null,"settlement_type": string,"tenancy_id": string,"tenant_amount": number,"tenant_approved": boolean
                  }
                  Insert: {
                    "blockchain_transaction"?: string | null,"created_at"?: string,"id"?: string,"landlord_amount": number,"landlord_approved"?: boolean,"original_deposit_amount": number,"settled_at"?: string | null,"settlement_type": string,"tenancy_id": string,"tenant_amount": number,"tenant_approved"?: boolean
                  }
                  Update: {
                    "blockchain_transaction"?: string | null,"created_at"?: string,"id"?: string,"landlord_amount"?: number,"landlord_approved"?: boolean,"original_deposit_amount"?: number,"settled_at"?: string | null,"settlement_type"?: string,"tenancy_id"?: string,"tenant_amount"?: number,"tenant_approved"?: boolean
                  }
                  Relationships: [
                    {
      foreignKeyName: "settlements_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: true
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    }
                  ]
                },"tenancies": {
                  Row: {
                    "activated_at": string | null,"blockchain_reference": string | null,"closed_at": string | null,"created_at": string,"deposit_amount": number,"display_currency": string,"end_date": string | null,"id": string,"landlord_profile_id": string,"monthly_rent_amount": number,"property_id": string,"settlement_token": string | null,"start_date": string,"status": string,"tenant_profile_id": string | null,"updated_at": string,"vault_address": string | null
                  }
                  Insert: {
                    "activated_at"?: string | null,"blockchain_reference"?: string | null,"closed_at"?: string | null,"created_at"?: string,"deposit_amount": number,"display_currency"?: string,"end_date"?: string | null,"id"?: string,"landlord_profile_id": string,"monthly_rent_amount": number,"property_id": string,"settlement_token"?: string | null,"start_date": string,"status"?: string,"tenant_profile_id"?: string | null,"updated_at"?: string,"vault_address"?: string | null
                  }
                  Update: {
                    "activated_at"?: string | null,"blockchain_reference"?: string | null,"closed_at"?: string | null,"created_at"?: string,"deposit_amount"?: number,"display_currency"?: string,"end_date"?: string | null,"id"?: string,"landlord_profile_id"?: string,"monthly_rent_amount"?: number,"property_id"?: string,"settlement_token"?: string | null,"start_date"?: string,"status"?: string,"tenant_profile_id"?: string | null,"updated_at"?: string,"vault_address"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenancies_landlord_profile_id_fkey"
      columns: ["landlord_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenancies_landlord_profile_id_fkey"
      columns: ["landlord_profile_id"]
isOneToOne: false
      referencedRelation: "v_shared_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenancies_property_id_fkey"
      columns: ["property_id"]
isOneToOne: false
      referencedRelation: "properties"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenancies_tenant_profile_id_fkey"
      columns: ["tenant_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenancies_tenant_profile_id_fkey"
      columns: ["tenant_profile_id"]
isOneToOne: false
      referencedRelation: "v_shared_profiles"
      referencedColumns: ["id"]
    }
                  ]
                },"tenancy_invitations": {
                  Row: {
                    "accepted_at": string | null,"accepted_by_profile_id": string | null,"created_at": string,"email": string | null,"expires_at": string,"id": string,"invited_by_profile_id": string,"status": string,"tenancy_id": string,"token": string,"wallet_address": string | null
                  }
                  Insert: {
                    "accepted_at"?: string | null,"accepted_by_profile_id"?: string | null,"created_at"?: string,"email"?: string | null,"expires_at"?: string,"id"?: string,"invited_by_profile_id": string,"status"?: string,"tenancy_id": string,"token": string,"wallet_address"?: string | null
                  }
                  Update: {
                    "accepted_at"?: string | null,"accepted_by_profile_id"?: string | null,"created_at"?: string,"email"?: string | null,"expires_at"?: string,"id"?: string,"invited_by_profile_id"?: string,"status"?: string,"tenancy_id"?: string,"token"?: string,"wallet_address"?: string | null
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenancy_invitations_accepted_by_profile_id_fkey"
      columns: ["accepted_by_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenancy_invitations_accepted_by_profile_id_fkey"
      columns: ["accepted_by_profile_id"]
isOneToOne: false
      referencedRelation: "v_shared_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenancy_invitations_invited_by_profile_id_fkey"
      columns: ["invited_by_profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenancy_invitations_invited_by_profile_id_fkey"
      columns: ["invited_by_profile_id"]
isOneToOne: false
      referencedRelation: "v_shared_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenancy_invitations_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    }
                  ]
                },"tenancy_participants": {
                  Row: {
                    "accepted_at": string | null,"id": string,"joined_at": string,"profile_id": string,"role": string,"status": string,"tenancy_id": string
                  }
                  Insert: {
                    "accepted_at"?: string | null,"id"?: string,"joined_at"?: string,"profile_id": string,"role": string,"status"?: string,"tenancy_id": string
                  }
                  Update: {
                    "accepted_at"?: string | null,"id"?: string,"joined_at"?: string,"profile_id"?: string,"role"?: string,"status"?: string,"tenancy_id"?: string
                  }
                  Relationships: [
                    {
      foreignKeyName: "tenancy_participants_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenancy_participants_profile_id_fkey"
      columns: ["profile_id"]
isOneToOne: false
      referencedRelation: "v_shared_profiles"
      referencedColumns: ["id"]
    },{
      foreignKeyName: "tenancy_participants_tenancy_id_fkey"
      columns: ["tenancy_id"]
isOneToOne: false
      referencedRelation: "tenancies"
      referencedColumns: ["id"]
    }
                  ]
                }
          }
          Views: {
            "v_shared_profiles": {
                  Row: {
                    "avatar_url": string | null,"created_at": string | null,"full_name": string | null,"id": string | null,"wallet_address": string | null
                  }
                  Insert: {
                           "avatar_url"?: string | null,"created_at"?: string | null,"full_name"?: string | null,"id"?: string | null,"wallet_address"?: string | null
                         }
                        Update: {
                           "avatar_url"?: string | null,"created_at"?: string | null,"full_name"?: string | null,"id"?: string | null,"wallet_address"?: string | null
                         }
                        Relationships: [
                    
                  ]
                }
          }
          Functions: {
            "accept_tenancy_invitation":
{ Args: { "p_token": string }; Returns: Json
                           },
"can_read_property":
{ Args: { "p_profile_id": string,"p_property_id": string }; Returns: boolean
                           },
"cancel_tenancy_invitation":
{ Args: { "p_invitation_id": string }; Returns: Json
                           },
"create_tenancy_invitation":
{ Args: { "p_tenancy_id": string,"p_tenant_email"?: string,"p_tenant_wallet"?: string }; Returns: Json
                           },
"create_tenancy_with_invitation":
{ Args: { "p_currency"?: string,"p_deposit": number,"p_end_date"?: string,"p_monthly_rent": number,"p_property"?: Json,"p_property_id"?: string,"p_start_date": string,"p_tenant_email"?: string,"p_tenant_wallet"?: string }; Returns: Json
                           },
"decline_tenancy_invitation":
{ Args: { "p_token": string }; Returns: Json
                           },
"is_tenancy_landlord":
{ Args: { "p_profile_id": string,"p_tenancy_id": string }; Returns: boolean
                           },
"is_tenancy_participant":
{ Args: { "p_profile_id": string,"p_tenancy_id": string }; Returns: boolean
                           },
"is_tenancy_tenant":
{ Args: { "p_profile_id": string,"p_tenancy_id": string }; Returns: boolean
                           },
"mark_deposit_protected":
{ Args: { "p_agreement_address": string,"p_decimals": number,"p_deposited_amount": number,"p_funding_signature": string,"p_mint_address": string,"p_onchain_funded_at": string,"p_required_amount": number,"p_tenancy_id": string,"p_vault_address": string }; Returns: Json
                           },
"record_deposit_agreement":
{ Args: { "p_agreement_address": string,"p_decimals": number,"p_initialization_signature": string,"p_mint_address": string,"p_required_amount": number,"p_tenancy_id": string,"p_vault_address": string }; Returns: Json
                           },
"resolve_tenancy_invitation":
{ Args: { "p_token": string }; Returns: Json
                           },
"verified_wallet_address":
{ Args: { "p_user_id": string }; Returns: string
                           }
          }
          Enums: {
            [_ in never]: never
          }
          CompositeTypes: {
            [_ in never]: never
          }
        }
}

type DatabaseWithoutInternals = Omit<Database, '__InternalSupabase'>

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
  ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
      Row: infer R
    }
    ? R
    : never
  : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Insert: infer I
    }
    ? I
    : never
  : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never
> = DefaultSchemaTableNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
  ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
      Update: infer U
    }
    ? U
    : never
  : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never
> = DefaultSchemaEnumNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
  ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
  : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never
> = PublicCompositeTypeNameOrOptions extends { schema: keyof DatabaseWithoutInternals }
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
  ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
  : never

export const Constants = {
  "graphql_public": {
          Enums: {
            
          }
        },"public": {
          Enums: {
            
          }
        }
} as const
