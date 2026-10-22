# Mira Medical Patient Intake System - Boilerplate Guide

This document explains how to use this boilerplate to build your own medical patient intake system.

## What This Boilerplate Provides

This is a **production-ready Node.js/Express API boilerplate** with the following features already implemented:

### Core Infrastructure ✅
- **Authentication**: JWT-based authentication with Passport.js
- **Authorization**: Granular role-based permissions using AccessControl library
- **Database**: PostgreSQL with Sequelize ORM, migrations, and seeds
- **File Management**: Upload/download with AWS S3 or local storage
- **Background Jobs**: Bull queue system with Redis for async processing
- **Real-time Updates**: WebSocket support for live notifications
- **Email System**: Nodemailer with Handlebars templates
- **API Structure**: Feature-based routing with decorator patterns
- **Testing**: Jest test framework with example tests
- **Security**: CORS, helmet, input validation with Joi
- **Documentation**: Swagger/OpenAPI ready

### What's Been Removed
- All business logic from the original intranet system (courses, blogs, announcements, polls, jobs, etc.)
- Domain-specific models and routes
- Old migrations and seeds (except examples)

### What's Been Kept as Examples
- 1 Migration file (`create-user`)
- 1 Seeder file (`demo-user`)
- 1 Email template (`general.hbs`)
- 1 Test file (`example.test.js`)
- Core routes: user, department, location, group, document, notification
- All middleware, utilities, and configuration files

## Getting Started

### 1. Prerequisites

Install the following on your development machine:
- Node.js >= 14.x
- PostgreSQL >= 12.x
- Redis (for background job queues)
- Git

### 2. Initial Setup

```bash
# Clone or copy this boilerplate
git clone <your-repo-url>
cd mira

# Install dependencies
npm install

# Create your environment file
cp .envtemplate .env

# Edit .env with your actual values
# At minimum, configure: DATABASE_URL, JWT_SECRET, PORT
```

### 3. Database Setup

```bash
# Create PostgreSQL database
createdb mira_db

# Run migrations (this will create the Users table)
npx sequelize-cli db:migrate

# (Optional) Seed with demo admin user
npx sequelize-cli db:seed:all
# Default credentials: admin@example.com / admin123
```

### 4. Create Upload Directory

```bash
mkdir -p public/uploads
```

### 5. Start Development Server

```bash
npm run dev
```

Visit `http://localhost:3000` - you should see the server running!

## Building Your Medical Intake System

### Step 1: Define Your Data Models

Think about what entities you need for your medical intake system:

**Example Models:**
- Patient (demographics, contact info, emergency contact)
- IntakeForm (medical history, current medications, allergies)
- Appointment (date, time, provider, reason)
- Insurance (provider, policy number, group number)
- Consent (type, date signed, document path)
- Provider (doctor/nurse info)
- MedicalRecord (diagnoses, treatments, notes)

### Step 2: Create Your First Feature - Patient Management

#### 2.1 Create Patient Model

```bash
npx sequelize-cli migration:generate --name create-patient
```

Edit the migration file in `src/migrations/`:
```javascript
module.exports = {
  up: async (queryInterface, { INTEGER, STRING, DATE, DATEONLY, ENUM }) => {
    await queryInterface.createTable({
      tableName: 'Patients',
      schema: process.env.SCHEMA_NAME,
    }, {
      id: { type: INTEGER, primaryKey: true, autoIncrement: true },
      firstName: { type: STRING, allowNull: false },
      lastName: { type: STRING, allowNull: false },
      dateOfBirth: { type: DATEONLY, allowNull: false },
      email: { type: STRING, allowNull: false, unique: true },
      phone: { type: STRING, allowNull: false },
      address: { type: STRING },
      city: { type: STRING },
      state: { type: STRING },
      zipCode: { type: STRING },
      emergencyContactName: { type: STRING },
      emergencyContactPhone: { type: STRING },
      status: { type: ENUM('active', 'inactive'), defaultValue: 'active' },
      createdAt: { type: DATE, allowNull: false },
      updatedAt: { type: DATE, allowNull: false },
    });
  },
  down: async (queryInterface) => {
    await queryInterface.dropTable('Patients');
  }
};
```

Create the model file `src/models/patient.model.js`:
```javascript
export default (sequelize, DataTypes) => {
  class Patient extends Model {
    static associate(models) {
      // Define associations here
      // Patient.hasMany(models.Appointment);
      // Patient.hasOne(models.IntakeForm);
    }
  }

  Patient.init({
    firstName: { type: DataTypes.STRING, allowNull: false },
    lastName: { type: DataTypes.STRING, allowNull: false },
    dateOfBirth: { type: DataTypes.DATEONLY, allowNull: false },
    email: { type: DataTypes.STRING, allowNull: false, unique: true },
    phone: { type: DataTypes.STRING, allowNull: false },
    address: DataTypes.STRING,
    city: DataTypes.STRING,
    state: DataTypes.STRING,
    zipCode: DataTypes.STRING,
    emergencyContactName: DataTypes.STRING,
    emergencyContactPhone: DataTypes.STRING,
    status: {
      type: DataTypes.ENUM('active', 'inactive'),
      defaultValue: 'active'
    },
  }, {
    sequelize,
    modelName: 'Patient',
    paranoid: true,
  });

  return Patient;
};
```

Run the migration:
```bash
npx sequelize-cli db:migrate
```

#### 2.2 Create Patient Routes

Create directory: `src/routes/patient/`

Create `src/routes/patient/patient.controller.js`:
```javascript
import models from '../../models';
import { Request, RequestBodyValidator } from '../../utils/decorators';
import { validationSchemas } from './validationSchemas';

class PatientController {
  @Request('/patients', 'GET')
  async getAllPatients(req, res, next) {
    try {
      const patients = await models.Patient.findAll({
        attributes: ['id', 'firstName', 'lastName', 'email', 'phone', 'status'],
        order: [['createdAt', 'DESC']],
      });
      return res.json({ patients });
    } catch (error) {
      next(error);
    }
  }

  @Request('/patients/:id', 'GET')
  async getPatientById(req, res, next) {
    try {
      const patient = await models.Patient.findByPk(req.params.id);
      if (!patient) {
        return res.status(404).json({ message: 'Patient not found' });
      }
      return res.json({ patient });
    } catch (error) {
      next(error);
    }
  }

  @Request('/patients', 'POST')
  @RequestBodyValidator(validationSchemas.createPatient)
  async createPatient(req, res, next) {
    try {
      const patient = await models.Patient.create(req.body);
      return res.status(201).json({ patient });
    } catch (error) {
      next(error);
    }
  }

  @Request('/patients/:id', 'PUT')
  @RequestBodyValidator(validationSchemas.updatePatient)
  async updatePatient(req, res, next) {
    try {
      const patient = await models.Patient.findByPk(req.params.id);
      if (!patient) {
        return res.status(404).json({ message: 'Patient not found' });
      }
      await patient.update(req.body);
      return res.json({ patient });
    } catch (error) {
      next(error);
    }
  }
}

export default new PatientController();
```

Create `src/routes/patient/validationSchemas.js`:
```javascript
import Joi from 'joi';

export const validationSchemas = {
  createPatient: Joi.object({
    firstName: Joi.string().required(),
    lastName: Joi.string().required(),
    dateOfBirth: Joi.date().required(),
    email: Joi.string().email().required(),
    phone: Joi.string().required(),
    address: Joi.string().optional(),
    city: Joi.string().optional(),
    state: Joi.string().optional(),
    zipCode: Joi.string().optional(),
    emergencyContactName: Joi.string().optional(),
    emergencyContactPhone: Joi.string().optional(),
  }),

  updatePatient: Joi.object({
    firstName: Joi.string(),
    lastName: Joi.string(),
    dateOfBirth: Joi.date(),
    email: Joi.string().email(),
    phone: Joi.string(),
    address: Joi.string(),
    city: Joi.string(),
    state: Joi.string(),
    zipCode: Joi.string(),
    emergencyContactName: Joi.string(),
    emergencyContactPhone: Joi.string(),
    status: Joi.string().valid('active', 'inactive'),
  }),
};
```

#### 2.3 Register Patient Routes

Edit `src/routes/index.js` to add your patient route:
```javascript
import patientController from './patient/patient.controller';

// ... existing code ...

router.use(patientController.router);
```

#### 2.4 Update ACL Permissions

Edit `src/utils/constants.js` to add patient resource:
```javascript
export const RESOURCE = {
  // ... existing resources ...
  PATIENT: 'PATIENT',
};

export const FEATURES = [
  // ... existing features ...
  {
    name: 'Patient Management',
    slug: 'PATIENT',
    description: 'Manage patient records and information.',
    url: '/patients',
  },
];
```

### Step 3: Add More Features

Follow the same pattern for:
- **Intake Forms**: Multi-step form data collection
- **Appointments**: Scheduling system with calendar
- **Insurance Verification**: Background job to verify coverage
- **Document Management**: Store consent forms, insurance cards, ID copies
- **Notifications**: Appointment reminders via email/SMS

### Step 4: Implement Medical-Specific Requirements

#### HIPAA Compliance
- Add encryption for PHI (Protected Health Information)
- Implement audit logging for all data access
- Add data retention policies
- Implement secure document storage

#### Integration with EHR Systems
- Add HL7 message parsing
- Implement FHIR API endpoints
- Create data mapping for existing systems

## Directory Structure Best Practices

```
src/
├── routes/
│   ├── patient/              # Patient management
│   ├── intakeForm/           # Intake form processing
│   ├── appointment/          # Appointment scheduling
│   ├── insurance/            # Insurance verification
│   └── medicalRecord/        # Medical records
├── models/
│   ├── patient.model.js
│   ├── intakeForm.model.js
│   ├── appointment.model.js
│   └── insurance.model.js
├── middlewares/
│   └── hipaaCompliance.js    # Add HIPAA-specific middleware
└── utils/
    ├── encryption.js         # PHI encryption utilities
    └── auditLog.js           # Audit logging utilities
```

## Testing Your Features

Create tests following the example in `src/test/integrations/example.test.js`:

```javascript
describe('Patient API', () => {
  it('should create a new patient', async () => {
    const response = await request(app)
      .post('/patients')
      .send({
        firstName: 'John',
        lastName: 'Doe',
        dateOfBirth: '1990-01-01',
        email: 'john.doe@example.com',
        phone: '555-0100',
      });

    expect(response.status).toBe(201);
    expect(response.body.patient.email).toBe('john.doe@example.com');
  });
});
```

Run tests:
```bash
npm test
```

## Deployment

### Build for Production

```bash
npm run build
```

### Environment Variables

Before deploying, ensure all environment variables in `.env` are properly configured:
- Use strong JWT_SECRET
- Configure proper database credentials
- Set up AWS S3 for file storage
- Configure email service (SMTP)
- Set NODE_ENV=production

### Using PM2

```bash
pm2 start npm --name "mira-api" -- run start:prod
pm2 save
pm2 startup
```

## Common Customizations

### Adding New Roles

Edit `src/utils/constants.js`:
```javascript
export const ROLES = {
  ADMIN: 'admin',
  DOCTOR: 'doctor',
  NURSE: 'nurse',
  RECEPTIONIST: 'receptionist',
  PATIENT: 'patient',
};
```

### Adding Background Jobs

1. Define job name in `src/utils/constants.js`
2. Create processor in `src/utils/queues/`
3. Dispatch job from controller

### Adding WebSocket Events

1. Define message type in `WS_MESSAGES` constant
2. Emit from controller using WebSocket connection
3. Listen on frontend

## Getting Help

- Check `CLAUDE.md` for architecture details
- Read `README.md` for setup instructions
- Review example files marked with "BOILERPLATE EXAMPLE"
- Look at `src/routes/user/` for a complete route example

## Next Steps

1. Build your patient intake form UI (React/Vue/Angular)
2. Implement appointment scheduling logic
3. Add insurance verification workflow
4. Set up email/SMS notifications
5. Implement HIPAA compliance features
6. Add EHR integration
7. Create reports and analytics

## Author

Syed Ali Hamza - hamza.syed9995@gmail.com

---

**Remember**: This is a boilerplate - customize it to fit your specific medical intake requirements!
