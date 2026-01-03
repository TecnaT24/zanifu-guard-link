import { serve } from "https://deno.land/std@0.190.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface STKPushRequest {
  phoneNumber: string;
  amount: number;
  orderId: string;
  accountReference: string;
}

async function getAccessToken(): Promise<string> {
  const consumerKey = Deno.env.get("MPESA_CONSUMER_KEY");
  const consumerSecret = Deno.env.get("MPESA_CONSUMER_SECRET");

  if (!consumerKey || !consumerSecret) {
    throw new Error("M-Pesa credentials not configured");
  }

  const auth = btoa(`${consumerKey}:${consumerSecret}`);

  const response = await fetch(
    "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials",
    {
      method: "GET",
      headers: {
        Authorization: `Basic ${auth}`,
      },
    }
  );

  if (!response.ok) {
    const errorText = await response.text();
    console.error("Failed to get access token:", errorText);
    throw new Error("Failed to get M-Pesa access token");
  }

  const data = await response.json();
  console.log("Access token obtained successfully");
  return data.access_token;
}

function formatPhoneNumber(phone: string): string {
  // Remove any spaces, dashes, or plus signs
  let formatted = phone.replace(/[\s\-\+]/g, "");

  // If starts with 0, replace with 254
  if (formatted.startsWith("0")) {
    formatted = "254" + formatted.substring(1);
  }

  // If starts with +254, remove the +
  if (formatted.startsWith("+254")) {
    formatted = formatted.substring(1);
  }

  // Ensure it starts with 254
  if (!formatted.startsWith("254")) {
    formatted = "254" + formatted;
  }

  return formatted;
}

function generateTimestamp(): string {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  const hours = String(now.getHours()).padStart(2, "0");
  const minutes = String(now.getMinutes()).padStart(2, "0");
  const seconds = String(now.getSeconds()).padStart(2, "0");
  return `${year}${month}${day}${hours}${minutes}${seconds}`;
}

function generatePassword(shortcode: string, passkey: string, timestamp: string): string {
  const data = shortcode + passkey + timestamp;
  return btoa(data);
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { phoneNumber, amount, orderId, accountReference }: STKPushRequest = await req.json();

    console.log("STK Push request received:", { phoneNumber, amount, orderId, accountReference });

    // Validate inputs
    if (!phoneNumber || !amount || !orderId) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: phoneNumber, amount, orderId" }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const shortcode = Deno.env.get("MPESA_SHORTCODE");
    const passkey = Deno.env.get("MPESA_PASSKEY");

    if (!shortcode || !passkey) {
      console.error("M-Pesa shortcode or passkey not configured");
      return new Response(
        JSON.stringify({ error: "M-Pesa configuration incomplete" }),
        {
          status: 500,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }

    const accessToken = await getAccessToken();
    const timestamp = generateTimestamp();
    const password = generatePassword(shortcode, passkey, timestamp);
    const formattedPhone = formatPhoneNumber(phoneNumber);

    console.log("Initiating STK Push to:", formattedPhone);

    // Use the Supabase project URL for callback
    const callbackUrl = `${Deno.env.get("SUPABASE_URL")}/functions/v1/mpesa-callback`;

    const stkPushPayload = {
      BusinessShortCode: shortcode,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: Math.round(amount),
      PartyA: formattedPhone,
      PartyB: shortcode,
      PhoneNumber: formattedPhone,
      CallBackURL: callbackUrl,
      AccountReference: accountReference || `Order-${orderId.substring(0, 8)}`,
      TransactionDesc: `Payment for order ${orderId.substring(0, 8)}`,
    };

    console.log("STK Push payload:", JSON.stringify(stkPushPayload, null, 2));

    const stkResponse = await fetch(
      "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(stkPushPayload),
      }
    );

    const stkData = await stkResponse.json();
    console.log("STK Push response:", JSON.stringify(stkData, null, 2));

    if (stkData.ResponseCode === "0") {
      return new Response(
        JSON.stringify({
          success: true,
          message: "STK Push sent successfully. Check your phone to enter PIN.",
          checkoutRequestId: stkData.CheckoutRequestID,
          merchantRequestId: stkData.MerchantRequestID,
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    } else {
      console.error("STK Push failed:", stkData);
      return new Response(
        JSON.stringify({
          success: false,
          error: stkData.errorMessage || stkData.ResponseDescription || "STK Push failed",
          details: stkData,
        }),
        {
          status: 400,
          headers: { "Content-Type": "application/json", ...corsHeaders },
        }
      );
    }
  } catch (error: any) {
    console.error("Error in M-Pesa STK Push function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
