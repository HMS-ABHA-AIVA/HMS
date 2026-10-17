import { prisma } from "../../config/db.js";
import { ApiError } from "../../common/errors/appError.js";

export const createPatientService = async (name: string,phone: string,email: string | undefined,facilityId: string) => {
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
            facilityId
        }
    });

    return patient;
};
export const getAllPatientsService = async (facilityId: string) => {
    const patients = await prisma.patient.findMany({
        where: {
            facilityId,
        },
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