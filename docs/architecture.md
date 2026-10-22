# Architecture

## Request Flow

1. **Entry Point**: `src/server.js` → creates HTTP server with WebSocket support, loads dotenv config
2. **App Setup**: `src/app.js` → configures Express middleware, routes
3. **Routes**: `src/routes/index.js` → central router with JWT auth middleware
4. **Controllers**: Feature-based in `src/routes/<feature>/<feature>.controller.js`
5. **Models**: Sequelize models in `src/models/` with auto-loading via index.js

## Directory Structure

```
src/
├── routes/<feature>/       # Feature-based routing
│   ├── <feature>.controller.js  # Route handlers & business logic
│   ├── query.js                 # Complex Sequelize queries
│   └── validationSchemas.js     # Joi validation schemas
├── models/                 # Sequelize models (14 production models)
├── middlewares/            # Auth, upload, error handling
│   ├── auth.js            # JWT token extraction and validation
│   ├── errorHandler.js    # Centralized error handling
│   └── upload.js          # Multer file upload middleware
├── lib/                    # Core libraries (WebSocket)
├── utils/                  # Helpers, constants, decorators, queues
├── config/                 # Database, passport, Redis config
├── migrations/             # Sequelize migrations (14 migrations)
├── seeders/                # Database seeds
├── templates/              # Email templates (Handlebars)
└── server.js               # Entry point with dotenv import
```

## Key Patterns

### Controllers

Use decorator pattern for validation and request handling:

```javascript
@RequestBodyValidator(validationSchema)
@Request
static async updateUser(req, res) { ... }
```

### Authentication

JWT tokens via `express-jwt`:
- Routes excluded from auth listed in `aclExcludedRoutes` in `src/routes/index.js`
- JWT secret loaded from `.env` via dotenv (imported at top of `src/server.js`)
- Token must be in `Authorization: Bearer <token>` header
- Login endpoint: `POST /api/users/login` (excluded from auth)

### Authorization

Role-based system:
- Roles: `super_admin`, `clinic_admin`, `provider`
- `super_admin` users have no clinic association (clinicId is null)
- All other users must belong to a clinic
- Controllers must manually filter queries by `req.auth.clinicId` for tenant isolation

See [Multi-Tenancy](multi-tenancy.md) for detailed authorization rules.

### Validation

Joi schemas for request validation:
- Schemas defined in `validationSchemas.js` files
- Used with `@RequestBodyValidator` decorator
- Modern Joi API: use `schema.validate()` not `Joi.validate()`

### Error Handling

Centralized in `src/middlewares/errorHandler.js`:
- Handles GeneralError instances
- Handles Sequelize errors (foreign key, unique constraints)
- Maps to appropriate HTTP status codes

### Background Jobs

Bull queues with Redis:
- `QUEUE_NAMES`: DEFAULT_QUEUE, NOTIFICATION_QUEUE, CLEANUP_QUEUE
- Define job types in `src/utils/constants.js`

### WebSocket

Real-time updates:
- Server: `src/server.js` creates WebSocket server
- Messages defined in `WS_MESSAGES` constant

## File Uploads

Uses `multer` with S3 or local storage:
- Middleware: `src/middlewares/upload.js`
- Storage: AWS S3 for images/documents, local `/public/uploads` for Excel/PowerPoint
- S3 bucket structure: `mira-upload-storage-${NODE_ENV}`
- Folders: profile-picture, document-file
- Limits: 10MB file size, 10MB field size
- Cleanup queue removes unused files
