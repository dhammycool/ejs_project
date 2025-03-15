import passport from "passport";
import { Strategy } from "passport-local";
import bcrypt from "bcrypt";
import db from "../config/db.js";  // Import database connection

passport.use(new Strategy(async function verify(username, password, cb) {
    try {
        // Fetch user from the database
        const check = await db.query("SELECT * FROM users WHERE email=$1", [username]);

        // If user is not found
        if (check.rows.length === 0) {
            return cb(null, false, { message: "User does not exist. Please register!" });
        }

        const user = check.rows[0];
        const storedPassword = user.password;

        // Compare hashed passwords using await
        const isMatch = await bcrypt.compare(password, storedPassword);
        
        if (isMatch) {
            return cb(null, user);  // User authenticated
        } else {
            return cb(null, false, { message: "Incorrect password" });
        }

    } catch (err) {
        console.error("Authentication error:", err);
        return cb(null, false, { message: "An error occurred during authentication. Please try again." });
    }
}));

export default passport;
