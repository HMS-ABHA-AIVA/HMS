import "./env.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/config/db.js";
import { occupyBed, releaseBed, bedIsTakeable } from "../src/modules/beds/beds.service.js";
import { api, createQaHospital, loginAs, removeQaHospital, strongPassword, type QaHospital } from "./helpers.js";

describe("Stage 1: beds and housekeeping", () => {
  let h: QaHospital;
  const cookies: Record<string, string> = {};

  const newBed = async (ward: string, bedNo: string) => {
    const r = await api("POST", "/api/beds", { cookie: cookies.admin!, body: { ward, bedNo } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json.data as { id: string; status: string };
  };
  const newPatient = async (name: string, phone: string) => {
    const r = await api("POST", "/api/patient/create", { cookie: cookies.admin!, body: { name, phone } });
    assert.equal(r.status, 201, JSON.stringify(r.json));
    return r.json.data as { id: string; name: string };
  };
  const bedById = async (id: string) => (await api("GET", "/api/beds", { cookie: cookies.admin! })).json.data.find((b: any) => b.id === id);

  before(async () => {
    h = await createQaHospital();
    cookies.admin = (await loginAs(h.adminEmail, h.adminPassword)).cookie;
    for (const [role, name] of [["doctor", "Dora Doctor"], ["nurse", "Nina Nurse"], ["housekeeping", "Hari Housekeeping"], ["front_office", "Fiona Front"], ["pharmacist", "Paul Pharmacist"]] as const) {
      const email = `qa-${role}-${Date.now()}@example.test`;
      const password = strongPassword();
      const made = await api("POST", "/api/staff", { cookie: cookies.admin!, body: { name, role, department: "Ward", login: { email, password } } });
      assert.equal(made.status, 201, JSON.stringify(made.json));
      cookies[role] = (await loginAs(email, password)).cookie;
    }
  });

  after(async () => {
    await prisma.housekeepingLog.deleteMany({ where: { facilityId: h.facilityId } });
    await prisma.bed.deleteMany({ where: { facilityId: h.facilityId } });
    await removeQaHospital(h.facilityId);
    await prisma.$disconnect();
  });

  it("refuses without a login", async () => {
    assert.equal((await api("GET", "/api/beds")).status, 401);
    assert.equal((await api("GET", "/api/beds/housekeeping-log")).status, 401);
  });

  describe("who may do what", () => {
    it("lets ward-side roles see beds and refuses a pharmacist", async () => {
      for (const role of ["admin", "doctor", "nurse", "housekeeping", "front_office"]) {
        assert.equal((await api("GET", "/api/beds", { cookie: cookies[role]! })).status, 200, role);
      }
      assert.equal((await api("GET", "/api/beds", { cookie: cookies.pharmacist! })).status, 403);
    });

    it("only an administrator adds a bed", async () => {
      for (const role of ["doctor", "nurse", "housekeeping", "front_office"]) {
        assert.equal((await api("POST", "/api/beds", { cookie: cookies[role]!, body: { ward: "General", bedNo: "X1" } })).status, 403, role);
      }
      assert.equal((await api("POST", "/api/beds", { cookie: cookies.admin!, body: { ward: "General", bedNo: "A1" } })).status, 201);
    });

    it("reservations are for front office, nurses and admins; cleaning for housekeeping, nurses and admins", async () => {
      const bed = await newBed("Roles", "R1");
      assert.equal((await api("POST", `/api/beds/${bed.id}/reserve`, { cookie: cookies.doctor!, body: { reservedFor: "Someone" } })).status, 403);
      assert.equal((await api("POST", `/api/beds/${bed.id}/reserve`, { cookie: cookies.housekeeping!, body: { reservedFor: "Someone" } })).status, 403);
      assert.equal((await api("POST", `/api/beds/${bed.id}/reserve`, { cookie: cookies.front_office!, body: { reservedFor: "Someone" } })).status, 200);
      assert.equal((await api("POST", `/api/beds/${bed.id}/clear-reservation`, { cookie: cookies.doctor! })).status, 403);

      await prisma.bed.update({ where: { id: bed.id }, data: { status: "dirty" } });
      assert.equal((await api("POST", `/api/beds/${bed.id}/start-cleaning`, { cookie: cookies.front_office! })).status, 403);
      assert.equal((await api("POST", `/api/beds/${bed.id}/start-cleaning`, { cookie: cookies.doctor! })).status, 403);
      assert.equal((await api("POST", `/api/beds/${bed.id}/start-cleaning`, { cookie: cookies.housekeeping! })).status, 200);
    });
  });

  describe("adding beds", () => {
    it("rejects bad input and a duplicate bed", async () => {
      assert.equal((await api("POST", "/api/beds", { cookie: cookies.admin!, body: { ward: "", bedNo: "1" } })).status, 400);
      await newBed("Duplicates", "D1");
      const dup = await api("POST", "/api/beds", { cookie: cookies.admin!, body: { ward: "Duplicates", bedNo: "D1" } });
      assert.equal(dup.status, 409);
      assert.equal(dup.json.code, "BED_EXISTS");
    });

    it("the same ward and number can exist in another hospital", async () => {
      const other = await createQaHospital();
      try {
        const theirs = (await loginAs(other.adminEmail, other.adminPassword)).cookie;
        await newBed("Shared Name", "S1");
        assert.equal((await api("POST", "/api/beds", { cookie: theirs, body: { ward: "Shared Name", bedNo: "S1" } })).status, 201);
        assert.equal((await api("GET", "/api/beds", { cookie: theirs })).json.data.length, 1, "only their own bed");
      } finally {
        await prisma.bed.deleteMany({ where: { facilityId: other.facilityId } });
        await removeQaHospital(other.facilityId);
      }
    });
  });

  describe("reservations", () => {
    it("reserves a vacant bed for a registered patient or for a name, and clears it", async () => {
      const bed = await newBed("Reserve", "V1");
      const patient = await newPatient("Reserved Patient", "9400000001");
      const r = await api("POST", `/api/beds/${bed.id}/reserve`, { cookie: cookies.nurse!, body: { patientId: patient.id, note: "Planned surgery" } });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      assert.equal(r.json.data.status, "reserved");
      assert.equal(r.json.data.reservedPatient.name, "Reserved Patient");
      assert.equal(r.json.data.reservedNote, "Planned surgery");

      const cleared = await api("POST", `/api/beds/${bed.id}/clear-reservation`, { cookie: cookies.nurse! });
      assert.equal(cleared.status, 200);
      assert.equal(cleared.json.data.status, "vacant");
      assert.equal(cleared.json.data.reservedPatient, null);

      const byName = await api("POST", `/api/beds/${bed.id}/reserve`, { cookie: cookies.nurse!, body: { reservedFor: "Walk-in family" } });
      assert.equal(byName.json.data.reservedFor, "Walk-in family");
    });

    it("refuses a bed that is not vacant, a past end time, no name, and an unknown patient", async () => {
      const bed = await newBed("Reserve", "V2");
      await api("POST", `/api/beds/${bed.id}/reserve`, { cookie: cookies.nurse!, body: { reservedFor: "First Person" } });
      const again = await api("POST", `/api/beds/${bed.id}/reserve`, { cookie: cookies.nurse!, body: { reservedFor: "Second Person" } });
      assert.equal(again.status, 409);
      assert.equal(again.json.code, "BED_NOT_VACANT");

      const free = await newBed("Reserve", "V3");
      const past = await api("POST", `/api/beds/${free.id}/reserve`, { cookie: cookies.nurse!, body: { reservedFor: "Late", until: "2020-01-01T00:00:00+05:30" } });
      assert.equal(past.status, 409);
      assert.equal(past.json.code, "RESERVATION_IN_PAST");
      assert.equal((await api("POST", `/api/beds/${free.id}/reserve`, { cookie: cookies.nurse!, body: {} })).status, 400);
      assert.equal((await api("POST", `/api/beds/${free.id}/reserve`, { cookie: cookies.nurse!, body: { patientId: "00000000-0000-4000-8000-000000000000" } })).status, 404);
      assert.equal((await api("POST", `/api/beds/${free.id}/clear-reservation`, { cookie: cookies.nurse! })).json.code, "BED_NOT_RESERVED");
    });

    it("two people reserving the same bed at once: exactly one wins", async () => {
      const bed = await newBed("Race", "C1");
      const [a, b] = await Promise.all([
        api("POST", `/api/beds/${bed.id}/reserve`, { cookie: cookies.nurse!, body: { reservedFor: "Racer One" } }),
        api("POST", `/api/beds/${bed.id}/reserve`, { cookie: cookies.front_office!, body: { reservedFor: "Racer Two" } }),
      ]);
      assert.deepEqual([a.status, b.status].sort(), [200, 409]);
    });

    it("a lapsed reservation can still be taken", async () => {
      const bed = await newBed("Lapse", "L1");
      await prisma.bed.update({ where: { id: bed.id }, data: { status: "reserved", reservedFor: "Gone", reservedUntil: new Date(Date.now() - 60_000) } });
      const row = await bedById(bed.id);
      assert.equal(row.reservationLapsed, true);
      assert.equal(bedIsTakeable({ status: "reserved", reservedPatientId: null, reservedUntil: new Date(Date.now() - 60_000) }, "anyone"), true);
      assert.equal(bedIsTakeable({ status: "reserved", reservedPatientId: "p1", reservedUntil: new Date(Date.now() + 60_000) }, "p2"), false);
      assert.equal(bedIsTakeable({ status: "reserved", reservedPatientId: "p1", reservedUntil: null }, "p1"), true);
      assert.equal(bedIsTakeable({ status: "occupied", reservedPatientId: null, reservedUntil: null }, "p1"), false);
    });
  });

  describe("occupying, releasing and the housekeeping pipeline", () => {
    it("an admission occupies a bed, a discharge makes it dirty, then it is cleaned and vacant again", async () => {
      const bed = await newBed("Pipeline", "P1");
      const patient = await newPatient("Pipeline Patient", "9400000002");

      await prisma.$transaction((tx) => occupyBed(tx, bed.id, patient.id, "visit-1"));
      let row = await bedById(bed.id);
      assert.equal(row.status, "occupied");
      assert.equal(row.patient.name, "Pipeline Patient");
      assert.equal((await api("POST", `/api/beds/${bed.id}/start-cleaning`, { cookie: cookies.nurse! })).json.code, "BED_WRONG_STATE", "an occupied bed cannot be cleaned");

      await prisma.$transaction((tx) => releaseBed(tx, h.facilityId, bed.id, "qa-system"));
      row = await bedById(bed.id);
      assert.equal(row.status, "dirty");
      assert.equal(row.patient, null);

      assert.equal((await api("POST", `/api/beds/${bed.id}/complete-cleaning`, { cookie: cookies.housekeeping! })).json.code, "BED_WRONG_STATE", "cannot complete what was not started");
      const started = await api("POST", `/api/beds/${bed.id}/start-cleaning`, { cookie: cookies.housekeeping! });
      assert.equal(started.json.data.status, "cleaning");
      const done = await api("POST", `/api/beds/${bed.id}/complete-cleaning`, { cookie: cookies.housekeeping! });
      assert.equal(done.json.data.status, "vacant");
      assert.equal((await api("POST", `/api/beds/${bed.id}/complete-cleaning`, { cookie: cookies.housekeeping! })).status, 409);
    });

    it("keeps a turnover log, newest first, with who did each step", async () => {
      const log = (await api("GET", "/api/beds/housekeeping-log?limit=20", { cookie: cookies.nurse! })).json.data;
      const mine = log.filter((l: any) => l.ward === "Pipeline");
      assert.deepEqual(mine.map((l: any) => l.action), ["cleaning_completed", "cleaning_started", "discharge_release"]);
      assert.ok(mine[0].by.includes("housekeeping"), "the person who cleaned it is recorded");
      assert.equal((await api("GET", "/api/beds/housekeeping-log?limit=0", { cookie: cookies.nurse! })).status, 400);
    });

    it("one hospital cannot touch another's beds", async () => {
      const other = await createQaHospital();
      try {
        const theirs = (await loginAs(other.adminEmail, other.adminPassword)).cookie;
        const bed = await newBed("Private", "Z1");
        assert.equal((await api("POST", `/api/beds/${bed.id}/reserve`, { cookie: theirs, body: { reservedFor: "Intruder" } })).status, 404);
        assert.equal((await api("POST", `/api/beds/${bed.id}/clear-reservation`, { cookie: theirs })).status, 404);
        assert.equal((await bedById(bed.id)).status, "vacant");
      } finally {
        await removeQaHospital(other.facilityId);
      }
    });
  });

  it("writes the changes to the audit trail", async () => {
    const actions = (await api("GET", "/api/audit-log?limit=200", { cookie: cookies.admin! })).json.data.map((e: any) => e.action);
    for (const wanted of ["Bed Added", "Bed Reserved", "Bed Reservation Cleared", "Bed Cleaning Started", "Bed Cleaning Completed"]) {
      assert.ok(actions.includes(wanted), `has "${wanted}"`);
    }
  });
});
