export const PAGE_SIZE = 10;

export const STATUS_CODES = {
  OK: 200,
  CREATED: 201,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOTFOUND: 404,
  INVALID_INPUT: 422,
  INTERNAL_SERVER_ERROR: 500,
  FOREIGN_KEY_VIOLATION: '23503',
  UNIQUE_KEY_VIOLATION: '23505',
};

export const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  PATIENT: 'patient',
};

export const UPLOAD_PATH = '../public/uploads/';

export const MAX_MULTER_FILE_SIZE = process.env.MULTER_FILE_SIZE_LIMIT || 10485760;
export const MAX_MULTER_FIELD_SIZE = process.env.MULTER_FIELD_SIZE_LIMIT || 10485760;
export const MAX_BODY_SIZE = process.env.BODY_SIZE_LIMIT || 52428800;

export const AWS_CONFIG = {
  AWS_ACCESS_KEY: process.env.AWS_ACCESS_KEY,
  AWS_SECRET_KEY: process.env.AWS_SECRET_KEY,
  BUCKET: `mira-upload-storage-${process.env.NODE_ENV}`,
  PROFILE_PICTURE: [process.env.FOLDER_ALIAS, 'profile-picture'].join('-'),
  DOCUMENT_FILE: [process.env.FOLDER_ALIAS, 'document-file'].join('-'),
  CLINIC_LOGO: [process.env.FOLDER_ALIAS, 'clinic-logo'].join('-'),
  PROVIDER_AVATAR: [process.env.FOLDER_ALIAS, 'provider-avatar'].join('-'),
};

export const AZURE_STORAGE_CONFIG = {
  CONNECTION_STRING: process.env.AZURE_STORAGE_CONNECTION_STRING,
  CONTAINER_NAME: process.env.AZURE_STORAGE_CONTAINER_NAME || 'clinic-logos',
};

export const QUEUE_NAMES = {
  EMAIL_QUEUE: 'EMAIL_QUEUE',
};

export const DEFAULT_QUEUE_JOB_NAMES = {
  REMOVE_TMP_ASSET: 'REMOVE_TMP_ASSET',
};

export const CLEANUP_QUEUE_JOB_NAMES = {
  DELETE_S3_FILES: 'DELETE_S3_FILES',
};

export const WS_MESSAGES = {
  USER_UPDATED: 'USER_UPDATED',
  LOGOUT: 'LOGOUT_USER',
};

export const PUBLIC_ROUTES = [
  '/auth/signup',
  '/auth/signin',
  '/auth/forgot-password',
  '/auth/reset-password',
];

export const NOTIFICATION_TYPES = {
  USER: 'user',
  SYSTEM: 'system',
};

export const PRACTICE_TYPES = {
  GROUP_PRACTICE: 'group_practice',
  COMMUNITY_HEALTH_CENTER: 'community_health_center',
  HOSPITAL_AFFILIATED: 'hospital_affiliated',
  SOLO_PRACTICE: 'solo_practice',
  OTHER: 'other',
};

export const SUBSCRIPTION_STATUSES = {
  ACTIVE: 'active',
  CANCELLED: 'cancelled',
  PAST_DUE: 'past_due',
  INCOMPLETE: 'incomplete',
  INCOMPLETE_EXPIRED: 'incomplete_expired',
  UNPAID: 'unpaid',
};

// Graduated pricing tiers (informational only - Stripe handles actual pricing)
// These represent the price per provider at different volume levels
export const PRICING_TIERS = {
  TIER_1: {
    name: 'tier_1',
    displayName: '1-10 Providers',
    minProviders: 1,
    maxProviders: 10,
    pricePerProvider: 199,
    description: '$199 per provider/month',
  },
  TIER_2: {
    name: 'tier_2',
    displayName: '11-20 Providers',
    minProviders: 11,
    maxProviders: 20,
    pricePerProvider: 149,
    description: '$149 per provider/month',
  },
  TIER_3: {
    name: 'tier_3',
    displayName: '21+ Providers',
    minProviders: 21,
    maxProviders: Infinity,
    pricePerProvider: 99,
    description: '$99 per provider/month',
  },
};

export const BILLING_EVENT_TYPES = {
  SUBSCRIPTION_CREATED: 'subscription_created',
  SUBSCRIPTION_UPDATED: 'subscription_updated',
  PLAN_CHANGED: 'plan_changed',
  PLAN_DOWNGRADE_WITH_EXCESS_PROVIDERS: 'plan_downgrade_with_excess_providers',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  PAYMENT_SUCCEEDED: 'payment_succeeded',
  PAYMENT_FAILED: 'payment_failed',
  WEBHOOK_PROCESSING_FAILED: 'webhook_processing_failed',
  PROVIDER_ADDED: 'provider_added',
  PROVIDER_REMOVED: 'provider_removed',
};

export const QUESTION_TYPES = {
  YES_NO: 'yes-no',
  SELECT: 'select',
  MULTI_SELECT: 'multi-select',
  TEXT: 'text',
  SYSTEM_COMPONENT: 'system-component',
};

export const SYSTEM_COMPONENTS = {
  MULTI_AREA_ASSESSMENT: 'multi-area-assessment',
};

export const LEGACY_QUESTION_TYPES = {
  YES_NO_LEGACY: 'yes_no',
  CONDITION_SELECT: 'condition_select',
  FREE_TEXT: 'free_text',
  VOICE_INPUT: 'voice_input',
  MULTI_SELECT_LEGACY: 'multi_select',
  MULTI_SELECT_GROUPED: 'multi_select_grouped',
  MULTI_SELECT_GROUPED_WITH_DETAILS: 'multi_select_grouped_with_details',
  MULTI_SELECT_WITH_FOLLOWUP: 'multi_select_with_followup',
  MULTI_SELECT_WITH_TIMEFRAME: 'multi_select_with_timeframe',
  PAIN_WIZARD: 'pain_wizard',
};

export const QUESTION_CATEGORIES = {
  MEDICAL_HISTORY: 'medical_history',
  PAIN: 'pain',
  MEDICATIONS: 'medications',
  PROCEDURES: 'procedures',
  TREATMENTS: 'treatments',
  DIAGNOSTICS: 'diagnostics',
  GOALS: 'goals',
};

export const AUDIT_ACTIONS = {
  USER_LOGIN: 'user_login',
  FAILED_LOGIN_ATTEMPT: 'failed_login_attempt',
  USER_LOGOUT: 'user_logout',
  SESSION_TIMEOUT: 'session_timeout',
  USER_UPDATED: 'user_updated',
  USER_DELETED: 'user_deleted',
  CLINIC_CREATED: 'clinic_created',
  CLINIC_ONBOARDING_INITIATED: 'clinic_onboarding_initiated',
  SUBSCRIPTION_ACTIVATED: 'subscription_activated',
  PROVIDER_INVITED: 'provider_invited',
  PROVIDER_ACTIVATED: 'provider_activated',
  PROVIDER_REMOVED: 'provider_removed',
  VIEW_PROVIDER_LIST: 'view_provider_list',
  VIEW_PROVIDER_PROFILE: 'view_provider_profile',
  UPDATE_PROVIDER_PROFILE: 'update_provider_profile',
  UPLOAD_PROVIDER_AVATAR: 'upload_provider_avatar',
  SUBSCRIPTION_CANCELLED: 'subscription_cancelled',
  PAYMENT_METHOD_UPDATED: 'payment_method_updated',
  FAILED_CLINIC_REGISTRATION: 'failed_clinic_registration',
  TEMPLATE_CREATED: 'template_created',
  VIEW_SUMMARY: 'view_summary',
  VIEW_PATIENT_SUMMARY_LIST: 'view_patient_summary_list',
  ARCHIVE_PATIENT_SUMMARY: 'archive_patient_summary',
  UNARCHIVE_PATIENT_SUMMARY: 'unarchive_patient_summary',
  EXPORT_PATIENT_SUMMARIES: 'export_patient_summaries',
  EXPORT_DATA: 'export_data',
  VIEW_INTAKE_SESSION: 'view_intake_session',
  VIEW_INTAKE_SUMMARY: 'view_intake_summary',
  CREATE_INTAKE_RESPONSE: 'create_intake_response',
  UPDATE_PATIENT_SUMMARY: 'update_patient_summary',
  DELETE_PATIENT_DATA: 'delete_patient_data',
  VIEW_CLINIC_LIST: 'view_clinic_list',
  VIEW_CLINIC_DETAILS: 'view_clinic_details',
  VIEW_CLINIC_PROFILE: 'view_clinic_profile',
  UPDATE_CLINIC_PROFILE: 'update_clinic_profile',
  DELETE_CLINIC: 'delete_clinic',
  SUBMIT_PATIENT_INTAKE: 'submit_patient_intake',
  UPLOAD_CLINIC_LOGO: 'upload_clinic_logo',
  FETCH_TEMPLATE_QUESTIONS: 'fetch_template_questions',
  CREATE_TEMPLATE: 'create_template',
  ADD_TEMPLATE_QUESTIONS: 'add_template_questions',
  UPDATE_TEMPLATE_QUESTION: 'update_template_question',
  DELETE_TEMPLATE_QUESTION: 'delete_template_question',
  DELETE_TEMPLATE: 'delete_template',
  UPDATE_TEMPLATE: 'update_template',
  ACCESS_BILLING_PORTAL: 'access_billing_portal',
  PASSWORD_CHANGED: 'password_changed',
  WEBHOOK_SUBSCRIPTION_ACTIVATED: 'webhook_subscription_activated',
  WEBHOOK_SUBSCRIPTION_UPDATED: 'webhook_subscription_updated',
  WEBHOOK_SUBSCRIPTION_CANCELLED: 'webhook_subscription_cancelled',
  WEBHOOK_PAYMENT_SUCCEEDED: 'webhook_payment_succeeded',
  WEBHOOK_PAYMENT_FAILED: 'webhook_payment_failed',
  FAILED_PROVIDER_INVITATION: 'failed_provider_invitation',
  FAILED_PROVIDER_ACTIVATION: 'failed_provider_activation',
  FAILED_PHI_ACCESS: 'failed_phi_access',
  UNAUTHORIZED_ACCESS_ATTEMPT: 'unauthorized_access_attempt',
  FAILED_BILLING_ACCESS: 'failed_billing_access',
  SUBSCRIPTION_ACCEPTANCE_CREATED: 'subscription_acceptance_created',
  VIEW_SUBSCRIPTION_ACCEPTANCES: 'view_subscription_acceptances',
  VIEW_SUBSCRIPTION_ACCEPTANCE: 'view_subscription_acceptance',
};

export const AUDIT_RESOURCE_TYPES = {
  USER: 'user',
  CLINIC: 'clinic',
  PATIENT_SUMMARY: 'patient_summary',
  INTAKE_SESSION: 'intake_session',
  INTAKE_RESPONSE: 'intake_response',
  PROVIDER: 'provider',
  TEMPLATE: 'template',
  SUBSCRIPTION_ACCEPTANCE: 'subscription_acceptance',
};
