import { createClient } from "@supabase/supabase-js";
const url = import.meta.env.VITE_SUPABASE_URL?.trim();
const key = (
  import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
  import.meta.env.VITE_SUPABASE_ANON_KEY
)?.trim();
export const cloudConfigured = Boolean(url || key);
export let configurationError = "";
if (cloudConfigured) {
  if (!url || !key)
    configurationError =
      "Cloud setup is incomplete. Configure both the Supabase URL and publishable key in Vercel, then redeploy.";
  else if (!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/.test(url))
    configurationError = "Cloud setup has an invalid Supabase project URL.";
  else if (key.startsWith("sb_secret_"))
    configurationError =
      "Use a Supabase publishable key, never a secret key, in the browser configuration.";
  else if (key.startsWith("eyJ")) {
    try {
      if (
        JSON.parse(
          atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
        ).role !== "anon"
      )
        configurationError =
          "Use the public anon key, never a service-role key.";
    } catch {
      configurationError = "The Supabase public key is invalid.";
    }
  }
}
export const supabase =
  cloudConfigured && !configurationError
    ? createClient(url, key, {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
        },
      })
    : null;
