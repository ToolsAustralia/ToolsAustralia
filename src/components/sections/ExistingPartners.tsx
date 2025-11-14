import Image from "next/image";
import { Star, Quote } from "lucide-react";

export default function ExistingPartners() {
  const partnerTestimonials = [
    {
      company: "PowerTool Pro",
      logo: "/images/SampleProducts/dewalttools.png", // Using existing images
      representative: "Mark Thompson",
      position: "Sales Director",
      testimonial:
        "Tools Australia has transformed our business. We've seen a 250% increase in sales and gained access to thousands of qualified customers we never could have reached before.",
      results: "+250% Sales Growth",
      rating: 5,
    },
    {
      company: "BuildMaster Tools",
      logo: "/images/SampleProducts/makitatools.jpg",
      representative: "Sarah Chen",
      position: "Marketing Manager",
      testimonial:
        "The partnership has exceeded all our expectations. The platform is intuitive, the support is excellent, and our products are reaching exactly the right audience.",
      results: "15,000+ New Customers",
      rating: 5,
    },
    {
      company: "TradeMax Equipment",
      logo: "/images/SampleProducts/milwaukeetools.png",
      representative: "David Wilson",
      position: "Business Owner",
      testimonial:
        "Being a Tools Australia partner has been game-changing. The dedicated account management and marketing support have helped us expand into new markets across Australia.",
      results: "#1 in Category",
      rating: 5,
    },
  ];

  const partnerBrands = [
    { name: "DeWalt", logo: "/images/brands/dewalt.png", category: "Power Tools", color: "bg-yellow-600" },
    { name: "Makita", logo: "/images/brands/Makita-red.png", category: "Professional Tools", color: "bg-cyan-600" },
    { name: "Milwaukee", logo: "/images/brands/milwaukee.png", category: "Heavy Duty", color: "bg-red-600" },
    { name: "Sidchrome", logo: "/images/brands/sidchrome.png", category: "Hand Tools", color: "bg-red-700" },
    { name: "Kincrome", logo: "/images/brands/kincrome.png", category: "Tool Storage", color: "bg-blue-700" },
  ];

  return (
    <section className="py-16 sm:py-20 lg:py-24 bg-white">
      <div className="w-full px-4 sm:px-6 lg:px-[100px] lg:max-w-1440 lg:mx-auto">
        {/* Section Header */}
        <div className="text-center mb-12 lg:mb-16">
          <div className="inline-flex items-center gap-2 bg-gradient-to-r from-[#ee0000] to-[#ff4444] text-white px-2 py-1 text-sm font-medium mb-3">
            Our Partners
          </div>

          <h2 className="text-[28px] sm:text-[36px] lg:text-[48px] font-black leading-tight text-black font-['Poppins'] mb-6">
            Trusted by Australia&apos;s
            <span className="block text-[#ee0000]">Leading Brands</span>
          </h2>

          <p className="text-[16px] sm:text-[18px] lg:text-[20px] text-[rgba(0,0,0,0.7)] font-normal leading-relaxed max-w-3xl mx-auto font-['Inter']">
            Join hundreds of successful partners who have chosen Tools Australia to grow their business and connect with
            Australia&apos;s largest tool community.
          </p>
        </div>

        {/* Partner Logos Grid */}
        <div className="mb-16">
          <h3 className="text-[20px] sm:text-[24px] font-bold text-gray-800 text-center mb-8 font-['Poppins']">
            Featured Partners
          </h3>

          {/* Desktop Grid */}
          <div className="hidden lg:grid grid-cols-5 gap-8 items-center justify-items-center mb-8">
            {partnerBrands.map((brand, index) => (
              <div key={index} className="group">
                <div
                  className={`${brand.color} rounded-2xl p-6 shadow-lg border border-gray-100 hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 w-full h-32 flex items-center justify-center`}
                >
                  <Image
                    src={brand.logo}
                    alt={brand.name}
                    width={120}
                    height={64}
                    className="max-h-16 w-auto object-contain filter brightness-0 invert transition-all duration-300"
                  />
                </div>
                <div className="text-center mt-3">
                  <p className="text-sm font-medium text-gray-800 font-['Poppins']">{brand.name}</p>
                  <p className="text-xs text-gray-500 font-['Inter']">{brand.category}</p>
                </div>
              </div>
            ))}
          </div>

          {/* Mobile Scroll */}
          <div className="lg:hidden overflow-x-auto scrollbar-hide">
            <div className="flex gap-6 pb-4" style={{ width: "max-content" }}>
              {partnerBrands.map((brand, index) => (
                <div key={index} className="flex-shrink-0 w-32">
                  <div
                    className={`${brand.color} rounded-xl p-4 shadow-lg border border-gray-100 h-24 flex items-center justify-center`}
                  >
                    <Image
                      src={brand.logo}
                      alt={brand.name}
                      width={120}
                      height={48}
                      className="max-h-12 w-auto object-contain filter brightness-0 invert"
                    />
                  </div>
                  <div className="text-center mt-2">
                    <p className="text-sm font-medium text-gray-800 font-['Poppins']">{brand.name}</p>
                    <p className="text-xs text-gray-500 font-['Inter']">{brand.category}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Partner Testimonials */}
        <div className="mb-16">
          <h3 className="text-[20px] sm:text-[24px] font-bold text-gray-800 text-center mb-8 font-['Poppins']">
            What Our Partners Say
          </h3>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {partnerTestimonials.map((testimonial, index) => (
              <div key={index} className="bg-white rounded-2xl p-8 shadow-xl border border-gray-100 relative">
                {/* Quote Icon */}
                <div className="absolute top-6 right-6 w-8 h-8 bg-[#ee0000]/10 rounded-full flex items-center justify-center">
                  <Quote className="w-4 h-4 text-[#ee0000]" />
                </div>

                {/* Company Logo */}
                <div className="w-16 h-16 bg-gray-100 rounded-xl flex items-center justify-center mb-6">
                  <Image
                    src={testimonial.logo}
                    alt={testimonial.company}
                    width={120}
                    height={48}
                    className="max-h-12 w-auto object-contain"
                  />
                </div>

                {/* Rating */}
                <div className="flex items-center gap-1 mb-4">
                  {[...Array(testimonial.rating)].map((_, i) => (
                    <Star key={i} className="w-4 h-4 fill-yellow-400 text-yellow-400" />
                  ))}
                </div>

                {/* Testimonial */}
                <p className="text-gray-600 font-['Inter'] mb-6 leading-relaxed">
                  &quot;{testimonial.testimonial}&quot;
                </p>

                {/* Results Badge */}
                <div className="inline-flex items-center gap-2 bg-gradient-to-r from-green-50 to-green-100 text-green-800 px-4 py-2 rounded-full text-sm font-medium mb-6">
                  {testimonial.results}
                </div>

                {/* Author */}
                <div className="border-t pt-4">
                  <p className="font-bold text-gray-800 font-['Poppins']">{testimonial.representative}</p>
                  <p className="text-sm text-gray-500 font-['Inter']">{testimonial.position}</p>
                  <p className="text-sm font-medium text-[#ee0000] font-['Inter']">{testimonial.company}</p>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Partner Success Stats */}
        <div className="bg-gradient-to-r from-gray-50 to-gray-100 rounded-3xl p-8 lg:p-12">
          <div className="text-center mb-10">
            <h3 className="text-[24px] sm:text-[28px] lg:text-[32px] font-bold text-gray-800 mb-4 font-['Poppins']">
              Partnership Success by the Numbers
            </h3>
            <p className="text-gray-600 font-['Inter'] max-w-2xl mx-auto">
              Our partners consistently achieve outstanding results through our platform
            </p>
          </div>

          <div className="grid grid-cols-2 lg:grid-cols-4 gap-8">
            <div className="text-center">
              <div className="text-3xl font-bold text-[#ee0000] mb-2 font-['Inter']">150%</div>
              <div className="text-gray-600 font-['Inter']">Average Sales Increase</div>
            </div>

            <div className="text-center">
              <div className="text-3xl font-bold text-[#ee0000] mb-2 font-['Inter']">12K</div>
              <div className="text-gray-600 font-['Inter']">Avg New Customers</div>
            </div>

            <div className="text-center">
              <div className="text-3xl font-bold text-[#ee0000] mb-2 font-['Inter']">99%</div>
              <div className="text-gray-600 font-['Inter']">Partner Satisfaction</div>
            </div>

            <div className="text-center">
              <div className="text-3xl font-bold text-[#ee0000] mb-2 font-['Inter']">4.9</div>
              <div className="text-gray-600 font-['Inter']">Average Rating</div>
            </div>
          </div>

          {/* Call to Action */}
          <div className="text-center mt-10 pt-8 border-t border-gray-200">
            <p className="text-gray-600 font-['Inter'] mb-4">Ready to join these successful partners?</p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <div className="flex items-center gap-2 text-sm text-gray-600 font-['Inter']">
                <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                <span>No setup fees</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 font-['Inter']">
                <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                <span>Dedicated support</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-600 font-['Inter']">
                <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                <span>Flexible terms</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
