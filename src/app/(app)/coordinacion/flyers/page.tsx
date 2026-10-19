import { Suspense } from "react";
import { FlyersContenido } from "@/components/coordinacion/FlyersContenido";

export default function CoordinacionFlyersPage() {
  return (
    <Suspense fallback={null}>
      <FlyersContenido />
    </Suspense>
  );
}
