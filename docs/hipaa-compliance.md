# HIPAA Compliance Requirements (MANDATORY)

## Why Audit Logging is Mandatory

HIPAA Security Rule § 164.312(b) requires "Audit Controls" to record and examine information system activity. This includes:

1. **§ 164.308(a)(1)(ii)(D) - Information System Activity Review**: Track WHO accessed the system
2. **§ 164.312(b) - Audit Controls**: Log access to ePHI (electronic Protected Health Information)
3. **Access Control Requirements**: Monitor unauthorized access attempts, brute force attacks, compromised credentials

## Two-Layer Audit Logging Approach

### 1. System Access Logging (Required)

- User login attempts (successful and failed)
- User account management (create, update, delete)
- Authentication events (session timeouts, logouts)
- Detects: brute force attacks, unauthorized access, insider threats

### 2. PHI Access Logging (Most Critical)

- View patient summaries
- Export patient data
- Access intake sessions
- Modify patient records
- Delete patient data

## Audit Logging Rules

**All Endpoints Accessing PHI MUST Use @AuditLog Decorator**

Protected Health Information (PHI) includes:
- Patient summaries (PatientSummary model)
- Intake sessions (IntakeSession model)
- Intake responses (IntakeResponse model)
- Any patient demographic or medical data

### Mandatory Decorator Usage

```javascript
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from '../../utils/constants';

@AuditLog({
  action: AUDIT_ACTIONS.VIEW_SUMMARY,
  resourceType: AUDIT_RESOURCE_TYPES.PATIENT_SUMMARY,
  getResourceId: (result) => result.id,
  getChanges: (req, result) => ({
    patientIdentifier: result.intakeSession.patientIdentifier,
    providerId: result.providerId
  })
})
@Request
static async getPatientSummary(req, res) {
  const summary = await PatientSummary.findByPk(req.params.id);
  return SuccessResponse(res, summary);
}
```

## Required Audit Actions

### Authentication Events (REQUIRED)

| Action | Constant | When to Log | Status |
|--------|----------|-------------|--------|
| User login success | `AUDIT_ACTIONS.USER_LOGIN` | Every successful login | ✅ Implemented |
| User login failure | `AUDIT_ACTIONS.FAILED_LOGIN_ATTEMPT` | Every failed login attempt | ✅ Implemented |
| User logout | `AUDIT_ACTIONS.USER_LOGOUT` | When user logs out | ⚠️ TODO |
| Session timeout | `AUDIT_ACTIONS.SESSION_TIMEOUT` | When session expires | ⚠️ TODO |

### User Management Events (REQUIRED)

| Action | Constant | When to Log | Status |
|--------|----------|-------------|--------|
| User created | `AUDIT_ACTIONS.USER_CREATED` | New user account | ✅ Implemented |
| User updated | `AUDIT_ACTIONS.USER_UPDATED` | User modifications | ✅ Implemented |
| User deleted | `AUDIT_ACTIONS.USER_DELETED` | User deletion/deactivation | ⚠️ TODO |

### PHI Access Events (CRITICAL - REQUIRED)

| Action | Constant | When to Log | Status |
|--------|----------|-------------|--------|
| View patient summary | `AUDIT_ACTIONS.VIEW_SUMMARY` | GET patient summary | ⚠️ TODO |
| Export patient data | `AUDIT_ACTIONS.EXPORT_DATA` | PDF/CSV exports | ⚠️ TODO |
| View intake session | `AUDIT_ACTIONS.VIEW_INTAKE_SESSION` | GET intake session | ⚠️ TODO |
| Create intake response | `AUDIT_ACTIONS.CREATE_INTAKE_RESPONSE` | POST patient response | ⚠️ TODO |
| Update patient summary | `AUDIT_ACTIONS.UPDATE_PATIENT_SUMMARY` | PUT/PATCH summary | ⚠️ TODO |
| Delete patient data | `AUDIT_ACTIONS.DELETE_PATIENT_DATA` | Soft/hard delete | ⚠️ TODO |

## AuditLog Model Constraint

**CRITICAL**: The AuditLog model MUST allow `clinicId` to be null to support super_admin operations.

### Migration Requirement

```javascript
clinicId: {
  type: Sequelize.UUID,
  allowNull: true,  // MUST be true for super_admin support
  references: {
    model: 'Clinics',
    key: 'id'
  }
}
```

### Model Definition

```javascript
clinicId: {
  type: DataTypes.UUID,
  allowNull: true,  // MUST be true for super_admin
}
```

### Why This Matters

- Super admin users have `clinicId: null` in their JWT token
- @AuditLog decorator extracts `clinicId` from `req.auth.clinicId`
- For super_admin, this value is `null`
- If database requires clinicId (NOT NULL), super_admin login will fail
- **Fix Required**: Modify existing migration and model to allow null

## Audit Log Required Fields

Every audit log entry MUST contain:

```javascript
{
  userId: req.auth?.id || null,           // null for failed logins
  clinicId: req.auth?.clinicId || null,   // null for super_admin
  action: AUDIT_ACTIONS.XXX,              // Action constant
  resourceType: AUDIT_RESOURCE_TYPES.XXX, // Resource type constant
  resourceId: '<UUID>',                    // Specific resource ID
  ipAddress: req.ip,                       // Client IP address
  userAgent: req.get('user-agent'),       // Browser/client info
  changes: {                               // JSON object with details
    field1: 'value1',
    field2: 'value2'
  },
  createdAt: new Date()                   // Automatic timestamp
}
```

### Immutability Requirements

- No `updatedAt` field - audit logs cannot be modified
- Once created, audit records are permanent
- Supports forensic analysis and compliance audits
- Never delete audit logs except for legal data retention policies

## Password Security (Already Implemented)

### Requirements

- Minimum 8 characters
- Must contain: uppercase, lowercase, number, special character (@$!%*?&)
- Validation pattern: `/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/`
- Use `crypto.pbkdf2Sync()` with `process.env.SALT` for hashing

### Security Rules

- Passwords NEVER returned in API responses
- Always delete from response: `delete userResponse.password`
- Password reset tokens expire after 1 hour
- Never log passwords in audit trails (only log "password changed" event)

## Access Control Validation

### Verify Clinic Status on Authenticated Requests

```javascript
@Request
static async protectedEndpoint(req, res) {
  if (req.auth.role !== 'super_admin') {
    const clinic = await Clinic.findByPk(req.auth.clinicId);
    if (clinic.accountStatus !== 'active') {
      throw new ForbiddenError('Clinic account is not active');
    }
  }
}
```

Note: User access is controlled entirely through clinic status. The login endpoint in [src/routes/user/user.controller.js](../src/routes/user/user.controller.js) checks `clinic.accountStatus` to enforce payment gating and account status.

### Trial Period Enforcement

```javascript
const clinic = await Clinic.findByPk(req.auth.clinicId);

if (!['trial', 'active'].includes(clinic.subscriptionStatus)) {
  throw new ForbiddenError('Subscription expired - please update billing');
}

if (clinic.subscriptionStatus === 'trial' && clinic.trialDaysRemaining <= 0) {
  throw new ForbiddenError('Trial period expired - please subscribe');
}
```

### When to Check Subscription

- PHI access endpoints (view/create/update patient data) - ALWAYS check
- Login endpoint - ALLOW (user needs access to update billing)
- Profile update - ALLOW (user management)
- Billing endpoints - ALLOW (needed to reactivate)

## Decorator Behavior

The `@AuditLog` decorator automatically:

1. Extracts `userId` and `clinicId` from `req.auth`
2. Extracts `ipAddress` from `req.ip`
3. Extracts `userAgent` from request headers
4. Executes the controller method
5. Calls `getResourceId()` and `getChanges()` functions with result
6. Creates AuditLog record in database
7. **Throws error if audit log creation fails** (ensures HIPAA compliance)
8. Uses `debug` logging for troubleshooting

### Decorator Example

```javascript
@AuditLog({
  action: AUDIT_ACTIONS.EXPORT_DATA,
  resourceType: AUDIT_RESOURCE_TYPES.PATIENT_SUMMARY,
  getResourceId: (result) => result.summaryId,
  getChanges: (req, result) => ({
    exportFormat: req.query.format,
    patientIdentifier: result.patientIdentifier,
    exportedBy: req.auth.email
  })
})
@Request
static async exportSummary(req, res) {
  const summary = await PatientSummary.findByPk(req.params.id);
  const pdfBuffer = await generatePDF(summary);
  res.setHeader('Content-Type', 'application/pdf');
  res.send(pdfBuffer);
  return { summaryId: summary.id, patientIdentifier: summary.intakeSession.patientIdentifier };
}
```

## Failed Operation Logging

For operations that can fail (like login), manual logging is required:

```javascript
static async login(req, res, next) {
  passport.authenticate('local', async (err, passportUser) => {
    if (passportUser) {
      return UserController.performLoginSuccess(req, res, passportUser);
    }

    await models.AuditLog.create({
      userId: null,
      clinicId: null,
      action: AUDIT_ACTIONS.FAILED_LOGIN_ATTEMPT,
      resourceType: AUDIT_RESOURCE_TYPES.USER,
      resourceId: null,
      ipAddress: req.ip,
      userAgent: req.get('user-agent'),
      changes: {
        email: req.body.email,
        reason: err?.message || 'Invalid credentials'
      }
    });

    throw new UnauthorizedError('Invalid credentials');
  })(req, res, next);
}
```

## Compliance Testing

### Required Tests for Every PHI Endpoint

```javascript
describe('HIPAA Audit Logging', () => {
  it('should create audit log for patient summary view', async () => {
    const summary = await createTestPatientSummary();
    const user = await createTestUser({ role: 'provider' });

    await request(app)
      .get(`/api/patient-summaries/${summary.id}`)
      .set('Authorization', `Bearer ${generateToken(user)}`);

    const auditLog = await AuditLog.findOne({
      where: {
        action: AUDIT_ACTIONS.VIEW_SUMMARY,
        resourceId: summary.id,
        userId: user.id
      }
    });

    expect(auditLog).toBeDefined();
    expect(auditLog.ipAddress).toBeDefined();
    expect(auditLog.userAgent).toBeDefined();
  });

  it('should throw error if audit log creation fails', async () => {
    jest.spyOn(AuditLog, 'create').mockRejectedValue(new Error('DB error'));

    const response = await request(app)
      .get('/api/patient-summaries/123')
      .set('Authorization', `Bearer ${token}`);

    expect(response.status).toBe(500);
    expect(response.body.message).toContain('Audit log creation failed');
  });
});
```

## Audit Log Retention

### Retention Policy

- Minimum 6 years (HIPAA requirement)
- Longer for state-specific laws
- Implement archive strategy (move old logs to cold storage)
- Never delete logs unless legally required

### Implementation Example

```javascript
export const archiveOldAuditLogs = async () => {
  const sixYearsAgo = new Date();
  sixYearsAgo.setFullYear(sixYearsAgo.getFullYear() - 6);

  const oldLogs = await AuditLog.findAll({
    where: {
      createdAt: {
        [Op.lt]: sixYearsAgo
      }
    }
  });

  await s3.putObject({
    Bucket: 'mira-audit-archive',
    Key: `audit-logs-${sixYearsAgo.getFullYear()}.json`,
    Body: JSON.stringify(oldLogs)
  });
};
```

## Action Constants

Action constants defined in `src/utils/constants.js`:

```javascript
export const AUDIT_ACTIONS = {
  USER_LOGIN: 'user_login',
  FAILED_LOGIN_ATTEMPT: 'failed_login_attempt',
  USER_CREATED: 'user_created',
  USER_UPDATED: 'user_updated',
  USER_DELETED: 'user_deleted',
  VIEW_SUMMARY: 'view_summary',
  EXPORT_DATA: 'export_data',
  VIEW_INTAKE_SESSION: 'view_intake_session',
  CREATE_INTAKE_RESPONSE: 'create_intake_response',
  UPDATE_PATIENT_SUMMARY: 'update_patient_summary',
  DELETE_PATIENT_DATA: 'delete_patient_data',
};

export const AUDIT_RESOURCE_TYPES = {
  USER: 'user',
  PATIENT_SUMMARY: 'patient_summary',
  INTAKE_SESSION: 'intake_session',
  PROVIDER: 'provider',
};
```
