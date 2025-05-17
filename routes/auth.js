import express from "express";
import passport from "../middlewares/auths.js"; 
import pool from "../config/db.js";
import bcrypt from "bcryptjs";
import { body, validationResult } from "express-validator"; 
import {loginLimiter } from "../middlewares/midFunction.js";
import csrfProtection from "csurf";
import logger from "../middlewares/logger.js";


const router = express.Router();
const saltRounds = 12; 

router.post( "/login",  loginLimiter,   [  body("username").isEmail().normalizeEmail(),  body("password").trim().isLength({ min: 6 }), ],
    (req, res, next) => {
        const errors = validationResult(req);
        if (!errors.isEmpty()) {
            return res.status(400).json({ errors: errors.array()});
        }

        passport.authenticate("local", (err, user, info) => {
            if (err) return next(err);
            if (!user) {
                return res.render("login.ejs", { error: info ? info.message : "Invalid credentials"});
            }

            req.logIn(user, (err) => {
                if (err) return next(err);
                return user.is_admin ? res.redirect("/report") : res.redirect("/services");
            });
        })(req, res, next);
    }
);


router.get("/logout", (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).send("Logout failed");
        res.redirect("/login");
    });
});


router.post("/register", [
    body("username").isEmail().withMessage("Enter a valid email"),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
], async (req, res) => {
    // Validate input fields
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render("register.ejs", { 
            regError: errors.array()[0].msg,
             
             });
    }

    // Destructure user details from the request body
    const { username, password, name } = req.body;

    try {
        // Check if user already exists
        const search = await pool.query("SELECT * FROM users WHERE email=$1", [username]);
        if (search.rows.length > 0) {
            return res.render("register.ejs", {
                 regError: "User already exists, kindly log in.",
                 });
        }

        // Hash the password before storing
        const hashedPassword = await bcrypt.hash(password, 12);

        // Insert user into the database
        const result = await pool.query(
            "INSERT INTO users (email, password, name) VALUES ($1, $2, $3) RETURNING *",
            [username, hashedPassword, name]
        );

        // Get the newly created user from the result
        const user = result.rows[0];

        // Log the user in after successful registration
        req.login(user, (err) => {
            if (err) {
                return res.render("register.ejs", {
                     regError: "Error logging in after registration.", 
                     });
            }
            res.redirect("/login");
        });
    } catch (err) {
        logger.info(err);
        res.status(500).send("Internal Server Error");
    }
});


export default router;
