import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

console.log('remove-connection function initializing');

serve(async (req: Request) => {
  console.log('[remove-connection] Received request', req.method, req.url);

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const body = await req.json();
    const { other_user_id } = body;

    if (!other_user_id) {
      return new Response(JSON.stringify({ error: 'Missing other_user_id' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Create a Supabase client with the Auth context of the logged in user.
    const supabaseUserClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization')! } } }
    );

    const { data: { user: callingUser }, error: authError } = await supabaseUserClient.auth.getUser();

    if (authError || !callingUser) {
      console.error('[remove-connection] Auth error:', authError);
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const callingUserId = callingUser.id;

    // Fetch calling user's role from their profile
    // Admin client needed here because RLS might prevent user client from reading their own profile's role column if not explicitly allowed.
     const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    const { data: callingUserProfile, error: profileError } = await supabaseAdmin
      .from('profiles')
      .select('role')
      .eq('id', callingUserId)
      .single();

    if (profileError || !callingUserProfile) {
        console.error('[remove-connection] Error fetching calling user profile:', profileError);
        return new Response(JSON.stringify({ error: "Could not verify calling user's role" }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
    const callingUserRole = callingUserProfile.role;
    console.log(`[remove-connection] Calling user: ${callingUserId}, Role: ${callingUserRole}, Unlinking from: ${other_user_id}`);


    let deleteQuery;
    if (callingUserRole === 'patient') {
      deleteQuery = supabaseAdmin
        .from('patient_caregiver_connections')
        .delete()
        .eq('patient_id', callingUserId)
        .eq('caregiver_id', other_user_id);
    } else if (callingUserRole === 'caregiver') {
      deleteQuery = supabaseAdmin
        .from('patient_caregiver_connections')
        .delete()
        .eq('caregiver_id', callingUserId)
        .eq('patient_id', other_user_id);
    } else {
      console.error('[remove-connection] Unknown user role for caller:', callingUserRole);
      return new Response(JSON.stringify({ error: 'Invalid user role for this operation' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { error: deleteError, count } = await deleteQuery;

    if (deleteError) {
      console.error('[remove-connection] Error deleting connection:', deleteError);
      return new Response(JSON.stringify({ error: 'Failed to remove connection', details: deleteError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (count === 0) {
        console.log('[remove-connection] No matching connection found to delete.');
         // This might not be an error, could mean it was already unlinked.
         // For now, treat as success but maybe log or return different message.
    } else {
        console.log(`[remove-connection] Successfully deleted ${count} connection(s).`);
    }

    return new Response(JSON.stringify({ message: 'Connection removed successfully.' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    console.error('[remove-connection] Unexpected error:', err);
    // Check if err is from JSON.parse
     if (err instanceof SyntaxError && err.message.includes("JSON")) {
        return new Response(JSON.stringify({ error: 'Invalid JSON payload' }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
        });
    }
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}); 