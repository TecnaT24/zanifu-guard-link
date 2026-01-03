import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const callbackData = await req.json();
    console.log("M-Pesa callback received:", JSON.stringify(callbackData, null, 2));

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const stkCallback = callbackData.Body?.stkCallback;

    if (!stkCallback) {
      console.error("Invalid callback data structure");
      return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc, CallbackMetadata } = stkCallback;

    console.log("Callback details:", { MerchantRequestID, CheckoutRequestID, ResultCode, ResultDesc });

    if (ResultCode === 0) {
      // Payment successful
      const metadata = CallbackMetadata?.Item || [];
      const amount = metadata.find((item: any) => item.Name === "Amount")?.Value;
      const mpesaReceiptNumber = metadata.find((item: any) => item.Name === "MpesaReceiptNumber")?.Value;
      const phoneNumber = metadata.find((item: any) => item.Name === "PhoneNumber")?.Value;

      console.log("Payment successful:", { amount, mpesaReceiptNumber, phoneNumber });

      // You can update order status here based on CheckoutRequestID
      // For now, we'll just log the successful payment
      console.log(`Payment of ${amount} received. Receipt: ${mpesaReceiptNumber}`);
    } else {
      // Payment failed
      console.log("Payment failed:", ResultDesc);
    }

    // Always return success to M-Pesa
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (error: any) {
    console.error("Error in M-Pesa callback function:", error);
    // Still return success to M-Pesa to acknowledge receipt
    return new Response(JSON.stringify({ ResultCode: 0, ResultDesc: "Accepted" }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
};

serve(handler);
