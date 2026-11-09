export interface Usuario {
  id: string;
  nombre: string;
  rol: "admin" | "coordinador" | "abeja";
}
