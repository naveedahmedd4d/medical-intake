require('dotenv').config();

const dialect = process.env.DB_DIALECT || 'postgres';

const sslOptions =
  dialect === 'postgres'
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      }
    : {
        options: {
          encrypt: process.env.DB_ENCRYPT === 'true',
          trustServerCertificate: process.env.DB_TRUST_CERT === 'true',
          enableArithAbort: true,
        },
      };

const shared = {
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT, 10) || (dialect === 'postgres' ? 5432 : 1433),
  dialect,
  dialectOptions: sslOptions,
  logging: false,
};

module.exports = {
  development: shared,
  test: {
    dialect: 'sqlite',
    storage: ':memory:',
  },
  production: shared,
};
