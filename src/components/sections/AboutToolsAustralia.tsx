import { CheckCircle } from "lucide-react";

export default function AboutToolsAustralia() {
  return (
    <section className="py-8 sm:py-12 lg:py-16 bg-gray-50">
      <div className="w-full px-4 sm:px-6 lg:px-[100px] lg:max-w-1440 lg:mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12 lg:mb-16">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white px-2 py-1 text-sm font-medium mb-3">
            About Tools Australia
          </div>

          <h2 className="text-[28px] sm:text-[36px] lg:text-[48px] font-black leading-tight text-black font-['Poppins'] mb-6">
            Australia&apos;s Premier
            <span className="block text-[#ee0000]">Tool Marketplace</span>
          </h2>

          <p className="text-[16px] sm:text-[18px] lg:text-[20px] text-[rgba(0,0,0,0.7)] font-normal leading-relaxed max-w-3xl mx-auto font-['Inter']">
            We&apos;ve built Australia&apos;s most trusted platform connecting tool professionals, enthusiasts, and
            leading brands in one comprehensive ecosystem.
          </p>
        </div>

        {/* Two Column Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12 lg:gap-16 items-center mb-16">
          {/* Left Column - Content */}
          <div>
            <h3 className="text-[24px] sm:text-[28px] lg:text-[32px] font-bold text-gray-800 mb-6 font-['Poppins']">
              Connecting Tools with the People Who Need Them
            </h3>

            <p className="text-[16px] sm:text-[18px] text-gray-600 mb-6 font-['Inter'] leading-relaxed">
              Since our founding, Tools Australia has revolutionized how Australians discover, purchase, and engage with
              quality tools. We&apos;ve created more than just a marketplace – we&apos;ve built a community.
            </p>

            <p className="text-[16px] sm:text-[18px] text-gray-600 mb-8 font-['Inter'] leading-relaxed">
              Our platform combines cutting-edge technology with deep industry expertise to deliver unparalleled value
              to both customers and partners. From weekend warriors to professional tradespeople, we serve everyone who
              values quality tools.
            </p>

            {/* Key Features */}
            <div className="grid grid-cols-2 gap-4">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-red-600" />
                </div>
                <span className="text-gray-700 font-medium font-['Inter']">Verified Products</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-red-600" />
                </div>
                <span className="text-gray-700 font-medium font-['Inter']">Expert Reviews</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-red-600" />
                </div>
                <span className="text-gray-700 font-medium font-['Inter']">Secure Payments</span>
              </div>

              <div className="flex items-center gap-3">
                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center">
                  <CheckCircle className="w-5 h-5 text-red-600" />
                </div>
                <span className="text-gray-700 font-medium font-['Inter']">Fast Shipping</span>
              </div>
            </div>
          </div>

          {/* Right Column - Stats Cards */}
          {/* Mobile/Tablet: Horizontal Scroll */}
          <div className="lg:hidden overflow-x-auto pb-4 scrollbar-hide">
            <div className="flex gap-6 min-w-max">
              <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 text-center flex-shrink-0 w-48">
                {/* <div className="text-2xl font-bold text-[#ee0000] mb-2 font-['Inter']">30,000+</div> */}
                <div className="font-bold text-[#ee0000] text-sm font-['Inter']">All Trades</div>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 text-center flex-shrink-0 w-48">
                {/* <div className="text-2xl font-bold text-[#ee0000] mb-2 font-['Inter']">2,000+</div> */}
                <div className="font-bold text-[#ee0000] text-sm font-['Inter']">Quality Products</div>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 text-center flex-shrink-0 w-48">
                {/* <div className="text-2xl font-bold text-[#ee0000] mb-2 font-['Inter']">200+</div> */}
                <div className="font-bold text-[#ee0000] text-sm font-['Inter']">Partner Discounts</div>
              </div>

              <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 text-center flex-shrink-0 w-48">
                {/* <div className="text-2xl font-bold text-[#ee0000] mb-2 font-['Inter']">$2M+</div> */}
                <div className="font-bold text-[#ee0000] text-sm font-['Inter']">Major Giveaways</div>
              </div>
            </div>
          </div>

          {/* Desktop: Grid Layout */}
          <div className="hidden lg:grid grid-cols-2 gap-6">
            {/* Stat Card 1 */}
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 text-center">
              {/* <div className="text-2xl font-bold text-[#ee0000] mb-2 font-['Inter']">30,000+</div> */}
              <div className="font-bold text-[#ee0000] text-lg font-['Inter']">All Trades</div>
            </div>

            {/* Stat Card 2 */}
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 text-center">
              {/* <div className="text-2xl font-bold text-[#ee0000] mb-2 font-['Inter']">2,000+</div> */}
              <div className="font-bold text-[#ee0000] text-lg font-['Inter']">Quality Products</div>
            </div>

            {/* Stat Card 3 */}
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 text-center">
              {/* <div className="text-2xl font-bold text-[#ee0000] mb-2 font-['Inter']">200+</div> */}
              <div className="font-bold text-[#ee0000] text-lg font-['Inter']">Partner Discounts</div>
            </div>

            {/* Stat Card 4 */}
            <div className="bg-white rounded-2xl p-6 shadow-lg border border-gray-100 text-center">
              {/* <div className="text-2xl font-bold text-[#ee0000] mb-2 font-['Inter']">$2M+</div> */}
              <div className="font-bold text-[#ee0000] text-lg font-['Inter']">Major Giveaways</div>
            </div>
          </div>
        </div>

        {/* Mission Statement */}
        <div className="bg-gradient-to-r from-gray-900 to-gray-800 rounded-3xl p-8 lg:p-12 text-center">
          <div className="max-w-4xl mx-auto">
            <h3 className="text-[24px] sm:text-[28px] lg:text-[32px] font-bold text-white mb-6 font-['Poppins']">
              Our Mission
            </h3>

            <p className="text-[16px] sm:text-[18px] lg:text-[20px] text-gray-300 leading-relaxed font-['Inter']">
              To give every Australian – from weekend DIY warriors to hard-working tradies – the chance to own the best
              tools on the market. Through epic tool giveaways, exclusive rewards, and community-driven promotions,
              we’re changing the way Aussies gear up for work and play.
            </p>
          </div>
        </div>

        {/* Values Section */}
        <div className="mt-16 grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="text-center">
            <h4 className="text-xl font-bold text-gray-800 mb-3 font-['Poppins']">Quality First</h4>
            <p className="text-gray-600 font-['Inter']">
              We only give away tools from trusted, top-tier brands. Every prize is hand-picked and vetted to meet the
              highest standards for performance, durability, and value.
            </p>
          </div>

          <div className="text-center">
            <h4 className="text-xl font-bold text-gray-800 mb-3 font-['Poppins']">Community Driven</h4>
            <p className="text-gray-600 font-['Inter']">
              Our members are the heart of what we do. From shaping the giveaways we launch to sharing their wins and
              stories, our community fuels the excitement that keeps us growing.
            </p>
          </div>

          <div className="text-center">
            <h4 className="text-xl font-bold text-gray-800 mb-3 font-['Poppins']">Innovation</h4>
            <p className="text-gray-600 font-['Inter']">
              We’re constantly improving how Australians win and engage – from streamlined entry systems to unique
              membership perks – making tool giveaways easier, fairer, and more rewarding than ever.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}
