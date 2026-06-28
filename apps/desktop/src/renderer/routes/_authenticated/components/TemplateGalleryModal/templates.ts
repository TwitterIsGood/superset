import {
	Boxes,
	Flame,
	Globe,
	Layers,
	type LucideIcon,
	MessageSquare,
	Smartphone,
} from "lucide-react";
import gstackBanner from "./assets/gstack.png";
import honoBanner from "./assets/hono.png";
import nextjsBanner from "./assets/nextjs.png";
import nextjsChatbotBanner from "./assets/nextjs-chatbot.png";
import reactNativeBanner from "./assets/react-native.png";
import t3TurboBanner from "./assets/t3-turbo.png";

export interface ProjectTemplate {
	id: string;
	name: string;
	description: string;
	icon: LucideIcon;
	bannerClassName: string;
	repo?: string;
	banner?: string;
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
	{
		id: "gstack",
		name: "gstack",
		description: "Garry Tan's role-based Claude Code workflow",
		icon: Layers,
		bannerClassName: "bg-zinc-900 text-white",
		repo: "https://github.com/garrytan/gstack",
		banner: gstackBanner,
	},
	{
		id: "nextjs",
		name: "Next.js",
		description: "Vercel's starter with Drizzle, NextAuth, and Postgres",
		icon: Globe,
		bannerClassName: "bg-black text-white",
		repo: "https://github.com/vercel/nextjs-postgres-auth-starter",
		banner: nextjsBanner,
	},
	{
		id: "nextjs-chatbot",
		name: "Next.js Chatbot",
		description: "AI chatbot built with Next.js and the AI SDK",
		icon: MessageSquare,
		bannerClassName: "bg-black text-white",
		repo: "https://github.com/vercel/ai-chatbot",
		banner: nextjsChatbotBanner,
	},
	{
		id: "react-native",
		name: "React Native",
		description: "Cross-platform mobile app with Expo",
		icon: Smartphone,
		bannerClassName: "bg-blue-500 text-white",
		repo: "https://github.com/expo/expo-template-default",
		banner: reactNativeBanner,
	},
	{
		id: "t3-turbo",
		name: "T3 Turbo",
		description: "Full-stack Turborepo with Next.js, Expo, and tRPC",
		icon: Boxes,
		bannerClassName: "bg-purple-700 text-white",
		repo: "https://github.com/t3-oss/create-t3-turbo",
		banner: t3TurboBanner,
	},
	{
		id: "hono",
		name: "React Router + Hono",
		description: "Fullstack template on Cloudflare Workers",
		icon: Flame,
		bannerClassName: "bg-orange-600 text-white",
		repo: "https://github.com/cloudflare/react-router-hono-fullstack-template",
		banner: honoBanner,
	},
];
