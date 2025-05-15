import pkg from 'pg';
import env from "dotenv";
import logger from "../middlewares/logger.js";

env.config();
const {Pool}=pkg;
const pool = new Pool({
 connectionString:process.env.DATABASE_URL,
 ssl:process.env.NODE_ENV==='production' ? {rejectUnauthorized: false } : false
});


export default pool;