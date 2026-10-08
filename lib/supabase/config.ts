export function supabaseMode() {
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  if(!url&&!key)return 'demo' as const;
  if(!url||!key)throw new Error('Supabase ist unvollständig konfiguriert. URL und Publishable Key müssen beide gesetzt sein.');
  const parsed=new URL(url);
  if(!['https:','http:'].includes(parsed.protocol))throw new Error('Ungültige Supabase-URL.');
  if(parsed.protocol==='http:'&&!['localhost','127.0.0.1'].includes(parsed.hostname))throw new Error('Supabase benötigt HTTPS.');
  return 'supabase' as const;
}
