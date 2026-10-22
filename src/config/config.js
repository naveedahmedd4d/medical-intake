import "dotenv/config";

const dialect = process.env.DB_DIALECT || "postgres";

const postgresDialectOptions =
  dialect === "postgres"
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      }
    : {
        options: {
          encrypt: process.env.DB_ENCRYPT === "true" || false,
          trustServerCertificate: process.env.DB_TRUST_CERT === "true" || true,
          enableArithAbort: true,
          requestTimeout: 30000,
        },
      };

const productionDialectOptions =
  dialect === "postgres"
    ? {
        ssl: {
          require: true,
          rejectUnauthorized: false,
        },
      }
    : {
        options: {
          encrypt: process.env.DB_ENCRYPT === "true",
          trustServerCertificate: process.env.DB_TRUST_CERT === "true",
          enableArithAbort: true,
        },
      };

export default {
  development: {
    username: process.env.DB_USER || "sa",
    password: process.env.DB_PASSWORD || "admin",
    database: process.env.DB_NAME || "mira_local",
    host: process.env.DB_HOST || "localhost",
    port:
      parseInt(process.env.DB_PORT, 10) ||
      (dialect === "postgres" ? 5432 : 1433),
    dialect,
    dialectOptions: postgresDialectOptions,
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
    logging: false,
  },
  test: {
    dialect: "sqlite",
    storage: ":memory:",
  },
  production: {
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    host: process.env.DB_HOST,
    type: "default",
    port: process.env.DB_PORT || (dialect === "postgres" ? 5432 : 1433),
    dialect,
    dialectOptions: productionDialectOptions,
    logging: false,
  },
};
