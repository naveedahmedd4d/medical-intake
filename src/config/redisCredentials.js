export const redis = {
  host: process.env.REDIS_HOST_URL || '127.0.0.1',
  port: process.env.REDIS_PORT || 6379,
};
