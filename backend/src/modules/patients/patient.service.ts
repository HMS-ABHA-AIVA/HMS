import { prisma } from "../../config/db.js";
import { ApiError } from "../../common/errors/appError.js";

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
            facilityId
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
    name: patient.name,
    phone: patient.phone,
    email: patient.email,
    dateOfBirth: toDateOnly(patient.dateOfBirth),
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