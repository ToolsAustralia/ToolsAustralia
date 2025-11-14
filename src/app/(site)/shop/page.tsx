import { Suspense } from "react";
import { Metadata } from "next";
import Image from "next/image";
import ShopContent from "@/components/features/ShopContent";
import MembershipSection from "@/components/sections/MembershipSection";
import MetallicDivider from "@/components/ui/MetallicDivider";

// SEO Metadata for Shop Page
export const metadata: Metadata = {
	title: "Shop Tools & Equipment | Tools Australia",
	description:
		"Discover our premium collection of professional tools and equipment. Shop power tools, hand tools, safety equipment, and more from top brands like DeWalt, Makita, and Milwaukee.",
	keywords:
		"tools, power tools, hand tools, safety equipment, DeWalt, Makita, Milwaukee, professional tools, Australia",
	openGraph: {
		title: "Shop Tools & Equipment | Tools Australia",
		description:
			"Discover our premium collection of professional tools and equipment. Shop power tools, hand tools, safety equipment, and more.",
		type: "website",
		url: "/shop",
	},
	twitter: {
		card: "summary_large_image",
		title: "Shop Tools & Equipment | Tools Australia",
		description: "Discover our premium collection of professional tools and equipment.",
	},
	alternates: {
		canonical: `${process.env.NEXT_PUBLIC_APP_URL || "https://toolsaustralia.com.au"}/shop`,
	},
};

export default function ShopPage() {
	return (
		<div className="min-h-screen-svh bg-white">
			{/* Page Header - Metallic Industrial Design */}
			<div className="relative pt-[86px] sm:pt-[106px] pb-8 bg-gradient-to-b from-black via-slate-900 to-black">
				{/* Background Image with Dark Overlay */}
				<div className="absolute inset-0 z-0">
					<Image
						src="/images/background/shopPage-bg.png"
						alt="Tools Australia"
						fill
						className="object-cover "
						priority
					/>
					<div className="absolute inset-0 " />
				</div>

				{/* Content */}
				<div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-8">
					<div className="flex flex-col lg:flex-row items-center justify-between gap-6">
						<div className="text-center lg:text-left">
							<h1 className="text-[32px] sm:text-[40px] lg:text-[48px] font-bold font-['Poppins'] mb-4">
								<span className="text-white">S</span>
								<span className="bg-gradient-to-r from-[#ee0000] to-[#cc0000] bg-clip-text text-transparent">h</span>
								<span className="text-white">op</span>
							</h1>
						</div>
						<div className="text-center lg:text-right lg:max-w-md">
							<p className="text-[16px] text-gray-200">
								Discover our premium collection of tools and equipment for professionals and enthusiasts
							</p>
						</div>
					</div>
				</div>

				{/* Metallic Border */}
				<MetallicDivider height="h-[2px]" className="absolute bottom-0 left-0 right-0" />
			</div>

			{/* Main Shop Content - Client Component for Interactivity */}
			<Suspense fallback={<div className=" text-center">Loading shop...</div>}>
				<ShopContent initialProducts={[]} totalProducts={0} />
			</Suspense>

			{/* Membership Section */}
			<div className="bg-gradient-to-b from-black via-slate-900 to-black">
				<MembershipSection title="UPGRADE YOUR TOOL GAME" padding="pt-8 pb-32" titleColor="text-white" />
			</div>
		</div>
	);
}
