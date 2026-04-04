import React from "react";
import FlowWidget from "./FlowWidget";
import { Loader2 } from "lucide-react";

interface WidgetRendererProps {
  widgetData: any;
}

export default function WidgetRenderer({ widgetData }: WidgetRendererProps) {
  if (!widgetData || typeof widgetData !== "object" || !widgetData.type) {
    return null;
  }

  // Add more widget types as they become available
  switch (widgetData.type) {
    case "flow_calculator":
      return <FlowWidget initialArea={widgetData.inputs?.area} />;
    default:
      console.warn(`[WidgetRenderer] Unknown widget type: ${widgetData.type}`);
      return null;
  }
}

export function WidgetLoading() {
  return (
    <div className="my-3 flex items-center justify-center p-6 border border-dashed border-muted-foreground/30 rounded-lg bg-muted/10">
      <div className="flex flex-col items-center gap-2 text-muted-foreground/80">
        <Loader2 className="w-6 h-6 animate-spin text-blue-500/60" />
        <span className="text-xs font-medium tracking-wide">جاري تحميل الواجهة التفاعلية...</span>
      </div>
    </div>
  );
}