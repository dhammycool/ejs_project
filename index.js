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
import Stripe from 'stripe';




const _dirname=dirname(fileURLToPath(import.meta.url));
const app=express();
const port=3000;
const saltRounds=10;
env.config();


app.use(express.static("public"));
app.use('/uploads',express.static('uploads'));
app.use(bodyParser.urlencoded({extended:true}));
app.use(methodOverride("_method"));
app.use((req, res, next) =>{
    res.locals.user=req.user || null;
    next();
});

const stripe=new Stripe('process.env.STRIPE_SECRET_KEY');

console.log("Session secret:", process.env.SESSION_SECRET || "default-secret");
app.use(
    session({
        secret:process.env.SESSION_SECRET,
        resave:false,
        saveUninitialized:false,
        cookie:{
            maxAge:1000 * 60 * 60 * 24,

        },

    })
);
app.use(passport.initialize());
app.use(passport.session());

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
    
    try{
        const request= await db.query("SELECT a.id, users.email, users.name As user_name,  s.price, s.name, a.appointment_city, a.appointment_address, a.appointment_mobile, a.appointment_date, a.start_time, a.end_time, a.music_desc,  a.status FROM appointments a Join users on a.user_id=users.id Join services s on a.service_id=s.id  ORDER BY a.appointment_date DESC");
       const  result=request.rows;
        res.render("report.ejs",{record:result,user:req.user});
    }catch(err){
     console.log(err);
    }} else{
        res.render("login.ejs",{regErr:"You are not an authorized  Admin"});
    } 
});


app.get("/test-logout", (req,res, next) => {
    if(!req.session){
        console.warn("no session found during logout");
        return res.redirect("/");
    }
    req.logout((err) => {
      
     if(err) {
     console.error("Logout error:",err);
     return next(err);
     }

   req.session.destroy((err) =>{
    if(err){
        console.error("session destruction error:",err);
        return next(err);
    }
        res.clearCookie("connect.sid");
        res.redirect("/");
    });
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


app.get("/receip",  async (req, res) => {
    console.log(req.user);
   
    if (req.isAuthenticated()){
        let userId=req.user.id;
        let weather;
        let error = null;
        let city;
        let result;
        try {
        const result= await db.query("SELECT appointment_city FROM appointments WHERE user_id=$1",[userId]) ;
        const data=result.rows;
        city=data.appointment_city;
        try {
        const apiKey="06569b2799c33546c2e712a170c3c767";
        const APIUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=imperial&appid=${apiKey}`;
        const response = await axios.get(APIUrl);
        weather = response.data;
    } catch (error) {
        weather = null;
        error = "Error, Please try again";
      }
    }catch(err){
        console.log(err);
    }
    
     try{
     const request= await db.query("SELECT a.id, s.price, s.name, a.appointment_address, a.appointment_mobile, a.appointment_date, a.start_time, a.end_time, EXTRACT(epoch FROM duration) AS duration_in_minutes, a.status FROM appointments a Join services s on a.service_id=s.id where user_id=$1 ORDER BY a.appointment_date ASC", [userId]);
     result=request.rows;
     if (result){
     res.render("receipt.ejs",{record:result,weather,error,user:req.user});

     }else {
        res.send("no record found");
    }
        
    }catch(err){
        
        console.log(err);
       }
    }else{
        res.redirect("/register");
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
    console.log('User:',req.user);
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
 const {id}=req.params;
 try{
    const result= await db.query("SELECT * FROM services WHERE id=$1",[id]);
    const services=result.rows[0];
    res.render("bookings.ejs",{service:services});
 }catch(err){
    console.log(err);
 }
 
});

app.get("/payment/:appointment_id", async (req,res) => {
    
        const appointId=req.params;
        try{
        const result= await db.query('SELECT s.name, s.price FROM appointments a Join services s on services_id=services.id WHERE a.id=',[appointId]);
        if(result.rows.length===0){
          return res.status(404).send('Appointment not found');
        }
         res.render("payment.ejs",{appointment:result.rows[0]},{message:'Thanks for the Bookings, we will approve this after payment.'});
        }catch(err){
        console.log(err);
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


app.post("/auth/google/bookings", passport.authenticate("google",{
    successRedirect: "/bookings",
    failureRedirect: "/login",
})
);



app.post("/services/:id", async (req, res) => {
    console.log('User:',req.user);
    if(!req.isAuthenticated()){
        return res.redirect('/login');
    }
    const {id}=req.params;
    const userId=req.user.id;
    const phone=req.body.phone;
    const address=req.body.address;
    const cities=req.body.cities;
    const date=req.body.date;
    const start_time=req.body.start_time;
    const finish_time=req.body.finish_time;
    const music_desc=req.body.music_desc;

    if(!validatePhoneNumber(phone)){
        return res.status(400).send('invalid phone number format.');
    }

    try {
    const result= await db.query("INSERT INTO appointments (user_id,service_id,appointment_city,appointment_address,appointment_mobile,appointment_date,start_time,end_time,music_desc) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id",
    [userId,id,cities,address,phone,moment(date).toISOString(),start_time,finish_time,music_desc,]) ;

    const appointment_id=result.rows[0].id;

     res.redirect(`/payment/${appointment_id}`);
     
}catch(err){
    console.log(err);
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
        res.status(500).send('Error adding service');
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

app.put("/record/:id", async (req,res) =>{
let appointmentId=req.params.id;
try{
    await db.query("UPDATE appointments SET status=$1 WHERE id=$2",["Booked",appointmentId]);
    res.redirect("/report");
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
    cb(null,user);

});

passport.deserializeUser((user, cb)=>{
    cb(null,user);

});


app.listen(port, ()=>{
    console.log('server is running on port 3000');
});



