"use client";

import { Star, ChevronLeft, ChevronRight, Quote } from "lucide-react";
import { useState } from "react";

interface Testimonial {
  id: string;
  name: string;
  role: string;
  company: string;
  rating: number;
  text: string;
  avatar?: string;
  verified?: boolean;
}

export default function CustomerTestimonials() {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isTransitioning, setIsTransitioning] = useState(false);

  const testimonials: Testimonial[] = [
    {
      id: "1",
      name: "Michael Thompson",
      role: "Construction Manager",
      company: "Thompson Builders",
      rating: 5,
      text: "Tools Australia has been our go-to supplier for over 3 years. The quality of their Milwaukee and DeWalt tools is unmatched, and their membership program saves us thousands annually. The customer service is exceptional - they understand the construction industry.",
      verified: true,
    },
    {
      id: "2",
      name: "Sarah Chen",
      role: "Electrician",
      company: "Chen Electrical Services",
      rating: 5,
      text: "As a professional electrician, I need reliable tools that won't let me down on the job. Tools Australia's Makita range has been incredible. The VIP membership gives me access to exclusive deals and priority support. Highly recommended!",
      verified: true,
    },
    {
      id: "3",
      name: "David Rodriguez",
      role: "Automotive Technician",
      company: "Rodriguez Auto Repair",
      rating: 5,
      text: "The Kincrome and Sidchrome tools from Tools Australia are top-notch. Their one-time packages are perfect for stocking up, and the quality is exactly what you'd expect from premium brands. Fast delivery and great prices.",
      verified: true,
    },
    {
      id: "4",
      name: "Emma Wilson",
      role: "Carpenter",
      company: "Wilson Carpentry",
      rating: 5,
      text: "I've been using Tools Australia for all my carpentry needs. The range of tools is impressive, and the membership benefits are fantastic. The team really knows their products and always provides expert advice.",
      verified: true,
    },
    {
      id: "5",
      name: "James Mitchell",
      role: "Plumber",
      company: "Mitchell Plumbing",
      rating: 5,
      text: "Outstanding service and product quality. Tools Australia's membership program has been a game-changer for my business. The exclusive discounts and early access to new products keep me ahead of the competition.",
      verified: true,
    },
    {
      id: "6",
      name: "Lisa Anderson",
      role: "HVAC Technician",
      company: "Anderson HVAC",
      rating: 5,
      text: "Professional tools for professional work. Tools Australia delivers on their promise of quality and service. The VIP membership is worth every penny with the savings and benefits it provides.",
      verified: true,
    },
  ];

  // Auto-advance testimonials - DISABLED
  // useEffect(() => {
  //   const interval = setInterval(() => {
  //     if (!isTransitioning) {
  //       setCurrentIndex((prev) => prev + 1);
  //     }
  //   }, 5000);
  //   return () => clearInterval(interval);
  // }, [isTransitioning]);

  const nextTestimonial = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => (prev + 1) % testimonials.length);
    setTimeout(() => setIsTransitioning(false), 700);
  };

  const prevTestimonial = () => {
    if (isTransitioning) return;
    setIsTransitioning(true);
    setCurrentIndex((prev) => (prev - 1 + testimonials.length) % testimonials.length);
    setTimeout(() => setIsTransitioning(false), 700);
  };

  return (
    <section className="py-12 sm:py-16 lg:py-24 mb-4 bg-gradient-to-br from-gray-50 to-white relative overflow-hidden w-full">
      {/* Background Elements */}
      <div className="absolute inset-0 opacity-30 pattern-dots-muted"></div>

      <div className="w-full px-2 sm:px-3 lg:px-8 lg:max-w-7xl lg:mx-auto relative">
        {/* Section Header */}
        <div className="text-center mb-8 sm:mb-10 lg:mb-16">
          <h2 className="text-[20px] sm:text-[24px] lg:text-[56px] font-bold text-gray-900 mb-2 sm:mb-3 lg:mb-4 font-['Poppins'] leading-tight">
            What Our <span className="text-red-600">Customers</span> Say
          </h2>
          <p className="text-[14px] sm:text-[16px] lg:text-[20px] text-gray-600 max-w-4xl mx-auto leading-relaxed">
            Real testimonials from professionals who trust Tools Australia for their business needs
          </p>
        </div>

        {/* Testimonials Carousel - Simple Design */}
        <div className="relative">
          {/* Mobile/Tablet: Single Card */}
          <div className="lg:hidden">
            <div className="flex overflow-hidden rounded-2xl sm:rounded-3xl">
              <div
                className="flex transition-transform duration-700 ease-out"
                style={{ transform: `translateX(-${currentIndex * 100}%)` }}
              >
                {testimonials.map((testimonial) => (
                  <div key={testimonial.id} className="w-full flex-shrink-0 px-2 sm:px-4">
                    <div className="bg-white rounded-xl sm:rounded-2xl p-4 sm:p-6 shadow-2xl hover:shadow-3xl transition-all duration-300 border border-gray-100 h-full transform hover:scale-[1.02] hover:-translate-y-1">
                      {/* Quote Icon */}
                      <div className="flex justify-between items-start mb-4 sm:mb-6">
                        <Quote className="w-6 h-6 sm:w-8 sm:h-8 text-red-100" />
                        {testimonial.verified && (
                          <div className="flex items-center gap-1 bg-green-100 text-green-600 px-2 py-1 rounded-full text-xs font-semibold">
                            <Star className="w-3 h-3 fill-current" />
                            Verified
                          </div>
                        )}
                      </div>

                      {/* Stars */}
                      <div className="flex items-center gap-1 mb-4 sm:mb-6">
                        {[...Array(testimonial.rating)].map((_, i) => (
                          <Star key={i} className="w-4 h-4 sm:w-5 sm:h-5 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>

                      {/* Testimonial Text */}
                      <p className="text-gray-700 leading-relaxed text-[14px] sm:text-[16px] mb-6 sm:mb-8 font-medium">
                        &ldquo;{testimonial.text}&rdquo;
                      </p>

                      {/* Customer Info */}
                      <div className="flex items-center gap-3 sm:gap-4">
                        <div className="w-12 h-12 sm:w-14 sm:h-14 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center text-white font-bold text-sm sm:text-lg">
                          {testimonial.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900 text-[14px] sm:text-[16px]">{testimonial.name}</h4>
                          <p className="text-gray-600 text-[12px] sm:text-[14px]">{testimonial.role}</p>
                          <p className="text-red-600 text-[12px] sm:text-[14px] font-semibold">{testimonial.company}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Desktop: Three Cards */}
          <div className="hidden lg:block">
            <div className="flex overflow-hidden rounded-3xl">
              <div
                className="flex transition-transform duration-700 ease-out"
                style={{ transform: `translateX(-${currentIndex * 33.33}%)` }}
              >
                {testimonials.map((testimonial) => (
                  <div key={testimonial.id} className="w-1/3 flex-shrink-0 px-4">
                    <div className="bg-white rounded-2xl p-6 shadow-2xl hover:shadow-3xl transition-all duration-300 border border-gray-100 h-full transform hover:scale-[1.02] hover:-translate-y-1">
                      {/* Quote Icon */}
                      <div className="flex justify-between items-start mb-6">
                        <Quote className="w-8 h-8 text-red-100" />
                        {testimonial.verified && (
                          <div className="flex items-center gap-1 bg-green-100 text-green-600 px-2 py-1 rounded-full text-xs font-semibold">
                            <Star className="w-3 h-3 fill-current" />
                            Verified
                          </div>
                        )}
                      </div>

                      {/* Stars */}
                      <div className="flex items-center gap-1 mb-6">
                        {[...Array(testimonial.rating)].map((_, i) => (
                          <Star key={i} className="w-5 h-5 fill-yellow-400 text-yellow-400" />
                        ))}
                      </div>

                      {/* Testimonial Text */}
                      <p className="text-gray-700 leading-relaxed text-[16px] mb-8 font-medium">
                        &ldquo;{testimonial.text}&rdquo;
                      </p>

                      {/* Customer Info */}
                      <div className="flex items-center gap-4">
                        <div className="w-14 h-14 bg-gradient-to-br from-red-500 to-red-600 rounded-full flex items-center justify-center text-white font-bold text-lg">
                          {testimonial.name
                            .split(" ")
                            .map((n) => n[0])
                            .join("")}
                        </div>
                        <div>
                          <h4 className="font-bold text-gray-900 text-[16px]">{testimonial.name}</h4>
                          <p className="text-gray-600 text-[14px]">{testimonial.role}</p>
                          <p className="text-red-600 text-[14px] font-semibold">{testimonial.company}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Navigation Arrows - Responsive */}
          <button
            onClick={prevTestimonial}
            className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 sm:-translate-x-6 w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 bg-white rounded-full shadow-2xl flex items-center justify-center hover:bg-gray-50 transition-all duration-300 border border-gray-100 group hover:shadow-3xl hover:scale-110"
          >
            <ChevronLeft className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-gray-600 group-hover:text-red-600 transition-colors" />
          </button>

          <button
            onClick={nextTestimonial}
            className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-4 sm:translate-x-6 w-10 h-10 sm:w-12 sm:h-12 lg:w-14 lg:h-14 bg-white rounded-full shadow-2xl flex items-center justify-center hover:bg-gray-50 transition-all duration-300 border border-gray-100 group hover:shadow-3xl hover:scale-110"
          >
            <ChevronRight className="w-4 h-4 sm:w-5 sm:h-5 lg:w-6 lg:h-6 text-gray-600 group-hover:text-red-600 transition-colors" />
          </button>
        </div>
      </div>
    </section>
  );
}
