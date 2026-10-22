# Database Models

## ORM Configuration

- Sequelize v6.37.7 with MSSQL (tedious v18.6.1)
- Configuration: `src/config/config.js` (uses MSSQL dialect)
- Connection: SQL Server 2022, database `mira_local`, sa/admin credentials
- TCP/IP protocol and SQL Server Authentication must be enabled
- All primary keys use UUID with UUIDV4 default values

## Core Models

### Clinic (Tenant Root)

- **Fields**: id, name, address, contactEmail, contactPhone, website, subscriptionStatus, stripeCustomerId, trialDaysRemaining, trialEndsAt
- **Subscription status**: trial, active, cancelled, past_due, trial_expired, suspended
- **Default trial**: 2 days
- **Has many**: Users, Providers, ClinicLocations, Templates, IntakeSessions, Subscriptions, UserInvitations, AuditLogs

### User

- **Fields**: id, clinicId (nullable for super_admin), firstName, lastName, email, password, role, status, isAdmin, contactNo, extension, lastActivity, avatar, joiningDate, dob, loginTime
- **Virtual field**: fullName (computed from firstName + lastName)
- **Password hashing**: Uses `crypto.pbkdf2Sync` with salt from env (NOT bcrypt)
- **Validation**: super_admin must have clinicId null, others must have clinicId
- **Belongs to**: Clinic
- **Has one**: Provider (one-to-one relationship)
- **Has many**: UserInvitations, PasswordResets, AuditLogs

### Provider (Extends User)

- **Fields**: id, userId (unique), clinicId, specialty, licenseNumber, npiNumber, deletedAt
- **One-to-one with User** (healthcare provider details)
- **Soft delete**: paranoid mode enabled
- **Belongs to**: User, Clinic
- **Has many**: IntakeSessions, PatientSummaries

### ClinicLocation

- **Fields**: id, clinicId, name, address, city, state, zipCode, phone, isPrimary
- **Belongs to**: Clinic

## Template System Models

### Template

- **Fields**: id, clinicId, name, description, category, isDefault, deletedAt
- **Purpose**: Manages intake form templates per clinic
- **Soft delete**: paranoid mode enabled
- **Belongs to**: Clinic
- **Has many**: TemplateQuestions, IntakeSessions

### TemplateQuestion

- **Fields**: id, templateId, parentQuestionId (self-referencing), questionText, questionType, category, position, isRequired, showCondition (JSON), options (JSON)
- **Question types**: yes_no, condition_select, voice, free_text, multi_select
- **Categories**: medical_history, pain, medications, procedures
- **Supports conditional logic** via parentQuestionId and showCondition
- **Belongs to**: Template, TemplateQuestion (parent)
- **Has many**: TemplateQuestions (children), IntakeResponses

## Intake Workflow Models

### IntakeSession

- **Fields**: id, clinicId, templateId, providerId, patientIdentifier, dateOfBirth, gender, status, metadata (JSON), isDeleted, deletedAt
- **Purpose**: Represents a patient intake encounter
- **Status values**: pending, in_progress, completed, cancelled
- **Soft delete**: isDeleted flag for data retention
- **Belongs to**: Clinic, Template, Provider
- **Has many**: IntakeResponses
- **Has one**: PatientSummary

### IntakeResponse

- **Fields**: id, clinicId, intakeSessionId, templateQuestionId, responseData (JSON)
- **Purpose**: Stores patient answers to template questions
- **Flexible JSON storage** for different response types
- **Belongs to**: IntakeSession, TemplateQuestion, Clinic

### PatientSummary

- **Fields**: id, clinicId, intakeSessionId (unique), providerId, aiGeneratedSummary (TEXT), structuredData (JSON), isArchived, archivedAt
- **Purpose**: AI-generated summary of patient intake
- **One-to-one with IntakeSession**
- **Archival support** for data management
- **Belongs to**: IntakeSession, Provider, Clinic

## Billing Models

### Subscription

- **Fields**: id, clinicId, planType, providerCount, stripeSubscriptionId (unique), status, currentPeriodStart, currentPeriodEnd
- **Plan types**: starter, professional, enterprise
- **Status**: active, cancelled, past_due
- **Stripe integration** for payment processing
- **Belongs to**: Clinic
- **Has many**: BillingEvents

### BillingEvent

- **Fields**: id, clinicId, subscriptionId (nullable), eventType, eventData (JSON), amountChange
- **Event types**: subscription_created, provider_added, provider_removed, payment_succeeded, payment_failed
- **Purpose**: Audit trail for billing operations
- **No updatedAt timestamp** (immutable records)
- **Belongs to**: Subscription, Clinic

## Security Models

### UserInvitation

- **Fields**: id, clinicId, invitedByUserId, email, role, token (unique), expiresAt, accepted
- **Role**: provider only
- **Purpose**: Token-based invitation system
- **Belongs to**: Clinic, User (invitedBy)

### PasswordReset

- **Fields**: id, clinicId, userId, token (unique), expiresAt, used
- **Purpose**: Secure password reset flow
- **No updatedAt timestamp**
- **Belongs to**: User, Clinic

### AuditLog

- **Fields**: id, clinicId, userId, action (STRING 100), resourceType (STRING 100), resourceId, ipAddress, userAgent, changes (JSON)
- **Flexible action and resourceType fields** (no database-level enum constraints)
- **Action types** defined in application constants (AUDIT_ACTIONS): user_login, failed_login_attempt, user_created, user_updated, user_deleted, view_summary, export_data, etc.
- **Resource types** defined in application constants (AUDIT_RESOURCE_TYPES): user, patient_summary, intake_session, provider, etc.
- **HIPAA compliance** readiness
- **No updatedAt timestamp** (immutable audit trail)
- **Belongs to**: User, Clinic

## Creating Migrations

```bash
npx sequelize-cli migration:generate --name create-<model-name>
```

### Sequelize DataTypes

- **UUID** with UUIDV4 default for primary keys
- **DATE** for timestamps (not DATETIME)
- **DATEONLY** for dates without time
- **TEXT** for long strings
- **DECIMAL(precision, scale)** for money
- **JSON fields**: Use `TEXT` in migration, `JSON` in model (Sequelize handles conversion for MSSQL)

### Example Migration Pattern

```javascript
module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.createTable('ModelName', {
      id: {
        type: Sequelize.UUID,
        defaultValue: Sequelize.UUIDV4,
        primaryKey: true,
      },
      clinicId: {
        type: Sequelize.UUID,
        allowNull: false,
        references: {
          model: 'Clinics',
          key: 'id',
        },
      },
      createdAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
      updatedAt: {
        type: Sequelize.DATE,
        allowNull: false,
      },
    });
  },
  down: async (queryInterface, Sequelize) => {
    await queryInterface.dropTable('ModelName');
  },
};
```
