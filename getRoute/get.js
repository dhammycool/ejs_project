import express from "express";
import cookieParser from "cookie-parser";
import csurf from "csurf";
import pool from "../config/db.js";
import stripe  from "../controllers/paymentControllers.js";
import upload from "../middlewares/uploads.js";
import moment from "moment";
import { validatePhoneNumber} from "../middlewares/midFunction.js";
import logger from "../middlewares/logger.js";
import fs from "fs";

const rout = express.Router();

let csrfProtection =csurf({cookie:true});
rout.get("", (req,res)=>{
   
    res.render("index.ejs");
  
});

rout.get("/about", (req, res) =>{
    res.render("about.ejs");
    
});




rout.get("/contact", (req, res) =>{
    res.render("contact.ejs");
});


rout.get("/event", (req, res) =>{
    res.render("event.ejs");

});


rout.get("/login",(req,res)=>{
    
    res.render("login.ejs");
});


rout.get("/receipt",  async (req, res) => {

    if (!req.isAuthenticated()) {
        return res.redirect("/register");
    }

    try {
    
        let userName=req.user.name;
        let userId=req.user.id;

        let payments = [];
        let  result=[];

     const results= await pool.query("SELECT a.id, s.price, s.name, a.appointment_address, a.appointment_mobile, a.appointment_date, a.start_time, a.end_time, EXTRACT(epoch FROM duration) AS duration_in_minutes, a.status  FROM appointments a Join services s on a.service_id=s.id where user_id=$1 ORDER BY a.appointment_date ASC", [userId]);
     result=results.rows || [];

    
    const paymentsQuery = await pool.query(
   `SELECT * FROM payments WHERE appointment_id IN(SELECT id FROM appointments WHERE user_id=$1) ORDER BY id DESC`, 
            [userId]
        );
        
        payments = paymentsQuery.rows || [];
     
       res.render("receipt.ejs", { record: result, payments, userName });

    } catch (error) {
        logger.info(" Error fetching payments:", error);
        res.status(500).send("Server Error");
    }
});



rout.get("/payment-success", async (req, res) => {
    if (!req.isAuthenticated()) {
        return res.redirect("/register");
    }
   
    try {
        const { payment_intent} = req.query;
    
        if (!payment_intent) {
            logger.info("No payment_intent found.");
            return res.status(400).send("Invalid request");
        }
           

        const paymentIntent = await stripe.paymentIntents.retrieve(payment_intent);
        
    logger.info("Received query:", req.query);

        const appointmentId = paymentIntent.metadata?.appointment_id || "Unknown";

        if (!appointmentId) {
            return res.status(400).send("Payment processed, but no linked appointment found.");
        }

        if(paymentIntent.status === "succeeded"){
    
        res.render("success.ejs", {
            amount: (paymentIntent.amount / 100).toFixed(2),
            currency:paymentIntent.currency.toUpperCase(),
            payment_method:paymentIntent.payment_method,
            status:paymentIntent.status,
           payment_id:paymentIntent.id,
          
            });
    }
    } catch (error) {
        logger.info("Error fetching payment details:", error);
        res.status(500).send("Error retrieving payment details");
    }
});


rout.get("/payment-success-receipt", async (req, res) => {
    const reference = req.query.reference;
    if (!reference) {
        return res.status(400).send("No payment reference provided.");
    }

    try {
        const { data } = await axios.get(`https://api.paystack.co/transaction/verify/${reference}`, {
            headers: {
                Authorization: `Bearer ${PAYSTACK_SECRET_KEY}`,
            },
        });

        const paymentData = data.data;
        console.log(paymentData);

        if (paymentData.status === "success") {
            const amount = (paymentData.amount / 100).toFixed(2);
            const currency = paymentData.currency;
            const payment_method = paymentData.channel;
            const status=paymentData.status;
            const payment_id = paymentData.metadata?.appointment_id || "Unknown";

            return res.render("success.ejs", {
                amount,
                currency,
                payment_method,
                status,
                payment_id
            });
        } else {
            return res.status(400).send("Payment not successful.");
        }
    } catch (error) {
        logger.info("💥 Error verifying Paystack payment:", error);
        res.status(500).send("Internal server error");
    }
});



rout.get("/register",(req, res) => {
    const token=req.csrfToken();
    
   res.render("register.ejs",
    {csrfToken:token}

   ); 
});


rout.get("/report", async (req, res) => {
    if (req.isAuthenticated() && req.user.is_admin) {
        try {
            const result = await pool.query(`
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
            res.render("report.ejs", {
                 record: result.rows,
                  userName: req.user.name,
             
                });
        } catch (err) {
            logger.info(err);
        }
    } else {
        res.render("login.ejs", { regErr: "You are not an authorized Admin" });
    }
});



rout.get("/services",csrfProtection, async (req,res) => {
    
    if(!req.isAuthenticated()){
        return res.redirect('/login');
    }
        try{
            const result= await pool.query('SELECT * FROM services');
            const check=result.rows;
            const token=req.csrfToken();
            res.render("services.ejs",{
                services:check,
                user:req.user,
                csrfToken:token
              
             });
        }catch(err){
            res.status(500).send('error fetching data');
        }
    
});


rout.get("/services/:id/book",  async (req, res) => {
    
    if (req.isAuthenticated()) {
        try {
            const result = await pool.query("SELECT * FROM services WHERE id=$1", [req.params.id]);
            if (result.rows.length === 0) return res.status(400).send('Service not found');

            const id= result.rows[0].id;
            
            res.redirect(`/bookings/${id}`);
        } catch (err) {
            logger.info(err);
        }
    } else {
        res.redirect("/login");
    }
});

rout.get("/bookings/:id", async (req, res) => {

    if(!req.isAuthenticated()){
        return res.redirect('/login');
    }
   try{
    const result = await pool.query("SELECT * FROM services WHERE id = $1", [req.params.id]);
     const token=req.csrfToken();
     logger.info("booking tok:",token);
    res.render("bookings.ejs", {
      service: result.rows[0],
      user: req.user,
     csrfToken:token,
    });
   }catch(error){
    logger.info(error);
   }
  });
  

rout.post("/bookings",async (req, res) => {
    
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
   
     const result= await pool.query("INSERT INTO appointments (user_id,service_id,appointment_city,appointment_address,appointment_mobile,appointment_date,start_time,end_time,music_desc) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING appointments.id",
     [user_id,service_id,cities,address,phone,moment(date).toISOString(),start_time,finish_time,music_desc,]) ;
     const appointment_id=result.rows[0].id;
      res.redirect(`/payment/${appointment_id}`);
      
 }catch(err){
     logger.info("error inserting appointment:",err);
     res.status(500).send("internal serval error");
 }
 }else{
     res.redirect('/login');
 }
 });

rout.get("/payment/:appointment_id", async (req,res) => {
    if(!req.isAuthenticated()){
        return res.redirect('/login');
    }
  
    const appointment_id=req.params.appointment_id;
    
    if(!appointment_id){
        logger.info("missing id");
    }
    try{
        const result=await pool.query(`
            SELECT a.id AS appointment_id, s.name AS service_name, u.email AS User_email , s.price AS service_price FROM appointments a 
             JOIN services s on  a.service_id=s.id 
             Join users u on a.user_id= u.id

             WHERE a.id=$1`,
             [appointment_id]);
        if(result.rows.length===0){
          return res.status(400).send("No Appointment found");
        }
        const token=req.csrfToken();
        res.render("payment.ejs",{
            message:'Thanks for the Bookings, we will approve this after payment.',
            appointments:result.rows[0],
            csrfToken:token,
         });
    }catch(err){
        logger.info("error fetching appointment:",err);
       
    }
});



rout.get("/services/:id/edit",async(req,res) =>{
    if(!req.isAuthenticated()){
        return res.redirect('/login');
    }
    const {id}=req.params;
    try{
    const result=await pool.query("SELECT * FROM services WHERE id=$1",[id]);
    const services=result.rows[0];
    res.render("edit.ejs",{service:services});
    }catch(err){
        logger.info(err);
    }

});

rout.put("/services/:id", async(req,res) =>{
    if(!req.isAuthenticated()){
        return res.redirect('/login');
    }
    let {id}=req.params;

    let new_image = "";

    if (req.file){
        new_image= req.file.filename;
    try{
        fs.unlinkSync("./uploads" + req.body.old_image);
    }catch(err){
        logger.info(err);
    }
    }else{
        new_image=req.body.old_image;
    }
    const {name,description,price}=req.body;
    const serviceImage=new_image;
   try{
    await pool.query("UPDATE services set name=$1, description=$2, image_url=$3, price=$4 WHERE id=$5",[name,description,serviceImage,price,id]);
    res.redirect("/get/services");
   }catch(err){
     logger.info(err);
   }
});



 rout.post('/services/show', upload, async (req,res)=>{
    if(!req.isAuthenticated()){
        return res.redirect('/login');
    }
    const {name, description,price}=req.body;
    const imageUrl=req.file.filename;
    try{
     await pool.query('INSERT INTO services (name,description,image_url,price) VALUES($1,$2,$3,$4)',[name,description,imageUrl,price]);
     res.redirect("/get/services");
   
    }catch(err){
        logger.info(err);
    }
});



    rout.delete('/services/:id',async(req,res) =>{
        if(!req.isAuthenticated()){
            return res.redirect('/login');
        }
        const {id}=req.params;
        try{
          
        await pool.query(`DELETE FROM payments WHERE appointment_id IN (SELECT id FROM appointments WHERE service_id=$1)`,[id]);
        await pool.query("DELETE FROM appointments WHERE service_id=$1",[id]);
        await pool.query("DELETE FROM services WHERE id=$1",[id]);
        res.redirect("/get/services");
        }catch(err){
            logger.info(err);
        }
    });


    
export default rout;