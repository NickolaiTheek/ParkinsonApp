-- Function to get user details from auth.users for specific user IDs
-- This is a temporary diagnostic tool to help repair missing profiles.
-- It is defined with `SECURITY DEFINER` to access the `auth.users` table,
-- but includes checks to ensure the caller (a caregiver) is actually connected to the patients they are requesting.

CREATE OR REPLACE FUNCTION get_user_details_for_repair(patient_ids UUID[])
RETURNS TABLE (
    id UUID,
    email TEXT,
    first_name TEXT,
    last_name TEXT
)
AS $$
BEGIN
    -- Security Check: Ensure the currently authenticated user is a caregiver
    -- and is connected to the patients being requested.
    IF NOT EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid() AND profiles.role = 'caregiver'
    ) THEN
        RAISE EXCEPTION 'User is not a caregiver';
    END IF;

    -- Further security: Check for active connections
    IF NOT EXISTS (
        SELECT 1 FROM patient_caregiver_connections
        WHERE patient_caregiver_connections.caregiver_id = auth.uid()
        AND patient_caregiver_connections.patient_id = ANY(patient_ids)
        AND patient_caregiver_connections.connection_status = 'active'
    ) THEN
        RAISE EXCEPTION 'Caregiver is not connected to one or more of the requested patients';
    END IF;

    -- If security checks pass, return the requested user data
    RETURN QUERY
    SELECT
        u.id,
        u.email,
        u.raw_user_meta_data->>'first_name' AS first_name,
        u.raw_user_meta_data->>'last_name' AS last_name
    FROM auth.users u
    WHERE u.id = ANY(patient_ids);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER; 