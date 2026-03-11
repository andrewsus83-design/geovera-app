"use client";
import { useEffect } from "react";
import { useRouter } from "next/navigation";

/**
 * /subscription is deprecated — Subscription management is now inside
 * the /start page (Subscription tab) as part of the AppShell redesign.
 * Redirect immediately.
 */
export default function SubscriptionRedirect() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/start");
  }, [router]);
  return null;
}
