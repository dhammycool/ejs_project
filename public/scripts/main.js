    document.addEventListener("DOMContentLoaded", async () => {

     const form=document.getElementById("payment-form");
     if (!form) return;

     form.addEventListener("submit",async(event)=>{
        event.preventDefault();

      const appointment_id = document.getElementById("appoint")?.value || "";
      const amount = parseInt(document.getElementById("amount")?.value.trim(), 10);
      const email=document.getElementById("email_add")?.value.trim();
      const paymentMethod=document.getElementById("payment-method").value;

      if (!amount || isNaN(amount)) {
        console.error("🚨 No valid amount found!");
        return;
    }
    console.error("📨 Sending data:", { appointment_id, amount });
if(paymentMethod==="stripe"){
     try {
          const response = await fetch("https://dj-romeo.onrender.com/payments/create-payment-intent", {
              method: "POST",
              headers: { 
                "Content-Type": "application/json",
                "CSRF-TOKEN":document.querySelector('#payment-form input[name="_csrf"').value,
                
             },
              body: JSON.stringify({ 
                appointment_id,
                 amount,
                  currency: "ngn"
                 }),
            
          });
  
          if (!response.ok) {
              throw new Error(`Server error: ${response.statusText}`);
          }
  
          const { clientSecret,publishableKey } = await response.json();
          const stripe=Stripe(publishableKey);

         

          if (!clientSecret) {
              throw new Error("No client secret received");
          }

         
  
          const elements = stripe.elements({ clientSecret });
  
          const paymentElement = elements.create("payment");
          paymentElement.mount("#payment-element");
  
          
          const form = document.getElementById("payment-form");
          form.addEventListener("submit", async (event) => {
              event.preventDefault();
  
              const { error, paymentIntent } = await stripe.confirmPayment({
                   elements,
                   confirmParams: {
                      return_url:`https://dj-romeo.onrender.com/payment-success`,
                  },
              });

          
            if (paymentIntent && paymentIntent.status === "succeeded") {
                console.error("✅ Payment succeeded, redirecting...");
                window.location.href = `/get/payment-success?payment_intent=${paymentIntent.id}`;
                return;
            }
            
            if (paymentIntent && paymentIntent.status === "requires_payment_method") {
                console.error("❌ Payment failed:", paymentIntent);
            
                document.querySelector("#general-error").innerText =
                    "Payment failed. Please try again with a different card.";
                document.querySelector("#general-error").style.display = "block";
                return;
            }
            if (error) {
                console.error("❌ Payment Error:", error);
               console.error("🔍 Error Type:", error.type);
                console.error("🔍 Error Code:", error.code);
                console.error("🔍 Error Message:", error.message);
            
                document.querySelectorAll(".error-message").forEach((el) => (el.style.display = "none"));
            
                switch (error.code) {
                    case "card_declined":
                        if (error.decline_code === "insufficient_funds") {
                            document.querySelector("#insufficient-funds-error").innerText =
                                "Insufficient funds. Please use another card.";
                            document.querySelector("#insufficient-funds-error").style.display = "block";
                        } else {
                            document.querySelector("#card-declined-error").innerText =
                                "Your card was declined. Please use another card.";
                            document.querySelector("#card-declined-error").style.display = "block";
                        }
                        break;
                    case "incorrect_cvc":
                        document.querySelector("#cvc-error").innerText =
                            "Incorrect CVC. Please check and try again.";
                        document.querySelector("#cvc-error").style.display = "block";
                        break;
                    case "processing_error":
                        document.querySelector("#general-error").innerText =
                            "An error occurred while processing the payment. Please try again.";
                        document.querySelector("#general-error").style.display = "block";
                        break;
                        case "authentication_required":
                            document.querySelector("#auth-error").innerText = "Your bank requires additional authentication. Please check your SMS or banking app.";
                            document.querySelector("#auth-error").style.display = "block";
                            break;
                    default:
                        document.querySelector("#general-error").innerText = error.message;
                        document.querySelector("#general-error").style.display = "block";
                        break;
                }
            }
          });
        
      }  catch (err) {
            console.error("❌ Unexpected Error:", err);
            document.querySelector("#payment-error").innerText = "An unexpected error occurred. Please try again.";
        }

}else if(paymentMethod==="paystack"){
console.error("nothing yet");
}

     })  
  });