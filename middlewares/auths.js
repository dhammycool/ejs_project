import express from "express";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import bcrypt from "bcrypt";
import pool from "../config/db.js";  
import logger from "../middlewares/logger.js";

passport.use(new Strategy(async function verify(username, password, cb) {
    try {
    
        const check = await pool.query("SELECT * FROM users WHERE email=$1", [username]);

      
        if (check.rows.length === 0) {
            return cb(null, false, { message: "User does not exist. Please register!" });
        }

        const user = check.rows[0];
        const storedPassword = user.password;

        
        const isMatch = await bcrypt.compare(password, storedPassword);
        
        if (isMatch) {
            return cb(null, user);  
        } else {
            return cb(null, false, { message: "Incorrect password" });
        }

    } catch (err) {
        logger.info("Authentication error:", err);
        return cb(null, false, { message: "An error occurred during authentication. Please try again." });
    }
}));


passport.serializeUser((user,cb)=>{
    cb(null,user.id);

});

passport.deserializeUser(async (id, cb) => {
    try {
        const result = await pool.query("SELECT * FROM users WHERE id = $1", [id]);
        if (result.rows.length === 0) {
            return cb(null, false); 
        }
        cb(null, result.rows[0]);
    } catch (err) {
        cb(err);
    }
});

export default passport;
