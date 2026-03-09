"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";

export default function AdminRootPage() {
  const router = useRouter();
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user.email === "andrewsus83@gmail.com") {
        router.replace("/backend");
      } else {
        router.replace("/analytics");
      }
    });
  }, [router]);
  return null;
}
