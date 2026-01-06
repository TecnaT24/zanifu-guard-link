-- Fix: Remove the permissive "Anyone can insert login attempts" policy
-- Login attempts should only be inserted by authenticated users or via service role

-- Drop the insecure policy that allows anyone to insert
DROP POLICY IF EXISTS "Anyone can insert login attempts" ON public.login_attempts;

-- Create a new policy that only allows authenticated users to insert their own login attempts
CREATE POLICY "Authenticated users can insert their own login attempts"
ON public.login_attempts
FOR INSERT
TO authenticated
WITH CHECK (
  -- Users can only log attempts for their own email or when user_id matches
  auth.uid() = user_id OR user_id IS NULL
);

-- Add a policy for service role to insert login attempts (for server-side logging)
-- This is handled implicitly as service role bypasses RLS