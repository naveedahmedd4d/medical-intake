const { SecretClient } = require("@azure/keyvault-secrets");
const { DefaultAzureCredential } = require("@azure/identity");

const credential = new DefaultAzureCredential();

const keyVaultName = "mira-key-vault";
const keyVaultUrl = `https://${keyVaultName}.vault.azure.net`;

// const SECRET_MAP = {
//   "AZURE-OPENAI-API-KEY": "AZURE_OPENAI_API_KEY",
//   "DB-PASSWORD": "DB_PASSWORD",
//   "STRIPE-PUBLISHABLE-KEY": "STRIPE_PUBLISHABLE_KEY",
//   "STRIPE-SECRET-KEY": "STRIPE_SECRET_KEY",
//   "STRIPE-WEBHOOK-SECRET": "STRIPE_WEBHOOK_SECRET",
// };

const SECRET_MAP = {
  "AZURE-OPENAI-API-KEY-PROD": "AZURE_OPENAI_API_KEY",
  "DB-PASSWORD-PROD": "DB_PASSWORD",
  "STRIPE-PUBLISHABLE-KEY-PROD": "STRIPE_PUBLISHABLE_KEY",
  "STRIPE-SECRET-KEY-PROD": "STRIPE_SECRET_KEY",
  "STRIPE-WEBHOOK-SECRET-PROD": "STRIPE_WEBHOOK_SECRET",
};

function printSecret(secret) {
  const { name, value, properties } = secret;
  const { enabled, expiresOn, createdOn } = properties;
  // eslint-disable-next-line no-console
  console.log("Secret:", { name, value, enabled, expiresOn, createdOn });
}

async function main() {
  const client = new SecretClient(keyVaultUrl, credential);

  const secretNames = Object.keys(SECRET_MAP);

  for (const secretName of secretNames) {
    try {
      const getSecretResult = await client.getSecret(secretName);
      const envVarName = SECRET_MAP[secretName];
      console.log(`\n[${secretName}] -> ${envVarName}`);
      printSecret(getSecretResult);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(`Failed to get ${secretName}:`, err.message);
    }
  }
}

/**
 * Loads secrets from Azure Key Vault and populates process.env.
 * Key Vault values override existing env vars when successfully fetched.
 * Silently skips/falls back to .env if Key Vault is unavailable (e.g. local dev).
 */
async function loadKeyVaultSecrets() {
  const client = new SecretClient(keyVaultUrl, credential);
  const secretNames = Object.keys(SECRET_MAP);
  let loaded = 0;

  for (const secretName of secretNames) {
    try {
      const getSecretResult = await client.getSecret(secretName);
      const envVarName = SECRET_MAP[secretName];
      if (getSecretResult.value) {
        process.env[envVarName] = getSecretResult.value;
        loaded += 1;
      }
    } catch (err) {
      // Fall back to .env - no-op (existing process.env value stays)
    }
  }

  if (loaded > 0) {
    // eslint-disable-next-line no-console
    console.log(`[KeyVault] Loaded ${loaded} secrets into process.env`);
  }
}

module.exports = { loadKeyVaultSecrets };

// Only run main() when executed directly (node azure.js)
if (require.main === module) {
  main().catch((error) => {
    // eslint-disable-next-line no-console
    console.error("An error occurred:", error);
    process.exit(1);
  });
}
