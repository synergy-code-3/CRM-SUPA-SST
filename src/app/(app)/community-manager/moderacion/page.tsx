import { redirect } from "next/navigation";

// "Moderación" no tiene una vista general (es un formulario, no un
// agregado) — entrar aquí directo manda a la primera red, igual que elegir
// la primera opción del grupo en el menú lateral.
export default function ModeracionPage() {
  redirect("/community-manager/moderacion/facebook");
}
