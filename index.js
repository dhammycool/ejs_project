import express from "express";
import bodyParser from "body-parser";
import { dirname } from "path";
import { fileURLToPath } from "url";
import axios from "axios";
import pg from "pg";
import bcrypt from "bcrypt";
import session from "express-session";
import passport from "passport";
import { Strategy } from "passport-local";
import GoogleStrategy from "passport-google-oauth20";
import env from "dotenv";
import multer from "multer";
import path from "path";
import fs from "fs";
import methodOverride from "method-override";
import moment from "moment";
import Stripe from "stripe";
import https from 'https';
import cors from "cors";
import nodemailer from "nodemailer";




const __filename=fileURLToPath(import.meta.url);
const __dirname=path.dirname(__filename);
const app=express();
const port=3000;
const saltRounds=10;
const stripe=new Stripe("sk_test_51QfSZvGzl6v4hn3sfjQ8FnQiBJXGd8feZkn89Ph7S6MhlhyVBzPytzH4mmROvVDbQydZ9YM2cinDdJNiQBbPSauv00Q80oaCTz");

env.config();
app.use(express.static("public"));
app.use('/uploads',express.static('uploads'));
app.use(express.text());
app.use((req, res, next)=>{
    if(req.originalUrl==="/webhook"){
        next();
    }else{
        express.json()(req,res,next);
    }
});

app.use(bodyParser.urlencoded({extended:true}));
app.use(methodOverride("_method"));

app.use(cors({origin:'http://localhost:3000'}));



app.use(
    session({
        secret:"SECRET",
        resave:false,
        saveUninitialized: true, // ✅ Change this to true to ensure session is stored
        cookie: {
            maxAge: 1000 * 60 * 60 * 24, // 1 day session lifetime
            secure: false, // ✅ Change to true if using HTTPS
            httpOnly: true, 
        },

    })
);
app.use(passport.initialize());
app.use(passport.session());

app.use((req, res, next) =>{
    res.locals.user=req.user || null;
    next();
});


const db= new pg.Client({
    user:process.env.PG_USER,
    host:process.env.PG_HOST,
    database:process.env.PG_DATABASE,
    password:process.env.PG_PASSWORD,
    port:process.env.PG_PORT,
});


db.connect();

function validatePhoneNumber(phone){
    const phoneRegex=/^\+?[0-9\s\-()]{7,15}$/;
    return phoneRegex.test(phone);
}

function formatDuration(seconds){
    const hours=Math.floor(seconds/3600);
    const minutes=Math.floor((seconds % 3600)/60);
    return '${hours}h ${minutes}m';
}


const storage=multer.diskStorage({
    destination:(req, file, cb) => {
        cb(null, './uploads');
    },
    filename:(req, file, cb) =>{
        const uniqueSuffix=Date.now() + '_' + Math.round(Math.random()*1E9);
        cb(null, file.fieldname + '-' + Date.now() + path.extname(file.originalname));
    }

});

const upload= multer({
    storage:storage,
    limits:{fileSize:1000000},
    fileFilter:(req, file, cb) =>{
        const filetypes=/jpeg|jpg|png|gif/;
        const extname=filetypes.test(path.extname(file.originalname).toLowerCase());
        const mimetype=filetypes.test(file.mimetype);
        if (extname && mimetype){
            return cb(null, true);
        }else{
            cb('Error:Images Only!');
        }
    }

}).single('serviceImage')


app.get("/login",(req,res)=>{
    res.render("login.ejs");
});





app.get("/report", async (req, res) => {
    
    if (req.isAuthenticated() && req.user.is_admin){

        let userName=req.user.name;
    try{
        const request= await db.query("SELECT a.id, users.email, users.name As user_name,  s.price, s.name, a.appointment_city, a.appointment_address, a.appointment_mobile, a.appointment_date, a.start_time, a.end_time, a.music_desc,  a.status FROM appointments a Join users on a.user_id=users.id Join services s on a.service_id=s.id  ORDER BY a.appointment_date DESC");
       const  result=request.rows;
        res.render("report.ejs",{record:result,userName});
    }catch(err){
     console.log(err);
    }} else{
        res.render("login.ejs",{regErr:"You are not an authorized  Admin"});
    } 
});

app.get("/logout", (req, res) => {
    req.session.destroy((err) => {
        if (err) return res.send("Error logging out.");
        res.redirect("/login");
    });
});


app.get("/contact", (req, res) =>{
    res.render("contact.ejs");
});


app.get("/auth/google", passport.authenticate("google",{

  successRedirect:'/', scope:["profile","email"],

})
);


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
        
        console.log("✅ Payments from DB:", paymentsQuery.rows); // ✅ Debug log
        payments = paymentsQuery.rows || [];
     
       res.render("receipt.ejs", { record: result, payments, userName });

    } catch (error) {
        console.error("❌ Error fetching payments:", error);
        res.status(500).send("Server Error");
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




app.get("", (req,res)=>{
   
    res.render("index.ejs");
  
});


app.get("/about", (req, res) =>{
    res.render("about.ejs");

});

app.get("/event", (req, res) =>{
    res.render("event.ejs");

});



app.get("/services/:id/edit", async(req,res) =>{
        const {id}=req.params;
        try{
        const result=await db.query("SELECT * FROM services WHERE id=$1",[id]);
        const services=result.rows[0];
        res.render("edit.ejs",{service:services});
        }catch(err){
            console.log("error");
        }
    
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




app.get("/services/:id/book", async(req,res) =>{
 console.log('User:',req.user);
 if(req.isAuthenticated()){
 const service_id=req.params.id;
 try{
    const result= await db.query("SELECT * FROM services WHERE id=$1",[service_id]);
    if(result.rows.length===0){
        return res.status(400).send('service not found');
    }
    res.render("bookings.ejs",{service:result.rows[0],user:req.user});
 }catch(err){
    console.log(err);
 }
}else{
    res.redirect("/login");
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
        console.log("error fetching appointment:",err);
        console.log("internal server error");
    }
});





// post route   >>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>
app.post("/login", passport.authenticate("local",{
    failureRedirect: "/login",
    failureFlash:true
}),
(req,res) =>{
    console.log(req.user);
    if(req.user.is_admin){
        res.redirect('/report');
    }else{
        res.redirect('/services');
    }
});

app.post("/create-payment-intent", async (req, res) => { 
try{
    let { amount, appointment_id } = req.body;

     if (!amount || !appointment_id) { 

    return res.status(400).json({ error: "Missing amount or booking ID" });
 } 


 const paymentIntent = await stripe.paymentIntents.create({ 

        amount: amount * 100, 

        currency: "ngn",

        metadata: { appointment_id:appointment_id },

    }); 

         console.log("✅ PaymentIntent Created:", paymentIntent.id);

         res.json({ clientSecret: paymentIntent.client_secret});

         } catch (error) {

         console.error("Error creating payment intent:", error);

         } 
        
        });
        

        app.post("/webhook", express.raw({ type: "application/json" }), async (req, res) => {
            console.log("webhook received");

         const signature = req.headers["stripe-signature"];
          let event;
          let email;
          let name;

           try { 
            event =  await  stripe.webhooks.constructEvent(req.body, signature, "whsec_tBplmvp1hN9wfMqTJy3nwP82TpyXgsuG");
            console.log("webhook verified succesfully:",event.type);

         } catch (err) { 
         console.error("webhook signature verification failed:",err.message);
        } 
        let eventType=event.type;
        let paymentIntent=event.data.object;
        if (eventType=== "payment_intent.succeeded") {  
        const appointment_id = paymentIntent.metadata.appointment_id;
        const payment_id=paymentIntent.id;
        const amount=paymentIntent.amount/100;
        const payment_method=paymentIntent.payment_method_types[0];
        const status=paymentIntent.status;

          try {
            await db.query("INSERT INTO payments (appointment_id, payment_id,payment_method, amount,payment_status) VALUES($1, $2, $3, $4, $5) ", [appointment_id, payment_id, payment_method, amount,status]);
             console.log("✅ Payment record inserted successfully");
            


            await db.query("UPDATE appointments SET status ='success' WHERE id = $1", [appointment_id]); 

            console.log(`✅ Payment status updated to Confirmed appointments${appointment_id}`);

            const result= await db.query(
                `SELECT a.id, u.email, u.name
                FROM appointments a 
                JOIN users u ON a.user_id = u.id
                WHERE a.id =$1`,
               [appointment_id]);
            if (result.rows.length>0){
                 email=result.rows[0].email;
                 name=result.rows[0].name;
                 console.log(email);
                 console.log(name);
             }else{
                console.log("missed data");
             }

             try {
    
            const transporter = nodemailer.createTransport({
            service: "gmail",
            auth: {
                user: "dhammycool@gmail.com",
                pass: "wgmk alwf gxck kinh", 
            },
        });

        const mailOptions = {
            from: "dhammycool@gmail.com",
            to:email, 
            subject: "Payment Successful - Booking Confirmed",
            text: `Dear ${name},\n\nYour payment of ₦${amount.toLocaleString()} was successful! Your booking has been confirmed.\n\nThank you!\n\nBest Regards, DJ ROMEO.`,
        };

        await transporter.sendMail(mailOptions);
        console.log(`✅ Email sent successfully`);

    } catch (emailError) {
        console.error("❌ Error sending email:", emailError.message);
    }
        res.status(200).json({ received: true });
    } catch (err) {
        console.error("❌ Error processing webhook:", err);
        return res.status(500).json({ error: "Failed to update appointment status" });
    }
} else if (eventType === "payment_intent.payment_failed") {
   
    const appointment_id = paymentIntent.metadata.appointment_id;
    console.log(`❌ Payment failed for appointment ${appointment_id}`);

    await db.query("UPDATE appointments SET status = 'Pending' WHERE id = $1", [appointment_id]);
    console.log("updated failed transaction");

    res.status(200).json({ success: false, message: "Payment failed", appointment_id });
    return;
} 
else {
    console.log(`⚠️ Unhandled event type: ${eventType}`);
    return res.status(400).send("Unhandled event type");
}
});

  

app.put("/record/:id", async (req,res) =>{
    let appointmentId=req.params.id;
    try{
        await db.query("UPDATE appointments SET status=$1 WHERE id=$2",["Booked",appointmentId]);
        res.redirect("/report");
    }catch(err){
        console.log(err);
    }
    });

app.post("/auth/google/bookings", passport.authenticate("google",{
    successRedirect: "/bookings",
    failureRedirect: "/login",
})
);



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
    console.log('delete request received:',req.body);
    const {id}=req.params;
    try{
    await db.query("DELETE FROM services WHERE id=$1",[id]);
    res.redirect("/services");
    }catch(err){
        console.log("no record");
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
        console.log(err);
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
     console.log(err);
   }
});





app.post("/register", async (req,res)=>{
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
                    console.log(err);
                }else{
                  const result= await db.query("INSERT INTO users (email, password,name) VALUES($1,$2,$3) RETURNING *", [username,harsh,name] ) ;
                     const user=result.rows[0];
                     req.login(user, (err)=>{
                        console.log(err);
                        res.redirect("/services");
                     })
                     
                    }   
            }); 
            }
        }catch(err){
            console.log(err);

        }
     });

// local stategy
passport.use(new Strategy( async function verify(username,password,cb){
    try{
        
        const check= await db.query("SELECT * FROM users where email=$1", [username,]);
        if (check.rows.length > 0) {
          const user=check.rows[0];
          const storedPassword=user.password;

          bcrypt.compare( password,storedPassword,(err, check)=> {
            if(err){
                return cb(err);
            }else{
                if(check){
                 return cb(null, user);
                 
                }else{
                    return(null,false);
                }
            }
             });
          } else {
            return cb("user not exist please register!");
          }

        } catch(err) {

        return cb(err);
     }
    
})
);


// google strategy..............

passport.use(
    "google", 
    new GoogleStrategy(
      {
      clientID:process.env.GOOGLE_CLIENT_ID,
      clientSecret:process.env.GOOGLE_CLIENT_SECRET,
      callbackURL:"http://localhost:3000/auth/google/bookings",
      userProfileURL:"https://www.googleapis.com/oauth2/v3/userinfo",
      },
     async (accessToken, refreshToken, profile, cb)=>{
       try{
       const check_user=await db.query("SELECT * FROM users where email=$1",[profile.email]);
       if(check_user.rows.lenght===0){
       const newUser=await db.query("INSERT INTO users (email,password) values=($1,$2) RETURNING *",[profile.email, "google"]);
       cb(null, newUser.rows[0]);
       }else{
        cb(null,check_user.rows[0]);
       }
    }catch(err){
     cb(err);
    }
    }
)
);

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



app.listen(port, ()=>{
    console.log('server is running on port 3000');
});



