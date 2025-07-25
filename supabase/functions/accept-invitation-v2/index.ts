import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

console.log('accept-invitation-v2 function initializing');

serve(async (req: Request) => {
  console.log('[accept-invitation-v2] Received request', req.method, req.url);
  let requestBodyText = '';
  try {
    // Log the raw body first
    if (req.body) {
      requestBodyText = await req.text(); // Read as text first
      console.log('[accept-invitation-v2] Raw request body:', requestBodyText);
    } else {
      console.log('[accept-invitation-v2] Request body is null or undefined.');
    }

    // Now attempt to parse
    const bodyPayload = JSON.parse(requestBodyText || '{}'); // Parse the text, provide empty obj if text was empty
    const { invitation_code } = bodyPayload;
    
    console.log('[accept-invitation-v2] Parsed invitation_code:', invitation_code);

    // Log the Authorization header
    const authHeader = req.headers.get('Authorization');
    console.log('[accept-invitation-v2] Authorization header:', authHeader ? "Present" : "Missing or Empty", authHeader ? authHeader.substring(0, 20) + "..." : "");

    if (!invitation_code) {
      console.log('[accept-invitation-v2] Missing invitation_code after parsing.');
      return new Response(JSON.stringify({ error: 'Missing invitation_code' }), {
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

    console.log('[accept-invitation-v2] Attempting to get user via supabaseUserClient.auth.getUser()');
    const { data: { user: caregiverUser }, error: authError } = await supabaseUserClient.auth.getUser();
    
    if (authError || !caregiverUser) {
      console.error('[accept-invitation-v2] Auth error or no caregiverUser:', authError, "User:", caregiverUser);
      return new Response(JSON.stringify({ error: 'User not authenticated' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    const caregiverId = caregiverUser.id;
    console.log('[accept-invitation-v2] Successfully authenticated caregiver. ID:', caregiverId);

    // Use Admin client for sensitive operations
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SERVICE_ROLE_KEY') ?? ''
    );
    console.log('[accept-invitation-v2] supabaseAdmin client initialized.');

    // 1. Find the invitation
    console.log(`[accept-invitation-v2] Attempting to fetch invitation: ${invitation_code}`);
    const { data: invitation, error: invitationError } = await supabaseAdmin
      .from('linking_invitations')
      .select('id, patient_id, status, expires_at')
      .eq('invitation_code', invitation_code)
      .single();

    if (invitationError || !invitation) {
      console.error('[accept-invitation-v2] Error fetching invitation or not found:', invitationError, "Invitation:", invitation);
      return new Response(JSON.stringify({ error: 'Invalid or expired invitation code.' }), {
        status: 404,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.log('[accept-invitation-v2] Successfully fetched invitation:', invitation);

    // 2. Validate invitation
    if (invitation.patient_id === caregiverId) {
        return new Response(JSON.stringify({ error: 'Cannot accept your own invitation.' }), {
            status: 400, headers: { 'Content-Type': 'application/json' }
        });
    }
    if (invitation.status !== 'pending') {
      return new Response(JSON.stringify({ error: 'Invitation is not active or already accepted.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    if (new Date(invitation.expires_at) < new Date()) {
      // Optionally update status to 'expired' here if not done by a cron job
      await supabaseAdmin.from('linking_invitations').update({ status: 'expired' }).eq('id', invitation.id);
      return new Response(JSON.stringify({ error: 'Invitation code has expired.' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const patientId = invitation.patient_id;
    console.log(`[accept-invitation-v2] Invitation validated. Patient ID: ${patientId}`);

    // 3. Check if link already exists
    console.log(`[accept-invitation-v2] Checking if link already exists for caregiver: ${caregiverId} and patient: ${patientId}`);
    const { data: existingLink, error: linkCheckError } = await supabaseAdmin
      .from('patient_caregiver_connections')
      .select('id')
      .eq('caregiver_id', caregiverId)
      .eq('patient_id', patientId)
      .maybeSingle(); // Use maybeSingle as it might return null

    if (linkCheckError && linkCheckError.code !== 'PGRST116') { // PGRST116 means no rows found, which is fine
        console.error('[accept-invitation-v2] Error checking existing link:', linkCheckError);
        return new Response(JSON.stringify({ error: 'Database error checking existing link.' }), {
            status: 500, headers: { 'Content-Type': 'application/json' }
        });
    }
    if (existingLink) {
      console.log('[accept-invitation-v2] Link already exists:', existingLink);
      return new Response(JSON.stringify({ error: 'You are already linked with this patient.' }), {
        status: 409, // Conflict
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.log('[accept-invitation-v2] No existing link found. Proceeding to create link.');

    // 4. Create the link in caregiver_patient table
    console.log(`[accept-invitation-v2] Attempting to insert link: caregiver_id=${caregiverId}, patient_id=${patientId}, invitation_code=${invitation_code}`);
    const { error: linkInsertError } = await supabaseAdmin
      .from('patient_caregiver_connections')
      .insert({
        caregiver_id: caregiverId,
        patient_id: patientId,
        connection_status: 'active',
        invitation_code: invitation_code,
      });

    if (linkInsertError) {
      console.error('[accept-invitation-v2] Error creating link in patient_caregiver_connections:', linkInsertError);
      return new Response(JSON.stringify({ error: 'Failed to link with patient.', details: linkInsertError.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
    console.log('[accept-invitation-v2] Successfully inserted link into patient_caregiver_connections.');

    // 5. Update invitation status to 'accepted'
    console.log(`[accept-invitation-v2] Attempting to update invitation ${invitation.id} status to accepted.`);
    const { error: updateInviteError } = await supabaseAdmin
      .from('linking_invitations')
      .update({ status: 'accepted' })
      .eq('id', invitation.id);

    if (updateInviteError) {
      // This is not ideal, as the link is created but status update failed.
      // Consider transaction or compensating action if critical.
      console.error('[accept-invitation-v2] Error updating invitation status (link was created):', updateInviteError);
    }
    console.log('[accept-invitation-v2] Successfully updated invitation status (or error was logged if failed).');

    return new Response(JSON.stringify({ message: 'Successfully linked with patient!' }), {
      headers: { 'Content-Type': 'application/json' },
      status: 200,
    });

  } catch (err) {
    console.error('Unexpected error in accept-invitation function:', err);
    return new Response(JSON.stringify({ error: 'Internal server error', details: err.message }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  }
}); 