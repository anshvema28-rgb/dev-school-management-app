// supabase/functions/delete-parent/index.ts
// Secure Parent Account Removal — Supabase Edge Function (Deno).
//
// SECURITY:
// - The service_role key is used ONLY here, server-side. Never exposed to Expo.
// - Admin status is determined from the authenticated user's profile in the
//   database — never from client-supplied input.
// - Only a profile whose role = 'parent' may be removed (validated server-side
//   before any deletion). Admin/teacher/student profiles are refused.
// - Deleting the Auth user lets the EXISTING FK cascades remove:
//       profiles row      (001: profiles.id -> auth.users(id) ON DELETE CASCADE)
//       parent_students   (006: parent_id  -> profiles(id)   ON DELETE CASCADE)
//   Students, attendance, fees, results and every other table are NEVER touched.
// - Clear JSON success/error responses; no credentials are ever returned.
//
// Deploy (manual, not run automatically):
//   supabase functions deploy delete-parent
// Set secrets (manual):
//   supabase secrets set SUPABASE_SERVICE_ROLE_KEY=...

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

const jsonResponse = (body: unknown, status: number) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

serve(async (req) => {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // 1. Verify Authorization header
    const authHeader = req.headers.get('Authorization')
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return jsonResponse({ error: 'Missing or invalid Authorization header' }, 401)
    }
    const token = authHeader.replace('Bearer ', '')

    // Client bound to the caller's token (verify identity + admin role)
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: authHeader } } }
    )

    // 2. Verify the caller is authenticated
    const { data: { user }, error: authError } = await userClient.auth.getUser(token)
    if (authError || !user) {
      return jsonResponse({ error: 'Invalid or expired token' }, 401)
    }

    // 3. Determine admin status from the DATABASE (never trust client input)
    const { data: profile, error: profileError } = await userClient
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .maybeSingle()

    if (profileError || !profile || profile.role !== 'admin') {
      return jsonResponse({ error: 'Forbidden: admin access required' }, 403)
    }

    // 4. Parse + validate body — ONLY the parent user/profile id is accepted
    let body: any
    try {
      body = await req.json()
    } catch {
      return jsonResponse({ error: 'Invalid JSON body' }, 400)
    }

    const parentId =
      typeof body?.parent_id === 'string' ? body.parent_id.trim() : ''
    if (!parentId || !UUID_RE.test(parentId)) {
      return jsonResponse({ error: 'A valid parent_id is required' }, 400)
    }

    // 5. Service-role client (server-side only)
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    if (!serviceKey) {
      return jsonResponse(
        { error: 'Server configuration error: service role key is not set' },
        500
      )
    }
    const admin = createClient(Deno.env.get('SUPABASE_URL') ?? '', serviceKey)

    // 6. Validate the target exists AND role = 'parent' before any deletion
    const { data: target, error: targetError } = await admin
      .from('profiles')
      .select('id, role')
      .eq('id', parentId)
      .maybeSingle()

    if (targetError) {
      return jsonResponse(
        { error: 'Failed to verify parent: ' + targetError.message },
        500
      )
    }
    if (!target) {
      return jsonResponse({ error: 'Parent not found' }, 404)
    }
    if (target.role !== 'parent') {
      return jsonResponse(
        { error: 'Refused: target profile is not a parent' },
        400
      )
    }

    // 7. Delete the Supabase Auth user with the server-side admin API.
    //    The existing FK cascades remove the profiles row and every
    //    parent_students link. Nothing else is deleted.
    const { error: deleteError } = await admin.auth.admin.deleteUser(parentId)

    if (deleteError) {
      // Orphaned profile (auth user already gone): remove ONLY the leftover
      // profiles row so the account can still be cleared. parent_students
      // cascades from it (006). No other table is touched.
      if (/not.?found/i.test(deleteError.message)) {
        const { error: orphanError } = await admin
          .from('profiles')
          .delete()
          .eq('id', parentId)
        if (orphanError) {
          return jsonResponse(
            { error: 'Failed to remove parent profile: ' + orphanError.message },
            500
          )
        }
        return jsonResponse({
          deleted: true,
          id: parentId,
          auth_user: false,
          message:
            'Parent profile and linked parent relationships removed (no auth user existed). Students were not deleted.',
        })
      }
      return jsonResponse(
        { error: 'Failed to delete parent account: ' + deleteError.message },
        500
      )
    }

    // 8. Success — the parent account only
    return jsonResponse({
      deleted: true,
      id: parentId,
      auth_user: true,
      message:
        'Parent login account, profile and linked parent relationships removed. Students were not deleted.',
    })
  } catch (err) {
    return jsonResponse({ error: 'Internal server error' }, 500)
  }
})
