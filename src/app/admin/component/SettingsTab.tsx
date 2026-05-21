"use client";

import { useEffect, useState } from "react";
import { ScrollText, Shield, Users } from "lucide-react";
import RolesManagement from "@/components/admin/settings/RolesManagement";
import StaffManagement from "@/components/admin/settings/StaffManagement";
import StaffActivityManagement from "./StaffActivityManagement";
import { usePermissions } from "@/hooks/usePermissions";

type Section = "staff" | "roles" | "logs";

export default function SettingsTab() {
  const { has } = usePermissions();
  const canManageStaff = has("settings.view");
  const canViewAudit = has("audit.view");

  const sections: { id: Section; label: string; icon: React.ReactNode; visible: boolean }[] = [
    { id: "staff", label: "Staff", icon: <Users className="w-4 h-4" />, visible: canManageStaff },
    { id: "roles", label: "Roles", icon: <Shield className="w-4 h-4" />, visible: canManageStaff },
    { id: "logs", label: "Logs", icon: <ScrollText className="w-4 h-4" />, visible: canViewAudit },
  ];
  const visible = sections.filter((s) => s.visible);

  const [section, setSection] = useState<Section>(() => visible[0]?.id ?? "staff");

  // If the active section becomes hidden (e.g. permission revoked mid-session),
  // fall back to the first still-visible one.
  useEffect(() => {
    if (!visible.some((s) => s.id === section) && visible[0]) {
      setSection(visible[0].id);
    }
  }, [visible, section]);

  if (visible.length === 0) {
    return (
      <div className="p-10 text-sm text-gray-500 dark:text-gray-400">
        You don&apos;t have permission to view this page.
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-1 border-b border-gray-200 dark:border-gray-800 mb-6 -mt-2 overflow-x-auto no-scrollbar">
        {visible.map((s) => (
          <TabButton
            key={s.id}
            active={section === s.id}
            onClick={() => setSection(s.id)}
            icon={s.icon}
            label={s.label}
          />
        ))}
      </div>

      {section === "staff" && <StaffManagement />}
      {section === "roles" && <RolesManagement />}
      {section === "logs" && <StaffActivityManagement />}
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
      className={`flex items-center gap-2 px-4 sm:px-5 py-2.5 text-sm font-semibold capitalize transition-colors -mb-px border-b-2 whitespace-nowrap ${
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
