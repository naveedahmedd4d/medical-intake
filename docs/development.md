# Development Guide

## Common Workflows

### Adding a New Feature/Resource

1. Create directory: `src/routes/<feature>/`
2. Add controller with static methods and decorators (see `src/routes/user/` example)
3. Create query file for complex Sequelize queries
4. Add validation schemas using Joi (use modern `schema.validate()` API)
5. Create Sequelize model in `src/models/` with ES6 class and static `associate()` method
6. Add migration: `npx sequelize-cli migration:generate --name create-feature`
7. Register route in `src/routes/index.js` using `router.use()`
8. Add to `aclExcludedRoutes` if public endpoint

### Example Files (Use as Templates)

- **Migration**: [src/migrations/20210301081630-create-user.js](../src/migrations/20210301081630-create-user.js)
- **Seeder**: [src/seeders/20210202112802-demo-user.js](../src/seeders/20210202112802-demo-user.js)
- **Model**: [src/models/user.model.js](../src/models/user.model.js)
- **Controller**: [src/routes/user/user.controller.js](../src/routes/user/user.controller.js)
- **Query**: [src/routes/user/query.js](../src/routes/user/query.js)
- **Validation**: [src/routes/user/validationSchemas.js](../src/routes/user/validationSchemas.js)
- **Template**: [src/templates/general.hbs](../src/templates/general.hbs)

## Working with Decorators

```javascript
@RequestBodyValidator(userUpdateSchema)
@Request
static async updateUser(req, res) { ... }
```

The decorator calls `schema.validate(req.body)` internally and returns `BadRequestError` if validation fails, preventing the controller method from executing.

## Working with Queries

```javascript
export const listQuery = ({ searchString, pageNumber, pageSize }) => {
  const query = { where: {} };
  if (searchString) {
    query.where[Op.or] = [
      { email: { [Op.like]: `%${searchString}%` } }
    ];
  }
  query.offset = (pageNumber - 1) * pageSize;
  query.limit = pageSize;
  return query;
};

const users = await User.findAndCountAll(listQuery(req.query));
```

## Implementing Tenant Isolation

Always filter by clinicId in controllers:

```javascript
const sessions = await IntakeSession.findAll({
  where: {
    clinicId: req.auth.clinicId,
    status: 'completed'
  }
});
```

For super_admin users, skip clinicId filter when needed:

```javascript
const where = {};
if (req.auth.role !== 'super_admin') {
  where.clinicId = req.auth.clinicId;
}
const clinics = await Clinic.findAll({ where });
```

See [Multi-Tenancy](multi-tenancy.md) for complete details.

## Medical Intake Features

### Template Question System

**Question Types:**
- `yes_no`: Boolean response
- `condition_select`: Dropdown selection
- `voice`: Voice recording
- `free_text`: Text input
- `multi_select`: Multiple choice

**Categories:**
- `medical_history`: Patient history
- `pain`: Pain assessment
- `medications`: Current medications
- `procedures`: Past procedures

**Conditional Logic:**
- `parentQuestionId`: Creates question hierarchy
- `showCondition` (JSON): Determines when question appears
- `position`: Controls question ordering
- Supports nested/branching intake flows

### Intake Workflow

1. Provider selects Template for patient
2. IntakeSession created with patient identifier
3. Patient answers TemplateQuestions
4. IntakeResponses stored in JSON format
5. AI generates PatientSummary from responses
6. Provider reviews summary and completes session

### Subscription & Billing

**Plan Types:**
- `starter`: Entry-level plan
- `professional`: Mid-tier plan
- `enterprise`: Full-featured plan

**Trial Management:**
- Default 2-day trial for new clinics
- `trialDaysRemaining` countdown
- `trialEndsAt` timestamp
- Status changes to trial_expired when trial ends

**Stripe Integration:**
- `stripeCustomerId` on Clinic
- `stripeSubscriptionId` on Subscription
- BillingEvents track all payment activity

## Troubleshooting

### Common Issues

**"Cannot read properties of undefined"**
- Check if all imported constants exist in `src/utils/constants.js`
- Verify middleware files exist and exports are correct

**"No authorization token was found"**
- Add route to `aclExcludedRoutes` in `src/routes/index.js`
- Or include `Authorization: Bearer <token>` header

**"Invalid credentials"**
- Ensure password hashing matches (crypto.pbkdf2Sync with SALT env var)
- Check user exists in database with correct email

**Database connection fails**
- Verify SQL Server 2022 is running
- Check TCP/IP protocol is enabled in SQL Server Configuration Manager
- Verify SQL Server Authentication is enabled
- Test connection string in `.env`

**Environment variables not loading**
- Ensure `import 'dotenv/config'` is first line in `src/server.js`
- Check `.env` file exists and has correct format

**Tenant data leakage**
- Always filter by `clinicId` in controllers
- Test with multiple clinics to verify isolation
- Review query logic for missing tenant filters

## Important Notes

- **Environment Variables**: Must add `import 'dotenv/config'` at top of `src/server.js` for JWT_SECRET to load
- **Password Hashing**: Uses `crypto.pbkdf2Sync()` with `process.env.SALT` - NOT bcrypt
- **Main Branches**: Both `main` and `master` are synced and contain same code
- **Babel**: Uses Babel for ES6+ features; dev uses babel-node with `--inspect` flag
- **Debugging**: Set `DEBUG=api:*` environment variable (Windows: `set DEBUG=api:*`)
- **Windows Development**: Commands use `set` for env vars (not `export`)
- **Port Management**: Use `npx kill-port 3000` to kill port if needed
- **No Comments**: User requirement - do not add comments to code
- **UUID Primary Keys**: All models use UUID v4, not auto-increment integers
- **Multi-Tenancy**: Manual clinicId filtering required in all controllers
- **Commit Messages**: Never include Claude Code co-authorship or attribution in commits
- **JSON Fields**: Use `TEXT` in migrations for MSSQL compatibility, `JSON` type in models (Sequelize handles conversion)

## Next Steps

Routes and controllers needed for:
- Clinics management (CRUD operations)
- Providers management (specialty, license info)
- ClinicLocations management
- Templates (create, edit, activate)
- TemplateQuestions (conditional logic setup)
- IntakeSessions (patient intake workflow)
- IntakeResponses (capture patient answers)
- PatientSummaries (AI generation, review)
- Subscriptions (plan management, Stripe)
- BillingEvents (billing history)
- UserInvitations (invite providers)
- PasswordResets (reset flow)
- AuditLogs (compliance reporting)
