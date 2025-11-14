import { Check } from "lucide-react";

export default function PartnerBenefits() {
  const benefits = [
    {
      title: "Increased Revenue",
      description: "Access our engaged community of 30,000+ tool professionals and enthusiasts",
      stats: "+150% avg sales increase",
    },
    {
      title: "Massive Reach",
      description: "Get your products in front of qualified buyers actively seeking tools",
      stats: "30,000+ active members",
    },
    {
      title: "Premium Placement",
      description: "Featured positioning in our marketplace with priority visibility",
      stats: "5x more visibility",
    },
    {
      title: "Brand Protection",
      description: "Verified partner status with authentic product guarantee",
      stats: "100% authentic guarantee",
    },
    {
      title: "Fast Integration",
      description: "Simple setup process with dedicated support and training",
      stats: "24hr setup time",
    },
    {
      title: "Targeted Marketing",
      description: "Reach specific demographics and professional segments",
      stats: "95% target accuracy",
    },
    {
      title: "National Coverage",
      description: "Australia-wide distribution network and logistics support",
      stats: "All major cities covered",
    },
    {
      title: "Dedicated Support",
      description: "Personal account manager and priority customer service",
      stats: "24/7 support available",
    },
  ];

  return (
    <section className="py-16 sm:py-20 lg:py-24 bg-white">
      <div className="w-full px-4 sm:px-6 lg:px-[100px] lg:max-w-1440 lg:mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12 lg:mb-16">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white px-2 py-1  text-sm font-medium mb-3">
            Partnership Benefits
          </div>

          <h2 className="text-[28px] sm:text-[36px] lg:text-[48px] font-black leading-tight text-black font-['Poppins'] mb-6">
            Why Choose
            <span className="block text-[#ee0000]">Tools Australia?</span>
          </h2>

          <p className="text-[16px] sm:text-[18px] lg:text-[20px] text-[rgba(0,0,0,0.7)] font-normal leading-relaxed max-w-3xl mx-auto font-['Inter']">
            Join Australia&apos;s fastest-growing tool marketplace and unlock unprecedented growth opportunities for
            your business with our comprehensive partnership program.
          </p>
        </div>

        {/* Benefits Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 lg:gap-8 mb-16">
          {benefits.map((benefit, index) => (
            <div
              key={index}
              className="group bg-white rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-2xl transition-all duration-500 transform hover:-translate-y-2 hover:scale-105"
            >
              {/* Content */}
              <h3 className="text-xl font-bold text-gray-800 mb-3 font-['Poppins'] group-hover:text-[#ee0000] transition-colors duration-300">
                {benefit.title}
              </h3>

              <p className="text-gray-600 mb-4 font-['Inter'] text-sm leading-relaxed">{benefit.description}</p>

              {/* Stats */}
              <div className="inline-flex items-center gap-2 bg-gray-50 px-3 py-2 rounded-full">
                <span className="text-xs font-semibold text-gray-700 font-['Inter']">{benefit.stats}</span>
              </div>
            </div>
          ))}
        </div>

        {/* Success Stories Section */}
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-3xl p-8 lg:p-12">
          <div className="text-center mb-10">
            <h3 className="text-[24px] sm:text-[28px] lg:text-[32px] font-bold text-gray-800 mb-4 font-['Poppins']">
              Partner Success Stories
            </h3>
            <p className="text-gray-600 font-['Inter'] max-w-2xl mx-auto">
              See how our partners have transformed their businesses with Tools Australia
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Success Story 1 */}
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <div className="mb-4">
                <h4 className="font-bold text-gray-800 font-['Poppins'] mb-1">PowerTool Pro</h4>
                <p className="text-sm text-gray-600 font-['Inter']">Tool Retailer</p>
              </div>
              <div className="text-2xl font-bold text-[#ee0000] mb-2 font-['Poppins']">+250%</div>
              <p className="text-gray-600 font-['Inter'] text-sm">
                Increase in online sales within 6 months of partnership
              </p>
            </div>

            {/* Success Story 2 */}
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <div className="mb-4">
                <h4 className="font-bold text-gray-800 font-['Poppins'] mb-1">BuildMaster</h4>
                <p className="text-sm text-gray-600 font-['Inter']">Construction Tools</p>
              </div>
              <div className="text-2xl font-bold text-[#ee0000] mb-2 font-['Poppins']">15,000+</div>
              <p className="text-gray-600 font-['Inter'] text-sm">New customers acquired through our platform</p>
            </div>

            {/* Success Story 3 */}
            <div className="bg-white rounded-2xl p-6 shadow-lg">
              <div className="mb-4">
                <h4 className="font-bold text-gray-800 font-['Poppins'] mb-1">TradeMax</h4>
                <p className="text-sm text-gray-600 font-['Inter']">Professional Tools</p>
              </div>
              <div className="text-2xl font-bold text-[#ee0000] mb-2 font-['Poppins']">#1</div>
              <p className="text-gray-600 font-['Inter'] text-sm">
                Top-rated partner in their category for 2 years running
              </p>
            </div>
          </div>
        </div>

        {/* Bottom CTA */}
        <div className="text-center mt-12">
          <p className="text-gray-600 font-['Inter'] mb-6">Ready to unlock these benefits for your business?</p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <div className="flex items-center gap-2 text-sm text-gray-600 font-['Inter']">
              <Check className="w-4 h-4 text-green-600" />
              No setup fees
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600 font-['Inter']">
              <Check className="w-4 h-4 text-green-600" />
              Flexible terms
            </div>
            <div className="flex items-center gap-2 text-sm text-gray-600 font-['Inter']">
              <Check className="w-4 h-4 text-green-600" />
              Dedicated support
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
