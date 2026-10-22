import debug from 'debug';
import models from '../models';

const log = debug('api:audit-helpers');

export async function logFailedAttempt({
  action,
  resourceType,
  email,
  reason,
  req,
  additionalChanges = {},
}) {
  const ipAddress = req.ip || req.connection?.remoteAddress;
  const userAgent = req.get('user-agent');
  const userId = req.auth?.id || null;
  const clinicId = req.auth?.clinicId || null;

  try {
    const { AuditLog: AuditLogModel } = models;
    await AuditLogModel.create({
      userId,
      clinicId,
      action,
      resourceType,
      resourceId: null,
      ipAddress,
      userAgent,
      changes: {
        email,
        reason,
        timestamp: new Date(),
        ...additionalChanges,
      },
    });

    log('Failed %s attempt for email: %s - %s', action, email, reason);
  } catch (auditError) {
    log('Audit log creation failed for %s: %O', action, auditError);
    throw auditError;
  }
}
