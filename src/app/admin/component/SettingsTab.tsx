"use client";

import { useState } from "react";
import { Shield, Users } from "lucide-react";
import RolesManagement from "@/components/admin/settings/RolesManagement";
import StaffManagement from "@/components/admin/settings/StaffManagement";

type Section = "staff" | "roles";

export default function SettingsTab() {
  const [section, setSection] = useState<Section>("staff");

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 mb-6 -mt-2">
        <TabButton
          active={section === "staff"}
          onClick={() => setSection("staff")}
          icon={<Users className="w-4 h-4" />}
          label="Staff"
        />
        <TabButton
          active={section === "roles"}
          onClick={() => setSection("roles")}
          icon={<Shield className="w-4 h-4" />}
          label="Roles"
        />
      </div>

      {section === "staff" ? <StaffManagement /> : <RolesManagement />}
    </div>
  );
}

function TabButton({
  active,
  onClick,
  icon,
  label,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold capitalize transition-colors -mb-px border-b-2 ${
        active
          ? "text-[#ee0000] dark:text-[#ff4444] border-[#ee0000] dark:border-[#ff4444]"
          : "text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 border-transparent"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
