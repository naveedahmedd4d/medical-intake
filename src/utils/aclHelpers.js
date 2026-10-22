import debugObj from 'debug';
import { logFailedAttempt } from './auditHelpers';
import { AUDIT_ACTIONS, AUDIT_RESOURCE_TYPES } from './constants';

const debug = debugObj('api:acl-audit');

const PHI_RESOURCES = ['patient-summaries', 'patient-intake', 'intake-sessions'];

const getResourceTypeFromPath = (path) => {
  if (path.includes('patient-summaries') || path.includes('patient-intake')) {
    return AUDIT_RESOURCE_TYPES.PATIENT_SUMMARY;
  }
  if (path.includes('providers')) {
    return AUDIT_RESOURCE_TYPES.PROVIDER;
  }
  if (path.includes('clinics')) {
    return AUDIT_RESOURCE_TYPES.CLINIC;
  }
  return AUDIT_RESOURCE_TYPES.USER;
};

export const handleAclDenial = async (res) => {
  const { req } = res;

  const isPHIResource = PHI_RESOURCES.some((resource) => req.path.includes(resource));

  if (isPHIResource || req.auth?.id) {
    try {
      await logFailedAttempt({
        action: AUDIT_ACTIONS.UNAUTHORIZED_ACCESS_ATTEMPT,
        resourceType: getResourceTypeFromPath(req.path),
        email: req.auth?.email || 'unauthenticated',
        reason: 'ACL denied access to resource',
        req,
        additionalChanges: {
          attemptedPath: req.path,
          attemptedMethod: req.method,
          userRole: req.auth?.role || 'none',
          clinicId: req.auth?.clinicId || null,
        },
      });
      debug(
        'ACL denial audited: %s %s by %s',
        req.method,
        req.path,
        req.auth?.email || 'unauthenticated'
      );
    } catch (auditError) {
      debug('Failed to audit ACL denial: %O', auditError);
    }
  }

  return res.status(403).json({
    status: 'error',
    message: 'Access denied',
  });
};
