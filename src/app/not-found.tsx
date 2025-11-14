import Link from "next/link";
import Image from "next/image";
import MetallicButton from "@/components/ui/MetallicButton";

export default function NotFound() {
  return (
    <div className="relative min-h-screen w-full overflow-hidden">
      {/* Background Image with Dark Overlay */}
      <div className="absolute inset-0 z-0">
        <Image
          src="/images/background/404-bg.png"
          alt="404 Background"
          fill
          className="object-cover"
          priority
          quality={100}
        />
        {/* Dark gradient overlay for readability */}
        <div className="absolute inset-0 bg-gradient-to-b from-black/20 via-black/10 to-black/30" />
      </div>

      {/* Content Container */}
      <div className="relative z-10 min-h-screen flex items-center justify-center px-4 py-12">
        <div className="max-w-2xl w-full text-center">
          {/* Glass-morphism Content Card */}
          <div
            className="relative backdrop-blur-md bg-black/40 rounded-2xl p-8 md:p-12
            border border-[#ee0000]/30 shadow-2xl shadow-[#ee0000]/20
            before:absolute before:inset-0 before:rounded-2xl 
            before:bg-gradient-to-br before:from-[#ee0000]/10 before:to-transparent before:pointer-events-none"
          >
            {/* Logo with Metallic Effect */}
            <div className="mb-6 relative">
              <div className="inline-block  ">
                <Image
                  src="/images/Tools Australia Logo/White-Text Logo.png"
                  alt="Tools Australia"
                  width={180}
                  height={60}
                  className="h-12 w-auto object-contain drop-shadow-[0_0_10px_rgba(238,0,0,0.3)]"
                  priority
                />
              </div>
            </div>

            {/* Title */}
            <h2
              className="text-3xl md:text-4xl font-bold mb-4
              bg-gradient-to-r from-gray-100 via-white to-gray-100
              bg-clip-text text-transparent"
            >
              Page Not Found
            </h2>

            {/* Description */}
            <p className="text-gray-300 text-lg mb-8 leading-relaxed">
              Looks like this page got lost in the workshop. The tool you&apos;re looking for might have been moved or
              doesn&apos;t exist.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <MetallicButton href="/" variant="primary" size="md" borderRadius="lg">
                Return Home
              </MetallicButton>

              <MetallicButton href="/shop" variant="secondary" size="md" borderRadius="lg" borderColor="red">
                Browse Shop
              </MetallicButton>
            </div>
          </div>

          {/* Help Text */}
          <p className="mt-8 text-gray-400">
            Need assistance?{" "}
            <Link
              href="/contact"
              className="text-[#ee0000] hover:text-[#ff4444] font-semibold 
                transition-colors underline decoration-[#ee0000]/50 hover:decoration-[#ee0000]"
            >
              Contact our support team
            </Link>
          </p>
        </div>
      </div>

      {/* Animated Glow Effects */}
      <div className="absolute top-0 left-0 w-full h-full pointer-events-none overflow-hidden z-[5]">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-[#ee0000]/10 rounded-full blur-[100px] animate-pulse-slow" />
        <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-[#ee0000]/10 rounded-full blur-[100px] animate-pulse-slow delay-1000" />
      </div>
    </div>
  );
}
