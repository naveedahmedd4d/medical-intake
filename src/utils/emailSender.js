/* eslint-disable import/no-unresolved, import/extensions */
import { addEmailToQueue } from './emailQueue';

export const emailSender = async ({ label, receiver, subject, body }) => {
  const job = await addEmailToQueue({ label, receiver, subject, body });
  return { jobId: job.id, receiver, queued: true };
};
