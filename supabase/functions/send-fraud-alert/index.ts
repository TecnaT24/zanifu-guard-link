import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface FraudAlertRequest {
  flagId: string;
  flagType: string;
  severity: string;
  description: string;
  userId?: string;
  orderId?: string;
  metadata?: Record<string, unknown>;
}

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { flagId, flagType, severity, description, userId, orderId, metadata }: FraudAlertRequest = await req.json();

    console.log("Received fraud alert request:", { flagId, flagType, severity, description });

    // Only send emails for high severity flags
    if (severity !== "high") {
      console.log("Skipping email - not high severity:", severity);
      return new Response(
        JSON.stringify({ message: "Email not sent - only high severity flags trigger emails" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get admin emails from Supabase
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const { data: adminRoles, error: rolesError } = await supabase
      .from("user_roles")
      .select("user_id")
      .in("role", ["admin", "security_personnel"]);

    if (rolesError) {
      console.error("Error fetching admin roles:", rolesError);
      throw new Error("Failed to fetch admin users");
    }

    if (!adminRoles || adminRoles.length === 0) {
      console.log("No admin users found to notify");
      return new Response(
        JSON.stringify({ message: "No admin users to notify" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    // Get admin emails from profiles
    const adminUserIds = adminRoles.map(r => r.user_id);
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("email")
      .in("user_id", adminUserIds)
      .not("email", "is", null);

    if (profilesError) {
      console.error("Error fetching profiles:", profilesError);
      throw new Error("Failed to fetch admin emails");
    }

    const adminEmails = profiles?.map(p => p.email).filter(Boolean) as string[];

    if (adminEmails.length === 0) {
      console.log("No admin emails found");
      return new Response(
        JSON.stringify({ message: "No admin emails configured" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    console.log("Sending fraud alert to:", adminEmails);

    const flagTypeLabels: Record<string, string> = {
      velocity: "🚨 Velocity Alert",
      high_value: "💰 High Value Transaction",
      daily_limit: "📊 Daily Limit Exceeded",
      suspicious: "⚠️ Suspicious Activity",
    };

    const flagLabel = flagTypeLabels[flagType] || flagType;
    const formattedDate = new Date().toLocaleString();

    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background-color: #f4f4f4; margin: 0; padding: 20px; }
            .container { max-width: 600px; margin: 0 auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }
            .header { background: linear-gradient(135deg, #dc2626, #991b1b); color: white; padding: 24px; text-align: center; }
            .header h1 { margin: 0; font-size: 24px; }
            .content { padding: 24px; }
            .alert-badge { display: inline-block; background: #fee2e2; color: #dc2626; padding: 4px 12px; border-radius: 16px; font-weight: 600; font-size: 12px; text-transform: uppercase; margin-bottom: 16px; }
            .detail-row { display: flex; padding: 12px 0; border-bottom: 1px solid #e5e5e5; }
            .detail-label { font-weight: 600; color: #6b7280; width: 120px; flex-shrink: 0; }
            .detail-value { color: #111827; }
            .description { background: #fef3c7; border-left: 4px solid #f59e0b; padding: 16px; margin: 16px 0; border-radius: 4px; }
            .footer { background: #f9fafb; padding: 16px 24px; text-align: center; color: #6b7280; font-size: 12px; }
            .cta-button { display: inline-block; background: #2563eb; color: white; padding: 12px 24px; border-radius: 6px; text-decoration: none; font-weight: 600; margin-top: 16px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>🚨 High Severity Fraud Alert</h1>
            </div>
            <div class="content">
              <span class="alert-badge">High Severity</span>
              
              <div class="detail-row">
                <span class="detail-label">Alert Type:</span>
                <span class="detail-value">${flagLabel}</span>
              </div>
              
              <div class="detail-row">
                <span class="detail-label">Flag ID:</span>
                <span class="detail-value">${flagId}</span>
              </div>
              
              ${orderId ? `
              <div class="detail-row">
                <span class="detail-label">Order ID:</span>
                <span class="detail-value">${orderId}</span>
              </div>
              ` : ""}
              
              ${userId ? `
              <div class="detail-row">
                <span class="detail-label">User ID:</span>
                <span class="detail-value">${userId}</span>
              </div>
              ` : ""}
              
              <div class="detail-row">
                <span class="detail-label">Detected At:</span>
                <span class="detail-value">${formattedDate}</span>
              </div>
              
              <div class="description">
                <strong>Description:</strong><br/>
                ${description}
              </div>
              
              ${metadata ? `
              <div class="detail-row">
                <span class="detail-label">Details:</span>
                <span class="detail-value">${JSON.stringify(metadata)}</span>
              </div>
              ` : ""}
              
              <p style="color: #6b7280; margin-top: 24px;">
                Please review this flag immediately and take appropriate action.
              </p>
            </div>
            <div class="footer">
              <p>This is an automated security alert from your fraud detection system.</p>
              <p>© ${new Date().getFullYear()} SecureShop - All rights reserved</p>
            </div>
          </div>
        </body>
      </html>
    `;

    const emailResponse = await resend.emails.send({
      from: "Fraud Alerts <onboarding@resend.dev>",
      to: adminEmails,
      subject: `🚨 HIGH SEVERITY: ${flagLabel} Detected`,
      html: emailHtml,
    });

    console.log("Email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, emailResponse }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    console.error("Error in send-fraud-alert function:", error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
