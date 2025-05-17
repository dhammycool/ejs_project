
import express from "express";
import session from "express-session";
import bodyParser from "body-parser"
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
import bcrypt from "bcryptjs";
import https from "https";
import axios from "axios";
import Stripe from "stripe";
import nodemailer from "nodemailer";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";
import logger from "./middlewares/logger.js";
import morgan from "morgan";
import passport from "./middlewares/auths.js";
import pool from "./config/db.js";
import router from "./routes/auth.js";
import paymentRouter from "./routes/payments.js";
import { handleWebhook } from "./controllers/paymentControllers.js";
import rout from "./getRoute/get.js";


env.config();
const app = express();

const stripe=new Stripe(process.env.STRIPE_SECRET_KEY);

app.post("/payments/webhook", express.raw({ type: "application/json" }), handleWebhook);


const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);


app.set("view engine", "ejs");

app.use(cors({
origin: [process.env.CLIENT_URL_ALT,"https://4e73-2a02-c7c-86ce-d800-782c-d432-738d-a587.ngrok-free.app"],
 credentials: true,
}));



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
         process.env.CLIENT_URL_ALT,
         "https://4e73-2a02-c7c-86ce-d800-782c-d432-738d-a587.ngrok-free.app",
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
  
app.use(cookieParser());
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());
app.use(express.text()); 
app.use(express.urlencoded({ extended: true }));
app.use(express.static("public"));
app.use("/uploads", express.static("uploads"));
app.use(methodOverride("_method"));
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV==='production',
    httpOnly: true,
    sameSite: "strict",
    maxAge: 1000 * 60 * 60 * 24,
  }
}));
app.use(passport.initialize());
app.use(passport.session());
const csrfProtection = csurf({cookie:true});
app.use((req, res, next) => {
  
  const method=req.method;
  const path=req.path;
const isEdit=/^\/services\/[^\/]+\/edit$/.test(path) ;
const isSubmit= method ==='PUT' && /^\/services\/[^\/]+$/.test(path);

  if ( path=== "/auth/login" || path==="/get/services/show"   || path==="/services/show" || isEdit || isSubmit)
   {
    return next();
  }
  csrfProtection(req, res, next);
});


app.use((req, res, next) => {
  res.locals.csrfToken = req.csrfToken ? req.csrfToken() : null;
  next();
});


app.use((req, res, next) => {
  if (req.url.endsWith(".js")) {
    res.type("application/javascript");
  }
  next();
});

if(process.env.NODE_ENV !=='production'){
  app.use(morgan("dev"));
}

if (process.env.NODE_ENV === "production") {
  app.enable("trust proxy");
  app.use((req, res, next) => {
    if (req.protocol !== "https") {
      return res.redirect("https://" + req.headers.host + req.url);
    }
    next();
  });
}


app.use((req, res, next) => {
  res.locals.user = req.user || null;
  next();
});


app.use("/", rout);
app.use("/auth", router);
app.use("/get", rout);
app.use("/payments", paymentRouter);


app.use((err, req, res, next) => {
  if (err.code === "EBADCSRFTOKEN") {
    return res.status(403).send("Invalid CSRF token");
  }
  next(err);
});


app.use((err, req, res, next) => {
  logger.info(err.stack);
  if (process.env.NODE_ENV=== 'production'){
    res.status(500).send("Something went wrong!");
  }else{
    res.status(500).send(`<pre>${err.stack}</pre>`);
  }
  
});


process.on("SIGINT", async () => {
  try {
    await pool.end();
    logger.info("Database connection closed.");
    process.exit(0);
  } catch (err) {
    logger.info("Error closing DB:", err);
    process.exit(1);
  }
});

process.on("SIGTERM", async () => {
  try {
    await pool.end();
    logger.info("Database connection closed.");
    process.exit(0);
  } catch (err) {
    logger.info("Error closing DB:", err);
    process.exit(1);
  }
});

const PORT=process.env.PORT || 3000;

app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
