import { prisma } from "../../../config/db.js";
import { ApiError } from "../../../common/errors/appError.js";
import { generateAbdmSessionToken } from "../../../common/client/facility.client.js";
import { decrypt } from "../../../common/utils/encryption.js"
import { encryptWithAbdmPublicKey } from "../../../common/utils/encryption.js";
import { getAbdmPublicKey, requestAadhaarOtp, aadharCreationClient, requestExistingAbhaAadhaarOtp, verifyExistingAbhaAadhaarOtp, getExistingAbhaProfile,requestExistingAbhaMobileOtp,verifyExistingAbhaMobileOtp,verifyExistingAbhaMobileUser ,generateAbhaQr} from "../../../common/client/abdm.client.js";

export const abdmTokenRetrievalService = async (facilityId: string, userId: string, environment: "SANDBOX" | "PRODUCTION") => {
  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!user) {
    throw new ApiError(404, "User not found");
  }
  if (user.facilityId !== facilityId) {
    throw new ApiError(401, "User does not belong to the specified facility");
  }

  const facilityAbdm = await prisma.facilityAbdmData.findUnique({
    where: {
      facilityId_environment: {
        facilityId: facilityId,
        environment: environment
      }
    }
  })

  if (!facilityAbdm) {
    throw new ApiError(404, "configure abdm details before this action.");
  }

  const clientId = facilityAbdm.clientId;
  const clientSecret = decrypt(facilityAbdm.clientSecret);

  const abdmResponse = await generateAbdmSessionToken({ clientId, clientSecret, environment })

  if (!abdmResponse.accessToken || !abdmResponse.refreshToken) {
    throw new ApiError(400, "ABDM authentication failed");
  }

  return {
    abdmAccessToken: abdmResponse.accessToken,
    abdmRefreshToken: abdmResponse.refreshToken
  };

}

//creation - aadhar number
export const aadhaarOtpRequestService = async (patientId: string, facilityId: string, abdmAccessToken: string, environment: "SANDBOX" | "PRODUCTION", aadhaar: string) => {

  // 1. Make sure patient belongs to authenticated user's facility
  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      facilityId,
    },
    include:{
      abha : true
    }
  });

  if (!patient) {
    throw new ApiError(
      404,
      "Patient not found",
    );
  }
  if (patient.abha) {
    throw new ApiError(
      409,
      "Patient already has an ABHA linked",
    );
  }


  // 2. Get ABDM public key
  const { publicKey } = await getAbdmPublicKey(environment, abdmAccessToken);

  if (!publicKey) {
    throw new ApiError(
      500,
      "Failed to retrieve ABDM public key",
    );
  }

  // 3. Encrypt Aadhaar
  const encryptedAadhaar = encryptWithAbdmPublicKey(
    aadhaar,
    publicKey,
  );

  // 4. Ask ABDM to send OTP
  const abdmResponse = await requestAadhaarOtp({
    accessToken: abdmAccessToken,
    encryptedAadhaar,
    environment,
  });

  if (!abdmResponse.txnId) {
    throw new ApiError(
      400,
      "ABDM did not return a transaction ID",
    );
  }

  // 5. Store transaction
  const transaction = await prisma.abhaTransaction.create({
    data: {
      txnId: abdmResponse.txnId,
      patientId: patient.id,
      facilityId,
      purpose: "ENROLLMENT",
      status: "PENDING",
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
    },
  });

  return {
    transactionId: transaction.id,
    txnId: transaction.txnId,
    message: abdmResponse.message,
  };
};


export const aadhaarOtpVerifyService = async (transactionId: string, facilityId: string, abdmAccessToken: string, environment: "SANDBOX" | "PRODUCTION", otp: string, mobile: string,) => {

  // 1. Find YOUR internal ABHA transaction
  const transaction = await prisma.abhaTransaction.findUnique({
    where: {
      id: transactionId,
    },
  });

  if (!transaction) {
    throw new ApiError(
      404,
      "ABHA transaction not found",
    );
  }

  //transaction should belong to authenticated faciity
  if (transaction.facilityId !== facilityId) {
    throw new ApiError(
      403,
      "Transaction does not belong to this facility",
    );
  }

  // 3. Make sure this transaction is for enrollment
  if (transaction.purpose !== "ENROLLMENT") {
    throw new ApiError(
      400,
      "Invalid transaction purpose",
    );
  }

  // 4. Make sure transaction is still pending
  if (transaction.status !== "PENDING") {
    throw new ApiError(
      400,
      "ABHA transaction is no longer pending",
    );
  }

  // 5. Check expiry
  if (transaction.expiresAt <= new Date()) {

    await prisma.abhaTransaction.update({
      where: {
        id: transaction.id,
      },
      data: {
        status: "EXPIRED",
      },
    });

    throw new ApiError(
      400,
      "ABHA transaction has expired",
    );
  }

  // 6. Get ABDM public key
  const { publicKey } = await getAbdmPublicKey(environment, abdmAccessToken);

  if (!publicKey) {
    throw new ApiError(
      500,
      "Failed to retrieve ABDM public key",
    );
  }

  // 7. Encrypt OTP using ABDM public key
  const encryptedOtp = encryptWithAbdmPublicKey(
    otp,
    publicKey,
  );

  // 8. Call ABDM enrollment API
  const abdmResponse = await aadharCreationClient({
    accessToken: abdmAccessToken,
    txnId: transaction.txnId,
    encryptedOtp,
    mobile,
    environment,
  });

  // 9. Make sure ABDM actually returned an ABHA number
  if (!abdmResponse?.ABHAProfile?.ABHANumber) {
    throw new ApiError(
      400,
      "ABDM enrollment failed",
    );
  }

  // 10. Create ABHA ↔ Patient mapping
  const abhaPatient = await prisma.abhaPatient.create({
    data: {
      patientId: transaction.patientId,
      abhaNumber: abdmResponse.ABHAProfile.ABHANumber,
      abhaAddress: abdmResponse.ABHAProfile.phrAddress?.[0] ?? null,
    },
  });

  // 11. Mark transaction as completed
  await prisma.abhaTransaction.update({
    where: {
      id: transaction.id,
    },
    data: {
      status: "COMPLETED",
    },
  });

  // 12. Return only what YOUR application needs
  return {
    patientId: transaction.patientId,
    abhaNumber: abhaPatient.abhaNumber,
    abhaAddress: abhaPatient.abhaAddress,
    isNew: abdmResponse.isNew,
    profile: abdmResponse.ABHAProfile,
  };
};

//verification - aadbhar number
export const requestExistingAbhaAadhaarOtpService = async (patientId: string, facilityId: string, abdmAccessToken: string, environment: "SANDBOX" | "PRODUCTION", aadhaar: string) => {
  const patient = await prisma.patient.findFirst({
    where: {
      id: patientId,
      facilityId,
    },
  });

  if (!patient) {
    throw new ApiError(404, "Patient not found");
  }

  // Don't allow linking another ABHA if this patient
  // is already linked.
  const existingAbha = await prisma.abhaPatient.findUnique({
    where: {
      patientId,
    },
  });

  if (existingAbha) {
    throw new ApiError(
      409,
      "Patient is already linked to an ABHA"
    );
  }

  const { publicKey } = await getAbdmPublicKey(environment, abdmAccessToken);

  if (!publicKey) {
    throw new ApiError(
      500,
      "Failed to retrieve ABDM public key"
    );
  }

  const encryptedAadhaar = encryptWithAbdmPublicKey(
    aadhaar,
    publicKey
  );

  const abdmResponse = await requestExistingAbhaAadhaarOtp({
    accessToken: abdmAccessToken,
    encryptedAadhaar,
    environment,
  });

  if (!abdmResponse.txnId) {
    throw new ApiError(
      400,
      "ABDM did not return a transaction ID"
    );
  }

  const transaction = await prisma.abhaTransaction.create({
    data: {
      txnId: abdmResponse.txnId,
      patientId: patient.id,
      facilityId,
      purpose: "VERIFICATION",
      status: "PENDING",
      expiresAt: new Date(
        Date.now() + 10 * 60 * 1000
      ),
    },
  });

  return {
    transactionId: transaction.id,
    txnId: transaction.txnId,
    message: abdmResponse.message,
  };
};


export const verifyExistingAbhaAadhaarOtpService = async (transactionId: string, facilityId: string, abdmAccessToken: string, environment: "SANDBOX" | "PRODUCTION", otp: string) => {
  const transaction = await prisma.abhaTransaction.findFirst({
    where: {
      id: transactionId,
      facilityId,
      purpose: "VERIFICATION",
    },
    include: {
      patient: true,
    },
  });

  if (!transaction) {
    throw new ApiError(
      404,
      "ABHA verification transaction not found"
    );
  }

  // Check transaction state
  if (transaction.status !== "PENDING") {
    throw new ApiError(
      400,
      `Transaction is already ${transaction.status.toLowerCase()}`
    );
  }

  // Check expiry
  if (transaction.expiresAt < new Date()) {
    await prisma.abhaTransaction.update({
      where: {
        id: transaction.id,
      },
      data: {
        status: "EXPIRED",
      },
    });

    throw new ApiError(
      400,
      "ABHA verification transaction has expired"
    );
  }

  // Make sure patient isn't already linked
  const existingAbha = await prisma.abhaPatient.findUnique({
    where: {
      patientId: transaction.patientId,
    },
  });

  if (existingAbha) {
    throw new ApiError(
      409,
      "Patient is already linked to an ABHA"
    );
  }

  // Get ABDM public key
  const { publicKey } = await getAbdmPublicKey(environment, abdmAccessToken);

  if (!publicKey) {
    throw new ApiError(
      500,
      "Failed to retrieve ABDM public key"
    );
  }

  // Encrypt OTP
  const encryptedOtp = encryptWithAbdmPublicKey(
    otp,
    publicKey
  );

  // Verify OTP with ABDM
  const abdmResponse = await verifyExistingAbhaAadhaarOtp({
    accessToken: abdmAccessToken,
    txnId: transaction.txnId,
    encryptedOtp,
    environment,
  });

  // Make sure ABDM actually verified it
  if (abdmResponse.authResult !== "success") {
    throw new ApiError(
      400,
      abdmResponse.message || "ABHA verification failed"
    );
  }

  // ABDM returns the X-token after successful authentication
  if (!abdmResponse.token) {
    throw new ApiError(
      400,
      "ABDM authentication succeeded but no X-token was returned"
    );
  }
  console.log("\n \n ABDM Response: \n \n", abdmResponse);
  // Get ABHA profile
  const profile = await getExistingAbhaProfile({
    accessToken: abdmAccessToken,
    xToken: abdmResponse.token,
    environment,
  });

  if (!profile?.ABHANumber) {
    throw new ApiError(
      400,
      "ABDM profile did not contain an ABHA number"
    );
  }
  console.log("\n \n ABHA Profile: \n \n", profile);
  // Link ABHA to the patient
  const abhaPatient = await prisma.abhaPatient.create({
    data: {
      patientId: transaction.patientId,
      abhaNumber: profile.ABHANumber,
      abhaAddress: profile.preferredAbhaAddress ?? null,
    },
  });

  // Mark transaction as completed
  await prisma.abhaTransaction.update({
    where: {
      id: transaction.id,
    },
    data: {
      status: "COMPLETED",
    },
  });

  return {
    patientId: transaction.patientId,
    transactionId: transaction.id,
    txnId: abdmResponse.txnId,
    message: abdmResponse.message,
    abhaNumber: abhaPatient.abhaNumber,
    abhaAddress: abhaPatient.abhaAddress,
    token : abdmResponse.token,
    

  };
};

//verfication - mobile number
//step 1 - request otp
export const requestExistingAbhaMobileOtpService = async (patientId: string,facilityId: string,abdmAccessToken: string,environment: "SANDBOX" | "PRODUCTION",mobile: string,) => {
    const patient = await prisma.patient.findFirst({
        where: {
            id: patientId,
            facilityId,
        },
        include: {
            abha: true,
        },
    });

    if (!patient) {
        throw new ApiError(404, "Patient not found");
    }

    // if (patient.abha) {
    //     throw new ApiError(
    //         409,
    //         "ABHA is already linked to this patient"
    //     );
    // }

    const { publicKey } = await getAbdmPublicKey(
        environment,
        abdmAccessToken
    );

    const encryptedMobile = encryptWithAbdmPublicKey(
        mobile,
        publicKey
    );

    const abdmResponse = await requestExistingAbhaMobileOtp(
        environment,
        abdmAccessToken,
        encryptedMobile
    );

    if (!abdmResponse?.txnId) {
        throw new ApiError(
            502,
            "ABDM did not return a transaction ID"
        );
    }

    const transaction = await prisma.abhaTransaction.create({
        data: {
            txnId: abdmResponse.txnId,
            patientId,
            facilityId,
            purpose: "VERIFICATION",
            status: "PENDING",
            expiresAt: new Date(
                Date.now() + 10 * 60 * 1000
            ),
        },
    });

    return {
        transactionId: transaction.id,
        txnId: abdmResponse.txnId,
        message: abdmResponse.message,
    };
};
//step 2 - verify otp
export const verifyExistingAbhaMobileOtpService = async (transactionId: string,facilityId: string,abdmAccessToken: string,environment: "SANDBOX" | "PRODUCTION",otp: string) => {
    const transaction = await prisma.abhaTransaction.findFirst({
        where: {
            id: transactionId,
            facilityId,
        },
    });

    if (!transaction) {
        throw new ApiError(404, "Transaction not found");
    }

    if (transaction.purpose !== "VERIFICATION") {
        throw new ApiError(400, "Invalid transaction purpose");
    }

    if (transaction.status !== "PENDING") {
        throw new ApiError(400, "Transaction is no longer active");
    }

    if (transaction.expiresAt < new Date()) {
        await prisma.abhaTransaction.update({
            where: {
                id: transaction.id,
            },
            data: {
                status: "EXPIRED",
            },
        });

        throw new ApiError(400, "Transaction has expired");
    }

    const { publicKey } = await getAbdmPublicKey(
        environment,
        abdmAccessToken
    );

    const encryptedOtp = encryptWithAbdmPublicKey(
        otp,
        publicKey
    );

    const abdmResponse = await verifyExistingAbhaMobileOtp(
        environment,
        abdmAccessToken,
        transaction.txnId,
        encryptedOtp
    );

    if (abdmResponse?.authResult !== "success") {
        throw new ApiError(
            400,
            abdmResponse?.message || "OTP verification failed"
        );
    }

    if (!abdmResponse?.token) {
        throw new ApiError(
            502,
            "ABDM did not return the authentication token"
        );
    }

    if (!abdmResponse?.accounts?.length) {
        throw new ApiError(
            404,
            "No ABHA accounts found for this mobile number"
        );
    }

    return {
        transactionId: transaction.id,
        txnId: abdmResponse.txnId,
        token: abdmResponse.token,
        expiresIn: abdmResponse.expiresIn,
        accounts: abdmResponse.accounts,
        message: abdmResponse.message,
    };
};
//step 3 - verify user and link internally
export const verifyExistingAbhaMobileUserService = async (abhaNumber: string,transactionId: string,facilityId: string,abdmAccessToken: string,environment: "SANDBOX" | "PRODUCTION",tToken: string) => {
  const transaction = await prisma.abhaTransaction.findFirst({
    where: {
      id: transactionId,
      facilityId,
      purpose: "VERIFICATION",
    },
    include: {
      patient: true,
    },
  });

  if (!transaction) {
    throw new ApiError(
      404,
      "ABHA verification transaction not found"
    );
  }

  // Check transaction state
  if (transaction.status !== "PENDING") {
    throw new ApiError(
      400,
      `Transaction is already ${transaction.status.toLowerCase()}`
    );
  }

  // Check expiry
  if (transaction.expiresAt < new Date()) {
    await prisma.abhaTransaction.update({
      where: {
        id: transaction.id,
      },
      data: {
        status: "EXPIRED",
      },
    });

    throw new ApiError(
      400,
      "ABHA verification transaction has expired"
    );
  }

  // Get ABDM public key
  const { publicKey } = await getAbdmPublicKey(
    environment,
    abdmAccessToken
  );

  if (!publicKey) {
    throw new ApiError(
      500,
      "Failed to retrieve ABDM public key"
    );
  }

  // Encrypt ABHA number for ABDM
  const encryptedAbhaNumber = encryptWithAbdmPublicKey(
    abhaNumber,
    publicKey
  );

  // Step 3: Verify user
  const abdmResponse = await verifyExistingAbhaMobileUser(
  environment,
  abdmAccessToken,
  tToken,
  abhaNumber,
  transaction.txnId
);

  if (!abdmResponse?.token) {
    throw new ApiError(
      400,
      "ABDM verification succeeded but no session token was returned"
    );
  }

  // Step 3 generates the final ABHA session token
  const xToken = abdmResponse.token;

  // Get authoritative ABHA profile using the generated session
  const profile = await getExistingAbhaProfile({
    accessToken: abdmAccessToken,
    xToken,
    environment,
  });

  if (!profile?.ABHANumber) {
    throw new ApiError(
      400,
      "ABDM profile did not contain an ABHA number"
    );
  }

  // Make sure this ABHA isn't already linked to another patient
  const existingAbha = await prisma.abhaPatient.findUnique({
    where: {
      abhaNumber: profile.ABHANumber,
    },
  });

  if (existingAbha && existingAbha.patientId !== transaction.patientId) {
    throw new ApiError(
      409,
      "This ABHA is already linked to another patient"
    );
  }

  // Create or update the ABHA link
  const abhaPatient = await prisma.abhaPatient.upsert({
    where: {
      patientId: transaction.patientId,
    },
    update: {
      abhaNumber: profile.ABHANumber,
      abhaAddress: profile.preferredAbhaAddress ?? null,
    },
    create: {
      patientId: transaction.patientId,
      abhaNumber: profile.ABHANumber,
      abhaAddress: profile.preferredAbhaAddress ?? null,
    },
  });

  // Mark transaction as completed
  await prisma.abhaTransaction.update({
    where: {
      id: transaction.id,
    },
    data: {
      status: "COMPLETED",
    },
  });

  return {
    patientId: transaction.patientId,
    transactionId: transaction.id,
    txnId: abdmResponse.txnId,
    token: abdmResponse.token,
    refreshToken: abdmResponse.refreshToken,
    expiresIn: abdmResponse.expiresIn,
    refreshExpiresIn: abdmResponse.refreshExpiresIn,
    message: "ABHA verified and linked successfully",

    abhaNumber: abhaPatient.abhaNumber,
    abhaAddress: abhaPatient.abhaAddress,

    name: profile.name,
    gender: profile.gender,
    dob: profile.dob,
    kycVerified: profile.kycVerified,
  };
};


//generate QR code
export const generateAbhaQrService = async (facilityId: string,abdmAccessToken: string,abhaXToken: string) => {

  const result = await generateAbhaQr({accessToken: abdmAccessToken,xToken: abhaXToken});

  return result;
};

//GET abha profile
//get ABHA profile

export const getAbhaProfileService = async (facilityId: string,accessToken: string,xToken: string,environment: "SANDBOX" | "PRODUCTION") => {

  const profile = await getExistingAbhaProfile(
   { accessToken,
    xToken,
    environment}
  );

  if (!profile?.ABHANumber) {

    throw new ApiError(
      400,
      "ABDM profile did not contain an ABHA number"
    );

  }

  return profile;

};