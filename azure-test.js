const { SecretClient } = require("@azure/keyvault-secrets");
const { DefaultAzureCredential } = require("@azure/identity");

const credential = new DefaultAzureCredential();

const keyVaultName = "mira-key-vault";
const keyVaultUrl = `https://${keyVaultName}.vault.azure.net`;

const SECRET_MAP = {
  "AZURE-OPENAI-API-KEY": "AZURE_OPENAI_API_KEY",
  "DB-PASSWORD": "DB_PASSWORD",
  "STRIPE-PUBLISHABLE-KEY": "STRIPE_PUBLISHABLE_KEY",
  "STRIPE-SECRET-KEY": "STRIPE_SECRET_KEY",
  "STRIPE-WEBHOOK-SECRET": "STRIPE_WEBHOOK_SECRET",
};

function printSecret(secret) {
  const { name, value, properties } = secret;
  const { enabled, expiresOn, createdOn } = properties;
  // eslint-disable-next-line no-console
  console.log("Secret:", { name, value, enabled, expiresOn, createdOn });
}

async function main() {
  const client = new SecretClient(keyVaultUrl, credential);
  console.log("client", client);
  const secreKeyName = "DB-PASSWORD";

  const getSecretData = await client.getSecret(secreKeyName);
  console.log("secreKeyName", getSecretData);
}

main().catch((error) => {
  // eslint-disable-next-line no-console
  console.error("An error occurred:", error);
  process.exit(1);
});
