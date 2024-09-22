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



const _dirname=dirname(fileURLToPath(import.meta.url));
const app=express();
const port=3000;
const saltRounds=10;
env.config();


app.use(express.static("public"));
app.use(bodyParser.urlencoded({extended:true}));
app.use(
    session({
        secret:process.env.SESSION_SECRET,
        resave:false,
        saveUninitialized:true,
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

app.post("/form", async (req, res) => {
    
    const name=req.body.name;
    const phone=req.body.phone;
    const address=req.body.address;
    const cities=req.body.cities;
    const date=req.body.date;
    const start_time=req.body.start_time;
    const finish_time=req.body.finish_time;
    const event_note=req.body.event_note;
    try {
     await db.query("UPDATE users set name=$1,phone=$2, address=$3, cities=$4, date=$5, start_time=$6, finish_time=$7, event_note=$8 WHERE email=$9",
    [name,phone,address,cities,date,start_time,finish_time,event_note, req.user.email,]);

     res.render("bookings.ejs",{message:'data stored successfully'});
     
}catch(err){
    console.log(err);
}
});

app.get("/bookings", async (req,res )=>{
    console.log(req.user);
    if (req.isAuthenticated()){
        res.render("bookings.ejs");
    }else{
        res.redirect("/register");
    }

});

app.get("/receip", async(req, res) => {
    if (req.isAuthenticated()){
       

        try{
     const request= await db.query("SELECT * FROM users where email=$1",[req.user.email]);
     const result=request.rows[0];
     if (result){
     res.render("receipt.ejs",{record:result});

     }else {
        res.redirect("register.ejs");
    }

    }catch(err){
        
        console.log(err);
       }
    }
});


app.post("/weather", async(req,res) => {
const apiKey="06569b2799c33546c2e712a170c3c767";
    const city=req.body.cities;
    const APIUrl = `https://api.openweathermap.org/data/2.5/weather?q=${city}&units=imperial&appid=${apiKey}`;
    let weather;
    let error = null;
    try {
      const response = await axios.get(APIUrl);
      weather = response.data;
      res.render("index.ejs",{weather,error});
    } catch (error) {
      weather = null;
      error = "Error, Please try again";
    }
    });



app.get("/contact", (req, res) =>{
    res.render("contact.ejs");
});

app.get("/login",(req,res)=>{
    res.render("login.ejs");
});

app.get("/logout", (req,res) => {
    req.logout((err) => {
     if(err) console.log(err);
        res.redirect("/");
    });
});


app.get("/auth/google", passport.authenticate("google",{

  successRedirect:'/', scope:["profile","email"],

})
);

app.get("/auth/google/bookings", passport.authenticate("google",{
    successRedirect: "/bookings",
    failureRedirect: "/login",

})
);

app.get("/register",(req,res)=>{
    res.render("register.ejs");
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



app.post("/register", async (req,res)=>{
    const username=req.body.username;
    const password=req.body.password;
    try{
       
        const search=await db.query("SELECT * FROM users where email=($1)",[username]);
        if(search.rows.length>0){
            res.send("user already exist, kindly log in");
            }else{
               bcrypt.hash(password, saltRounds, async (err,harsh)=>{
                if (err){
                    console.log(err);
                }else{
                  const result= await db.query("INSERT INTO users (email, password) VALUES($1,$2) RETURNING *", [username,harsh] ) ;
                     const user=result.rows[0];
                     req.login(user, (err)=>{
                        console.log(err);
                        res.redirect("/bookings");
                     })
                     
                    }   
            }); 
            }
        }catch(err){
            console.log(err);

        }
     });


app.post("/login", passport.authenticate("local",{
    successRedirect: "/bookings",
    failureRedirect: "/login",
}));




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



