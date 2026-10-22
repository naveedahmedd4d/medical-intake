import "dotenv/config";
import { v4 as uuidv4 } from "uuid";
import db from "../src/models";
import { generateHash } from "../src/utils/helper";

const email = "superadmin@mira.com";
const password = "SuperAdmin123!";

async function main() {
  await db.sequelize.authenticate();
  console.log("DB connected");

  const existing = await db.User.findOne({ where: { email }, paranoid: false });
  if (existing) {
    console.log("ALREADY_EXISTS");
    console.log(`email=${existing.email}`);
    console.log(`role=${existing.role}`);
    console.log(`password=${password}`);
    await db.sequelize.close();
    return;
  }

  const user = await db.User.create({
    id: uuidv4(),
    firstName: "System",
    lastName: "Administrator",
    email,
    password: generateHash(password),
    phone: null,
    clinicId: null,
    role: "super_admin",
  });

  console.log("CREATED");
  console.log(`email=${user.email}`);
  console.log(`role=${user.role}`);
  console.log(`password=${password}`);
  await db.sequelize.close();
}

main().catch(async (err) => {
  console.error("SEED_FAILED:", err.message);
  try {
    await db.sequelize.close();
  } catch (closeErr) {
    console.error("CLOSE_FAILED:", closeErr.message);
  }
  process.exit(1);
});
