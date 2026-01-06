-- Add policy for admins to update profiles (for last_login_at tracking)
CREATE POLICY "Admins can update all profiles" 
ON public.profiles 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Also add a policy to let users update last_login_at themselves on login
-- But more importantly, create a trigger to auto-update last_login_at on auth.users login
-- Since we can't attach triggers to auth schema, let's create a function that can be called with service role

-- Create a function to update last_login_at that bypasses RLS
CREATE OR REPLACE FUNCTION public.update_last_login(p_user_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE profiles
  SET last_login_at = now()
  WHERE user_id = p_user_id;
END;
$$;