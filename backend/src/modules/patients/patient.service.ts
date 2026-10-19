import { prisma } from "../../config/db.js";
import { ApiError } from "../../common/errors/appError.js";
import { nextMrn } from "../../common/utils/counters.js";

// DATE column <-> "YYYY-MM-DD" (no time zone shifts)
const toDateOnly = (date: Date | null) => (date ? date.toISOString().slice(0, 10) : null);

export const createPatientService = async (name: string,phone: string,email: string | undefined,facilityId: string,dateOfBirth?: string) => {
     const existingPatient = await prisma.patient.findFirst({
        where: {
            phone,
            facilityId
        }
    });

    if (existingPatient) {
        throw new ApiError(
            409,
            "Patient with this phone number already exists"
        );
    }
    const patient = await prisma.patient.create({
        data: {
            name,
            phone,
            email : email ?? null,
            dateOfBirth: dateOfBirth ? new Date(`${dateOfBirth}T00:00:00.000Z`) : null,
            facilityId,
            mrn: await nextMrn(prisma, facilityId),
        }
    });

    return { ...patient, dateOfBirth: toDateOnly(patient.dateOfBirth) };
};
export const getAllPatientsService = async (facilityId: string, limit = 500, page = 1) => {
    const patients = await prisma.patient.findMany({
        where: {
            facilityId,
        },
        take: limit,
        skip: (page - 1) * limit,
        include: {
            abha: true,
        },
        orderBy: {
            createdAt: "desc",
        },
    });

    return patients.map((patient) => ({
    id: patient.id,
    mrn: patient.mrn,
    allergies: patient.allergies,
    problemList: patient.problemList,
    name: patient.name,
    phone: patient.phone,
    email: patient.email,
    dateOfBirth: toDateOnly(patient.dateOfBirth),
    gender: patient.gender,
    address: patient.address,
    stateName: patient.stateName,
    districtName: patient.districtName,
    createdAt: patient.createdAt,
    updatedAt: patient.updatedAt,
    abha: patient.abha
        ? {
              abhaNumber: patient.abha.abhaNumber,
              abhaAddress: patient.abha.abhaAddress,
          }
        : null,
}));
};

export const getPatientTransactionsService = async (patientId: string,facilityId: string) => {
  // Make sure patient belongs to this facility
  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      facilityId,
    },
  });

  if (!patient) {
    throw new ApiError(404, "Patient not found");
  }

  const transactions = await prisma.abhaTransaction.findMany({
    where: {
      patientId,
      facilityId,
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  return transactions;
};
export const updatePatientService = async (
    patientId: string,
    facilityId: string,
    changes: { phone?: string | undefined; email?: string | undefined; address?: string | undefined; stateName?: string | undefined; districtName?: string | undefined; allergies?: string[] | undefined; problemList?: string[] | undefined },
) => {
    const patient = await prisma.patient.findFirst({ where: { id: patientId, facilityId } });

    if (!patient) {
        throw new ApiError(404, "Patient not found", [], "PATIENT_NOT_FOUND");
    }

    if (changes.phone && changes.phone !== patient.phone) {
        const taken = await prisma.patient.findFirst({ where: { phone: changes.phone, facilityId, NOT: { id: patientId } } });
        if (taken) {
            throw new ApiError(409, "Another patient with this phone number already exists");
        }
    }

    // Only the fields that were sent are touched; "" clears an optional text field.
    const data: { phone?: string; email?: string | null; address?: string | null; stateName?: string | null; districtName?: string | null; allergies?: string[]; problemList?: string[] } = {};
    if (changes.allergies !== undefined) data.allergies = changes.allergies;
    if (changes.problemList !== undefined) data.problemList = changes.problemList;
    if (changes.phone !== undefined) data.phone = changes.phone;
    if (changes.email !== undefined) data.email = changes.email === "" ? null : changes.email;
    if (changes.address !== undefined) data.address = changes.address === "" ? null : changes.address;
    if (changes.stateName !== undefined) data.stateName = changes.stateName === "" ? null : changes.stateName;
    if (changes.districtName !== undefined) data.districtName = changes.districtName === "" ? null : changes.districtName;

    const updated = await prisma.patient.update({ where: { id: patientId }, data });

    return { ...updated, dateOfBirth: toDateOnly(updated.dateOfBirth) };
};
