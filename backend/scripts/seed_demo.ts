import "dotenv/config";
import { randomBytes } from "crypto";
import { appendFileSync } from "fs";
import bcrypt from "bcrypt";
import { prisma } from "../src/config/db.js";

// Creates a demo facility + staff login for LOCAL development only.
//  - Refuses to run against production.
//  - Never uses a fixed password: pass SEED_PASSWORD, or one is generated and written to the
//    git-ignored backend/.local-credentials.txt (it is not printed).
if (process.env.NODE_ENV === "production") {
  console.error("Refusing to seed demo accounts when NODE_ENV=production.");
  process.exit(1);
}

const FACILITY_EMAIL = process.env.SEED_FACILITY_EMAIL ?? "admin@hospital.com";
const STAFF_EMAIL = process.env.SEED_STAFF_EMAIL ?? "admin@hospital.com";

async function main() {
  console.log("Seeding demo facility and staff...");

  const generated = !process.env.SEED_PASSWORD;
  const password = process.env.SEED_PASSWORD ?? randomBytes(12).toString("base64url");
  if (password.length < 10) {
    throw new Error("SEED_PASSWORD must be at least 10 characters.");
  }

  const facilityPassword = await bcrypt.hash(password, 10);
  const staffPassword = await bcrypt.hash(password, 12);

  const facility = await prisma.facility.upsert({
    where: { email: FACILITY_EMAIL },
    update: {
      passwordHash: facilityPassword,
    },
    create: {
      name: "City General Hospital",
      email: FACILITY_EMAIL,
      hfrId: "IN2410001234",
      passwordHash: facilityPassword,
    },
  });
  console.log("✔ Facility ready:", facility.email, "(ID:", facility.id, ")");

  const staffAdmin = await prisma.user.upsert({
    where: { email: STAFF_EMAIL },
    update: {
      passwordHash: staffPassword,
      facilityId: facility.id,
    },
    create: {
      name: "Asha Verma",
      email: STAFF_EMAIL,
      facilityId: facility.id,
      passwordHash: staffPassword,
    },
  });
  console.log("✔ Staff admin ready:", staffAdmin.email, "(ID:", staffAdmin.id, ")");

  if (generated) {
    appendFileSync(
      new URL("../.local-credentials.txt", import.meta.url),
      `${new Date().toISOString()}  facility ${FACILITY_EMAIL} / staff ${STAFF_EMAIL}  password: ${password}\n`,
    );
    console.log("A password was generated and saved to backend/.local-credentials.txt (git-ignored).");
  }
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
