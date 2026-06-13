import { supabase } from "./supabase.js";

export async function getCliente(token) {
  const { data, error } = await supabase
    .from("clientes")
    .select("*")
    .eq("token", token)
    .single();
  if (error || !data) return null;
  return data;
}

export async function getAllClientes() {
  const { data, error } = await supabase
    .from("clientes")
    .select("id, token, nombre, ciudad")
    .order("created_at", { ascending: false });
  if (error) return [];
  return data;
}
