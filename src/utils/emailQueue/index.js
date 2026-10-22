import { Queue, Worker } from 'bullmq';
import debugObj from 'debug';
import { EmailClient } from '@azure/communication-email';
import path from 'path';
import fs from 'fs';
import Handlebars from 'handlebars';
import { redis } from '../../config/redisCredentials';
import { QUEUE_NAMES } from '../constants';

const debug = debugObj('api:email-queue');

const { AZURE_COMMUNICATION_CONNECTION_STRING, AZURE_SENDER_EMAIL } = process.env;

const generalContent = fs.readFileSync(
  path.resolve(__dirname, '../../templates/general.hbs'),
  'utf8'
);
const emailTemplate = Handlebars.compile(generalContent);

let client;
const getEmailClient = () => {
  if (!client) {
    if (!AZURE_COMMUNICATION_CONNECTION_STRING) {
      throw new Error(
        'AZURE_COMMUNICATION_CONNECTION_STRING is not configured in environment variables'
      );
    }
    client = new EmailClient(AZURE_COMMUNICATION_CONNECTION_STRING);
  }
  return client;
};

const { EMAIL_QUEUE } = QUEUE_NAMES;

const connection = {
  host: redis.host,
  port: redis.port,
  maxRetriesPerRequest: null,
};

export const emailQueue = new Queue(EMAIL_QUEUE, {
  connection,
  defaultJobOptions: {
    removeOnComplete: true,
    removeOnFail: false,
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
  },
});

export const emailWorker = new Worker(
  EMAIL_QUEUE,
  async (job) => {
    const { receiver, subject, body, label } = job.data;

    const emailMessage = {
      senderAddress: AZURE_SENDER_EMAIL,
      content: {
        subject,
        html: emailTemplate(body),
      },
      recipients: {
        to: [{ address: receiver }],
      },
    };

    if (label) {
      emailMessage.headers = {
        'X-Sender-Name': label,
      };
    }

    const emailClient = getEmailClient();
    const poller = await emailClient.beginSend(emailMessage);
    const result = await poller.pollUntilDone();

    debug(`Email sent successfully to ${receiver}:`, result.id);
    return result;
  },
  { connection }
);

emailWorker.on('failed', (job, error) => {
  debug(`Email job failed for ${job?.data?.receiver}: ${error.message}`);
  debug(`Job will be retried. Attempt ${job.attemptsMade} of ${job.opts.attempts}`);
});

emailWorker.on('completed', (job) => {
  debug(`Email job completed for ${job?.data?.receiver}`);
});

export const addEmailToQueue = async ({ label, receiver, subject, body }) => {
  const job = await emailQueue.add(
    'send-email',
    {
      label,
      receiver,
      subject,
      body,
    },
    {
      priority: 1,
    }
  );

  debug(`Email job added to queue for ${receiver} with job ID: ${job.id}`);
  return job;
};
