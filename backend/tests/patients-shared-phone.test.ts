import "./env.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/config/db.js";
import { api, createQaHospital, loginAs, removeQaHospital, type QaHospital } from "./helpers.js";

// A family often shares one mobile number, so a number must never identify a single patient.
describe("Patients can share a mobile number", () => {
  let h: QaHospital;
  let cookie: string;

  before(async () => {
    h = await createQaHospital();
    cookie = (await loginAs(h.adminEmail, h.adminPassword)).cookie;
  });

  after(async () => {
    await removeQaHospital(h.facilityId);
    await prisma.$disconnect();
  });

  const create = (body: Record<string, unknown>) => api("POST", "/api/patient/create", { cookie, body });

  it("creates several patients with the same mobile number", async () => {
    const a = await create({ name: "Asha Devi", phone: "9876543210", dateOfBirth: "1990-04-02" });
    const b = await create({ name: "Ravi Kumar", phone: "9876543210", dateOfBirth: "2015-08-19" });
    assert.equal(a.status, 201, JSON.stringify(a.json));
    assert.equal(b.status, 201, JSON.stringify(b.json));
    assert.notEqual(a.json.data.id, b.json.data.id);
    assert.notEqual(a.json.data.mrn, b.json.data.mrn);
  });

  it("lets a patient's mobile number be changed to one another patient already has", async () => {
    const a = await create({ name: "Meena Rao", phone: "9000000001", dateOfBirth: "1985-01-12" });
    await create({ name: "Sunil Rao", phone: "9000000002", dateOfBirth: "1983-06-30" });
    const r = await api("PATCH", `/api/patient/${a.json.data.id}`, { cookie, body: { phone: "9000000002" } });
    assert.equal(r.status, 200, JSON.stringify(r.json));
  });

  it("registers from an ABHA alone: no name, no date of birth", async () => {
    const r = await create({ phone: "9000000003" });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    assert.equal(r.json.data.name, "Name pending (from ABHA)");
    assert.equal(r.json.data.dateOfBirth, null);
  });
});
