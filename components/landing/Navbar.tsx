import React from "react";
import { Menu } from "lucide-react";

interface NavbarProps {
  onOpenMenu?: () => void;
}

export default function Navbar({ onOpenMenu }: NavbarProps) {
  return (
    <nav className="sticky top-0 z-50 w-full px-4 py-4">
      <div className="mx-auto max-w-[1120px]">
        <div className="flex items-center justify-between rounded-full border border-slate-200/50 bg-white/80 px-6 py-3 shadow-[0_18px_45px_rgba(15,23,42,0.06)] backdrop-blur-md">
          {/* Logo & Brand */}
          <div className="flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-emerald-600">
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="h-5 w-5 text-white"
              >
                <path d="m16 13 5.223 3.482a.5.5 0 0 0 .777-.416V7.87a.5.5 0 0 0-.752-.432L16 10.5" />
                <rect x="2" y="6" width="14" height="12" rx="2" />
              </svg>
            </div>
            <span className="text-sm font-medium text-slate-800">insightseel</span>
          </div>

          {/* Desktop Navigation */}
          <div className="hidden items-center gap-6 md:flex">
            <a href="#features" className="text-xs text-slate-600 transition-colors hover:text-slate-900">
              Features
            </a>
            <a href="#pricing" className="text-xs text-slate-600 transition-colors hover:text-slate-900">
              Pricing
            </a>
            <a href="#docs" className="text-xs text-slate-600 transition-colors hover:text-slate-900">
              Docs
            </a>
            <button className="rounded-full bg-emerald-600 px-5 py-2 text-xs font-semibold text-white transition-all hover:scale-[1.02] hover:bg-emerald-700">
              Get Started
            </button>
          </div>

          {/* Mobile Menu Button */}
          <button
            onClick={onOpenMenu}
            className="flex items-center justify-center md:hidden"
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5 text-slate-700" />
          </button>
        </div>
      </div>
    </nav>
  );
}
