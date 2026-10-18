import type { Request,Response,NextFunction } from "express"
import jwt from "jsonwebtoken"
import {ApiError} from "../errors/appError.js"
import { logSecurityEvent } from "../utils/securityLog.js"

export interface userAuthRequest extends Request {
     user?:{
        id : string
        email : string
        facilityId : string
    }
}

export const verifyUserJwt = async(req : userAuthRequest , res : Response,next : NextFunction) =>{
    try {
        const token = req.cookies?.accessToken || req.header("Authorization")?.replace("Bearer ","")
        if(!token){
            logSecurityEvent("AUTH_TOKEN_MISSING", req);
            throw new ApiError(401,"unauthorized access");
        }


        let decoded;
        try {
            // Only the algorithm we sign with is accepted (rules out "alg: none" and algorithm-swap tokens).
            decoded = jwt.verify(token,process.env.USER_ACCESS_TOKEN_SECRET!,{ algorithms: ["HS256"] }) as {id : string , email : string, facilityId : string};
        } catch (error) {
            logSecurityEvent("AUTH_TOKEN_INVALID", req, { reason: error instanceof jwt.TokenExpiredError ? "expired" : "invalid" });
            throw new ApiError(401 , "unauthorized access");
        }

        req.user = {
            id : decoded.id,
            email : decoded.email,
            facilityId : decoded.facilityId
        }
        next();
    } catch (error) {
        next(error);
    }
}
