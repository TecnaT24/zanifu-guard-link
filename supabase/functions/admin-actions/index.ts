import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.89.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface AdminActionRequest {
  action: "change_role" | "unlock_account" | "lock_account";
  targetUserId: string;
  newRole?: "customer" | "admin" | "security_personnel";
}

const handler = async (req: Request): Promise<Response> => {
  console.log("Admin action request received");

  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Create client with user's token to verify they're authenticated
    const supabaseUser = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? "",
      { global: { headers: { Authorization: authHeader } } }
    );

    // Get the current user
    const { data: { user }, error: userError } = await supabaseUser.auth.getUser();
    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Use service role to check admin status and perform actions
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Check if requesting user is admin
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from("user_roles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (roleError || roleData?.role !== "admin") {
      console.error("Not admin:", roleError);
      return new Response(
        JSON.stringify({ error: "Admin access required" }),
        { status: 403, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const { action, targetUserId, newRole }: AdminActionRequest = await req.json();
    console.log(`Admin ${user.id} performing ${action} on user ${targetUserId}`);

    // Prevent admin from modifying their own role
    if (action === "change_role" && targetUserId === user.id) {
      return new Response(
        JSON.stringify({ error: "Cannot modify your own role" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    let result;

    switch (action) {
      case "change_role":
        if (!newRole) {
          return new Response(
            JSON.stringify({ error: "New role is required" }),
            { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
          );
        }

        // Update or insert role
        const { data: existingRole } = await supabaseAdmin
          .from("user_roles")
          .select("id")
          .eq("user_id", targetUserId)
          .maybeSingle();

        if (existingRole) {
          result = await supabaseAdmin
            .from("user_roles")
            .update({ role: newRole, updated_at: new Date().toISOString() })
            .eq("user_id", targetUserId);
        } else {
          result = await supabaseAdmin
            .from("user_roles")
            .insert({ user_id: targetUserId, role: newRole });
        }

        if (result.error) throw result.error;
        console.log(`Role changed to ${newRole} for user ${targetUserId}`);
        break;

      case "unlock_account":
        result = await supabaseAdmin
          .from("profiles")
          .update({ 
            account_locked: false, 
            failed_login_attempts: 0,
            updated_at: new Date().toISOString() 
          })
          .eq("user_id", targetUserId);

        if (result.error) throw result.error;
        console.log(`Account unlocked for user ${targetUserId}`);
        break;

      case "lock_account":
        result = await supabaseAdmin
          .from("profiles")
          .update({ 
            account_locked: true,
            updated_at: new Date().toISOString() 
          })
          .eq("user_id", targetUserId);

        if (result.error) throw result.error;
        console.log(`Account locked for user ${targetUserId}`);
        break;

      default:
        return new Response(
          JSON.stringify({ error: "Invalid action" }),
          { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
        );
    }

    return new Response(
      JSON.stringify({ success: true, action, targetUserId }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in admin-actions function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
