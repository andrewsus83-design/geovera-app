"use client";
import { useState, useEffect } from "react";
import ThreeColumnLayout from "@/components/shared/ThreeColumnLayout";
import NavColumn from "@/components/shared/NavColumn";
import AgentList from "@/components/ai-agent/AgentList";
import type { Agent } from "@/components/ai-agent/AgentList";
import AgentDetailCard from "@/components/ai-agent/AgentDetailCard";
import HireAgentPanel from "@/components/ai-agent/HireAgentPanel";
import type { HiredAgent } from "@/components/ai-agent/HireAgentPanel";
import { supabase } from "@/lib/supabase";

const FALLBACK_BRAND_ID = process.env.NEXT_PUBLIC_DEMO_BRAND_ID || "a37dee82-5ed5-4ba4-991a-4d93dde9ff7a";

const DEFAULT_AGENTS: Agent[] = [
  {
    id: "ceo",
    name: "CEO Agent",
    title: "Strategic Planning & Oversight",
    icon: "🧑‍💼",
    active: true,
    locked: false,
    description:
      "Your AI CEO handles high-level strategic decisions, budget allocation, partnership evaluations, and KPI setting. It analyzes market trends and provides daily actionable insights to grow your brand.",
    dailyTasks: [
      "Review and optimize marketing budget allocation",
      "Evaluate partnership and collaboration proposals",
      "Set and track monthly KPIs and growth targets",
      "Analyze competitor landscape and market trends",
      "Generate strategic recommendations for brand growth",
    ],
    skills: ["Strategy", "Analytics", "Budget", "Partnerships", "KPIs", "Market Analysis"],
    recentActivity: [
      { title: "Reviewed Q1 Marketing Budget", time: "2h ago" },
      { title: "Set March KPIs for Team", time: "5h ago" },
      { title: "Analyzed Competitor Strategy Report", time: "1d ago" },
      { title: "Approved BrandX Partnership", time: "2d ago" },
      { title: "Generated Weekly Growth Insights", time: "3d ago" },
    ],
  },
  {
    id: "cmo",
    name: "CMO Agent",
    title: "Marketing & Content Strategy",
    icon: "📣",
    active: true,
    locked: false,
    description:
      "Your AI CMO creates and manages content across all platforms. It generates post ideas, writes captions, selects hashtags, schedules content, and responds to trending topics — all aligned with your brand voice.",
    dailyTasks: [
      "Create and schedule social media content",
      "Write blog posts and long-form articles",
      "Monitor and respond to trending topics",
      "Optimize content for SEO and engagement",
      "Manage cross-platform content calendar",
    ],
    skills: ["Content", "Social Media", "Copywriting", "SEO", "Trends", "Branding"],
    recentActivity: [
      { title: "Created Instagram Carousel: Summer Collection", time: "1h ago" },
      { title: "Scheduled 3 TikTok Videos", time: "3h ago" },
      { title: "Published Blog: Eco-Friendly Materials", time: "1d ago" },
      { title: "Responded to Trending TikTok Sound", time: "1d ago" },
      { title: "Optimized 5 Product Page Descriptions", time: "2d ago" },
    ],
  },
  {
    id: "cto",
    name: "CTO Agent",
    title: "Technical Strategy",
    icon: "💻",
    active: false,
    locked: true,
    description:
      "Your AI CTO handles technical strategy including website optimization, analytics setup, automation workflows, and integration management. Available on Partner plan.",
    dailyTasks: [
      "Monitor website performance and uptime",
      "Optimize page speed and Core Web Vitals",
      "Set up and manage marketing automation",
      "Configure analytics tracking and reporting",
      "Manage API integrations and data pipelines",
    ],
    skills: ["Web Dev", "Analytics", "Automation", "APIs", "Performance", "Security"],
    recentActivity: [],
  },
  {
    id: "support",
    name: "Customer Support",
    title: "Auto-Reply & Engagement",
    icon: "🎧",
    active: false,
    locked: true,
    description:
      "Your AI Customer Support agent handles comment replies, DM responses, and customer inquiries across all connected platforms using Late API. Available on Partner plan.",
    dailyTasks: [
      "Reply to top-priority comments (by score)",
      "Respond to customer DMs and inquiries",
      "Escalate complex issues to human team",
      "Track customer sentiment trends",
      "Generate weekly support summary report",
    ],
    skills: ["Support", "Auto-Reply", "Sentiment", "Triage", "Engagement", "Reporting"],
    recentActivity: [],
  },
];

// Merge hired persona into default agent list
function mergeWithHired(defaults: Agent[], hired: HiredAgent[]): Agent[] {
  return defaults.map((agent) => {
    const persona = hired.find((h) => h.role === agent.id.toUpperCase());
    if (!persona) return agent;
    return {
      ...agent,
      name: `${persona.persona_name} (${persona.role})`,
      title: persona.persona_title ?? agent.title,
      description: persona.persona_description ?? agent.description,
    };
  });
}

// Unlock agents based on subscription tier
function applyTierLocks(defaults: Agent[], tier: string): Agent[] {
  // premium+ unlocks CMO, partner unlocks CTO + Support
  return defaults.map((a) => {
    if (a.id === "cmo")     return { ...a, locked: tier === "basic" };
    if (a.id === "cto")     return { ...a, locked: tier !== "partner" };
    if (a.id === "support") return { ...a, locked: tier !== "partner" };
    return a; // CEO always unlocked
  });
}

export default function AIAgentPage() {
  const [selectedId, setSelectedId] = useState("ceo");
  const [brandId, setBrandId] = useState(FALLBACK_BRAND_ID);
  const [currentTier, setCurrentTier] = useState<"basic" | "premium" | "partner">("basic");
  const [agents, setAgents] = useState<Agent[]>(DEFAULT_AGENTS);
  const [hiredAgents, setHiredAgents] = useState<HiredAgent[]>([]);

  // Load brand_id + subscription tier from auth
  useEffect(() => {
    const load = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const { data: bp } = await supabase
          .from("brand_profiles")
          .select("id")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();
        if (!bp?.id) return;
        setBrandId(bp.id);
        // Fetch subscription tier
        const res = await fetch("/api/payment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action: "get_subscription", brand_id: bp.id }),
        });
        const sub = await res.json();
        if (sub.success) {
          const tier = (sub.brand_payment?.subscription_tier as string) ?? "basic";
          const mapped = tier === "partner" ? "partner" : tier === "premium" ? "premium" : "basic";
          setCurrentTier(mapped as "basic" | "premium" | "partner");
        }
      } catch { /* keep fallback */ }
    };
    load();
  }, []);

  // Load existing hired agents from DB whenever brandId resolves
  useEffect(() => {
    const loadHired = async () => {
      try {
        const { data } = await supabase
          .from("gv_ai_agents")
          .select("*")
          .eq("brand_id", brandId)
          .eq("is_active", true)
          .order("created_at", { ascending: true });
        if (data && data.length > 0) {
          const hired = data as HiredAgent[];
          setHiredAgents(hired);
          setAgents(applyTierLocks(mergeWithHired(DEFAULT_AGENTS, hired), currentTier));
        }
      } catch { /* keep defaults */ }
    };
    loadHired();
  }, [brandId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Re-apply tier locks when currentTier changes
  useEffect(() => {
    setAgents(applyTierLocks(mergeWithHired(DEFAULT_AGENTS, hiredAgents), currentTier));
  // hiredAgents intentionally omitted: this effect only re-locks based on tier change
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentTier]);

  const handleHired = (agent: HiredAgent) => {
    const updated = [...hiredAgents, agent];
    setHiredAgents(updated);
    setAgents(applyTierLocks(mergeWithHired(DEFAULT_AGENTS, updated), currentTier));
  };

  const selectedAgent = agents.find((a) => a.id === selectedId)!;
  const selectedHiredAgent = hiredAgents.find((h) => h.role === selectedId.toUpperCase()) ?? null;

  const left = (
    <NavColumn>
      <AgentList agents={agents} selectedId={selectedId} onSelect={setSelectedId} />
    </NavColumn>
  );

  const center = <HireAgentPanel brandId={brandId} onHired={handleHired} />;

  const right = (
    <AgentDetailCard
      agent={selectedAgent}
      hiredAgent={selectedHiredAgent}
      brandId={brandId}
    />
  );

  return <ThreeColumnLayout left={left} center={center} right={right} />;
}
