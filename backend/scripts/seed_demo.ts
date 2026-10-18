import { prisma } from "../src/config/db.js";
import bcrypt from "bcrypt";

async function main() {
  console.log("Seeding demo facility and staff...");
  const facilityPassword = await bcrypt.hash("password", 10);
  const staffPassword = await bcrypt.hash("password", 12);

  const facility = await prisma.facility.upsert({
    where: { email: "admin@hospital.com" },
    update: {
      passwordHash: facilityPassword,
    },
    create: {
      name: "City General Hospital",
      email: "admin@hospital.com",
      hfrId: "IN2410001234",
      passwordHash: facilityPassword,
    },
  });
  console.log("✔ Facility ready:", facility.email, "(ID:", facility.id, ")");

  const staffAdmin = await prisma.user.upsert({
    where: { email: "admin@hospital.com" },
    update: {
      passwordHash: staffPassword,
      facilityId: facility.id,
    },
    create: {
      name: "Asha Verma",
      email: "admin@hospital.com",
      facilityId: facility.id,
      passwordHash: staffPassword,
    },
  });
  console.log("✔ Staff admin ready:", staffAdmin.email, "(ID:", staffAdmin.id, ")");
}

main()
  .catch((e) => {
    console.error("Seed failed:", e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
