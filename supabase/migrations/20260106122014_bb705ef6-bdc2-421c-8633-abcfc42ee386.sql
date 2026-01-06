-- Drop the trigger that uses pg_net
DROP TRIGGER IF EXISTS on_fraud_flag_created ON public.fraud_flags;

-- Drop the old function
DROP FUNCTION IF EXISTS public.notify_fraud_alert();

-- Create a simpler version that just logs (or could be extended later)
CREATE OR REPLACE FUNCTION public.notify_fraud_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- For now, we just return NEW without calling external services
  -- The fraud alert can be handled by the application layer instead
  RETURN NEW;
END;
$$;

-- Recreate the trigger with the simplified function
CREATE TRIGGER on_fraud_flag_created
  AFTER INSERT ON public.fraud_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.notify_fraud_alert();