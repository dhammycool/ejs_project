import express from "express";
import { createPaymentIntent, handleWebhook, paystackTrans,handlePaystackWebhook } from "../controllers/paymentControllers.js";


const paymentRouter = express.Router();
paymentRouter.post("/webhook/paystack", express.json(),handlePaystackWebhook);
paymentRouter.post("/webhook/stripe", express.raw({ type: "application/json" }), handleWebhook);

paymentRouter.post("/create-payment-intent", createPaymentIntent);
paymentRouter.post("/paystack/create-transaction",paystackTrans);





export default paymentRouter;









