import React, { useState } from "react";
import { Calculator, ArrowRight, CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface FlowWidgetProps {
  initialArea?: number;
}

export default function FlowWidget({ initialArea = 1500 }: FlowWidgetProps) {
  const [area, setArea] = useState(initialArea);
  const [flowRate, setFlowRate] = useState<number | null>(null);

  const calculateFlow = () => {
    // Example: A generic flow calculation based on SBC logic
    // Just a placeholder calculation
    setFlowRate(area * 0.15);
  };

  return (
    <div className="my-4 border border-blue-500/20 bg-blue-500/5 rounded-lg p-4 font-sans text-sm" dir="rtl">
      <div className="flex items-center gap-2 mb-3 text-blue-400 font-semibold">
        <Calculator className="w-5 h-5" />
        <span>حاسبة تدفق المياه التقريبية (Flow Rate Calculator)</span>
      </div>
      
      <div className="flex flex-col gap-3">
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3">
          <label className="text-muted-foreground whitespace-nowrap">مساحة التصميم (م٢):</label>
          <input 
            type="number" 
            value={area}
            onChange={(e) => setArea(Number(e.target.value))}
            className="bg-background border border-border rounded px-3 py-1.5 w-full sm:w-32 focus:outline-none focus:border-blue-500/50"
          />
          <Button onClick={calculateFlow} size="sm" className="w-full sm:w-auto bg-blue-600 hover:bg-blue-700 text-white flex gap-2">
            احسب التدفق <ArrowRight className="w-4 h-4" />
          </Button>
        </div>

        {flowRate !== null && (
          <div className="mt-2 p-3 bg-emerald-500/10 border border-emerald-500/20 rounded flex items-center gap-3 text-emerald-400">
            <CheckCircle2 className="w-5 h-5 flex-shrink-0" />
            <div>
              <span className="block text-xs opacity-80">التدفق المقدر:</span>
              <strong className="text-lg">{flowRate.toFixed(2)} gpm</strong>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}