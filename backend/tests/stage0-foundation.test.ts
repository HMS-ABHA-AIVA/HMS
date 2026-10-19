import "./env.js";
import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { prisma } from "../src/config/db.js";
import { api, createQaHospital, loginAs, removeQaHospital, strongPassword, type QaHospital } from "./helpers.js";

describe("Stage 0: roles, staff, settings, profile, audit, MRN", () => {
  let h: QaHospital;
  let admin = "";

  before(async () => {
    h = await createQaHospital();
    const login = await loginAs(h.adminEmail, h.adminPassword);
    assert.equal(login.status, 200, "admin can sign in");
    assert.equal(login.json.data.role, "admin", "login reports the role");
    admin = login.cookie;
  });

  after(async () => {
    await removeQaHospital(h.facilityId);
    await prisma.$disconnect();
  });

  it("refuses everything without a login", async () => {
    for (const path of ["/api/staff", "/api/settings", "/api/facility-profile", "/api/audit-log"]) {
      assert.equal((await api("GET", path)).status, 401, path);
    }
  });

  describe("staff and roles", () => {
    let doctorId = "";
    let doctorEmail = "";
    let doctorPassword = "";
    let doctorCookie = "";

    it("lists the administrator that exists", async () => {
      const r = await api("GET", "/api/staff", { cookie: admin });
      assert.equal(r.status, 200);
      assert.equal(r.json.data.length, 1);
      assert.equal(r.json.data[0].role, "admin");
      assert.equal(r.json.data[0].hasLogin, true);
    });

    it("adds a doctor with a login", async () => {
      doctorEmail = `qa-doc-${Date.now()}@example.test`;
      doctorPassword = strongPassword();
      const r = await api("POST", "/api/staff", {
        cookie: admin,
        body: { name: "Dr Qa Tester", role: "doctor", department: "Medicine", hprId: "qa.doctor@hpr.abdm", monthlySalary: 90000, consultationFee: 750, bankAccountLast4: "1234", login: { email: doctorEmail, password: doctorPassword } },
      });
      assert.equal(r.status, 201, JSON.stringify(r.json));
      assert.equal(r.json.data.role, "doctor");
      assert.equal(r.json.data.hasLogin, true);
      assert.equal(r.json.data.opdFee, 750);
      doctorId = r.json.data.id;
    });

    it("the doctor signs in and sees the role", async () => {
      const r = await loginAs(doctorEmail, doctorPassword);
      assert.equal(r.status, 200);
      assert.equal(r.json.data.role, "doctor");
      doctorCookie = r.cookie;
    });

    it("a doctor can list colleagues but pay and login details are hidden", async () => {
      const r = await api("GET", "/api/staff?role=doctor", { cookie: doctorCookie });
      assert.equal(r.status, 200);
      const row = r.json.data.find((s: any) => s.id === doctorId);
      assert.equal(row.monthlySalary, null);
      assert.equal(row.bankAccountLast4, null);
      assert.equal(row.email, null);
      assert.equal(row.hasLogin, false);
      assert.equal(row.consultationFee, 750);
    });

    it("an administrator sees pay and login details", async () => {
      const r = await api("GET", `/api/staff/${doctorId}`, { cookie: admin });
      assert.equal(r.json.data.monthlySalary, 90000);
      assert.equal(r.json.data.bankAccountLast4, "1234");
      assert.equal(r.json.data.email, doctorEmail);
    });

    it("a doctor cannot change staff, settings or read the audit log", async () => {
      assert.equal((await api("POST", "/api/staff", { cookie: doctorCookie, body: { name: "X Y", role: "nurse", department: "Ward" } })).status, 403);
      assert.equal((await api("PATCH", `/api/staff/${doctorId}`, { cookie: doctorCookie, body: { department: "ER" } })).status, 403);
      assert.equal((await api("PUT", "/api/settings", { cookie: doctorCookie, body: { erFee: 1 } })).status, 403);
      assert.equal((await api("PUT", "/api/facility-profile", { cookie: doctorCookie, body: { phone: "9999999999" } })).status, 403);
      assert.equal((await api("GET", "/api/audit-log", { cookie: doctorCookie })).status, 403);
    });

    it("rejects bad input with a specific message", async () => {
      const r = await api("POST", "/api/staff", { cookie: admin, body: { name: "A", role: "wizard", department: "" } });
      assert.equal(r.status, 400);
      assert.equal(r.json.code, "VALIDATION");
      const weak = await api("POST", "/api/staff", { cookie: admin, body: { name: "Weak Pass", role: "nurse", department: "Ward", login: { email: "weak@example.test", password: "password123" } } });
      assert.equal(weak.status, 400);
      const dup = await api("POST", "/api/staff", { cookie: admin, body: { name: "Dup Email", role: "nurse", department: "Ward", login: { email: doctorEmail, password: strongPassword() } } });
      assert.equal(dup.status, 409);
      assert.equal(dup.json.code, "EMAIL_IN_USE");
    });

    it("a role change takes effect at once", async () => {
      const r = await api("PATCH", `/api/staff/${doctorId}`, { cookie: admin, body: { role: "nurse" } });
      assert.equal(r.status, 200);
      assert.equal(r.json.data.role, "nurse");
      // the doctor's existing token now belongs to a nurse: still allowed to list, not to edit
      assert.equal((await api("GET", "/api/staff", { cookie: doctorCookie })).status, 200);
      const relogin = await loginAs(doctorEmail, doctorPassword);
      assert.equal(relogin.json.data.role, "nurse");
    });

    it("nobody can lock themselves out", async () => {
      const mine = (await api("GET", "/api/staff", { cookie: admin })).json.data.find((s: any) => s.email === h.adminEmail);
      const a = await api("PATCH", `/api/staff/${mine.id}`, { cookie: admin, body: { active: false } });
      assert.equal(a.status, 400);
      assert.equal(a.json.code, "SELF_LOCKOUT");
      const b = await api("PATCH", `/api/staff/${mine.id}`, { cookie: admin, body: { role: "nurse" } });
      assert.equal(b.status, 400);
      const c = await api("DELETE", `/api/staff/${mine.id}/login`, { cookie: admin });
      assert.equal(c.status, 400);
    });

    it("deactivating a person blocks their login and their token", async () => {
      const r = await api("PATCH", `/api/staff/${doctorId}`, { cookie: admin, body: { active: false } });
      assert.equal(r.status, 200);
      assert.equal((await api("GET", "/api/staff", { cookie: doctorCookie })).status, 401, "token refused");
      assert.equal((await loginAs(doctorEmail, doctorPassword)).status, 401, "login refused");
      const back = await api("PATCH", `/api/staff/${doctorId}`, { cookie: admin, body: { active: true } });
      assert.equal(back.status, 200);
      assert.equal((await loginAs(doctorEmail, doctorPassword)).status, 200, "login works again");
    });

    it("gives a person without a login a sign-in, then removes it", async () => {
      const created = await api("POST", "/api/staff", { cookie: admin, body: { name: "Visiting Doc", role: "doctor", department: "Orthopaedics", employmentType: "visiting_fee", feePerConsult: 500 } });
      assert.equal(created.status, 201);
      assert.equal(created.json.data.hasLogin, false);
      const id = created.json.data.id;
      const email = `qa-visit-${Date.now()}@example.test`;
      const password = strongPassword();
      const set = await api("PUT", `/api/staff/${id}/login`, { cookie: admin, body: { email, password } });
      assert.equal(set.status, 200);
      assert.equal(set.json.data.hasLogin, true);
      assert.equal((await loginAs(email, password)).status, 200);
      const removed = await api("DELETE", `/api/staff/${id}/login`, { cookie: admin });
      assert.equal(removed.status, 200);
      assert.equal(removed.json.data.hasLogin, false);
      assert.equal((await loginAs(email, password)).status, 401);
    });

    it("staff of another hospital are not reachable", async () => {
      const other = await createQaHospital();
      try {
        const otherLogin = await loginAs(other.adminEmail, other.adminPassword);
        const theirs = (await api("GET", "/api/staff", { cookie: otherLogin.cookie })).json.data;
        assert.equal(theirs.length, 1, "only their own admin");
        assert.equal((await api("GET", `/api/staff/${doctorId}`, { cookie: otherLogin.cookie })).status, 404);
        assert.equal((await api("PATCH", `/api/staff/${doctorId}`, { cookie: otherLogin.cookie, body: { department: "X" } })).status, 404);
      } finally {
        await removeQaHospital(other.facilityId);
      }
    });
  });

  describe("settings", () => {
    it("returns defaults, saves changes and keeps them", async () => {
      const before = (await api("GET", "/api/settings", { cookie: admin })).json.data;
      assert.equal(before.opdDefaultFee, 600);
      assert.equal(before.requireReportVerification, false);

      const saved = await api("PUT", "/api/settings", { cookie: admin, body: { opdDefaultFee: 650, gstin: "27abcde1234f1z5", requireReportVerification: true, billFooter: "Thank you" } });
      assert.equal(saved.status, 200, JSON.stringify(saved.json));
      assert.equal(saved.json.data.opdDefaultFee, 650);
      assert.equal(saved.json.data.gstin, "27ABCDE1234F1Z5");
      assert.equal(saved.json.data.requireReportVerification, true);

      const again = (await api("GET", "/api/settings", { cookie: admin })).json.data;
      assert.equal(again.opdDefaultFee, 650);
      assert.equal(again.erFee, 900, "untouched settings keep their default");
    });

    it("the standard fee applies to a doctor with no fee of their own", async () => {
      const r = await api("POST", "/api/staff", { cookie: admin, body: { name: "Dr Default Fee", role: "doctor", department: "ENT" } });
      assert.equal(r.json.data.opdFee, 650);
    });

    it("rejects a bad GSTIN and unknown settings", async () => {
      assert.equal((await api("PUT", "/api/settings", { cookie: admin, body: { gstin: "NOTAGSTIN" } })).status, 400);
      assert.equal((await api("PUT", "/api/settings", { cookie: admin, body: { hackerSetting: 1 } })).status, 400);
      assert.equal((await api("PUT", "/api/settings", { cookie: admin, body: { bedDayCheckoutHour: 30 } })).status, 400);
    });
  });

  describe("facility profile", () => {
    it("saves and reads the hospital's details", async () => {
      const r = await api("PUT", "/api/facility-profile", { cookie: admin, body: { hipId: "QA_HIP_1", facilityType: "Hospital", address: "1 Test Road", state: "Karnataka", district: "Bengaluru", pincode: "560001", phone: "08012345678", latitude: 12.97, longitude: 77.59 } });
      assert.equal(r.status, 200, JSON.stringify(r.json));
      const got = (await api("GET", "/api/facility-profile", { cookie: admin })).json.data;
      assert.equal(got.hipId, "QA_HIP_1");
      assert.equal(got.pincode, "560001");
      assert.equal(got.latitude, 12.97);
      assert.equal(got.hfrId, h.hfrId, "HFR id unchanged");
    });

    it("refuses an HFR id that another hospital uses, and bad values", async () => {
      const other = await createQaHospital();
      try {
        const clash = await api("PUT", "/api/facility-profile", { cookie: admin, body: { hfrId: other.hfrId } });
        assert.equal(clash.status, 409);
        assert.equal(clash.json.code, "HFR_ID_IN_USE");
      } finally {
        await removeQaHospital(other.facilityId);
      }
      assert.equal((await api("PUT", "/api/facility-profile", { cookie: admin, body: { pincode: "12" } })).status, 400);
      assert.equal((await api("PUT", "/api/facility-profile", { cookie: admin, body: { latitude: 200 } })).status, 400);
    });
  });

  describe("audit trail", () => {
    it("records staff, settings and profile changes without secrets", async () => {
      const r = await api("GET", "/api/audit-log?limit=100", { cookie: admin });
      assert.equal(r.status, 200);
      const actions = r.json.data.map((e: any) => e.action);
      for (const wanted of ["Staff Added", "Staff Updated", "Hospital Settings Updated", "Facility Profile Updated", "Staff Login Created", "Staff Login Removed"]) {
        assert.ok(actions.includes(wanted), `has "${wanted}"`);
      }
      const text = JSON.stringify(r.json.data);
      assert.ok(!/password/i.test(text.replace(/Staff Login/g, "")), "no password text in the trail");
    });

    it("can be searched and paged", async () => {
      const found = (await api("GET", "/api/audit-log?search=settings", { cookie: admin })).json.data;
      assert.ok(found.length >= 1 && found.every((e: any) => /settings/i.test(e.action + e.detail)));
      const page1 = (await api("GET", "/api/audit-log?limit=2", { cookie: admin })).json.data;
      const page2 = (await api("GET", `/api/audit-log?limit=2&before=${encodeURIComponent(page1[1].at)}`, { cookie: admin })).json.data;
      assert.equal(page1.length, 2);
      assert.ok(page2.every((e: any) => new Date(e.at) < new Date(page1[1].at)));
    });
  });

  describe("patients: MRN, allergies, problems", () => {
    it("gives each new patient the next MRN of the hospital", async () => {
      const a = await api("POST", "/api/patient/create", { cookie: admin, body: { name: "Mrn One", phone: "9100000001" } });
      const b = await api("POST", "/api/patient/create", { cookie: admin, body: { name: "Mrn Two", phone: "9100000002" } });
      assert.equal(a.status, 201, JSON.stringify(a.json));
      assert.equal(a.json.data.mrn, "MRN-10001");
      assert.equal(b.json.data.mrn, "MRN-10002");
    });

    it("never repeats an MRN when patients are created at the same moment", async () => {
      const replies = await Promise.all(
        ["Anita", "Bharat", "Chitra", "Devraj", "Esha", "Farid"].map((first, i) => api("POST", "/api/patient/create", { cookie: admin, body: { name: `${first} Parallel`, phone: `92000000${10 + i}` } })),
      );
      assert.ok(replies.every((r) => r.status === 201), JSON.stringify(replies.map((r) => r.status)));
      const mrns = replies.map((r) => r.json.data.mrn);
      assert.equal(new Set(mrns).size, 6, `unique: ${mrns.join(",")}`);
    });

    it("lists MRNs and stores allergies and problems", async () => {
      const list = (await api("GET", "/api/patient", { cookie: admin })).json.data;
      assert.ok(list.every((p: any) => /^MRN-\d+$/.test(p.mrn)));
      const first = list.find((p: any) => p.mrn === "MRN-10001");
      const upd = await api("PATCH", `/api/patient/${first.id}`, { cookie: admin, body: { allergies: ["Penicillin", "Peanuts"], problemList: ["Hypertension"] } });
      assert.equal(upd.status, 200, JSON.stringify(upd.json));
      assert.deepEqual(upd.json.data.allergies, ["Penicillin", "Peanuts"]);
      const again = (await api("GET", "/api/patient", { cookie: admin })).json.data.find((p: any) => p.id === first.id);
      assert.deepEqual(again.problemList, ["Hypertension"]);
      assert.equal((await api("PATCH", `/api/patient/${first.id}`, { cookie: admin, body: { allergies: [""] } })).status, 400);
    });

    it("keeps name, date of birth and gender fixed (existing rule untouched)", async () => {
      const list = (await api("GET", "/api/patient", { cookie: admin })).json.data;
      assert.equal((await api("PATCH", `/api/patient/${list[0].id}`, { cookie: admin, body: { name: "Changed Name" } })).status, 400);
    });
  });

  describe("existing M1 behaviour is untouched", () => {
    it("the dashboard still works and counts these patients", async () => {
      const r = await api("GET", "/api/dashboard", { cookie: admin });
      assert.equal(r.status, 200);
      assert.equal(r.json.data.totalPatients, 8);
    });

    it("the Scan & Share queue and ABHA audit are still staff-readable", async () => {
      assert.equal((await api("GET", "/api/abha/shares", { cookie: admin })).status, 200);
      assert.equal((await api("GET", "/api/abha/audit", { cookie: admin })).status, 200);
    });

    it("the ABDM callback is still refused without a token", async () => {
      const r = await api("POST", "/api/v3/hip/patient/share", { body: {} });
      assert.equal(r.status, 401);
    });
  });
});
