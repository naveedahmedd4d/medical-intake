import express from 'express';
import acl from 'express-acl';
import debugObj from 'debug';
import auth from '../middlewares/auth';
import { requireActiveSubscription } from '../middlewares/subscription';
import { handleAclDenial } from '../utils/aclHelpers';
import UserController from './user/user.controller';
import ClinicController from './clinic/clinic.controller';
import ProviderController from './provider/provider.controller';
import BillingController from './billing/billing.controller';
import PricingController from './pricing/pricing.controller';
import PatientSummaryController from './patientSummary/patientSummary.controller';
import PatientIntakeController from './patientIntake/patientIntake.controller';
import TemplateController from './template/template.controller';
import SubscriptionAcceptanceController from './subscriptionAcceptance/subscriptionAcceptance.controller';

const debug = debugObj('api:routes');
const router = express.Router();

acl.config({
  baseUrl: 'api',
  decodedObjectName: 'auth',
  roleSearchPath: 'auth.role',
  denyCallback: handleAclDenial,
  defaultRole: 'guest',
});

const authExcludedRoutes = [
  '/api/users/login',
  '/api/users/validate-email',
  '/api/clinics/register',
  '/api/webhooks/stripe',
  '/api/clinics/onboarding/initiate',
  '/api/clinics/validate-name',
  '/api/providers/accept-invitation',
  '/api/patient-intake/questions',
  '/api/patient-intake',
  /^\/api\/patient-intake\/summary\/.*/,
  /^\/api\/patient-intake\/[^/]+\/[^/]+$/,
  /^\/api-docs\/.*/,
  /^\/api\/providers\/public\/.*/,
  '/api/subscription-acceptances',
  /^\/api\/subscription-acceptances\/by-session\/.+/,
  '/api/pricing/tiers',
];

export const aclExcludedRoutes = [
  ...authExcludedRoutes,
  /^\/api\/templates\/[^/]+\/active$/,
  /^\/api\/templates\/[^/]+\/visible$/,
  /^\/api\/templates\/[^/]+\/questions\/reorder$/,
];

export const subscriptionExcludedRoutes = [
  '/api/users/login',
  '/api/users/validate-email',
  '/api/users/payment-status',
  '/api/clinics/register',
  '/api/clinics/onboarding/initiate',
  '/api/clinics/validate-name',
  '/api/providers/accept-invitation',
  '/api/patient-intake/questions',
  '/api/patient-intake',
  /^\/api\/patient-intake\/summary\/.*/,
  /^\/api\/patient-intake\/[^/]+\/[^/]+$/,
  '/api/webhooks/stripe',
  /^\/api-docs\/.*/,
  '/api/subscription-acceptances',
  /^\/api\/subscription-acceptances\/by-session\/.+/,
  '/api/pricing/tiers',
];

router.use(auth.required.unless({ path: authExcludedRoutes }));

// Multi-role support: Ensure user always has a valid primary role
router.use((req, _res, next) => {
  // Skip excluded routes
  const isExcluded = aclExcludedRoutes.some((route) => {
    if (typeof route === 'string') {
      return req.originalUrl === route;
    }
    return route.test(req.originalUrl);
  });

  if (isExcluded || !req.auth) {
    return next();
  }

  debug('Auth check: path=%s, role=%s, roles=%o', req.path, req.auth.role, req.auth.roles);

  const activeRole = req.headers['x-active-role'];
  if (activeRole) {
    const hasRole =
      req.auth.roles && Array.isArray(req.auth.roles) && req.auth.roles.includes(activeRole);
    const isClinicAdminSwitchingToProvider =
      req.auth.role === 'clinic_admin' &&
      activeRole === 'provider' &&
      (hasRole || !req.auth.roles || !req.auth.roles.includes('provider'));

    if (hasRole || isClinicAdminSwitchingToProvider) {
      req.auth.role = activeRole;
      debug('Using active role from header: %s', req.auth.role);
      return next();
    }
    debug('Active role %s not in available roles: %o', activeRole, req.auth.roles);
  }

  // If user has roles array but no primary role, set primary role to first role
  if (req.auth.roles && Array.isArray(req.auth.roles) && req.auth.roles.length > 0) {
    if (!req.auth.role) {
      const [firstRole] = req.auth.roles;
      req.auth.role = firstRole;
      debug('Set primary role from roles array: %s', req.auth.role);
    }
  } else if (!req.auth.role) {
    // No role at all, set to guest
    req.auth.role = 'guest';
    debug('No role found, setting to guest');
  }

  return next();
});

router.use(acl.authorize.unless({ path: aclExcludedRoutes }));

router.use((req, res, next) => {
  const isExcluded = subscriptionExcludedRoutes.some((route) => {
    if (typeof route === 'string') {
      return req.path === route.replace('/api', '');
    }
    return route.test(req.path);
  });

  if (isExcluded) {
    return next();
  }

  return requireActiveSubscription(req, res, next);
});

router.use('/users', UserController.getRouter());
router.use('/clinics', ClinicController.getRouter());
router.use('/providers', ProviderController.getRouter());
router.use('/billing', BillingController.getRouter());
router.use('/pricing', PricingController.getRouter());
router.use('/patient-summaries', PatientSummaryController.getRouter());
router.use('/patient-intake', PatientIntakeController.getRouter());
router.use('/templates', TemplateController.getRouter());
router.use('/questions', TemplateController.getQuestionsRouter());
router.use('/subscription-acceptances', SubscriptionAcceptanceController.getRouter());

export default router;
