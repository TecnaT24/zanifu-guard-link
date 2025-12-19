import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface Verify2FARequest {
  userId: string;
  code: string;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("2FA verification request received");

  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { userId, code }: Verify2FARequest = await req.json();
    console.log(`Verifying 2FA code for user: ${userId}`);

    if (!userId || !code) {
      console.error("Missing userId or code");
      return new Response(
        JSON.stringify({ error: "User ID and code are required", valid: false }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Find the most recent valid code for this user
    const { data: codeRecord, error: fetchError } = await supabaseAdmin
      .from("two_factor_codes")
      .select("*")
      .eq("user_id", userId)
      .eq("code", code)
      .eq("used", false)
      .gt("expires_at", new Date().toISOString())
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching 2FA code:", fetchError);
      return new Response(
        JSON.stringify({ error: "Verification failed", valid: false }),
        { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    if (!codeRecord) {
      console.log("Invalid or expired code");
      return new Response(
        JSON.stringify({ error: "Invalid or expired verification code", valid: false }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Mark the code as used
    await supabaseAdmin
      .from("two_factor_codes")
      .update({ used: true })
      .eq("id", codeRecord.id);

    // Update profile to enable 2FA if not already enabled
    await supabaseAdmin
      .from("profiles")
      .update({ two_factor_enabled: true, last_login_at: new Date().toISOString() })
      .eq("user_id", userId);

    console.log("2FA verification successful");

    return new Response(
      JSON.stringify({ valid: true, message: "Verification successful" }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: any) {
    console.error("Error in verify-2fa-code function:", error);
    return new Response(
      JSON.stringify({ error: error.message, valid: false }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
