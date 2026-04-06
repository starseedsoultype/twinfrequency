import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    // Verify the user is authenticated
    const authHeader = req.headers.get('Authorization')
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    // Create client with user's JWT to verify identity
    const userClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    )

    const { data: { user }, error: authError } = await userClient.auth.getUser()
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    const userId = user.id

    // Create admin client with service role key
    const adminClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    )

    // Delete all user data in order (respecting foreign keys)
    await adminClient.from('messages').delete().eq('sender_id', userId)
    await adminClient.from('group_messages').delete().eq('sender_id', userId)
    await adminClient.from('matches').delete().or(`user1.eq.${userId},user2.eq.${userId}`)
    await adminClient.from('likes').delete().or(`from_user.eq.${userId},to_user.eq.${userId}`)
    await adminClient.from('blocks').delete().or(`blocker_id.eq.${userId},blocked_id.eq.${userId}`)
    await adminClient.from('reports').delete().or(`reporter_id.eq.${userId},reported_id.eq.${userId}`)

    // Delete avatar from storage
    const { data: files } = await adminClient.storage.from('avatars').list(userId)
    if (files && files.length > 0) {
      const paths = files.map((f: any) => `${userId}/${f.name}`)
      await adminClient.storage.from('avatars').remove(paths)
    }

    // Delete profile
    await adminClient.from('profiles').delete().eq('id', userId)

    // Delete auth user
    const { error: deleteError } = await adminClient.auth.admin.deleteUser(userId)
    if (deleteError) {
      console.error('Error deleting auth user:', deleteError)
      return new Response(JSON.stringify({ error: 'Failed to delete account' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      })
    }

    return new Response(JSON.stringify({ success: true }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })

  } catch (err) {
    console.error('delete-account error:', err)
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    })
  }
})
