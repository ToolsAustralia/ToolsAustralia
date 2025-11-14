import React from "react";

interface StructuredDataProps<T = unknown> {
  data: T;
}

/**
 * Renders JSON-LD structured data safely in the head.
 * Google recommends JSON-LD and a single script tag per schema block.
 */
export function StructuredData<T>({ data }: StructuredDataProps<T>) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data) }} />;
}

// Common schema helpers

export interface PostalAddress {
  "@type": "PostalAddress";
  streetAddress?: string;
  addressLocality?: string;
  addressRegion?: string;
  postalCode?: string;
  addressCountry?: string;
}

export interface OrganizationSchema {
  "@context": "https://schema.org";
  "@type": "Organization";
  name: string;
  url: string;
  logo?: string;
  telephone?: string;
  sameAs?: string[];
  address?: PostalAddress;
}

export function OrganizationJsonLd(props: {
  name: string;
  url: string;
  logo?: string;
  telephone?: string;
  sameAs?: string[];
  address?: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry?: string;
  };
}) {
  const data: OrganizationSchema = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: props.name,
    url: props.url,
    logo: props.logo,
    telephone: props.telephone,
    sameAs: props.sameAs,
    address: props.address ? { "@type": "PostalAddress", ...props.address } : undefined,
  };
  return <StructuredData data={data} />;
}

export interface ProductOfferSchema {
  "@type": "Offer";
  price: number | string;
  priceCurrency: string;
  availability?: string;
  url?: string;
}

export interface AggregateRatingSchema {
  "@type": "AggregateRating";
  ratingValue: number | string;
  reviewCount: number | string;
}

export interface ReviewRatingSchema {
  "@type": "Rating";
  ratingValue: number | string;
  bestRating?: number | string;
}

export interface ReviewSchema {
  "@type": "Review";
  author: { "@type": "Person"; name: string };
  datePublished?: string;
  reviewBody?: string;
  name?: string;
  reviewRating?: ReviewRatingSchema;
}

export interface ProductSchema {
  "@context": "https://schema.org";
  "@type": "Product";
  name: string;
  description?: string;
  image: string | string[];
  brand?: { "@type": "Brand"; name: string };
  category?: string;
  sku?: string;
  aggregateRating?: AggregateRatingSchema;
  offers?: ProductOfferSchema;
  review?: ReviewSchema[];
}

export function ProductJsonLd(props: {
  name: string;
  description?: string;
  image: string | string[];
  brand?: string;
  category?: string;
  sku?: string;
  aggregateRating?: { ratingValue: number; reviewCount: number };
  offer?: { price: number | string; priceCurrency: string; availability?: string; url?: string };
  reviews?: Array<{
    author: string;
    datePublished?: string;
    reviewBody?: string;
    name?: string;
    reviewRating?: number;
  }>;
}) {
  const data: ProductSchema = {
    "@context": "https://schema.org",
    "@type": "Product",
    name: props.name,
    description: props.description,
    image: props.image,
    brand: props.brand ? { "@type": "Brand", name: props.brand } : undefined,
    category: props.category,
    sku: props.sku,
    aggregateRating: props.aggregateRating
      ? {
          "@type": "AggregateRating",
          ratingValue: props.aggregateRating.ratingValue,
          reviewCount: props.aggregateRating.reviewCount,
        }
      : undefined,
    offers: props.offer
      ? {
          "@type": "Offer",
          price: props.offer.price,
          priceCurrency: props.offer.priceCurrency,
          availability: props.offer.availability,
          url: props.offer.url,
        }
      : undefined,
    review: props.reviews?.map((r) => ({
      "@type": "Review",
      author: { "@type": "Person", name: r.author },
      datePublished: r.datePublished,
      reviewBody: r.reviewBody,
      name: r.name,
      reviewRating: r.reviewRating ? { "@type": "Rating", ratingValue: r.reviewRating, bestRating: 5 } : undefined,
    })),
  };
  return <StructuredData data={data} />;
}

export interface BreadcrumbItemSchema {
  "@type": "ListItem";
  position: number;
  name: string;
  item: string;
}

export interface BreadcrumbListSchema {
  "@context": "https://schema.org";
  "@type": "BreadcrumbList";
  itemListElement: BreadcrumbItemSchema[];
}

export function BreadcrumbJsonLd(props: { items: Array<{ name: string; item: string }> }) {
  const data: BreadcrumbListSchema = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: props.items.map((i, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: i.name,
      item: i.item,
    })),
  };
  return <StructuredData data={data} />;
}

export interface LocalBusinessSchema {
  "@context": "https://schema.org";
  "@type": "LocalBusiness";
  name: string;
  url: string;
  telephone?: string;
  address?: PostalAddress;
  openingHours?: string[];
}

export function LocalBusinessJsonLd(props: {
  name: string;
  url: string;
  telephone?: string;
  address?: {
    streetAddress?: string;
    addressLocality?: string;
    addressRegion?: string;
    postalCode?: string;
    addressCountry?: string;
  };
  openingHours?: string[];
}) {
  const data: LocalBusinessSchema = {
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name: props.name,
    url: props.url,
    telephone: props.telephone,
    address: props.address ? { "@type": "PostalAddress", ...props.address } : undefined,
    openingHours: props.openingHours,
  };
  return <StructuredData data={data} />;
}

export interface WebSiteSchema {
  "@context": "https://schema.org";
  "@type": "WebSite";
  name: string;
  url: string;
  potentialAction?: {
    "@type": "SearchAction";
    target: string;
    "query-input": string;
  };
}

export function WebSiteJsonLd(props: { name: string; url: string; potentialActionUrl?: string }) {
  const data: WebSiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: props.name,
    url: props.url,
    potentialAction: props.potentialActionUrl
      ? {
          "@type": "SearchAction",
          target: `${props.potentialActionUrl}?q={search_term_string}`,
          "query-input": "required name=search_term_string",
        }
      : undefined,
  };
  return <StructuredData data={data} />;
}

interface FAQPageJsonLdProps {
  items: Array<{ question: string; answer: string }>;
}

export function FAQPageJsonLd({ items }: FAQPageJsonLdProps) {
  const data = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((faq) => ({
      "@type": "Question",
      name: faq.question,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.answer,
      },
    })),
  };

  return <StructuredData data={data} />;
}
