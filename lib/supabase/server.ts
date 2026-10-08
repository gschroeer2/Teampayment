import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
export async function serverClient() {
  const store=await cookies();
  return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,{
    cookies:{getAll:()=>store.getAll(),setAll:values=>{try{values.forEach(({name,value,options})=>store.set(name,value,{...options,sameSite:'lax',secure:process.env.NODE_ENV==='production'}));}catch{/* Server Components cannot write cookies; proxy refreshes sessions. */}}}
  });
}
