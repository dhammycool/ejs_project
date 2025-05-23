import express from "express";
import { createPaymentIntent, handleWebhook, paystackTrans } from "../controllers/paymentControllers.js";


const paymentRouter = express.Router();



paymentRouter.post("/create-payment-intent", createPaymentIntent);
paymentRouter.post("/paystack/create-transaction",paystackTrans);
paymentRouter.post("/webhook", express.raw({ type: "application/json" }), handleWebhook);



export default paymentRouter;









