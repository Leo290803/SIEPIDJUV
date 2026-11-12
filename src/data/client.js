import { createClient } from "@supabase/supabase-js";
import { publicSupabaseConfig } from "./publicConfig.js";
export const supabase = createClient(
  import.meta.env.VITE_SUPABASE_URL || publicSupabaseConfig.url,
  import.meta.env.VITE_SUPABASE_ANON_KEY || publicSupabaseConfig.key,
  {
    auth: {
      flowType: "pkce",
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: true,
    },
  },
);
export function readableError(error) {
  if (error?.code === "40001" || error?.code === "PGRST116")
    return "Outro usuário alterou este registro. Recarregue antes de salvar novamente.";
  if (error?.code === "23505")
    return "Já existe um registro com estes dados. Confira possíveis duplicidades.";
  if (error?.code === "42501")
    return "Sua conta não tem permissão para esta operação.";
  if (error?.message?.includes("Invalid login credentials"))
    return "E-mail ou senha inválidos.";
  if (error?.message?.includes("Email not confirmed"))
    return "Confirme seu e-mail antes de entrar.";
  if (error?.message?.includes("rate limit"))
    return "Muitas tentativas. Aguarde alguns minutos e tente novamente.";
  if (
    error?.message?.includes("Failed to fetch") ||
    error?.message?.includes("NetworkError")
  )
    return "Não foi possível conectar. Verifique a conexão e tente novamente.";
  return error?.message || "Não foi possível concluir a operação.";
}
