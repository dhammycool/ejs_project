import express from "express";
import passport from "../middlewares/auth.js"; // Import Passport middleware

const router = express.Router();


router.post("/login", (req, res, next) => {
    passport.authenticate("local", (err, user, info) => {
        if (err) return next(err);
        if (!user) {
            return res.render("login.ejs", { error: info ? info.message : "Invalid credentials" });
        }
        req.logIn(user, (err) => {
            if (err) return next(err);
            return user.is_admin ? res.redirect("/report") : res.redirect("/services");
        });
    })(req, res, next);
});

router.get("/logout", (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).send("Logout failed");
        res.redirect("/login");
    });
});

export default router;
