import express from "express";
import bodyParser from "body-parser";
import { dirname } from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import bcrypt from "bcrypt";
import session from "express-session";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth20";
import env from "dotenv";
import path from "path";
import fs from "fs";
import methodOverride from "method-override";
import moment from "moment";
import Stripe from "stripe";
import https from 'https';
import cors from "cors";
import nodemailer from "nodemailer";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { body, validationResult } from "express-validator";
import csurf from "csurf";
import { createLogger, format, transports } from "winston";
import logger from "./middlewares/logger.js";
import db from "./config/db.js";
import upload from "./middlewares/uploads.js";
import passport from "./middlewares/auth.js";
import router from "./routes/auth.js";




env.config();
const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const app=express();
const port=3000;
const saltRounds=12;
const csrfProtection = csurf({ cookie: true });


// Middleware
app.use(express.static("public"));
app.use('/uploads',express.static('uploads'));
app.use(express.text());

if (process.env.NODE_ENV) {
    app.use((req, res, next) => {
        if (!req.secure) {
            return res.redirect("https://" + req.headers.host + req.url);
        }
        next();
    });
}
app.use((req, res, next)=>{
    if(req.originalUrl==="/webhook"){
        next();
    }else{
        express.json()(req,res,next);
    }
});

app.use(bodyParser.urlencoded({extended:true}));
app.use(methodOverride("_method"));

app.use(cors({
    origin: process.env.CLIENT_URL,
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
}));


app.use(session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 1000 * 60 * 60 * 24, 
        httpOnly: true,
        secure: process.env.NODE_ENV=== "production",
        sameSite: "strict", 
    },
}));


app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) =>{
    res.locals.user=req.user || null;
    next();
});
app.use(helmet());

app.use(csrfProtection);

app.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken(); 
    next();
});


function validatePhoneNumber(phone){
    const phoneRegex=/^\+?[0-9\s\-()]{7,15}$/;
    return phoneRegex.test(phone);
}

function formatDuration(seconds){
    const hours=Math.floor(seconds/3600);
    const minutes=Math.floor((seconds % 3600)/60);
    return `${hours}h ${minutes}m`;
}

const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, 
    max: 5,
    message: "Too many login attempts, please try again later.",
});



// Routes


app.get("", (req,res)=>{
   
    res.render("index.ejs");
  
});

app.get("/about", (req, res) =>{
    res.render("about.ejs");

});


app.get("/contact", (req, res) =>{
    res.render("contact.ejs");
});


app.get("/event", (req, res) =>{
    res.render("event.ejs");

});

app.get("/services", async (req,res) => {
    
    if(!req.isAuthenticated()){
        return res.redirect('/login');
    }

        try{
            const result= await db.query('SELECT * FROM services');
            const check=result.rows;
            res.render("services.ejs",{services:check,user:req.user});
        }catch(err){
            res.status(500).send('error fetching data');
        }
    
});



app.get("/services/:id/edit", async(req,res) =>{
    const {id}=req.params;
    try{
    const result=await db.query("SELECT * FROM services WHERE id=$1",[id]);
    const services=result.rows[0];
    res.render("edit.ejs",{service:services});
    }catch(err){
        console.error(err);
    }

});



app.get("/services/:id/book", async (req, res) => {
    if (req.isAuthenticated()) {
        try {
            const result = await db.query("SELECT * FROM services WHERE id=$1", [req.params.id]);
            if (result.rows.length === 0) return res.status(400).send('Service not found');
            res.render("bookings.ejs", { service: result.rows[0], user: req.user });
        } catch (err) {
            console.error(err);
        }
    } else {
        res.redirect("/login");
    }
});


app.get("/login",(req,res)=>{
    res.render("login.ejs");
});



app.get("/register",(req,res)=>{
    res.render("register.ejs");
});


app.get("/receipt",  async (req, res) => {
    try {
        if (!req.isAuthenticated()) {
            return res.redirect("/register");
        }

        let userName=req.user.name;
        let userId=req.user.id;

        let payments = [];
        let  result=[];

     const results= await db.query("SELECT a.id, s.price, s.name, a.appointment_address, a.appointment_mobile, a.appointment_date, a.start_time, a.end_time, EXTRACT(epoch FROM duration) AS duration_in_minutes, a.status  FROM appointments a Join services s on a.service_id=s.id where user_id=$1 ORDER BY a.appointment_date ASC", [userId]);
     result=results.rows || [];

    
    const paymentsQuery = await db.query(
   `SELECT * FROM payments WHERE appointment_id IN(SELECT id FROM appointments WHERE user_id=$1) ORDER BY id DESC`, 
            [userId]
        );
        
        payments = paymentsQuery.rows || [];
     
       res.render("receipt.ejs", { record: result, payments, userName });

    } catch (error) {
        console.error("❌ Error fetching payments:", error);
        res.status(500).send("Server Error");
    }
});


// Admin Report
app.get("/report", async (req, res) => {
    if (req.isAuthenticated() && req.user.is_admin) {
        try {
            const result = await db.query(`
                SELECT a.id, users.email, users.name AS user_name, 
                       s.price, s.name, a.appointment_city, 
                       a.appointment_address, a.appointment_mobile, 
                       a.appointment_date, a.start_time, a.end_time, 
                       a.music_desc, a.status 
                FROM appointments a 
                JOIN users ON a.user_id = users.id 
                JOIN services s ON a.service_id = s.id  
                ORDER BY a.appointment_date DESC
            `);
            res.render("report.ejs", { record: result.rows, userName: req.user.name });
        } catch (err) {
            console.error(err);
        }
    } else {
        res.render("login.ejs", { regErr: "You are not an authorized Admin" });
    }
});





app.get("/payment-success", async (req, res) => {
    try {
        console.log("Received query:", req.query);
        const { payment_intent} = req.query;// Get PaymentIntent ID from URL

        if (!payment_intent) {
            console.log("No payment_intent found.");
            return res.status(400).send("Invalid request");
        }
           

        const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent);
        const appointmentId = paymentIntent.metadata?.appointment_id || "Unknown";

        if (!appointmentId) {
            return res.status(400).send("Payment processed, but no linked appointment found.");
        }

        if(paymentIntent.status === "succeeded"){
    
        res.render("success.ejs", {
            amount: (paymentIntent.amount / 100).toFixed(2),// Convert cents to NGN
            currency:paymentIntent.currency.toUpperCase(),
            payment_method:paymentIntent.payment_method,
            status:paymentIntent.status,
           payment_id:paymentIntent.id,
          
            });
    }
    } catch (error) {
        console.error("Error fetching payment details:", error);
        res.status(500).send("Error retrieving payment details");
    }
});


app.get("/payment/:appointment_id", async (req,res) => {
    const appointment_id=req.params.appointment_id;
    try{
        const result=await db.query(`SELECT a.id AS appointment_id, s.name AS service_name, s.price AS service_price FROM appointments a  JOIN services s on  a.service_id=s.id WHERE a.id=$1`,[appointment_id]);
        if(result.rows.length===0){
          return res.status(400).send("No Appointment found");
        }
        res.render("payment.ejs",{message:'Thanks for the Bookings, we will approve this after payment.',appointments:result.rows[0]});
    }catch(err){
        console.error("error fetching appointment:",err);
       
    }
});

    

app.put("/record/:id", async (req,res) =>{
    let appointmentId=req.params.id;
    try{
        await db.query("UPDATE appointments SET status=$1 WHERE id=$2",["Booked",appointmentId]);
        res.redirect("/report");
    }catch(err){
        console.error(err);
    }
    });





app.post("/bookings", async (req, res) => {
   console.log('User:',req.user);
    if(req.isAuthenticated()){
    try{
    const user_id=req.body.user_id;
    const service_id=req.body.service_id;
    const cities=req.body.cities;
    const address=req.body.address;
    const phone=req.body.phone;
    const date=req.body.date;
    const start_time=req.body.start_time;
    const finish_time=req.body.finish_time;
    const music_desc=req.body.music_desc;

    if(!validatePhoneNumber(phone)){
        return res.status(400).send('invalid phone number format.');
    }
  
    const result= await db.query("INSERT INTO appointments (user_id,service_id,appointment_city,appointment_address,appointment_mobile,appointment_date,start_time,end_time,music_desc) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING appointments.id",
    [user_id,service_id,cities,address,phone,moment(date).toISOString(),start_time,finish_time,music_desc,]) ;
    const appointment_id=result.rows[0].id;
     res.redirect(`/payment/${appointment_id}`);
     
}catch(err){
    console.error("error inserting appointment:",err);
    res.status(500).send("internal serval error");
}
}else{
    res.redirect('/login');
}
});




app.post("/add-service", upload, async (req,res)=>{
  
    const {name, description,price}=req.body;
    const imageUrl=req.file.filename;
    try{
     const test= await db.query('INSERT INTO services (name,description,image_url,price) VALUES($1,$2,$3,$4)',[name,description,imageUrl,price]);
     res.redirect("/services");
   
    }catch(err){
        console.error(err);
    }
});


app.delete("/services/:id", async(req,res) =>{
    const {id}=req.params;
    try{
    await db.query("DELETE FROM services WHERE id=$1",[id]);
    res.redirect("/services");
    }catch(err){
        console.error("no record");
    }
});

app.put("/services/:id", upload, async(req,res) =>{

    let {id}=req.params;

    let new_image="";

    if (req.file){
        new_image= req.file.filename;
    try{
        fs.unlinkSync("./uploads" + req.body.old_image);
    }catch(err){
        console.error(err);
    }
    }else{
        new_image=req.body.old_image;
    }
    const {name,description,price}=req.body;
    const serviceImage=new_image;
   try{
    await db.query("UPDATE services set name=$1, description=$2, image_url=$3, price=$4 WHERE id=$5",[name,description,serviceImage,price,id]);
    res.redirect("/services");
   }catch(err){
     console.error(err);
   }
});





app.post("/register", [
    body("username").isEmail().withMessage("Enter a valid email"),
    body("password").isLength({ min: 8 }).withMessage("Password must be at least 8 characters"),
], async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
        return res.render("register.ejs", { regError: errors.array()[0].msg });
    }
    const username=req.body.username;
    const password=req.body.password;
    const name=req.body.name;
    try{
        const search=await db.query("SELECT * FROM users where email=($1)",[username]);
        if(search.rows.length>0){
            res.render("register.ejs",{regError:"user already exist, kindly log in."});
            }else{
               bcrypt.hash(password, saltRounds, async (err,harsh)=>{
                if (err){
                    console.error(err);
                }else{
                  const result= await db.query("INSERT INTO users (email, password,name) VALUES($1,$2,$3) RETURNING *", [username,harsh,name] ) ;
                     const user=result.rows[0];
                     req.login(user, (err)=>{
                        console.error(err);
                        res.redirect("/services");
                     })
                     
                    }   
            }); 
            }
        }catch(err){
            console.log(err);

        }
     });


passport.serializeUser((user,cb)=>{
    cb(null,user.id);

});

passport.deserializeUser(async (id, cb) => {
    try {
        const result = await db.query("SELECT * FROM users WHERE id = $1", [id]);
        if (result.rows.length === 0) {
            return cb(null, false); 
        }
        cb(null, result.rows[0]);
    } catch (err) {
        cb(err);
    }
});

process.on("SIGINT", async () => {
    try {
        await db.end();
        console.log("Database connection closed.");
        process.exit(0);
    } catch (err) {
        console.error("Error closing database connection:", err);
        process.exit(1);
    }
});

process.on("SIGTERM", async () => {
    try {
        await db.end();
        console.log("Database connection closed.");
        process.exit(0);
    } catch (err) {
        console.error("Error closing database connection:", err);
        process.exit(1);
    }
});

app.listen(port, ()=>{
    console.log('server is running on port 3000');
});


