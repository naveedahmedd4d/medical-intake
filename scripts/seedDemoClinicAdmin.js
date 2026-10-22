import "dotenv/config";
import { v4 as uuidv4 } from "uuid";
import db from "../src/models";
import { generateHash } from "../src/utils/helper";

const CLINIC_ID = "46c6d95f-76e7-4a2c-90ea-49b51ce5bc26";
const email = "clinicadmin@demo.com";
const password = "ClinicAdmin123!";

async function main() {
  await db.sequelize.authenticate();

  let clinic = await db.Clinic.findByPk(CLINIC_ID);
  if (!clinic) {
    clinic = await db.Clinic.create({
      id: CLINIC_ID,
      clinicName: "Demo Clinic",
      clinicSlug: "demo-clinic",
      subscriptionStatus: "active",
      accountStatus: "active",
      trialDaysRemaining: 0,
      providerCount: 0,
    });
    console.log("Created clinic", clinic.id);
  }

  let user = await db.User.findOne({ where: { email }, paranoid: false });
  if (user) {
    await user.update({
      password: generateHash(password),
      role: "clinic_admin",
      clinicId: CLINIC_ID,
      firstName: "Demo",
      lastName: "Admin",
    });
    console.log("UPDATED");
  } else {
    user = await db.User.create({
      id: uuidv4(),
      firstName: "Demo",
      lastName: "Admin",
      email,
      password: generateHash(password),
      phone: null,
      clinicId: CLINIC_ID,
      role: "clinic_admin",
    });
    console.log("CREATED");
  }

  if (db.UserRole) {
    const existingRole = await db.UserRole.findOne({
      where: { userId: user.id, role: "clinic_admin" },
    });
    if (!existingRole) {
      await db.UserRole.create({
        id: uuidv4(),
        userId: user.id,
        role: "clinic_admin",
      });
    }
  }

  console.log(`email=${email}`);
  console.log(`password=${password}`);
  console.log(`role=clinic_admin`);
  console.log(`clinicId=${CLINIC_ID}`);
  console.log(`clinicName=${clinic.clinicName}`);

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
