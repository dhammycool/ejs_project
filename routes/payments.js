import express from "express";
import { createPaymentIntent, handleWebhook, paystackTrans,handlePaystackWebhook } from "../controllers/paymentControllers.js";


const paymentRouter = express.Router();



paymentRouter.post("/create-payment-intent", createPaymentIntent);
paymentRouter.post("/paystack/create-transaction",paystackTrans);
paymentRouter.post("/webhook", express.raw({ type: "application/json" }), handleWebhook);
paymentRouter.post("/webhook", express.raw({type:"application/json"}),handlePaystackWebhook);



export default paymentRouter;









