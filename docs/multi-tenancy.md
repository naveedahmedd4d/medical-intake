# Multi-Tenancy Architecture

## Tenant Isolation

- **Clinic** is the core multi-tenant entity
- All entities (except super_admin users) are scoped to `clinicId`
- Foreign key references enforce data isolation at database level
- **Important**: Application code must manually filter by `clinicId` in controllers

## Role System

```javascript
User.role enum: ['super_admin', 'clinic_admin', 'provider']

super_admin:
  - clinicId must be null
  - Can manage all clinics
  - System-wide access

clinic_admin:
  - Must have clinicId
  - Manages single clinic
  - Full access within clinic

provider:
  - Must have clinicId
  - Healthcare provider role
  - Can conduct patient intakes
```

## Data Isolation Pattern

```javascript
const users = await User.findAll({
  where: {
    clinicId: req.auth.clinicId
  }
});
```

## Multi-Tenancy Enforcement (MANDATORY)

### Query Filtering Rules

**CRITICAL**: All database queries MUST enforce tenant isolation by filtering on `clinicId`. Failure to implement proper filtering creates severe security vulnerabilities allowing cross-tenant data access.

**Required Pattern for All Controllers:**

```javascript
const buildWhereClause = (req, additionalFilters = {}) => {
  const where = { ...additionalFilters };

  if (req.auth.role !== 'super_admin') {
    where.clinicId = req.auth.clinicId;
  }

  return where;
};

const users = await User.findAll({
  where: buildWhereClause(req, {})
});
```

**Super Admin Exception:**
- ONLY `super_admin` role can query across all clinics
- `clinic_admin` and `provider` roles MUST be restricted to their own `clinicId`
- Always check `req.auth.role` before deciding whether to apply clinicId filter
- Super admin queries return data from all tenants

### Endpoints That MUST Filter by clinicId

#### 1. List Operations (`findAll`, `findAndCountAll`)

```javascript
static async list(req, res) {
  const where = {};
  if (req.auth.role !== 'super_admin') {
    where.clinicId = req.auth.clinicId;
  }
  const results = await Model.findAll({ where });
  return SuccessResponse(res, results);
}
```

#### 2. Read Operations (`findOne`, `findByPk`)

```javascript
static async getById(req, res) {
  const resource = await Model.findByPk(req.params.id);

  if (req.auth.role !== 'super_admin' && resource.clinicId !== req.auth.clinicId) {
    throw new ForbiddenError('Access denied: resource belongs to different clinic');
  }

  return SuccessResponse(res, resource);
}
```

#### 3. Update Operations

```javascript
static async update(req, res) {
  const resource = await Model.findByPk(req.params.id);

  if (!resource) {
    throw new NotFoundError('Resource not found');
  }

  if (req.auth.role !== 'super_admin' && resource.clinicId !== req.auth.clinicId) {
    throw new ForbiddenError('Access denied: cannot modify resource from different clinic');
  }

  await resource.update(req.body);
  return SuccessResponse(res, resource);
}
```

#### 4. Delete Operations

```javascript
static async delete(req, res) {
  const resource = await Model.findByPk(req.params.id);

  if (!resource) {
    throw new NotFoundError('Resource not found');
  }

  if (req.auth.role !== 'super_admin' && resource.clinicId !== req.auth.clinicId) {
    throw new ForbiddenError('Access denied: cannot delete resource from different clinic');
  }

  await resource.destroy();
  return SuccessResponse(res, { message: 'Resource deleted' });
}
```

## Authorization Helper Functions

Create reusable authorization helpers in `src/utils/authorization.js`:

```javascript
export const buildTenantWhereClause = (req, additionalFilters = {}) => {
  const where = { ...additionalFilters };

  if (req.auth.role !== 'super_admin') {
    where.clinicId = req.auth.clinicId;
  }

  return where;
};

export const verifyTenantAccess = (req, resource) => {
  if (req.auth.role === 'super_admin') {
    return true;
  }

  if (resource.clinicId !== req.auth.clinicId) {
    throw new ForbiddenError('Access denied: resource belongs to different clinic');
  }

  return true;
};

export const requireSuperAdmin = (req) => {
  if (req.auth.role !== 'super_admin') {
    throw new ForbiddenError('Access denied: super admin privileges required');
  }
  return true;
};

export const requireClinicAdmin = (req) => {
  if (!['super_admin', 'clinic_admin'].includes(req.auth.role)) {
    throw new ForbiddenError('Access denied: clinic admin privileges required');
  }
  return true;
};
```

## User Management Rules

### User Creation

- Public user creation endpoint (`POST /api/users`) MUST be removed or restricted to super_admin only
- Clinic admins are created via clinic onboarding flow: `POST /api/clinics/register`
- Providers are created via invitation flow using UserInvitation model
- Super admins can create users via restricted endpoint (requires super_admin role)

### User Updates

Users can only be updated by:
1. The user themselves (self-service profile updates)
2. `clinic_admin` of the same clinic (user management)
3. `super_admin` (system administration)

Always verify `clinicId` match before allowing updates. Role changes require `clinic_admin` or `super_admin` privileges. Prevent users from elevating their own privileges.

### User Queries

- `GET /api/users` - Filter by `req.auth.clinicId` (unless super_admin)
- `GET /api/users/:id` - Verify user belongs to `req.auth.clinicId`
- Never expose users from other clinics
- Recommended: Remove general user list endpoint, use specific endpoints per workflow

## Testing Multi-Tenancy

When implementing any new endpoint, MUST test:

### 1. Cross-Tenant Isolation Test

```javascript
it('should prevent clinic A admin from accessing clinic B data', async () => {
  const clinicA = await createTestClinic('Clinic A');
  const clinicB = await createTestClinic('Clinic B');
  const adminA = await createTestUser({ role: 'clinic_admin', clinicId: clinicA.id });
  const resourceB = await createTestResource({ clinicId: clinicB.id });

  const response = await request(app)
    .get(`/api/resources/${resourceB.id}`)
    .set('Authorization', `Bearer ${generateToken(adminA)}`);

  expect(response.status).toBe(403);
  expect(response.body.message).toContain('different clinic');
});
```

### 2. Super Admin Access Test

```javascript
it('should allow super_admin to access all clinic data', async () => {
  const clinicA = await createTestClinic('Clinic A');
  const clinicB = await createTestClinic('Clinic B');
  const superAdmin = await createTestUser({ role: 'super_admin', clinicId: null });

  const response = await request(app)
    .get('/api/resources')
    .set('Authorization', `Bearer ${generateToken(superAdmin)}`);

  expect(response.status).toBe(200);
  const clinicIds = response.body.data.map(r => r.clinicId);
  expect(clinicIds).toContain(clinicA.id);
  expect(clinicIds).toContain(clinicB.id);
});
```

### 3. List Query Filtering Test

```javascript
it('should only return resources for user clinic', async () => {
  const clinicA = await createTestClinic('Clinic A');
  const clinicB = await createTestClinic('Clinic B');
  await createTestResource({ clinicId: clinicA.id });
  await createTestResource({ clinicId: clinicB.id });
  const adminA = await createTestUser({ role: 'clinic_admin', clinicId: clinicA.id });

  const response = await request(app)
    .get('/api/resources')
    .set('Authorization', `Bearer ${generateToken(adminA)}`);

  expect(response.status).toBe(200);
  expect(response.body.data).toHaveLength(1);
  expect(response.body.data[0].clinicId).toBe(clinicA.id);
});
```

## Common Vulnerabilities to Avoid

### Missing clinicId Filter

**❌ Wrong:**
```javascript
const users = await User.findAll();
```

**✅ Correct:**
```javascript
const where = {};
if (req.auth.role !== 'super_admin') {
  where.clinicId = req.auth.clinicId;
}
const users = await User.findAll({ where });
```

### No Authorization Check on Update

**❌ Wrong:**
```javascript
await User.update(req.body, { where: { id: req.params.id } });
```

**✅ Correct:**
```javascript
const user = await User.findByPk(req.params.id);
if (req.auth.role !== 'super_admin' && user.clinicId !== req.auth.clinicId) {
  throw new ForbiddenError('Access denied');
}
await user.update(req.body);
```

### Public User Creation

**❌ Wrong:**
```javascript
export const aclExcludedRoutes = [
  { url: '/api/users', methods: ['POST'] }
];
```

**✅ Correct:**
```javascript
export const aclExcludedRoutes = [
  '/api/users/login',
  '/api/clinics/register'
];
```

## Security Best Practices

- **Tenant isolation**: Controllers must manually filter by `req.auth.clinicId`
- **JWT includes clinicId**: Middleware can use `req.auth.clinicId` to filter queries
- **Super admins have clinicId: null**: JWT token reflects this
- **Test with multiple clinics**: Verify isolation in all endpoints
- **Review query logic**: Ensure no missing tenant filters
