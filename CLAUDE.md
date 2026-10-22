# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Detailed documentation**: See [/docs](docs/) folder for comprehensive guides.

## Project Overview

**Mira Medical Patient Intake System API** - Production multi-tenant medical intake platform with comprehensive patient intake workflows, template management, AI-generated summaries, subscription billing, and audit trails.

**Tech Stack**: Node.js, Express, MSSQL (SQL Server), Sequelize, JWT Auth, Bull Queues, WebSocket, AWS S3, Stripe

**Current Status**: Production-ready system with 14 models, complete multi-tenancy architecture, and working authentication. All migrations have been successfully applied to the database.

**Database**: MSSQL (SQL Server 2022) with database `mira_local`, credentials configured in `.env`

## Quick Commands

### Running the Application
```bash
npm run dev              # Development server with nodemon on port 3000
npm start                # Production start with babel-node
npm run build            # Compile with Babel to dist/
```

### Database Operations
```bash
npx sequelize-cli db:migrate           # Run migrations
npx sequelize-cli db:seed:all          # Seed database
npx sequelize-cli migration:generate --name <name>  # Create migration
```

### Linting & Documentation
```bash
npm run lint:eslint:fix  # Auto-fix lint issues
```
Swagger UI: `http://localhost:3000/api-docs`

## Critical Rules (MANDATORY)

### 1. Multi-Tenancy Enforcement

**CRITICAL**: All database queries MUST enforce tenant isolation by filtering on `clinicId`. Failure to implement proper filtering creates severe security vulnerabilities.

```javascript
const where = {};
if (req.auth.role !== 'super_admin') {
  where.clinicId = req.auth.clinicId;
}
const results = await Model.findAll({ where });
```

**Role System:**
- `super_admin`: clinicId is null, can access all clinics
- `clinic_admin`: Must have clinicId, full access within clinic
- `provider`: Must have clinicId, healthcare provider role

See [docs/multi-tenancy.md](docs/multi-tenancy.md) for complete enforcement rules.

### 2. HIPAA Compliance - Audit Logging

**All endpoints accessing PHI MUST use @AuditLog decorator:**

```javascript
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../../utils/constants';

@AuditLog({
  action: AUDIT_ACTIONS.VIEW_PATIENT_SUMMARY_LIST,
  resourceType: AUDIT_RESOURCE_TYPES.PATIENT_SUMMARY,
  getResourceId: (result) => result?.id,
  getChanges: (req, result) => ({ patientIdentifier: result?.intakeSession?.patientIdentifier })
})
@Request
static async listPatientSummaries(req, res) {
  const summaries = await PatientSummary.findAll(query);
  return SuccessResponse(res, summaries);
}
```

**PHI includes**: PatientSummary, IntakeSession, IntakeResponse models and any patient demographic/medical data.

See [docs/hipaa-compliance.md](docs/hipaa-compliance.md) for required audit actions.

### 3. Code Style Requirements

- **No Comments**: User requirement - never add code comments
- **No Claude Attribution**: Never include Claude Code co-authorship in commits
- **Password Hashing**: Use `crypto.pbkdf2Sync()` with `process.env.SALT` (NOT bcrypt)
- **UUID Primary Keys**: All models use UUID v4, not auto-increment integers
- **JSON Fields**: Use `TEXT` in migrations for MSSQL, `JSON` type in models

### 4. API Response Structure

**All responses use `SuccessResponse(res, data)` helper.** For list endpoints, use minimalist pagination (only `totalRecords`, no `currentPage`/`pageSize`/`totalPages`).

```javascript
const result = {
  totalRecords: count,
  providers: providersData,
};
SuccessResponse(res, result);
```

See [docs/api-documentation.md](docs/api-documentation.md) for complete standards and examples.

### 5. Authentication & Security

**JWT Configuration:**
- Secret: `process.env.JWT_SECRET`
- Token payload: `{ id, email, role, clinicId }`
- Expiration: 24 hours
- Header: `Authorization: Bearer <token>`

**Password Requirements (HIPAA Compliant):**
- Minimum 8 characters
- Must contain: uppercase, lowercase, number, special character (@$!%*?&)

**Role System (express-acl):**
- `super_admin`: clinicId is null, unrestricted access to all resources and clinics
- `clinic_admin`: Must have clinicId, full access within their clinic
- `provider`: Must have clinicId, healthcare provider with restricted permissions

**Super Admin Validation:**
```javascript
if (role === 'super_admin' && clinicId) {
  throw Error('super_admin cannot have clinicId');
}
if (role !== 'super_admin' && !clinicId) {
  throw Error('clinicId required for non super_admin');
}
```

**ACL Configuration:**
- ACL rules defined in [nacl.json](nacl.json) at project root
- Configured in [src/routes/index.js](src/routes/index.js) with `express-acl`
- Public routes bypass ACL via `aclExcludedRoutes` array
- ACL reads role from `req.auth.role` (populated by JWT middleware)

### 6. Decorator Pattern & Stacking Order

**Critical: Decorators must be stacked in correct order (bottom executes first):**

```javascript
@AuditLog({ ... })           // 3. Log after response (outermost)
@Request                      // 2. Error handling wrapper
@RequestBodyValidator(schema) // 1. Validate first (innermost)
static async createProvider(req, res) { ... }
```

**Available Decorators:**

#### @Request
- **Purpose**: Wraps async controller methods with try/catch error handling
- **Parameters**: None
- **Usage**: Always use on controller methods
```javascript
@Request
static async getProfile(req, res) { ... }
```

#### @RequestBodyValidator(schema)
- **Purpose**: Validates req.body with Joi schema, auto-generates Swagger docs
- **Parameters**:
  - `schema` (Joi.object) - Joi validation schema
- **Usage**: Use for POST/PUT/PATCH endpoints with request body
```javascript
@RequestBodyValidator(inviteProviderSchema)
static async inviteProvider(req, res) { ... }
```

#### @AuditLog(config)
- **Purpose**: Creates HIPAA audit log entry after successful execution
- **Parameters**:
  - `action` (string) - Action constant from AUDIT_ACTIONS
  - `resourceType` (string) - Resource type from AUDIT_RESOURCE_TYPES
  - `getResourceId` (function) - `(result, req, res) => string|null` - Returns resource ID
  - `getChanges` (function) - `(req, result, res) => object` - Returns changes object
- **Usage**: Required for all PHI access endpoints
```javascript
@AuditLog({
  action: AUDIT_ACTIONS.PROVIDER_INVITED,
  resourceType: AUDIT_RESOURCE_TYPES.PROVIDER,
  getResourceId: (result) => result?.userId,
  getChanges: (req, result) => ({
    email: result?.email,
    clinicId: req.auth.clinicId,
  })
})
static async inviteProvider(req, res) { ... }
```

#### @SwaggerDoc(config)
- **Purpose**: Adds Swagger/OpenAPI documentation metadata
- **Parameters**:
  - `tags` (array) - Swagger tag grouping
  - `description` (string) - Endpoint description
  - `security` (array) - Auth requirements (default: `[{ bearerAuth: [] }]`, use `[]` for public)
  - `query` (object) - Query parameter definitions
  - `params` (object) - Path parameter definitions
- **Usage**: Use on all endpoints for API documentation
```javascript
@SwaggerDoc({
  tags: ['Providers'],
  description: 'List all providers for clinic',
  security: [],  // Public endpoint
  query: {
    search: { type: 'string', description: 'Search term' },
    page: { type: 'number', default: 1 }
  }
})
static async listProviders(req, res) { ... }
```

### 7. Stripe Integration

**Production subscription billing system integrated with clinic onboarding:**

- **Webhook endpoint**: `/api/webhooks/stripe` (raw body required, bypasses JWT/ACL)
- **Environment variables**: `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`
- **Models**: Subscription, BillingEvent, ProcessedWebhookEvent
- **Automatic processing**: Subscription activation, payment failures, cancellations logged in BillingEvent table
- **Subscription plans**: STARTER, PROFESSIONAL, ENTERPRISE (defined in constants)

**Key Stripe operations:**
1. **Clinic Onboarding** - Creates Stripe Customer and Checkout Session
2. **Provider Management** - Updates subscription quantity (add/remove seats) with proration
3. **Billing Portal** - `GET /api/billing/portal` returns Stripe Customer Portal URL
4. **Webhooks** - Processes checkout.session.completed, customer.subscription.* events

**Stripe Subscription Flow:**
```javascript
// 1. Create customer on clinic onboarding
const customer = await stripe.customers.create({
  email: admin.email,
  metadata: { clinicId, userId, planType }
});

// 2. Create checkout session with trial
const checkoutSession = await createCheckoutSession({
  stripeCustomerId: customer.id,
  planType: payment.planType,
  clinicId: newClinic.id,
  trialEndTimestamp
});

// 3. Update subscription quantity when adding/removing providers
await stripe.subscriptions.update(subscriptionId, {
  items: [{ id: itemId, quantity: newProviderCount }],
  proration_behavior: 'create_prorations'
});
```

### 8. Soft Delete Cascade (Paranoid Mode)

**Global paranoid delete cascade is enabled for all models with soft deletes:**

- **Implementation**: Global `afterDestroy` hook in [src/models/index.js](src/models/index.js)
- **Helper Function**: [src/utils/paranoidDeleteCascade.js](src/utils/paranoidDeleteCascade.js)
- **How it works**: When a paranoid model is soft deleted, all associated models with `onDelete: 'CASCADE'` are automatically soft deleted
- **Transaction support**: Cascaded deletes preserve transaction integrity and trigger individual hooks

**To enable cascade for a model association:**

```javascript
User.hasOne(models.Provider, {
  foreignKey: 'userId',
  as: 'provider',
  onDelete: 'CASCADE',  // Required for paranoid cascade
});
```

**Best Practice - Add CASCADE in both places:**
1. **Model association** (required for soft delete cascade via hook)
2. **Migration foreign key** (recommended for hard delete cascade via database)

```javascript
userId: {
  type: UUID,
  references: { model: 'Users', key: 'id' },
  onDelete: 'CASCADE',  // Database-level hard delete cascade
}
```

**Behavior:**
- **Soft delete** (`destroy()`): Cascades via global hook
- **Hard delete** (`destroy({ force: true })`): Cascades via database constraint

## ACL Configuration (nacl.json)

**ACL file location**: [nacl.json](nacl.json) at project root

**Structure**: Role-based permissions mapped to HTTP methods and resource paths

**Example ACL rules:**
```json
{
  "group": "clinic_admin",
  "permissions": [
    {
      "resource": "providers/*",
      "methods": ["GET", "POST", "DELETE"],
      "action": "allow"
    }
  ]
}
```

**Public Routes (bypass ACL and JWT):**
Defined in `aclExcludedRoutes` array in [src/routes/index.js](src/routes/index.js):
- `/api/users/login`
- `/api/clinics/onboarding/initiate`
- `/api/providers/accept-invitation`
- `/api/patient-intake/questions`
- `/api/patient-intake`
- `/api/patient-intake/summary/:id`
- `/api/webhooks/stripe`

## Current API Endpoints

### Authentication & User Management
- `POST /api/users/login` - Login with email/password (public)
- `GET /api/payment-status` - Check if user requires payment setup

### Clinic Management
- `POST /api/clinics/onboarding/initiate` - Initiate clinic onboarding with Stripe (public)
- `GET /api/clinics/profile` - Get current clinic profile (clinic_admin)
- `GET /api/clinics` - List all clinics (super_admin)
- `GET /api/clinics/:id` - Get clinic by ID (super_admin)
- `DELETE /api/clinics/:id` - Soft delete clinic (super_admin)

### Provider Management
- `POST /api/providers/invite` - Invite provider to clinic (clinic_admin)
- `POST /api/providers/accept-invitation` - Accept provider invitation (public)
- `GET /api/providers` - List providers with pagination (clinic_admin)
- `GET /api/providers/profile` - Get provider profile (provider)
- `PUT /api/providers/profile` - Update provider profile (provider)
- `DELETE /api/providers/:id` - Remove provider from clinic (clinic_admin)

### Billing
- `GET /api/billing/portal` - Get Stripe Customer Portal URL (clinic_admin)

### Patient Summaries
- `GET /api/patient-summaries` - List patient summaries with filters
- `PATCH /api/patient-summaries/:id` - Update patient summary (archive/unarchive)
- `GET /api/patient-summaries/export/pdf` - Export patient summaries to PDF

### Patient Intake
- `GET /api/patient-intake/questions` - Get template questions (public)
- `POST /api/patient-intake` - Submit patient intake form (public)
- `GET /api/patient-intake/summary/:sessionId` - Get patient intake summary (public)

### Webhooks
- `POST /api/webhooks/stripe` - Stripe webhook handler (public, raw body)

## Must-Do Checklist for New API Endpoints

When creating a new API endpoint, follow these steps:

### 1. Create Model (if needed)
- Use UUID v4 for primary key
- Add `paranoid: true` for soft deletes
- Define associations with `onDelete: 'CASCADE'`
- Use `TEXT` type in migrations for JSON fields

### 2. Create Migration
- MSSQL-compatible data types
- Add foreign key constraints with `onDelete: 'CASCADE'`
- Add indexes for frequently queried fields

### 3. Create Validation Schema
```javascript
export const createResourceSchema = Joi.object().keys({
  name: Joi.string().required(),
  clinicId: Joi.string().uuid().when('$role', {
    is: 'super_admin',
    then: Joi.forbidden(),
    otherwise: Joi.required()
  })
});
```

### 4. Create Query Builder (query.js)
- Enforce multi-tenancy filtering
- Support pagination
- Include necessary associations

### 5. Create Controller Method
```javascript
@SwaggerDoc({
  tags: ['ResourceName'],
  description: 'Endpoint description',
  security: [],  // [] for public, omit for authenticated
})
@RequestBodyValidator(createResourceSchema)  // For POST/PUT/PATCH only
@AuditLog({
  action: AUDIT_ACTIONS.RESOURCE_CREATED,
  resourceType: AUDIT_RESOURCE_TYPES.RESOURCE,
  getResourceId: (result) => result?.id,
  getChanges: (req, result) => ({ name: result?.name })
})
@Request
static async createResource(req, res) {
  // Implementation
  return SuccessResponse(res, data);
}
```

### 6. Register Route
Add to controller's `getRouter()`:
```javascript
this.router.post('/', this.createResource);
```

### 7. Add to Routes Index
In [src/routes/index.js](src/routes/index.js):
```javascript
import ResourceController from './resource/resource.controller';
router.use('/resources', ResourceController.getRouter());
```

### 8. Update ACL (nacl.json)
Add permissions for each role:
```json
{
  "resource": "resources/*",
  "methods": ["GET", "POST"],
  "action": "allow"
}
```

### 9. Add Public Routes (if needed)
In [src/routes/index.js](src/routes/index.js), add to `aclExcludedRoutes`:
```javascript
'/api/resources/public-endpoint'
```

### 10. Add Swagger Mapping
In [src/config/swagger.js](src/config/swagger.js), add to `routeMapping`:
```javascript
'ResourceController.createResource': { path: '/api/resources', method: 'post' }
```

### 11. Multi-Tenancy Check
- Ensure all queries filter by `clinicId` (except super_admin)
- Validate user has access to resources they're querying
- Use authorization helpers from multi-tenancy utils

### 12. Test the Endpoint
- Test with different roles (super_admin, clinic_admin, provider)
- Verify ACL permissions work correctly
- Check audit logs are created for PHI access
- Verify Swagger documentation appears correctly

## Key File Locations

**Example Templates:**
- Controller: [src/routes/provider/provider.controller.js](src/routes/provider/provider.controller.js)
- Model: [src/models/provider.model.js](src/models/provider.model.js)
- Migration: [src/migrations/20251106063045-create-providers.js](src/migrations/20251106063045-create-providers.js)
- Validation: [src/routes/provider/validationSchemas.js](src/routes/provider/validationSchemas.js)
- Query builder: [src/routes/provider/query.js](src/routes/provider/query.js)

**Configuration:**
- Routes: [src/routes/index.js](src/routes/index.js) - Central router with JWT auth + ACL
- ACL Rules: [nacl.json](nacl.json) - Role-based access control configuration
- Auth middleware: [src/middlewares/auth.js](src/middlewares/auth.js)
- Decorators: [src/utils/decorators.js](src/utils/decorators.js)
- Constants: [src/utils/constants.js](src/utils/constants.js) - AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES, QUEUE_NAMES
- Stripe utilities: [src/utils/stripe.js](src/utils/stripe.js) - Stripe SDK instance
- Stripe helpers: [src/utils/stripeHelpers.js](src/utils/stripeHelpers.js) - Checkout session creation
- Paranoid cascade: [src/utils/paranoidDeleteCascade.js](src/utils/paranoidDeleteCascade.js) - Global soft delete cascade
- Swagger config: [src/config/swagger.js](src/config/swagger.js) - Route mapping for API docs

## Documentation

For detailed information, see:

- **[Architecture](docs/architecture.md)** - Request flow, directory structure, key patterns
- **[Multi-Tenancy](docs/multi-tenancy.md)** - Tenant isolation, query filtering, authorization helpers
- **[HIPAA Compliance](docs/hipaa-compliance.md)** - Audit logging rules, required actions, testing
- **[Database](docs/database.md)** - All 14 models, relationships, migration patterns
- **[API Documentation](docs/api-documentation.md)** - Swagger auto-generation, current endpoints
- **[Development](docs/development.md)** - Common workflows, troubleshooting, important notes

## Author

Syed Ali Hamza - hamza.syed9995@gmail.com
