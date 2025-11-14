"use client";

import { useState } from "react";
import PartnerHero from "./PartnerHero";
// PartnerCTA removed as requested
import PartnerModal from "@/components/modals/PartnerModal";

export default function PartnerInteractive() {
  const [isModalOpen, setIsModalOpen] = useState(false);

  const handleBecomePartner = () => {
    setIsModalOpen(true);
  };

  const handleModalClose = () => {
    setIsModalOpen(false);
  };

  return (
    <>
      {/* Hero Section */}
      <PartnerHero onBecomePartnerAction={handleBecomePartner} />

      {/* Partner Modal */}
      <PartnerModal isOpen={isModalOpen} onClose={handleModalClose} />
    </>
  );
}

// PartnerCTA component and wrapper removed as requested
