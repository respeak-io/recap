"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

export function TabsRenderer({
  tabs,
  renderContent,
}: {
  tabs: { title: string; content: any[] }[];
  renderContent: (nodes: any[], keyPrefix: string) => React.ReactNode;
}) {
  const [activeTab, setActiveTab] = useState(0);

  return (
    <div className="my-4 rounded-lg border">
      <div className="flex border-b bg-muted/30">
        {tabs.map((tab, i) => (
          <button
            key={i}
            className={cn(
              "px-4 py-2 text-sm font-medium transition-colors border-b-2 -mb-px",
              i === activeTab
                ? "border-primary text-foreground"
                : "border-transparent text-muted-foreground hover:text-foreground"
            )}
            onClick={() => setActiveTab(i)}
          >
            {tab.title}
          </button>
        ))}
      </div>
      <div className="p-4">
        {renderContent(tabs[activeTab].content, `tab-${activeTab}`)}
      </div>
    </div>
  );
}
