import type { Request,Response,NextFunction } from "express"
import jwt from "jsonwebtoken"
import {ApiError} from "../errors/appError.js"

export interface userAuthRequest extends Request {
     user?:{
        id : string
        email : string
        facilityId : string
    }
}

export const verifyUserJwt = async(req : userAuthRequest , res : Response,next : NextFunction) =>{
    try {
        const token = req?.cookies.accessToken || req.header("Authorization")?.replace("Bearer ","")
        if(!token){
            throw new ApiError(401,"unauthorized access");
        }

        
        let decoded;
        try {
            
            decoded = jwt.verify(token,process.env.USER_ACCESS_TOKEN_SECRET!) as {id : string , email : string, facilityId : string};
        } catch (error) {
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
