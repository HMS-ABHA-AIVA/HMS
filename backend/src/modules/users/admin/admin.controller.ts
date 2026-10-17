import type { Request, Response, NextFunction } from "express";
import type { userAuthRequest } from "../../../common/middlewares/verifyUserJwt.js"
import { loginAdminSchema } from "../../../common/validators/admin.validator.js"
import { ApiError } from "../../../common/errors/appError.js";
import { loginAdminService ,logoutAdminService } from "./admin.service.js";


export const adminLogin = async (req: Request, res: Response, next: NextFunction) => {
    try {
        const result = loginAdminSchema.safeParse(req.body);
        if (!result.success) {
            const message = result.error.issues.map((issue: any) => issue.message).join(", ")
            throw new ApiError(400, `invalid request body: ${message}`);
        }

        const loggedInAdmin = await loginAdminService(result.data.email, result.data.password);
        if (!loggedInAdmin) {
            throw new ApiError(401, "Invalid email or password");
        }

        res.cookie("accessToken", loggedInAdmin.accessToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
            maxAge: 2 * 60 * 60 * 1000,
        });

        res.cookie("refreshToken", loggedInAdmin.refreshToken, {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
            maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        });

        res.status(200).json({
            success: true,
            message: "Admin logged in successfully",
            data: {
                id: loggedInAdmin.user.id,
                email: loggedInAdmin.user.email,
                name: loggedInAdmin.user.name,
            }
        });
    } catch (error) {
        next(error)
    }
}


export const adminLogout = async (req: userAuthRequest,res: Response,next: NextFunction) => {

    try {
        if(!req.user){
            throw new ApiError(401,"unauthorized");
        }
        await logoutAdminService(req.user.id);

        res.clearCookie("accessToken", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        });

        res.clearCookie("refreshToken", {
            httpOnly: true,
            secure: process.env.NODE_ENV === "production",
            sameSite: process.env.NODE_ENV === "production" ? "none" : "strict",
        });

        return res.status(200).json({
            success: true,
            message: "Admin logged out successfully"
        });

    } catch (error) {
        next(error);
    }
};
