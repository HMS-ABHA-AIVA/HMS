import type { Request,Response,NextFunction } from "express"
import jwt from "jsonwebtoken"
import {ApiError} from "../errors/appError.js"
export interface authRequest extends Request {
     facility?:{
        id : string
        hfrId : string
        email : string
    }
}

export const verifyFacilityJwt = async(req : authRequest , res : Response,next : NextFunction) =>{
    try {
        const token = req?.cookies.accessToken || req.header("Authorization")?.replace("Bearer ","")
        if(!token){
            throw new ApiError(401,"unauthorized access");
        }

        
        let decoded;
        try {
            
            decoded = jwt.verify(token,process.env.FACILITY_ACCESS_TOKEN_SECRET!) as {facilityId : string , hfrId : string, email : string};
        } catch (error) {
            throw new ApiError(401 , "unauthorized access");
        }

        req.facility = {
            id : decoded.facilityId,
            hfrId : decoded.hfrId,
            email : decoded.email
        }
        next();
    } catch (error) {
        next(error);
    }
}