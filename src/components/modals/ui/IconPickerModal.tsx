"use client";

import { useMemo, useState, ChangeEvent } from "react";
import * as LucideIcons from "lucide-react";
import type { LucideIcon } from "lucide-react";
import ModalContainer from "./ModalContainer";
import ModalHeader from "./ModalHeader";
import ModalContent from "./ModalContent";
import Input from "./Input";

interface IconPickerModalProps {
  isOpen: boolean;
  title?: string;
  onClose: () => void;
  onSelect: (iconName: string) => void;
}

type IconEntry = {
  name: string;
  Component: LucideIcon;
  keywords: string;
};

const ICONS: IconEntry[] = Object.entries(LucideIcons)
  .filter(([name, icon]) => {
    if (name === "default" || name === "icons" || name === "createLucideIcon") return false;
    if (!/^[A-Z]/.test(name)) return false;
    return typeof icon === "function";
  })
  .map(([name, icon]) => ({
    name,
    Component: icon as LucideIcon,
    keywords: name
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/[-_]+/g, " ")
      .toLowerCase(),
  }))
  .sort((a, b) => a.name.localeCompare(b.name));

const IconPickerModal: React.FC<IconPickerModalProps> = ({ isOpen, onClose, onSelect, title = "Select Icon" }) => {
  const [search, setSearch] = useState("");

  const filteredIcons = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return ICONS;
    return ICONS.filter((entry) => entry.keywords.includes(query));
  }, [search]);

  const handleSelect = (iconName: string) => {
    onSelect(iconName);
    onClose();
  };

  return (
    <ModalContainer isOpen={isOpen} onClose={onClose} size="3xl" height="fixed">
      <ModalHeader title={title} onClose={onClose} />
      <ModalContent>
        <div className="space-y-4">
          <Input
            label="Search icons"
            value={search}
            onChange={(event: ChangeEvent<HTMLInputElement>) => setSearch(event.target.value)}
            placeholder="Start typing to filter icons..."
          />

          <div className="max-h-[420px] overflow-y-auto rounded-xl border border-gray-200 bg-white shadow-sm p-3">
            {filteredIcons.length === 0 ? (
              <div className="py-12 text-center text-sm text-gray-500">No icons match your search.</div>
            ) : (
              <div className="grid grid-cols-4 sm:grid-cols-5 lg:grid-cols-6 gap-3">
                {filteredIcons.map(({ name, Component }) => (
                  <button
                    key={name}
                    type="button"
                    onClick={() => handleSelect(name)}
                    className="group flex flex-col items-center gap-2 rounded-lg border border-gray-200 bg-white hover:border-red-500 hover:bg-red-50/60 transition-colors p-3 text-gray-700 hover:text-red-600 shadow-sm"
                  >
                    <Component className="w-6 h-6" />
                    <span className="text-[11px] font-medium tracking-wide text-center">{name}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </ModalContent>
    </ModalContainer>
  );
};

export default IconPickerModal;
