// 🌍 Core & Third-Party Modules
import express from "express";
import session from "express-session";
import bodyParser from "body-parser";
import methodOverride from "method-override";
import helmet from "helmet";
import cors from "cors";
import cookieParser from "cookie-parser";
import csurf from "csurf";
import path, { dirname } from "path";
import { fileURLToPath } from "url";
import env from "dotenv";
import moment from "moment";
import fs from "fs";
import bcrypt from "bcrypt";
import https from "https";
import axios from "axios";
import Stripe from "stripe";
import nodemailer from "nodemailer";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";
import logger from "./middlewares/logger.js";

// 🔐 Auth
import passport from "./middlewares/auths.js";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth20";

// 📦 App Routes & Config
import db from "./config/db.js";
import router from "./routes/auth.js";
import paymentRouter from "./routes/payments.js";
import { handleWebhook } from "./controllers/paymentControllers.js";
import rout from "./getRoute/get.js";



// ✅ Environment
env.config();
const app = express();

const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);

app.post("/payments/webhook", express.raw({ type: "application/json" }), handleWebhook);


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// 🧠 View Engine
app.set("view engine", "ejs");

app.use(cors({
  origin: process.env.CLIENT_URL_ALT,
  credentials: true,
}));


// 🛡️ Helmet
app.use(
    helmet({
      
     contentSecurityPolicy: {
      
     directives: {
      defaultSrc: ["'self'"],
      scriptSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://apis.google.com",
        "https://js.stripe.com"
      ],
      frameSrc: [
        "'self'",
        "https://js.stripe.com"
      ],
      connectSrc: [
        "'self'","*",
        "https://js.stripe.com",
        "https://api.stripe.com",
        "https://checkout.stripe.com",
         process.env.CLIENT_URL,
         process.env.CLIENT_URL_ALT,// ✅ your ngrok domain
      ],
      styleSrc: [
        "'self'",
        "'unsafe-inline'",
        "https://fonts.googleapis.com"
      ],
      imgSrc: ["'self'", "data:"],
     
    },
  },


  })
 );
  

// 🍪 Cookie Parser
app.use(cookieParser());

// 🧠 Body Parsers
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.text()); // For webhooks
app.use(express.urlencoded({ extended: true }));

// 📦 Static Files
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));

// 🧠 Method Override
app.use(methodOverride("_method"));

// 🔐 Session
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    maxAge: 86400000,
    secure: false,
    httpOnly: true,
    sameSite: "lax"
  }
}));


//wil latter update this back

//secure: process.env.NODE_ENV ==="production",
//httpOnly: true,
//sameSite: "strict"
// 🔐 Passport
app.use(passport.initialize());
app.use(passport.session());

// 💉 CSRF - After session & bodyParser
const csrfProtection = csurf();


// 💉 CSRF - After session & bodyParser
app.use((req, res, next) => {
  if ( req.path === "/auth/login") {
    return next();
  }
  csrfProtection(req, res, next);
});

// 📍 Make token available in views
app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken ? req.csrfToken() : null;
  next();
});

// 📍 Custom MIME type for JS
app.use((req, res, next) => {
  if (req.url.endsWith(".js")) {
    res.type("application/javascript");
  }
  next();
});

// 🔒 Enforce HTTPS in production
if (process.env.NODE_ENV === "production") {
  app.enable("trust proxy");
  app.use((req, res, next) => {
    if (req.protocol !== "https") {
      return res.redirect("https://" + req.headers.host + req.url);
    }
    next();
  });
}



// 🧑 Set user in views
app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
});

// 🛣️ Routes
app.use("/", rout);
app.use("/auth", router);
app.use("/get", rout);
app.use("/payments", paymentRouter);



// ❗ CSRF Errors
app.use((err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN") {
    return res.status(403).send("Invalid CSRF token");
  }
  next(err);
});

// ❗ Generic Error Handler
app.use((err, req, res, next) => {
  logger.info(err.stack);
  res.status(500).send("Something went wrong!");
});

// 💥 Graceful Shutdown
process.on("SIGINT", async () => {
  try {
    await db.end();
    logger.info("Database connection closed.");
    process.exit(0);
  } catch (err) {
    logger.info("Error closing DB:", err);
    process.exit(1);
  }
});

process.on("SIGTERM", async () => {
  try {
    await db.end();
    logger.info("Database connection closed.");
    process.exit(0);
  } catch (err) {
    logger.info("Error closing DB:", err);
    process.exit(1);
  }
});

// 🚀 Start Server
app.listen(process.env.port, () => {
  logger.info(`Server running on port ${process.env.port}`);
});
