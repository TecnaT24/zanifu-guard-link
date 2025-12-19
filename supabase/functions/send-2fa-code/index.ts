import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Send2FARequest {
  email: string;
  userId: string;
}

const generateCode = (): string => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const handler = async (req: Request): Promise<Response> => {
  console.log("2FA code request received");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { email, userId }: Send2FARequest = await req.json();
    console.log(`Generating 2FA code for email: ${email}`);

    if (!email || !userId) {
      console.error("Missing email or userId");
      return new Response(
        JSON.stringify({ error: "Email and userId are required" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const code = generateCode();
    console.log(`Generated 6-digit code for user ${userId}`);

    // Store the code in the database using service role
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Invalidate any existing unused codes for this user
    await supabaseAdmin
      .from("two_factor_codes")
      .update({ used: true })
      .eq("user_id", userId)
      .eq("used", false);

    // Insert new code
    const { error: insertError } = await supabaseAdmin.from("two_factor_codes").insert({
      user_id: userId,
      email: email,
      code: code,
    });

    if (insertError) {
      console.error("Failed to store 2FA code:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to generate verification code" }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Send the email
    const emailResponse = await resend.emails.send({
      from: "Zanifu Security <onboarding@resend.dev>",
      to: [email],
      subject: "Your Zanifu Verification Code",
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f5; margin: 0; padding: 40px 20px;">
          <div style="max-width: 400px; margin: 0 auto; background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
            <div style="text-align: center; margin-bottom: 32px;">
              <div style="width: 56px; height: 56px; background: linear-gradient(135deg, #0ea5e9, #0284c7); border-radius: 12px; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center;">
                <span style="color: white; font-size: 24px;">🛡️</span>
              </div>
              <h1 style="color: #18181b; font-size: 24px; font-weight: 700; margin: 0;">Zanifu Secure Commerce</h1>
              <p style="color: #71717a; font-size: 14px; margin: 8px 0 0;">Two-Factor Authentication</p>
            </div>
            
            <div style="background: #f4f4f5; border-radius: 8px; padding: 24px; text-align: center; margin-bottom: 24px;">
              <p style="color: #52525b; font-size: 14px; margin: 0 0 12px;">Your verification code is:</p>
              <div style="font-size: 36px; font-weight: 700; letter-spacing: 8px; color: #0ea5e9; font-family: monospace;">${code}</div>
            </div>
            
            <p style="color: #71717a; font-size: 13px; text-align: center; margin: 0;">
              This code expires in <strong>10 minutes</strong>.<br>
              If you didn't request this code, please ignore this email.
            </p>
          </div>
        </body>
        </html>
      `,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, message: "Verification code sent" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in send-2fa-code function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
