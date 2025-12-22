-- Create a function to notify about high severity fraud flags
-- This will be called by the trigger after a fraud flag is inserted
CREATE OR REPLACE FUNCTION public.notify_fraud_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  payload jsonb;
BEGIN
  -- Only notify for high severity flags
  IF NEW.severity = 'high' THEN
    payload := jsonb_build_object(
      'flagId', NEW.id,
      'flagType', NEW.flag_type,
      'severity', NEW.severity,
      'description', NEW.description,
      'userId', NEW.user_id,
      'orderId', NEW.order_id,
      'metadata', NEW.metadata
    );
    
    -- Use pg_net to call the edge function asynchronously
    PERFORM net.http_post(
      url := 'https://gphmsrjiuiydmjezqijz.supabase.co/functions/v1/send-fraud-alert',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdwaG1zcmppdWl5ZG1qZXpxaWp6Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjYxMzU0NjMsImV4cCI6MjA4MTcxMTQ2M30.LS1WQugdIxCRhzeZRrBbpBmfBAtr9nQFiovca1Vbiqw'
      ),
      body := payload
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Create the trigger to call the notification function after fraud flag insert
DROP TRIGGER IF EXISTS on_fraud_flag_created ON public.fraud_flags;
CREATE TRIGGER on_fraud_flag_created
  AFTER INSERT ON public.fraud_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_fraud_alert();