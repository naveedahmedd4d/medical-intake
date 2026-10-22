# API Documentation (Swagger)

## Philosophy

Auto-generated Swagger docs from existing code with smart defaults and flexible overrides.

**Access**: Swagger UI available at `http://localhost:3000/api-docs`

## Auto-Generation Approach

Uses `@SwaggerDoc` decorator with `joi-to-swagger` to automatically convert Joi validation schemas into Swagger documentation.

### Key Benefits

- No manual JSON editing
- Single source of truth (Joi schemas = Swagger docs)
- Smart defaults with flexible customization
- Auto-synced when schemas change

## Usage Patterns

### Pattern 1: Zero Config (Most Common)

```javascript
@RequestBodyValidator(userLoginSchema)
@Request
static async login(req, res, next) {
}
```

Auto-generates:
- Summary: "Login" (from method name)
- Request schema: from userLoginSchema
- Responses: Standard 200/400/422
- Tags: ["User"] (from controller name)

### Pattern 2: Minimal Override (Custom Tag)

```javascript
@SwaggerDoc({ tags: ['Authentication'] })
@RequestBodyValidator(userSignUpSchema)
@Request
static async createUser(req, res, next) {
}
```

Uses custom tag, auto-generates everything else.

### Pattern 3: Full Customization

```javascript
@SwaggerDoc({
  summary: 'Authenticate user',
  description: 'JWT-based authentication with HIPAA audit logging',
  tags: ['Authentication'],
  security: [],
  responses: {
    200: {
      description: 'Login successful',
      content: {
        'application/json': {
          schema: {
            type: 'object',
            properties: {
              id: { type: 'string', format: 'uuid' },
              email: { type: 'string', format: 'email' },
              token: { type: 'string', description: 'JWT token (24h)' },
            },
          },
        },
      },
    },
    401: { description: 'Invalid credentials' },
  },
})
@RequestBodyValidator(userLoginSchema)
@Request
static async login(req, res, next) {
}
```

## Smart Defaults

| Field | Auto-Detection | Override Example |
|-------|---------------|------------------|
| `summary` | Method name → "Create User" | `summary: 'Register new user'` |
| `description` | Empty | `description: '...'` |
| `tags` | Controller name → ["User"] | `tags: ['Authentication']` |
| `requestBody` | From `@RequestBodyValidator` schema | `requestBody: {...}` |
| `responses` | 200/400/422/500 | `responses: {...}` |
| `security` | Global JWT auth | `security: []` (no auth) |

## Implementation Details

### Decorator

`@SwaggerDoc(config)` in `src/utils/decorators.js`:
- Stores metadata for each method
- Auto-converts Joi schemas using `joi-to-swagger`
- Merges smart defaults with custom config

### Config

`src/config/swagger.js`:
- Reads decorator metadata via `getSwaggerMetadata()`
- Generates OpenAPI 3.0 spec
- Serves Swagger UI at `/api-docs`

### RequestBodyValidator Enhancement

- Now stores Joi schema for Swagger auto-generation
- No breaking changes to existing functionality

## Adding Docs to New Endpoints

### Minimal Approach (Recommended)

```javascript
@RequestBodyValidator(mySchema)
@Request
static async myEndpoint(req, res) {
}
```

Swagger auto-generated!

### Optional Tag Override

```javascript
@SwaggerDoc({ tags: ['CustomTag'] })
@RequestBodyValidator(mySchema)
@Request
static async myEndpoint(req, res) {
}
```

Custom tag, everything else auto-generated.

## Response Structure Standards

### Success Responses

All successful API responses follow this structure:

```json
{
  "data": {
    // Response payload here
  }
}
```

### List/Pagination Responses

For list endpoints with pagination, follow the **minimalist approach**:

```json
{
  "data": {
    "totalRecords": 42,
    "items": [...]
  }
}
```

**Rationale:**
- Frontend already knows `page` and `pageSize` from request parameters
- Frontend can calculate `totalPages` as `Math.ceil(totalRecords / pageSize)`
- Reduces response payload size
- Follows GitHub API minimalist pattern

**Example calculation on frontend:**
```javascript
const totalPages = Math.ceil(response.data.totalRecords / pageSize);
const hasNextPage = currentPage < totalPages;
```

### Error Responses

```json
{
  "status": "error",
  "message": "Error description",
  "data": {
    // Optional additional error details
  }
}
```

## Current API Endpoints

### Authentication & User Management

#### Public (No Auth Required)

- **POST /api/users/login** - Login with email/password, returns JWT token
- **POST /api/clinics/register** - Register new clinic with admin user, location, and optional provider details

#### Protected (Requires JWT)

- **POST /api/users** - Create new user (super_admin only)
- **GET /api/users** - List all users with pagination
- **GET /api/users/:id** - Get user by ID
- **PUT /api/users/:id** - Update user

### Clinic Management (Super Admin Only)

#### Protected (Requires JWT with super_admin role)

- **GET /api/clinics** - List all clinics with filtering, search, and pagination
  - Query params: `search`, `planType`, `status`, `page`, `pageSize`, `sortColumn`, `sortOrder`
  - Returns: `{ totalRecords, clinics: [...] }`
- **GET /api/clinics/:id** - Get detailed clinic information including admins, locations, and subscription
- **DELETE /api/clinics/:id** - Soft delete clinic (sets `deletedAt` via paranoid mode)

## Authentication

JWT tokens via `express-jwt`:
- Secret: `process.env.JWT_SECRET`
- Token generation: `src/utils/helper.js` - generateJWT()
- Token payload: `{ id, email, role, clinicId }`
- Expiration: 24 hours
- Token must be in `Authorization: Bearer <token>` header

### Password Hashing

Uses `crypto.pbkdf2Sync()` with `process.env.SALT` (NOT bcrypt):

```javascript
crypto.pbkdf2Sync(password, process.env.SALT, 10000, 64, 'sha512').toString('hex')
```

### Password Requirements (HIPAA Compliant)

- Minimum 8 characters
- Must contain: uppercase, lowercase, number, special character
- Pattern: `/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/`
