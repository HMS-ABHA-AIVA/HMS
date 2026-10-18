import type {Request , Response , NextFunction} from "express"
import { ApiError } from "../../common/errors/appError.js";
import type { userAuthRequest } from "../../common/middlewares/verifyUserJwt.js";
import { createPatientSchema } from "../../common/validators/patient.validation.js";
import { createPatientService,getAllPatientsService,getPatientTransactionsService} from "./patient.service.js";




export const createPatientController = async (req: userAuthRequest,res: Response,next :NextFunction) => {
    try {
    if(!req.user){
        throw new ApiError(401,"unauthrorized access");
    }
    const result = createPatientSchema.safeParse(req.body);
    if (!result.success) {
            const message = result.error.issues
                .map((issue: any) => issue.message)
                .join(", ");

            throw new ApiError(400, `Invalid request body: ${message}`);
        }


    const facilityId = req.user.facilityId;

    if (!facilityId) {
        throw new ApiError(401, "Unauthorized");
    }

    const patient = await createPatientService(
        result.data.name,
        result.data.phone,
        result.data.email,
        facilityId,
        result.data.dateOfBirth
    );

    return res.status(201).json({
        success: true,
        message: "Patient created successfully",
        data: patient
    });
    } catch (error) {
        next(error)
    }
   
};

export const getAllPatientController = async (req: userAuthRequest,res: Response,next: NextFunction) => {
    try {
        if (!req.user) {
            throw new ApiError(401, "Unauthorized access");
        }

        const facilityId = req.user.facilityId;

        if (!facilityId) {
            throw new ApiError(401, "Unauthorized");
        }

        const patients = await getAllPatientsService(facilityId);

        return res.status(200).json({
            success: true,
            message: "Patients retrieved successfully",
            data: patients,
        });
    } catch (error) {
        next(error);
    }
};

export const getPatientTransactionsController = async (
  req: userAuthRequest,
  res: Response,
  next: NextFunction
) => {
  try {
    if (!req.user) {
      throw new ApiError(401, "Unauthorized access");
    }

    const facilityId = req.user.facilityId;

    if (!facilityId) {
      throw new ApiError(401, "Unauthorized");
    }

    const { patientId } = req.params;

    if (typeof patientId !== "string") {
      throw new ApiError(400, "Patient ID is required");
    }

    const transactions = await getPatientTransactionsService(patientId,facilityId);

    return res.status(200).json({
      success: true,
      message: "Patient transactions retrieved successfully",
      data: transactions,
    });
  } catch (error) {
    next(error);
  }
};