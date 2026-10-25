// src/pages/index.tsx
import { useEffect } from "react";
import { useRouter } from "next/router";

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    // Direct redirect to camera on load – no auth needed
    router.replace("/camera");
  }, []);

  return null;
}
