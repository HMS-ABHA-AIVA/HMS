import bcrypt from "bcrypt";
import { prisma } from "../../../config/db.js";
import {ApiError} from "../../../common/errors/appError.js"
import jwt from "jsonwebtoken"
import { randomBytes } from "crypto"

// Compared against when the account does not exist, so a missing account takes as long as a wrong password.
const DUMMY_HASH = bcrypt.hashSync(randomBytes(16).toString("hex"), 12);

export const loginAdminService = async (email: string,password: string) => {
    const existingUser = await prisma.user.findUnique({
        where: {
            email,
        },
    });

    if (!existingUser) {
        await bcrypt.compare(password, DUMMY_HASH);
        throw new ApiError(401, "invalid email or password");
    }

    const isPasswordValid = await bcrypt.compare(password,existingUser.passwordHash);

    if (!isPasswordValid) {
        throw new ApiError(401, "invalid email or password");
    }

    const accessToken = jwt.sign({
            id: existingUser.id,
            email: existingUser.email,
            facilityId: existingUser.facilityId,
        },
        process.env.USER_ACCESS_TOKEN_SECRET!,
        {
            expiresIn: "2h",
        }
    );

    const refreshToken = jwt.sign(
        {
            id: existingUser.id,
            email: existingUser.email,
            facilityId: existingUser.facilityId,
        },
        process.env.USER_REFRESH_TOKEN_SECRET!,
        {
            expiresIn: "7d",
        }
    );

    const tokenHash = await bcrypt.hash(refreshToken, 12);

   const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

    await prisma.userRefreshToken.create({
        data: {
            tokenHash,
            userId: existingUser.id,
            expiresAt,
        },
    });

    return {
        accessToken,
        refreshToken,

        user: {
            id: existingUser.id,
            name: existingUser.name,
            email: existingUser.email,
            facilityId: existingUser.facilityId,
        },
    };
};



export const logoutAdminService = async (userId : string) => {

     await prisma.userRefreshToken.deleteMany({
        where: {
            userId,
            expiresAt: {
                gt: new Date()
            }
        }
    });
};