# Mira Medical Patient Intake System - Backend API

A **simple, clean** Node.js/Express API boilerplate for building medical patient intake systems with JWT authentication, file management, and background jobs.

## Tech Stack

- **Runtime**: Node.js with Babel for ES6+ features
- **Framework**: Express.js 4.18.2
- **Database**: MSSQL (SQL Server 2022) with Sequelize ORM v6.37.7
- **Authentication**: JWT with express-jwt v8.4.1
- **File Storage**: AWS S3 or local storage with Multer
- **Background Jobs**: Bull queues with Redis
- **Real-time**: WebSocket support
- **Email**: Nodemailer with Handlebars templates

## Current Status

✅ **User Authentication** - Login with JWT tokens
✅ **5 Working Endpoints** - List, Get, Create, Update users + Login
✅ **File Uploads** - AWS S3 or local storage configured
✅ **Background Jobs** - Bull queue system with Redis
✅ **Email System** - Nodemailer with Handlebars templates
✅ **WebSocket** - Real-time updates
✅ **Clean Structure** - Feature-based routing with decorators
✅ **Example Files** - Migration, seeder, and template examples

**Note**: ACL/permissions system has been removed. Only basic JWT authentication is active.

## Prerequisites

- Node.js >= 14.x
- SQL Server 2022 (with TCP/IP enabled and SQL Server Authentication)
- Redis (for background job queues)

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
# Rename .envtemplate to .env
# Edit .env with your MSSQL credentials:
# - DB_HOST=localhost
# - DB_USER=sa
# - DB_PASSWORD=admin
# - DB_NAME=mira_local
# - DB_DIALECT=mssql
# - JWT_SECRET=your-secret-key
# - SALT=your-salt-for-password-hashing
```

### 3. Setup Database

Ensure SQL Server 2022 is installed and running with:
- TCP/IP protocol enabled in SQL Server Configuration Manager
- SQL Server Authentication enabled

```bash
# Create database (using SQL Server Management Studio or sqlcmd)
# CREATE DATABASE mira_local;

# Run migrations
npx sequelize-cli db:migrate

# (Optional) Seed demo user
npx sequelize-cli db:seed:all
```

### 4. Create Upload Directory

```bash
# Windows
mkdir public\uploads

# Linux/Mac
mkdir -p public/uploads
```

### 5. Start Development Server

```bash
# Windows
npm run dev

# Server will start at http://localhost:3000
```

## Available Scripts

- `npm run dev` - Development server with hot reload
- `npm start` - Production server
- `npm run build` - Build for production
- `npm run lint:eslint` - Lint code
- `npm run lint:eslint:fix` - Auto-fix linting issues

## API Endpoints

All endpoints under `/api/users`:

### Public (No Auth Required)
- **POST /api/users/login** - Login with email/password, returns JWT token
- **POST /api/users** - Create new user

### Protected (Requires JWT Bearer Token)
- **GET /api/users** - List all users with pagination
- **GET /api/users/:id** - Get user by ID
- **PUT /api/users/:id** - Update user

**Example Request:**
```bash
curl -X GET http://localhost:3000/api/users \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

## Project Structure

```
src/
├── routes/
│   └── user/                   # User routes (login, CRUD)
│       ├── user.controller.js  # Route handlers with decorators
│       ├── query.js            # Sequelize query builders
│       └── validationSchemas.js # Joi validation schemas
├── models/
│   ├── user.model.js           # User model (only model)
│   └── index.js                # Model loader
├── middlewares/
│   ├── auth.js                 # JWT authentication
│   ├── errorHandler.js         # Centralized error handling
│   └── upload.js               # File upload middleware
├── lib/                        # Core libraries (WebSocket)
├── utils/                      # Helpers, constants, decorators, queues
├── config/
│   ├── config.js               # Database config (MSSQL)
│   └── passport.js             # Passport strategies
├── migrations/                 # Database migrations
├── seeders/                    # Database seeds
├── templates/                  # Email templates (Handlebars)
└── server.js                   # Entry point (loads dotenv)
```

## Authentication

### JWT Authentication
- Login with email and password via `POST /api/users/login`
- Returns JWT token for authenticated requests
- Token must be included in `Authorization: Bearer <token>` header
- Passport.js local strategy for password verification
- Password hashing using `crypto.pbkdf2Sync` (NOT bcrypt)

### Available Roles
Defined in `src/utils/constants.js`:
- `admin` - Administrator role
- `user` - Regular user role
- `patient` - Patient role (for medical intake)

**Note**: ACL/permissions system has been removed. For production, implement role-based checks in controllers or add middleware.

## Building Features

### Example: Adding Patient Management

1. **Create Model** (`src/models/patient.model.js`) using ES6 class with static `associate()` method
2. **Create Migration** (`npx sequelize-cli migration:generate --name create-patient`)
   - Use MSSQL-compatible DataTypes: `INTEGER`, `STRING`, `DATE`, `DATEONLY`, `ENUM`, `BOOLEAN`, `TEXT`
3. **Create Routes** (`src/routes/patient/`)
   - Controller with static methods and decorators
   - Query file for Sequelize query builders
   - Validation schemas using Joi (modern `schema.validate()` API)
4. **Register Route** in `src/routes/index.js` using `router.use()`
5. **Add to excluded routes** if endpoint should be public (in `aclExcludedRoutes`)

See [CLAUDE.md](CLAUDE.md) for detailed architecture and patterns.

## Configuration

### Environment Variables
Key variables in `.env`:
- `DB_HOST` - SQL Server host (default: localhost)
- `DB_USER` - SQL Server username (e.g., sa)
- `DB_PASSWORD` - SQL Server password
- `DB_NAME` - Database name (e.g., mira_local)
- `DB_DIALECT` - Must be `mssql`
- `JWT_SECRET` - Secret for JWT signing
- `SALT` - Salt for password hashing (used with crypto.pbkdf2Sync)
- `PORT` - Server port (default: 3000)
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY` - For S3 uploads
- `REDIS_URL` - Redis for job queues

### Adding New Roles
Edit `src/utils/constants.js`:
```javascript
export const ROLES = {
  ADMIN: 'admin',
  USER: 'user',
  PATIENT: 'patient',
  DOCTOR: 'doctor',    // Add new role
  NURSE: 'nurse',      // Add new role
};
```

**Note**: Implement role-based authorization checks in controllers as needed.

## Background Jobs

Bull queues handle async tasks:
- `DEFAULT_QUEUE` - General background processing
- `NOTIFICATION_QUEUE` - Email notifications
- `CLEANUP_QUEUE` - File cleanup

Define job types in `src/utils/constants.js`

## Example Files

Learn from these examples:
- **Migration**: `src/migrations/20210301081630-create-user.js`
- **Seeder**: `src/seeders/20210202112802-demo-user.js`
- **Email Template**: `src/templates/general.hbs`

## Documentation

- [CLAUDE.md](CLAUDE.md) - Complete architecture, patterns, and development guide

## Troubleshooting

### Common Issues

**"No authorization token was found"**
- Add route to `aclExcludedRoutes` in `src/routes/index.js`
- Or include `Authorization: Bearer <token>` header in request

**"Invalid credentials"**
- Ensure password hashing uses `crypto.pbkdf2Sync` with `SALT` env variable
- Check user exists in database

**Database connection fails**
- Verify SQL Server 2022 is running
- Enable TCP/IP protocol in SQL Server Configuration Manager
- Enable SQL Server Authentication
- Check `.env` file has correct MSSQL credentials

**Environment variables not loading**
- Ensure `import 'dotenv/config'` is at top of `src/server.js`
- Verify `.env` file exists in project root

## Author

Syed Ali Hamza - hamza.syed9995@gmail.com

## License

ISC
